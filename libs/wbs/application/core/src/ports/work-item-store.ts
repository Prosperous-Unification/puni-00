import type { Hold, IsoDate, Readiness } from '@wbs/domain';

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

export interface WorkItemPatch {
  name?: string;
  notes?: string;
  /** `null` removes the constraint and lets the dependencies alone decide. */
  startNoEarlierThan?: IsoDate | null;
  /**
   * Why the work is held back, or `null` to take the words off and leave the
   * date.
   *
   * **A patch that leaves this row with a reason and no date is refused** —
   * `not_before_reason_needs_a_date`, decided against the row as it will stand
   * rather than against this patch, because a patch naming only the reason is
   * legal on a row that already has a date and illegal on one that does not.
   * The commonest way to meet it is taking the date off and forgetting the
   * words: `{ startNoEarlierThan: null }` on a row that has a reason is refused,
   * and `{ startNoEarlierThan: null, startNoEarlierThanReason: null }` is the
   * request that means it. Nothing is cleared on the caller's behalf — the words
   * are somebody's sentence, and deleting them quietly is worse than a 400.
   *
   * Length is the controller's (`LONGEST_NOT_BEFORE_REASON`), which is also
   * where a blank becomes this `null`, so `''` never reaches the column.
   */
  startNoEarlierThanReason?: string | null;
  /**
   * The last day this work may finish on, or `null` to take the deadline off.
   *
   * **No pair rule and no second field**: the floor above has a reason column to
   * stay consistent with and this has nothing, so this store takes any
   * `IsoDate` or `null` and refuses neither. Two layers above it do. The
   * **controller** refuses a value that is not an `IsoDate`, through the same
   * malformed-payload path the floor uses — a 400, like every other malformed
   * field. The **service** refuses a date before the project's day zero, which
   * is where that check has to live because it is the first layer holding the
   * project as well as the payload; that one is a 422.
   */
  deadline?: IsoDate | null;
  /**
   * The day the work actually began, or `null` to take the record off.
   *
   * Any `IsoDate` or `null`; the controller refuses a value that is not a date
   * through the malformed-payload path (`fact_start_must_be_a_date`). Nothing
   * else is refused: an end before a start is a typo the two cells show side by
   * side, not a fact the store has an opinion about.
   */
  factStart?: IsoDate | null;
  /** The day the work actually finished, or `null` to take the record off — {@link factStart}'s rules. */
  factEnd?: IsoDate | null;
  /** A readiness, or `null` to take it off. Written only by `setStatus` and structural edits. */
  readiness?: Readiness | null;
  /** A hold, or `null` to take it off. Written only by `setStatus` and structural edits. */
  hold?: Hold | null;
  /**
   * An integer of 1 or more, or `null` to leave this work with no priority.
   *
   * Validated at the controller, which is the only place a value that is not a
   * whole number of at least 1 can enter: the column is an integer and the
   * leveller reads it as a priority, so a 0 or a 1.5 would order the queue by a
   * number nobody could have meant.
   */
  priority?: number | null;
  /** `null` takes the label off. Never constrains who may be assigned the work. */
  serviceTeamId?: string | null;
  /**
   * The row's whole own team set. Absent leaves it alone and `[]` makes it
   * unstated. Kept beside `serviceTeamId` for one compatibility release; the
   * controller refuses requests that name both.
   */
  teamIds?: readonly string[];
  /**
   * Which services deliver this work, as the **whole** set. Absent leaves the
   * dimension alone, like every other field here; `[]` is the one spelling of
   * taking the label off, and puts the row back to inheriting its ancestors'.
   *
   * A **set, replaced whole**, which is {@link tagIds}'s rule and no longer the
   * inverse of it — the scalar this replaces was the column's shape, and task
   * 10.2 took the column out of the read path. There is no `null` arm any more:
   * a set has an empty spelling, so the second spelling of "no service" that
   * `null` used to be would now be two ways to say one thing.
   *
   * Deduplicated by the store on the way in — the join's primary key would
   * refuse a repeated pair, and a payload naming one service twice is a client
   * being untidy rather than a request that means anything else.
   *
   * An id the directory no longer holds refuses the **whole** patch with
   * `unknown_service`, decided **inside the transaction that performs the
   * update** — {@link serviceTeamId}'s argument, plus `work_item_tag`'s: the
   * join cascades, so a service removed between a precheck and this write
   * leaves nothing for a foreign key to catch and the insert would answer a 500
   * where the honest answer names the service.
   */
  serviceIds?: readonly string[];
  /**
   * How many people may be on this work item at once — an integer of 1 to
   * 1000, or `null` to put it back to one at a time.
   *
   * `null` **resets** where `priority`'s clears: `work_item.max_parallel` is
   * `NOT NULL` because 1 and unset are the same fact, and a second spelling of
   * one fact is what the column's default exists to prevent. The store turns
   * the `null` into a 1 rather than writing it — see
   * {@link WorkItemStore.patch}.
   *
   * Validated at the controller, which is the only place a value that is not a
   * whole number of 1 to 1000 can enter. A 0 there would be a width of 0, and
   * `effort / 0` is a plan of `Infinity` dates.
   */
  maxParallel?: number | null;
  /**
   * What kind of thing this work item is, **whole**: the set as it will stand,
   * never a member to add or remove.
   *
   * `[]` takes every tag off, and there is no `null` arm because there is
   * nothing else `[]` could mean — a tag has no column to reset to a default,
   * unlike {@link maxParallel}, and no third "deliberately untagged" state,
   * unlike nothing at all in this model. Absent leaves the row's tags alone,
   * which is the same reading every other field here takes.
   *
   * Whole rather than a delta because the undo journal has to carry a
   * before-value that restores what was there: a patch of "add `regulatory`"
   * has no inverse that a second patch can express, and the compensating
   * command for a set is the prior set. That is the seam a scalar habit loses
   * data at, and it has its own watched red in the service.
   *
   * An id the directory no longer holds is refused with `unknown_tag`, decided
   * **inside the transaction that performs the update** — `serviceTeamId`'s
   * argument exactly, and for a stronger reason: `work_item_tag.tag_id`
   * cascades, so an id removed in the gap between a precheck and the write
   * would not fail on a foreign key at all. It would insert against a `tag` row
   * that is gone, and SQLite would refuse it — but the refusal a reader gets
   * must name the tag rather than be a 500, and only the transaction can.
   */
  tagIds?: readonly string[];
  /**
   * What kind of work this row **is**, **whole**: the set as it will stand, at
   * most one type on an authored write (`work_item_takes_one_type`, WBS
   * 010.4.10) while undo/redo and copies write a stored conflict back exactly;
   * never a member to add or remove — {@link tagIds}'s rule and every one of its
   * reasons, including the undo journal needing a before-value that restores.
   *
   * `[]` takes every type off and is the only spelling of it. Unlike
   * {@link tagIds}, `[]` here also has no inheritance behind it to fall back to:
   * a row with no types has no types, so this is the one dimension where the
   * empty set and the answer a reader sees are the same thing
   * (`docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md`).
   *
   * An id the directory no longer holds refuses the **whole** patch with
   * `unknown_type`, decided **inside the transaction that performs the update**
   * — {@link tagIds}'s argument unchanged: the join cascades, so an id removed
   * between a precheck and this write leaves nothing for a foreign key to catch,
   * and the refusal a reader gets must name the type rather than be a 500.
   */
  typeIds?: readonly string[];
  /**
  /**
   * Where this row's work also exists, **whole**: the list as it will stand.
   *
   * `tagIds`' replacement rule and its undo argument, with one difference that
   * matters — the members are records, so "the same list" means the same refs in
   * the same order rather than the same set of ids. `[]` removes every ref.
   *
   * A ref whose `systemId` the directory does not hold refuses the **whole**
   * patch with `unknown_system`, decided inside the write's transaction:
   * `work_item_external_ref.system_id` cascades, so a system removed between a
   * precheck and the write leaves nothing for a foreign key to catch.
   */
  externalRefs?: readonly ExternalRefWrite[];
}

/**
 * A ref as a caller states it — no `id`, because the store mints one per row.
 *
 * `name` is required rather than optional, and the boundary that parses the
 * request is what supplies `''` for a caller that named nothing
 * (`asOptionalExternalRefs`). An optional field here would let the store's own
 * insert reach SQLite without the column, which is the same row written two
 * ways — and the way that skips it is the one no reader can tell from a name
 * somebody deleted.
 */
interface ExternalRefWrite {
  systemId: string;
  url: string;
  name: string;
}

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

/** A position write the caller has already worked out, applied with whatever prompted it. */
export interface Repositioned {
  id: string;
  position: number;
}

/** A promoted child: a new parent and a new place among its new siblings. */
export interface Reparented extends Repositioned {
  parentId: string | null;
}

export interface FrozenNumber {
  id: string;
  frozenNumber: string | null;
}

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
