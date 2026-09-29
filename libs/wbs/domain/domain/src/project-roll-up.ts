import { foldStatuses, type WorkItemStatus } from './progress';
import type { IsoDate } from './workday';

/**
 * Bumped whenever {@link ProjectRollUp}'s shape or meaning changes, so a
 * process cache keyed on it never answers a roll-up computed by other rules.
 */
export const ROLLUP_DTO_VERSION = 1;

/** The fields of one tree row a roll-up reads (a structural slice of the project read). */
export interface RollUpRow {
  id: string;
  parentId: string | null;
  /** The row's folded status, as the table shows it. */
  status: WorkItemStatus;
  finalTotal: number;
  /** Null for an undated or held row. */
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  /** Whether any step of the row holds an estimate. */
  estimated: boolean;
}

/** The project read a roll-up is computed from: the one the project page reads. */
export interface RollUpTree {
  workItems: readonly RollUpRow[];
  scheduleError: string | null;
  waitingForPerson: number;
  waitingForCapacity: number;
  /** The engine whose dates the rows carry. */
  displayed: string;
  projectRevision: number;
  seq: number;
}

/** One project read as one row of a space (`add-spaces`, spec `space-read`). */
export interface ProjectRollUp {
  kind: 'rolled_up';
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  finalTotal: number;
  status: WorkItemStatus;
  counts: {
    byStatus: Record<WorkItemStatus, number>;
    leaves: number;
    estimated: number;
  };
  scheduleError: string | null;
  waitingForPerson: number;
  waitingForCapacity: number;
  displayed: string;
  projectRevision: number;
  seq: number;
}

/**
 * Reads a project as one row: the project is a parent of its roots.
 *
 * - `dates` spans the dated roots, or is null when none is dated or the
 *   schedule failed; held roots carry no dates and drop out.
 * - `finalTotal` sums the roots' final totals; no per-step totals, since steps
 *   are a per-project vocabulary.
 * - `status` is {@link foldStatuses} over the roots: the same parent rule the
 *   table applies, never a second computation. No rows read `unknown`.
 * - `counts` count leaves only, per status.
 *
 * Pure: the caller reads the tree through the project routes' predicate.
 */
export function rollUpProject(tree: RollUpTree): ProjectRollUp {
  const parents = new Set(tree.workItems.flatMap(({ parentId }) => parentId ?? []));
  const roots = tree.workItems.filter(({ parentId }) => parentId === null);
  const leaves = tree.workItems.filter(({ id }) => !parents.has(id));
  // A literal rather than built from WORK_ITEM_STATUSES: the Record type makes
  // a status added later a compile error here instead of a missing count.
  const byStatus: Record<WorkItemStatus, number> = {
    unknown: 0,
    draft: 0,
    ready: 0,
    in_progress: 0,
    blocked_by_proxy: 0,
    on_hold: 0,
    blocked: 0,
    done: 0,
  };
  for (const leaf of leaves) byStatus[leaf.status] += 1;
  return {
    kind: 'rolled_up',
    dates: tree.scheduleError === null ? spanOf(roots) : null,
    finalTotal: roots.reduce((sum, root) => sum + root.finalTotal, 0),
    // Proof: see `folds the roots, so a project whose roots are all on hold
    // reads on_hold` in `project-roll-up.test.ts`.
    status: foldStatuses(roots.map(({ status }) => status)),
    counts: {
      byStatus,
      leaves: leaves.length,
      estimated: leaves.filter(({ estimated }) => estimated).length,
    },
    scheduleError: tree.scheduleError,
    waitingForPerson: tree.waitingForPerson,
    waitingForCapacity: tree.waitingForCapacity,
    displayed: tree.displayed,
    projectRevision: tree.projectRevision,
    seq: tree.seq,
  };
}

/** ISO dates order as strings, so the span is a string minimum and maximum. */
function spanOf(roots: readonly RollUpRow[]): { startsOn: IsoDate; endsOn: IsoDate } | null {
  const dated = roots.flatMap(({ dates }) => (dates === null ? [] : [dates]));
  if (dated.length === 0) return null;
  return {
    startsOn: dated.map(({ startsOn }) => startsOn).reduce((a, b) => (b < a ? b : a)),
    endsOn: dated.map(({ endsOn }) => endsOn).reduce((a, b) => (b > a ? b : a)),
  };
}
