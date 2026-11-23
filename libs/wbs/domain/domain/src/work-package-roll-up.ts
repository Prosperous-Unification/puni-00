import { foldStatuses, WORK_ITEM_STATUSES, type WorkItemStatus } from './progress';
import type { ScheduleError } from './schedule-error';
import type { IsoDate } from './workday';

/**
 * Bumped whenever {@link WorkPackageRollUp}'s shape or meaning changes, so a
 * process cache keyed on it never answers a roll-up computed by other rules.
 */
export const ROLLUP_DTO_VERSION = 2;

/** The fields of one tree row a roll-up reads (a structural slice of the work package read). */
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

/** The work package read a roll-up is computed from: the one the work package page reads. */
export interface RollUpTree {
  workItems: readonly RollUpRow[];
  scheduleError: ScheduleError;
  waitingForPerson: number;
  waitingForCapacity: number;
  /** The engine whose dates the rows carry; null when connected placement is unavailable. */
  displayed: string | null;
  workPackageRevision: number;
  seq: number;
}

/** One work package read as one row of a space (`add-spaces`, spec `space-read`). */
export interface WorkPackageRollUp {
  kind: 'rolled_up';
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  finalTotal: number;
  status: WorkItemStatus;
  counts: {
    byStatus: Record<WorkItemStatus, number>;
    leaves: number;
    estimated: number;
  };
  scheduleError: ScheduleError;
  waitingForPerson: number;
  waitingForCapacity: number;
  displayed: string | null;
  workPackageRevision: number;
  seq: number;
}

/** A missing required engine carries no partial total; a project without readable packages is empty. */
export type ProjectRollUp =
  | { readonly kind: 'empty' }
  | { readonly kind: 'unavailable' }
  | Pick<
      WorkPackageRollUp,
      | 'kind'
      | 'dates'
      | 'finalTotal'
      | 'status'
      | 'counts'
      | 'waitingForPerson'
      | 'waitingForCapacity'
    >;

/**
 * Folds only the readable children captured by one project observation. Empty packages still
 * contribute their unknown status. Any unavailable child withholds the entire total; any failed
 * child schedule withholds project dates. Children retain their own errors, engines and revisions.
 */
export function rollUpProject(
  children: readonly (WorkPackageRollUp | { readonly kind: 'unavailable' })[],
): ProjectRollUp {
  // Proof: omitting empty-project handling made the actual Source publish rolled_up for an admitted empty project (space-project-rollup-fault-empty-v1).
  if (children.length === 0) return { kind: 'empty' };
  const available: WorkPackageRollUp[] = [];
  for (const child of children) {
    // Proof: skipping the unavailable child exposed a partial project total through the actual Source (space-project-rollup-fault-unavailable-v1).
    if (child.kind === 'unavailable') return { kind: 'unavailable' };
    available.push(child);
  }
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
  for (const child of available)
    for (const status of WORK_ITEM_STATUSES) byStatus[status] += child.counts.byStatus[status];
  return {
    kind: 'rolled_up',
    // Proof: ignoring a child schedule error exposed project dates over a real stored dependency cycle (space-project-rollup-fault-schedule-error-v1).
    dates: available.some((child) => child.scheduleError !== null) ? null : spanOf(available),
    finalTotal: available.reduce((sum, child) => sum + child.finalTotal, 0),
    status: foldStatuses(available.map((child) => child.status)),
    counts: {
      byStatus,
      leaves: available.reduce((sum, child) => sum + child.counts.leaves, 0),
      estimated: available.reduce((sum, child) => sum + child.counts.estimated, 0),
    },
    waitingForPerson: available.reduce((sum, child) => sum + child.waitingForPerson, 0),
    waitingForCapacity: available.reduce((sum, child) => sum + child.waitingForCapacity, 0),
  };
}

/**
 * Reads a work package as one row: the work package is a parent of its roots.
 *
 * - `dates` spans the dated roots, or is null when none is dated or the
 *   schedule failed; held roots carry no dates and drop out.
 * - `finalTotal` sums the roots' final totals; no per-step totals, since steps
 *   are a per-work-package vocabulary.
 * - `status` is {@link foldStatuses} over the roots: the same parent rule the
 *   table applies, never a second computation. No rows read `unknown`.
 * - `counts` count leaves only, per status.
 *
 * Pure: the caller reads the tree through the work package routes' predicate.
 */
export function rollUpWorkPackage(tree: RollUpTree): WorkPackageRollUp {
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
    // Proof: see `folds the roots, so a workPackage whose roots are all on hold
    // reads on_hold` in `work-package-roll-up.test.ts`.
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
    workPackageRevision: tree.workPackageRevision,
    seq: tree.seq,
  };
}

/** ISO dates order as strings, so the span is a string minimum and maximum. */
function spanOf(
  roots: readonly Pick<RollUpRow, 'dates'>[],
): { startsOn: IsoDate; endsOn: IsoDate } | null {
  const dated = roots.flatMap(({ dates }) => (dates === null ? [] : [dates]));
  if (dated.length === 0) return null;
  return {
    startsOn: dated.map(({ startsOn }) => startsOn).reduce((a, b) => (b < a ? b : a)),
    endsOn: dated.map(({ endsOn }) => endsOn).reduce((a, b) => (b > a ? b : a)),
  };
}
