import type { FrozenNumber, Reparented, WorkItemPatch } from '@wbs/domain';

import type { LabelledWorkItem, Service, Tag, WorkItem, WorkItemType } from './work-item-values';
import type { WriteStamp } from './write-stamp';
export type {
  ExternalRef,
  ExternalSystem,
  LabelledWorkItem,
  Service,
  Tag,
  WorkItem,
  WorkItemType,
} from './work-item-values';
export type { FrozenNumber, Reparented, WorkItemPatch } from '@wbs/domain';

/** A position write the caller has already worked out, applied with whatever prompted it. */
export interface Repositioned {
  id: string;
  position: number;
}

/**
 * What a tag rename answered.
 *
 * `taken` carries no surviving name here — the caller has it, because it typed
 * it — and the controller turns this into the 409 the directory page shows.
 * {@link ServiceTeamWritten}'s shape, one dimension over.
 *
 * `projectIds` is every project holding a row that carries the tag, read in the
 * rename's own transaction so the events published after it name the plans that
 * were labelled when it happened.
 */
export type TagWritten =
  | { ok: true; tag: Tag; projectIds: readonly string[] }
  | { ok: false; reason: 'taken' | 'not_found' };

/**
 * What a work item type rename answered — {@link TagWritten}'s shape, one
 * dimension over, including `taken` carrying no surviving name because the
 * caller typed it.
 *
 * `projectIds` is every project holding a row that carries the type, read in the
 * rename's own transaction so the events published after it name the plans that
 * were labelled when it happened.
 */
export type WorkItemTypeWritten =
  | { ok: true; workItemType: WorkItemType; projectIds: readonly string[] }
  | { ok: false; reason: 'taken' | 'not_found' };

/**
 * What a service rename answered — {@link TagWritten}'s shape, one dimension
 * over, and the same reading of each arm.
 *
 * `projectIds` is every project holding a work item that names the service,
 * read inside the rename's own transaction so the events published after it
 * name the plans that were labelled when it happened.
 */
export type ServiceWritten =
  | { ok: true; service: Service; projectIds: readonly string[] }
  | { ok: false; reason: 'taken' | 'not_found' };

/**
 * What a patch answered: the written row, or the reason nothing was written.
 *
 * `unknown_team` is a `serviceTeamId` the directory no longer holds, decided
 * **inside the transaction that performs the update**. It is not a service-level
 * precheck's answer: a check one statement earlier passes for a team removed in
 * the gap, and the update then fails on the column's own foreign key — a 500 for
 * a request whose only fault is being out of date. `assignment.person_id`'s
 * case exactly, and the same shape of answer.
 *
 * The column's foreign key is real, and this comment said the opposite until
 * `team-sets` measured it (2026-08-14): `work_item.service_team_id` was added
 * by `ALTER TABLE … ADD … REFERENCES service_team(id)` with no `ON DELETE`
 * action, so SQLite refuses both an unknown id and the delete of a team any row
 * still names. What has no cascade is the *delete* — which is why
 * {@link DirectoryStore.removeTeam} nulls the labels itself.
 *
 * `unknown_tag` is the same answer for the other label dimension, decided in
 * the same transaction and argued in {@link WorkItemPatch.tagIds}. The two are
 * deliberately separate reasons rather than one `unknown_label`: a reader told
 * a label is gone has to know **which** picker to reopen, and the two
 * dimensions are independent everywhere else in this model.
 *
 * `unknown_service` is the third dimension's, and a third reason for the same
 * reason: three pickers now, and "a label is gone" would leave a reader opening
 * all of them. `work_item.service_id` has `ON DELETE SET NULL`, so unlike the
 * tag it *would* be caught by the column's own foreign key — as a raw
 * `FOREIGN KEY constraint failed`, which is a 500 where the honest answer names
 * the service.
 *
 * `not_before_reason_needs_a_date` is decided in the same transaction and for a
 * version of the same reason: the rule is about the row **as it will stand**, so
 * it has to be asked against the stored date and the patch's together, and a
 * service-level precheck followed by an update is two statements with a
 * concurrent write's worth of gap between them — another patch clearing the date
 * in that gap leaves exactly the pair this refuses. There is no constraint
 * behind it to catch that (the migration argues why a `CHECK` here would 500 the
 * outgoing release mid-swap), so this transaction is the whole of the guarantee.
 */
export type WorkItemPatched =
  | { ok: true; workItem: WorkItem }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'unknown_team'
        | 'unknown_tag'
        | 'unknown_service'
        | 'unknown_type'
        | 'unknown_system'
        | 'not_before_reason_needs_a_date'
        /**
         * A readiness or hold written on a row that has children. Decided in
         * the write itself, so a statement racing a first child cannot leave
         * one on a parent, where the plan read refuses it.
         */
        | 'has_children';
    };

/**
 * What an assignment write answered.
 *
 * `unknown_person` is decided inside the write's own transaction, for the
 * mirror-image reason: `assignment.person_id` *does* have a foreign key, so a
 * person removed in the gap makes the insert answer a raw constraint failure —
 * a 500 for a request whose only fault is being out of date.
 */
export type AssignmentWritten =
  { ok: true } | { ok: false; reason: 'unknown_person' | 'unknown_step' };

/** One requested row's immediate predecessor in its source's full-reader order. */
export interface WorkItemPlacement {
  readonly id: string;
  readonly afterId: string | null;
}

export interface WorkItemStore {
  /**
   * Every work item of one project, each carrying the teams it is joined to.
   *
   * The join is the read since `team-sets`: `work_item.service_team_id` is
   * still written beside it and is still what the outgoing release selects, but
   * nothing here consults it.
   */
  listByProject(projectId: string): Promise<LabelledWorkItem[]>;
  /** The requested rows that belong to `projectId`, in the full project reader's order. */
  listByIds(projectId: string, ids: readonly string[]): Promise<LabelledWorkItem[]>;
  /**
   * Placement of each requested existing row in the full project reader's order.
   *
   * Missing or foreign-project IDs are absent. Each answer names the immediate
   * predecessor across the complete project, whether or not that predecessor
   * was requested. Empty IDs return an empty collection.
   */
  listPlacements(projectId: string, ids: readonly string[]): Promise<WorkItemPlacement[]>;
  findById(id: string): Promise<WorkItem | null>;
  /**
   * Inserts, and respaces the sibling group in the same transaction when the
   * insertion had no gap to take. Two calls would leave a window in which two
   * siblings share a position, and the number derived in that window would be
   * wrong for whoever read it.
   */
  insert(workItem: WorkItem, respaced: readonly Repositioned[], stamp: WriteStamp): Promise<void>;
  /**
   * Applies the patch and validates any `serviceTeamId` it names **in one
   * transaction** — see {@link WorkItemPatched}. A patch naming no field writes
   * nothing and answers the row it found.
   */
  patch(id: string, patch: WorkItemPatch, stamp: WriteStamp): Promise<WorkItemPatched>;
  move(
    id: string,
    parentId: string | null,
    position: number,
    respaced: readonly Repositioned[],
    stamp: WriteStamp,
  ): Promise<void>;
  /**
   * Rewrites the positions of whole sibling groups, in one transaction, and
   * bumps the revision of **only** the work items named in `moved`.
   *
   * One call rather than a `move` per work item, for the reason
   * {@link setFrozenNumbers} is one call: a project half arranged is a project
   * where some rows are in schedule order and some are not, and nobody reading
   * it could tell which. It also keeps a press to one journal entry and one
   * broadcast.
   *
   * The split between `placements` and `moved` is `move`'s own, and it matters
   * for the same reason: a respaced sibling that kept its place must not gain a
   * revision, or a peer's pending undo of something else on that row is refused
   * by an arrangement that did not touch it.
   */
  setPositions(
    placements: readonly Repositioned[],
    moved: readonly string[],
    stamp: WriteStamp,
  ): Promise<void>;
  /**
   * Writes or clears stored numbers. `null` returns a work item to deriving.
   *
   * A freeze is one call rather than a write per work item: a project half
   * frozen is a project where some numbers moved and some did not, and nobody
   * reading it could tell which.
   */
  setFrozenNumbers(updates: readonly FrozenNumber[], stamp: WriteStamp): Promise<void>;
  /** Removes `ids` and applies `promoted` together, so a promotion cannot outlive its parent. */
  remove(ids: readonly string[], promoted: readonly Reparented[], stamp: WriteStamp): Promise<void>;
}
