import type { WorkItemStatus } from './progress';
import type { IsoDate } from './workday';

/** The fields of one tree row "in progress now" reads. */
export interface InProgressRow {
  id: string;
  parentId: string | null;
  number: string;
  name: string;
  /** The row's folded status: the single source of whether it is in progress. */
  status: WorkItemStatus;
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  /** Step id to person id. */
  assignees: Readonly<Record<string, string>>;
  /** Step id to that step's stated state; an unstated step is absent. */
  progress: Readonly<Record<string, string>>;
}

/** The project read "in progress now" is computed from: the one the project page reads. */
export interface InProgressTree {
  workItems: readonly InProgressRow[];
  slices: readonly { workItemId: string; stepId: string | null; lateBy: number | null }[];
  /** The project's steps, in the order the work runs through them. */
  steps: readonly { id: string; name: string }[];
  assignedPeople: readonly { id: string; name: string }[];
}

/** One leaf in progress, as a space lists it (spec `in-progress-now`). */
export interface InProgressLeaf {
  workItemId: string;
  number: string;
  name: string;
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  /** The most any of the leaf's slices is late by, in workdays; null when none is. */
  lateBy: number | null;
  assignees: { id: string; name: string }[];
  /** The first step, in step order, stated in progress; null when none is. */
  step: { id: string; name: string } | null;
}

/**
 * The leaves of one project whose folded status reads `in_progress`.
 *
 * The fold is the only test: a held or blocked leaf with a step stated in
 * progress is not in progress (ADR 0032), which is why this never reads
 * `step_progress` directly.
 */
export function inProgressLeavesOf(tree: InProgressTree): InProgressLeaf[] {
  const parents = new Set(tree.workItems.flatMap(({ parentId }) => parentId ?? []));
  const people = new Map(tree.assignedPeople.map((person) => [person.id, person]));
  return (
    tree.workItems
      // Proof: see `never lists a held leaf, whatever its step says` in
      // `in-progress-now.test.ts`.
      .filter(({ id, status }) => !parents.has(id) && status === 'in_progress')
      .map((row) => {
        const lateness = tree.slices
          .filter(({ workItemId }) => workItemId === row.id)
          .flatMap(({ lateBy }) => (lateBy === null ? [] : [lateBy]));
        const assigned = [...new Set(Object.values(row.assignees))].flatMap((personId) => {
          const person = people.get(personId);
          return person === undefined ? [] : [{ id: person.id, name: person.name }];
        });
        const step = tree.steps.find(({ id }) => row.progress[id] === 'in_progress');
        return {
          workItemId: row.id,
          number: row.number,
          name: row.name,
          dates: row.dates,
          lateBy: lateness.length === 0 ? null : Math.max(...lateness),
          assignees: assigned,
          step: step === undefined ? null : { id: step.id, name: step.name },
        };
      })
  );
}

/** Compares two derived numbers segment by segment, so `1.9` precedes `1.10`. */
function compareNumbers(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const difference = (a[at] ?? -1) - (b[at] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Orders items by end date ascending with undated last, then space position,
 * then number: the order the spec gives "in progress now".
 */
export function sortInProgress<T extends { position: number; number: string }>(
  items: readonly T[],
  endsOn: (item: T) => IsoDate | null,
): T[] {
  return [...items].sort((left, right) => {
    const l = endsOn(left);
    const r = endsOn(right);
    if (l !== r) {
      if (l === null) return 1;
      if (r === null) return -1;
      return l < r ? -1 : 1;
    }
    return left.position - right.position || compareNumbers(left.number, right.number);
  });
}
