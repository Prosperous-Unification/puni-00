import type {
  IssuedAttemptNumber,
  RunningStoredAttempt,
  StepNodeAttemptStore,
  StepProgressStore,
  StepStore,
  StoredAttempt,
  WorkItemStore,
} from '@wbs/core';

/**
 * A StepNodeAttemptStore backed by an array, holding the invariants the SQLite
 * table's checks and partial index hold: numbers one past the higher of the
 * node's mark and its highest row (A42), at most one running attempt per node,
 * and, given `progress`, no start on a node stated `done`.
 */
export function inMemoryAttempts(
  workItems: WorkItemStore,
  table: MemoryAttemptTable = memoryAttemptTable(),
  steps?: StepStore,
  progress?: Pick<StepProgressStore, 'listByWorkItems'>,
): StepNodeAttemptStore {
  const { rows, issued } = table;
  const markOf = (workItemId: string, stepId: string) =>
    issued.find((mark) => mark.workItemId === workItemId && mark.stepId === stepId);
  /** `raiseMarks` in the SQLite adapter: the higher number wins, never the lower. */
  const raise = (marks: readonly IssuedAttemptNumber[]) => {
    for (const mark of marks) {
      const held = markOf(mark.workItemId, mark.stepId);
      const next = { workItemId: mark.workItemId, stepId: mark.stepId, issued: mark.issued };
      if (held === undefined) issued.push(next);
      else if (held.issued < mark.issued) issued.splice(issued.indexOf(held), 1, next);
    }
  };
  const onNode = (workItemId: string, stepId: string) =>
    rows.filter((row) => row.workItemId === workItemId && row.stepId === stepId);
  const ordered = async (projectId: string, kept: StoredAttempt[]) => {
    const position = new Map(
      ((await steps?.listByProject(projectId)) ?? []).map((each) => [each.id, each.position]),
    );
    return [...kept].sort(
      (left, right) =>
        left.workItemId.localeCompare(right.workItemId) ||
        (position.get(left.stepId) ?? 0) - (position.get(right.stepId) ?? 0) ||
        left.stepId.localeCompare(right.stepId) ||
        left.attemptNumber - right.attemptNumber,
    );
  };
  const projectOf = async (projectId: string) =>
    new Set((await workItems.listByProject(projectId)).map((row) => row.id));
  const replaceRow = (attempt: StoredAttempt) => {
    const kept = rows.filter(
      (row) =>
        !(
          row.workItemId === attempt.workItemId &&
          row.stepId === attempt.stepId &&
          row.attemptNumber === attempt.attemptNumber
        ),
    );
    rows.splice(0, rows.length, ...kept, structuredClone(attempt));
  };

  return {
    async listByProject(projectId) {
      const ids = await projectOf(projectId);
      return ordered(
        projectId,
        rows.filter((row) => ids.has(row.workItemId)),
      );
    },
    async listByWorkItems(projectId, wanted) {
      const ids = await projectOf(projectId);
      const asked = new Set(wanted);
      return ordered(
        projectId,
        rows.filter((row) => ids.has(row.workItemId) && asked.has(row.workItemId)),
      );
    },
    listOfWorkItem(workItemId) {
      const bySteps = new Map<string, StoredAttempt[]>();
      for (const row of [...rows]
        .filter((each) => each.workItemId === workItemId)
        .sort((left, right) => left.attemptNumber - right.attemptNumber)) {
        bySteps.set(row.stepId, [...(bySteps.get(row.stepId) ?? []), row]);
      }
      return Promise.resolve(bySteps);
    },
    async start(start, _stamp) {
      const projectId = (await workItems.findById(start.workItemId))?.projectId;
      if (progress !== undefined && projectId !== undefined) {
        const stated = await progress.listByWorkItems(projectId, [start.workItemId]);
        if (stated.some((each) => each.stepId === start.stepId && each.state === 'done')) {
          return { ok: false, reason: 'node_done' as const };
        }
      }
      const held = onNode(start.workItemId, start.stepId);
      if (held.some((row) => row.endedAt === null)) {
        return { ok: false, reason: 'attempt_running' as const };
      }
      const attempt: RunningStoredAttempt = {
        ...start,
        attemptNumber:
          Math.max(
            markOf(start.workItemId, start.stepId)?.issued ?? 0,
            ...held.map((row) => row.attemptNumber),
          ) + 1,
        endedAt: null,
        outcome: null,
      };
      rows.push(structuredClone(attempt));
      raise([{ ...start, issued: attempt.attemptNumber }]);
      return { ok: true, attempt };
    },
    end(end, _stamp) {
      const prior = onNode(end.workItemId, end.stepId).find(
        (row): row is RunningStoredAttempt => row.endedAt === null,
      );
      if (prior === undefined) {
        return Promise.resolve({ ok: false, reason: 'no_running_attempt' as const });
      }
      if (end.endedAt < prior.startedAt) {
        return Promise.reject(new Error('CHECK constraint failed: step_node_attempt_order'));
      }
      const attempt: StoredAttempt = {
        ...prior,
        endedAt: end.endedAt,
        outcome: end.outcome,
        reference: end.reference === undefined ? prior.reference : end.reference,
        note: end.note === undefined ? prior.note : end.note,
      };
      replaceRow(attempt);
      return Promise.resolve({ ok: true, prior: structuredClone(prior), attempt });
    },
    remove(workItemId, stepId, attemptNumber, _stamp) {
      const taken = onNode(workItemId, stepId).find((row) => row.attemptNumber === attemptNumber);
      if (taken === undefined) return Promise.resolve(null);
      rows.splice(rows.indexOf(taken), 1);
      return Promise.resolve(taken);
    },
    restore(attempt, _stamp) {
      replaceRow(attempt);
      raise([{ ...attempt, issued: attempt.attemptNumber }]);
      return Promise.resolve();
    },
    async listIssued(projectId, wanted) {
      const ids = await projectOf(projectId);
      const asked = new Set(wanted);
      return issued
        .filter((mark) => ids.has(mark.workItemId) && asked.has(mark.workItemId))
        .map((mark) => ({ ...mark }))
        .sort(
          (left, right) =>
            left.workItemId.localeCompare(right.workItemId) ||
            left.stepId.localeCompare(right.stepId),
        );
    },
    raiseIssued(marks) {
      raise(marks);
      return Promise.resolve();
    },
    moveAll(fromWorkItemId, toWorkItemId, _stamp) {
      raise(
        issued
          .filter((mark) => mark.workItemId === fromWorkItemId)
          .map((mark) => ({ ...mark, workItemId: toWorkItemId })),
      );
      const moved = rows.map((row) =>
        row.workItemId === fromWorkItemId ? { ...row, workItemId: toWorkItemId } : row,
      );
      rows.splice(0, rows.length, ...moved);
      return Promise.resolve();
    },
  };
}

export interface MemoryAttemptTable {
  readonly rows: StoredAttempt[];
  /** The nodes' marks, cascading with their work item as the rows do. */
  readonly issued: IssuedAttemptNumber[];
}

export function memoryAttemptTable(): MemoryAttemptTable {
  return { rows: [], issued: [] };
}
