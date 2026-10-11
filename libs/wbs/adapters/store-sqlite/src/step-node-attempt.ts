import type {
  AttemptEnd,
  AttemptEnded,
  AttemptStart,
  AttemptStarted,
  RunningStoredAttempt,
  StepNodeAttemptStore,
  StoredAttempt,
  WriteStamp,
} from '@wbs/core';
import { attemptOf, isAttemptOutcome } from '@wbs/domain';
import { and, eq, inArray, isNull, max, type SQL } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import { messagesOf } from './constraint';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { step, stepNodeAttempt, workItem } from './schema';

/** The columns every read takes, the audit columns left off. */
const ATTEMPT_COLUMNS = {
  workItemId: stepNodeAttempt.workItemId,
  stepId: stepNodeAttempt.stepId,
  attemptNumber: stepNodeAttempt.attemptNumber,
  startedAt: stepNodeAttempt.startedAt,
  endedAt: stepNodeAttempt.endedAt,
  outcome: stepNodeAttempt.outcome,
  executorPersonId: stepNodeAttempt.executorPersonId,
  reference: stepNodeAttempt.reference,
  note: stepNodeAttempt.note,
};

interface AttemptColumns {
  workItemId: string;
  stepId: string;
  attemptNumber: number;
  startedAt: number;
  endedAt: number | null;
  outcome: string | null;
  executorPersonId: string | null;
  reference: string | null;
  note: string | null;
}

/**
 * A stored row as a {@link StoredAttempt}.
 *
 * @throws on an outcome outside `ATTEMPT_OUTCOMES` or a pairing `attemptOf`
 * refuses: the row is trusted state, and the drizzle enum is erased at runtime.
 */
function storedAttemptOf(row: AttemptColumns): StoredAttempt {
  const { workItemId, stepId, outcome, ...facts } = row;
  if (outcome !== null && !isAttemptOutcome(outcome)) {
    throw new Error(`attempt ${workItemId}/${stepId} has an unknown outcome: ${outcome}`);
  }
  return { ...attemptOf({ ...facts, outcome }), workItemId, stepId };
}

/** {@link storedAttemptOf} for a row the caller just read as running. */
function runningAttemptOf(row: AttemptColumns): RunningStoredAttempt {
  const attempt = storedAttemptOf(row);
  if (attempt.endedAt !== null) {
    throw new Error(`attempt ${row.workItemId}/${row.stepId} was read as running and has ended`);
  }
  return attempt;
}

/**
 * Whether SQLite refused an insert under `step_node_attempt_running`, the
 * partial unique index, and not under the primary key.
 *
 * Both name `work_item_id, step_id` first, so a substring test like
 * `isUniqueViolation`'s would read a duplicate number as a running attempt;
 * the primary key's message continues with `, step_node_attempt.attempt_number`.
 */
function isRunningAttemptViolation(err: unknown): boolean {
  return messagesOf(err).some((message) =>
    /UNIQUE constraint failed: step_node_attempt\.work_item_id, step_node_attempt\.step_id(?!,)/.test(
      message,
    ),
  );
}

/**
 * The attempts at step nodes — see {@link StepNodeAttemptStore} and
 * `stepNodeAttempt` in `schema.ts`.
 *
 * A satellite of its work item, exactly as `StepProgressRepository` is: every
 * write moves that work item's revision inside the same transaction.
 */
export class StepNodeAttemptRepository implements StepNodeAttemptStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async listByProject(projectId: string): Promise<StoredAttempt[]> {
    return await this.listWhere(eq(workItem.projectId, projectId));
  }

  async listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredAttempt[]> {
    if (ids.length === 0) return [];
    return await this.listWhere(
      and(eq(workItem.projectId, projectId), inArray(stepNodeAttempt.workItemId, [...ids])),
    );
  }

  async listOfWorkItem(workItemId: string): Promise<ReadonlyMap<string, readonly StoredAttempt[]>> {
    const bySteps = new Map<string, StoredAttempt[]>();
    for (const attempt of await this.listWhere(eq(stepNodeAttempt.workItemId, workItemId))) {
      const held = bySteps.get(attempt.stepId);
      if (held === undefined) bySteps.set(attempt.stepId, [attempt]);
      else held.push(attempt);
    }
    return bySteps;
  }

  /**
   * By work item, then the step's **position**, then number ascending: the
   * order the work runs in, as `StepProgressRepository.listByProject` reads.
   * Inner joins, because both references are foreign keys.
   */
  private async listWhere(condition: SQL | undefined): Promise<StoredAttempt[]> {
    await Promise.resolve();
    return this.db
      .select(ATTEMPT_COLUMNS)
      .from(stepNodeAttempt)
      .innerJoin(step, eq(stepNodeAttempt.stepId, step.id))
      .innerJoin(workItem, eq(stepNodeAttempt.workItemId, workItem.id))
      .where(condition)
      .orderBy(
        stepNodeAttempt.workItemId,
        step.position,
        stepNodeAttempt.stepId,
        stepNodeAttempt.attemptNumber,
      )
      .all()
      .map(storedAttemptOf);
  }

  /**
   * Reads the node's highest number and inserts the next one in one
   * transaction, `IMMEDIATE` when it is the outermost, so a second writer
   * waits at `BEGIN` and then reads the first one's row (inside a unit of work
   * the outer `BEGIN IMMEDIATE` already holds the lock). A node already
   * running refuses at `step_node_attempt_running`, answered `attempt_running`.
   *
   * Proof, watched 2026-10-12 in `lets one of two concurrent starts win and
   * tells the other attempt_running`: the `max + 1` read moved before the
   * transaction is masked by the partial index (the case still passed); with
   * the index also dropped the loser threw its primary-key violation on a
   * reused number 1, where the read inside the transaction numbers it 2.
   */
  async start(start: AttemptStart, stamp: WriteStamp): Promise<AttemptStarted> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      try {
        const attempt = this.db.transaction(
          (tx) => {
            const highest = tx
              .select({ number: max(stepNodeAttempt.attemptNumber) })
              .from(stepNodeAttempt)
              .where(
                and(
                  eq(stepNodeAttempt.workItemId, start.workItemId),
                  eq(stepNodeAttempt.stepId, start.stepId),
                ),
              )
              .get();
            const row = {
              ...start,
              attemptNumber: (highest?.number ?? 0) + 1,
              endedAt: null,
              outcome: null,
            };
            tx.insert(stepNodeAttempt)
              .values({ ...row, ...auditOnCreate(stamp) })
              .run();
            bumpWorkItems(tx, [start.workItemId], stamp);
            return runningAttemptOf(row);
          },
          { behavior: 'immediate' },
        );
        return { ok: true, attempt };
      } catch (refused) {
        if (isRunningAttemptViolation(refused)) return { ok: false, reason: 'attempt_running' };
        throw refused;
      }
    });
  }

  async end(end: AttemptEnd, stamp: WriteStamp): Promise<AttemptEnded> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx): AttemptEnded => {
        const node = and(
          eq(stepNodeAttempt.workItemId, end.workItemId),
          eq(stepNodeAttempt.stepId, end.stepId),
        );
        const running = tx
          .select(ATTEMPT_COLUMNS)
          .from(stepNodeAttempt)
          .where(and(node, isNull(stepNodeAttempt.endedAt)))
          .get();
        if (running === undefined) return { ok: false, reason: 'no_running_attempt' };
        const prior = runningAttemptOf(running);
        const ended = {
          ...running,
          endedAt: end.endedAt,
          outcome: end.outcome,
          reference: end.reference === undefined ? running.reference : end.reference,
          note: end.note === undefined ? running.note : end.note,
        };
        tx.update(stepNodeAttempt)
          .set({
            endedAt: ended.endedAt,
            outcome: ended.outcome,
            reference: ended.reference,
            note: ended.note,
            ...auditOnUpdate(stamp),
          })
          .where(and(node, eq(stepNodeAttempt.attemptNumber, running.attemptNumber)))
          .run();
        bumpWorkItems(tx, [end.workItemId], stamp);
        return { ok: true, prior, attempt: storedAttemptOf(ended) };
      });
    });
  }

  async remove(
    workItemId: string,
    stepId: string,
    attemptNumber: number,
    stamp: WriteStamp,
  ): Promise<StoredAttempt | null> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        // All three halves of the key, for `StepProgressRepository.remove`'s reason.
        const removed = tx
          .delete(stepNodeAttempt)
          .where(
            and(
              eq(stepNodeAttempt.workItemId, workItemId),
              eq(stepNodeAttempt.stepId, stepId),
              eq(stepNodeAttempt.attemptNumber, attemptNumber),
            ),
          )
          .returning(ATTEMPT_COLUMNS)
          .all();
        const taken = removed.at(0);
        if (taken === undefined) return null;
        bumpWorkItems(tx, [workItemId], stamp);
        return storedAttemptOf(taken);
      });
    });
  }

  async restore(attempt: StoredAttempt, stamp: WriteStamp): Promise<void> {
    const facts = {
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      outcome: attempt.outcome,
      executorPersonId: attempt.executorPersonId,
      reference: attempt.reference,
      note: attempt.note,
    };
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.insert(stepNodeAttempt)
          .values({
            workItemId: attempt.workItemId,
            stepId: attempt.stepId,
            attemptNumber: attempt.attemptNumber,
            ...facts,
            ...auditOnCreate(stamp),
          })
          .onConflictDoUpdate({
            target: [
              stepNodeAttempt.workItemId,
              stepNodeAttempt.stepId,
              stepNodeAttempt.attemptNumber,
            ],
            set: { ...facts, ...auditOnUpdate(stamp) },
          })
          .run();
        bumpWorkItems(tx, [attempt.workItemId], stamp);
      });
    });
  }

  /**
   * Conditional, exactly as `StepProgressRepository.moveAll` is and for its
   * measured reason: almost every hand-down moves no attempt, and an
   * unconditional bump would stale every reader's precondition on both rows.
   */
  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.update(stepNodeAttempt)
          .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
          .where(eq(stepNodeAttempt.workItemId, fromWorkItemId))
          .run();
        if (rowsChanged(tx, 'moving attempts') === 0) return;
        bumpWorkItems(tx, [fromWorkItemId, toWorkItemId], stamp);
      });
    });
  }
}
