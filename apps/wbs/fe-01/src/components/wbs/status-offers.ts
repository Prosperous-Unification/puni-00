import type {
  Hold,
  Readiness,
  SettableStatus,
  StepState,
  WorkItemStatus,
} from '@wbs/domain/progress';

/**
 * Every settable status, in the order the row menu and the Status cell list
 * them (`add-work-item-statuses`, design §7). `blocked_by_proxy` is read off
 * the graph and never set, so it is not here.
 */
export const STATUS_MENU_ORDER = [
  'draft',
  'ready',
  'in_progress',
  'on_hold',
  'blocked',
  'done',
  'unknown',
] as const satisfies readonly SettableStatus[];

/** What {@link statusOffersOf} reads of a row: its status, its statements, and its children. */
export interface StatusRow {
  status: WorkItemStatus;
  readiness: Readiness | null;
  hold: Hold | null;
  progress: Record<string, StepState>;
  subRows: readonly StatusRow[];
}

function leavesOf(row: StatusRow): StatusRow[] {
  return row.subRows.length === 0 ? [row] : row.subRows.flatMap(leavesOf);
}

const hasSpoken = (row: StatusRow): boolean => Object.keys(row.progress).length > 0;

/**
 * The statuses a row's menu and Status cell offer: every settable status but
 * the one the row reads, leaving out each whose write be-01 would refuse or
 * that would change nothing (`WorkItemService.setStatus` is the rule this
 * mirrors). A parent is judged by the leaves beneath it, since a status set on
 * a parent is written on its leaves.
 *
 * - Draft and Ready only where no leaf has a step that has spoken
 *   (`readiness_after_progress`), and some leaf would change.
 * - In progress and Done only in a project with steps (`no_steps`); on an
 *   unfinished parent, In progress only while a leaf beneath is unstarted, as
 *   that is the leaf it starts.
 * - On hold and Blocked never on a row reading done (`cannot_hold_done`), and
 *   only where some leaf would change.
 * - Unknown only where some leaf holds a statement to clear.
 *
 * Proof: the filter on the row's own status removed made `offers no hold on
 * done work, and In progress to reopen it` fail with `done` offered on a done
 * row; the hold comparison replaced by `true` made `offers a parent a hold
 * while any unfinished leaf beneath does not already hold it` fail on
 * `expected [ 'on_hold', … ] to not include 'on_hold'`; watched 2026-09-29.
 */
export function statusOffersOf(row: StatusRow, hasSteps: boolean): SettableStatus[] {
  const leaves = leavesOf(row);
  const isParent = row.subRows.length > 0;
  const offered = (status: SettableStatus): boolean => {
    switch (status) {
      case 'draft':
      case 'ready':
        return (
          !leaves.some(hasSpoken) &&
          leaves.some((each) => each.readiness !== status || each.hold !== null)
        );
      case 'in_progress':
        return (
          hasSteps &&
          (!isParent || row.status === 'done' || leaves.some((each) => !hasSpoken(each)))
        );
      case 'on_hold':
      case 'blocked':
        return (
          row.status !== 'done' &&
          leaves.some((each) =>
            each.status === 'done' ? each.hold !== null : each.hold !== status,
          )
        );
      case 'done':
        return hasSteps;
      case 'unknown':
        return leaves.some(
          (each) => hasSpoken(each) || each.readiness !== null || each.hold !== null,
        );
    }
  };
  return STATUS_MENU_ORDER.filter((status) => status !== row.status && offered(status));
}
