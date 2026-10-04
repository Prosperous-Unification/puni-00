import type { Hold, IsoDate, Readiness } from '@wbs/domain';

export interface WorkItem {
  id: string;
  projectId: string;
  parentId: string | null;
  position: number;
  name: string;
  notes: string;
  frozenNumber: string | null;
  /** A day this item may not start before — a floor, never a pin. */
  startNoEarlierThan: IsoDate | null;
  /**
   * Why, in the planner's own words, or null where nobody has said.
   *
   * Words about {@link WorkItem.startNoEarlierThan} and nothing else — no state
   * and no second constraint. Null unless there is a date for it to be about:
   * `isOrphanedNotBeforeReason` in `@wbs/domain` is the rule and
   * {@link WorkItemStore.patch} is where it is refused. See `schema.ts`.
   */
  startNoEarlierThanReason: string | null;
  /**
   * The last day this work may finish on, or null where nobody has said.
   *
   * The mirror of {@link WorkItem.startNoEarlierThan} at the other end: a
   * date-only ceiling, never a pin and never a promise the scheduler keeps —
   * Fast orders by it and reports `Late by N workdays` when it cannot be met.
   * **No reason column beside it**, unlike the floor; `tasks.md` 1.1 says why.
   */
  deadline: IsoDate | null;
  /**
   * The day work on this row actually began, or null where nobody has said.
   *
   * A record beside the constraints above it: read by no engine, typed by the
   * planner, drawn as the start of a done row's single bar. See `schema.ts` and
   * ADR 0024.
   */
  factStart: IsoDate | null;
  /**
   * The day work on this row actually finished, or null where nobody has said.
   *
   * Filled with the day of the act by {@link WorkItemService.setStatus} when a
   * row is marked done holding none, and never overwritten by it; otherwise the
   * planner's. Where a done row's bar stops. See `schema.ts` and ADR 0024.
   */
  factEnd: IsoDate | null;
  /**
   * What the planner has said about whether this leaf is ready to start, or
   * null where nobody has said. Always null on a parent. One input to the
   * row's folded status (`leafStatusOf`), never the status itself.
   */
  readiness: Readiness | null;
  /**
   * The planner's hold on this leaf, or null for none. Always null on a
   * parent. `on_hold` takes the leaf out of the schedule input; `blocked`
   * does not (ADR 0032).
   */
  hold: Hold | null;
  /**
   * How important this work is — an integer of 1 or more, smaller being more
   * important — or null for "nobody has said".
   *
   * An ordering of the leveller's queue, never a constraint on the calendar. See
   * `schedule.ts`'s `goesFirst` for what it decides and `schema.ts` for why
   * null is a state of its own.
   */
  priority: number | null;
  /** The service or team this work is labelled with, or null. */
  serviceTeamId: string | null;
  /**
   * Which service delivers this work, or null for "nobody has said".
   *
   * A column and not a set (design.md D2): one service per item. Nothing to do
   * with {@link serviceTeamId} above it, whose name is a leftover — that one is
   * a **team**, and it keeps the name for one release because blue and green
   * share one SQLite file mid-swap (D9).
   *
   * Null is _unstated_ and inherits, exactly as an empty `teamIds` or `tagIds`
   * does; see `effectiveServicesOf` in `libs/wbs/domain/domain` for the walk. There is no
   * third "deliberately no service" state.
   *
   * On {@link WorkItem} rather than {@link LabelledWorkItem} because it is
   * stored in the row: a restore that dropped it would bring a subtree back
   * unlabelled, and the label would have been lost by the undo that was
   * supposed to preserve it.
   */
  serviceId: string | null;
  /**
   * How many people may be on this work item at once — an integer of 1 or
   * more, never null, because 1 and unset are the same fact.
   *
   * The **stored** number. What the schedule actually runs the work at is
   * narrower: `widthFor` clamps it to the team's own size and drops it to 1 for
   * a named assignee. See `schema.ts`.
   */
  maxParallel: number;
  /**
   * How many times this work item has been written to, counting writes to its
   * estimates, assignments and dependencies — and not counting a change to the
   * number derived for it. See `schema.ts` for the whole rule.
   */
  revision: number;
}

/**
 * A work item as every read of a plan gives it: the stored row, plus the teams
 * it is joined to.
 *
 * A second interface rather than a field on {@link WorkItem}, because
 * {@link WorkItem} is also what a **write** takes — `insert`, the journal's
 * `restore_subtree` rows and every fixture build one — and `work_item` has no
 * column for a set. The two shapes are genuinely different facts about the same
 * thing: what is stored in the row, and what is joined to it.
 *
 * `teamIds` is ordered by team id, so two reads of an unchanged plan answer the
 * same array — `openspec/changes/team-sets/design.md` D6. Empty means the row
 * states nothing and inherits; see `effectiveTeamsOf` in `libs/wbs/domain/domain`.
 */
export interface LabelledWorkItem extends WorkItem {
  teamIds: readonly string[];
  /**
   * What kind of thing the row is, 0..n, and **independent of `teamIds` in every
   * respect** — a row states either, both or neither, and inheriting one says
   * nothing about the other.
   *
   * Ordered by tag id, for `teamIds`' reason. **What the row states, and only
   * that**: the tags in force on it are these plus every ancestor's, unioned by
   * `effectiveTagsOf` in `libs/wbs/domain/domain` (ADR 0008). A row that states none is not
   * a special case there — it simply adds nothing to what it was carrying.
   *
   * Unlike `teamIds` this has no column behind it and never had one: there is no
   * `work_item.tagId` to be the outgoing release's copy, because the dimension
   * arrived after the set was already the shape. `work_item_tag` is the whole of
   * the fact.
   */
  tagIds: readonly string[];
  /**
   * What this row delivers, 0..n, off `work_item_service` and **never**
   * `work_item.service_id`.
   *
   * Here from task 10.2, where the third dimension stopped being a column: the
   * comment this replaces argued the field would be a second declaration of the
   * fact the row already carried, and that argument died with the join table.
   * {@link WorkItem.serviceId} is still declared and still written by the
   * outgoing release, and is read by nothing in this one (design D2) — so this
   * is now the only place a reader may learn what a row delivers.
   *
   * Ordered by service id, `teamIds`' rule and for its reason: two reads of an
   * unchanged plan answer the same array. Empty means the row states nothing and
   * inherits; see `effectiveServicesOf` in `libs/wbs/domain/domain`.
   */
  serviceIds: readonly string[];
  /**
   * What kind of work the row **is** — `Story`, `Bug`, `Spike`, `Epic`.
   *
   * Zero or one since WBS 010.4.10; the array stays so several can return
   * without a migration. More than one is a **type conflict** (an older writer
   * mid-swap, or data from before the rule), read whole and never trimmed here;
   * `WorkItemService.patch` refuses to author one.
   *
   * The fourth dimension, and the one whose empty case does **not** mean what
   * the other three's does. Empty here means the row has no type, full stop: it
   * does not inherit, there is no `effectiveTypesOf` beside `effectiveTagsOf`,
   * and a reader may take this array as the whole answer. A child of an `Epic`
   * is emphatically not an `Epic`, which is the argument in
   * `docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md`.
   *
   * That makes this the only one of the four a face can draw without walking the
   * tree, and the only one whose chips are all removable — nothing on it was
   * stated somewhere else.
   *
   * Ordered by type id, `teamIds`' rule and for its reason: two reads of an
   * unchanged plan answer the same array.
   */
  typeIds: readonly string[];
  /**
   * Where this row's work also exists, in the order the refs were added.
   *
   * **Not a label set, and the only reference-shaped field here that is a list
   * of records rather than of ids.** A tag or a service is a name from a
   * vocabulary; a ref is a vocabulary name *plus* the address of one thing, and
   * two refs into the same system are two different links rather than one fact
   * stated twice.
   *
   * Nothing inherits here either: a ref is on the row that carries it.
   */
  externalRefs: readonly ExternalRef[];
}

/**
 * One link out of a work item: which system, and where.
 *
 * `systemId` is the **stored** derivation (design D1) — `systemOfUrl` answered
 * it when the ref was written and nothing re-derives it on read, so a ref keeps
 * the type it was given when the rule later changes.
 *
 * `url` is a string and not a parsed URL: it is stored as typed, and every
 * surface that renders it as a link checks the scheme first. A `javascript:`
 * URL written by a peer edit is the fault that rule exists for.
 *
 * `name` is what a reader calls this link, and `''` means they have not said.
 * That is a stated absence rather than a missing value — the column is
 * `NOT NULL DEFAULT ''`, so there is one spelling of it — and every surface
 * draws `refLabelOf(url)` in its place. Never fetched: see the table's own
 * JSDoc for why a typed name is not the cached title this table refuses.
 */
export interface ExternalRef {
  id: string;
  systemId: string;
  url: string;
  name: string;
}

/**
 * One external system in the global directory — {@link Tag}'s two columns.
 *
 * Seeded where the tag is empty: these names are what `systemOfUrl` can answer,
 * so the vocabulary and the deriving rule are one fact.
 */
export interface ExternalSystem {
  id: string;
  name: string;
}

/**
 * One tag in the global directory: an id and a name, and deliberately nothing
 * else.
 *
 * **No size and no capacity**, unlike {@link ServiceTeam}, which still carries
 * a retired `size`. That absence is the model rule — a tag says what kind of
 * thing a work item is, and nothing about a tag is ever spent — and it is
 * visible here, in the table, and on the directory page, which renders tags
 * with no capacity column.
 */
export interface Tag {
  id: string;
  name: string;
}

/**
 * One work item type in the global directory: an id and a name, nothing else.
 *
 * {@link Tag}'s two columns, for {@link Tag}'s reason — nothing about a type is
 * ever spent — and for one more of its own: the change that adds this dimension
 * rules out a type deciding anything, so there is deliberately no colour here,
 * no default, no ordering weight and no `isDefault`. A type is a label, and a
 * reader's taxonomy is not the tool's to interpret.
 */
export interface WorkItemType {
  id: string;
  name: string;
}

/**
 * One service in the global directory: an id and a name, and nothing else.
 *
 * {@link Tag}'s two columns, and for a different reason than the tag's. A tag
 * has no size because nothing about a tag is ever spent; a service has none
 * because a service is not a pool either — it is what the work is part of, and
 * who has the people is {@link ServiceTeam}, whose name is a leftover. The
 * ownership between the two is `team_service`, read through
 * {@link DirectoryStore} and never a column here.
 */
export interface Service {
  id: string;
  name: string;
}
