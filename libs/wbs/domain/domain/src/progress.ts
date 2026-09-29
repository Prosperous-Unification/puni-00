/**
 * Where the work has got to: three statuses, per step, and the one rule that
 * turns a row's steps into a reading of the row.
 *
 * Dany, 2026-08-18: _"maybe we should augment actual days by completion
 * status?"_ — asked the day after actuals shipped, and the reason it is the
 * right question is in `openspec/changes/actual-days/design.md` D3: an actual
 * with no completion state beside it cannot tell **"took 8 days, finished"**
 * from **"8 days so far"**, and those two mean opposite things for every
 * successor. This module is the vocabulary that tells them apart.
 *
 * It lives in `@wbs/domain` rather than in be-01 because it is a **rule both
 * apps share**, in the sense `effectiveTeamsOf` is: the API derives an item's
 * status for its payload, and a face that folds a subset of rows — a filtered
 * table, a collapsed branch, a card — has to derive the same answer from the
 * same fold or the two disagree on screen about a plan neither of them changed.
 */

/**
 * What one step has said about its own work on one work item — its
 * **progress**, in `CONTEXT.md`'s word.
 *
 * **Two values, because the third is the absence of a row.** "Unknown" is
 * never stored: it is what a work item with no `step_progress` row for that step
 * reads as, exactly as an unstated capacity and an unrecorded actual are
 * absences rather than zeroes (`project_team_capacity` and `actual` in be-01's
 * `schema.ts`). Storing it would give two spellings of "nobody has said" — no
 * row, and a row saying nothing — and every reader would have to handle both.
 *
 * **No `blocked` and no `cancelled`**, and that is a refusal rather than an
 * omission: each extra state is a question the engine must answer the day it
 * starts reading this — what a blocked predecessor does to its successors'
 * floor, whether a cancelled step's estimate leaves the plan's totals — and the
 * engine is not reading this yet. Three states can be added to; a fourth shipped
 * now would be a meaning nobody has agreed, stored on real plans, in rows the
 * next change has to interpret.
 */
export type StepState = 'in_progress' | 'done';

/**
 * What a work item's step progress folds to: nothing said, part-way through,
 * or finished. {@link agree} and {@link statusOf} compute it; it is one input
 * to a leaf's {@link WorkItemStatus}, never the whole of it.
 */
export type ProgressStatus = 'unknown' | StepState;

/**
 * What the planner has said about whether a leaf is defined well enough to
 * start. Stored once per leaf, null when unsaid; a parent holds none. It has no
 * per-step source, which is why a column is its single source where ADR 0024
 * refused a stored row status.
 */
export const READINESSES = ['draft', 'ready'] as const;
export type Readiness = (typeof READINESSES)[number];

/**
 * The planner's statement that work on a leaf is stopped. `on_hold` takes the
 * leaf out of the schedule ({@link withoutHeldSubtrees}); `blocked` leaves the
 * schedule alone. Stored beside readiness and progress, never instead of them,
 * so clearing it returns the leaf to what it read before. See
 * `docs/adr/0032-a-hold-leaves-the-plan-blocked-is-a-reading.md`.
 */
export const HOLDS = ['on_hold', 'blocked'] as const;
export type Hold = (typeof HOLDS)[number];

/**
 * What a **work item** reads as — its **status**. Derived on every read and
 * never stored: a leaf from its progress, hold, readiness and predecessors
 * ({@link leafStatusOf}, then {@link blockedByProxyOf}); a parent from its
 * children ({@link foldStatuses}).
 *
 * `unknown` was spelled `not_started` until 2026-09-12: "not started" claims to
 * know something about work nobody has spoken about. `blocked_by_proxy` is said
 * by the dependency graph and never by anyone, so nothing may set it.
 */
export const WORK_ITEM_STATUSES = [
  'unknown',
  'draft',
  'ready',
  'in_progress',
  'blocked_by_proxy',
  'on_hold',
  'blocked',
  'done',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** A leaf's status before its predecessors are read: every status but `blocked_by_proxy`. */
export type LeafStatus = Exclude<WorkItemStatus, 'blocked_by_proxy'>;
export const LEAF_STATUSES: readonly LeafStatus[] = WORK_ITEM_STATUSES.filter(
  (status): status is LeafStatus => status !== 'blocked_by_proxy',
);

/** The two states a step may be stored in, in the order a face should offer them. */
export const STEP_STATES: readonly StepState[] = ['in_progress', 'done'];

/** Nothing has been said about this work, by anybody, for any step. */
export const UNKNOWN = 'unknown';

/**
 * The seven statuses `setStatus` accepts, in the order the row menu offers
 * them. `blocked_by_proxy` is not among them: the dependency graph says it,
 * never a person. `in_progress` writes the first silent step's statement,
 * since a row's progress is still the steps' (`add-work-item-statuses`).
 */
export const SETTABLE_STATUSES = [
  'draft',
  'ready',
  'in_progress',
  'on_hold',
  'blocked',
  'done',
  'unknown',
] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/** Whether a value off the wire is one of the two states a step may be put in. */
export function isStepState(value: unknown): value is StepState {
  return value === 'in_progress' || value === 'done';
}

/** Whether a stored or posted value is one of the two readinesses. */
export function isReadiness(value: unknown): value is Readiness {
  // Proof: reduced to `typeof value === 'string'` and `admit exactly their own
  // closed sets` failed with `Expected: false, Received: true`; watched
  // 2026-09-28. Slice 3 proves it again through the routes that call it.
  return typeof value === 'string' && (READINESSES as readonly string[]).includes(value);
}

/** Whether a stored or posted value is one of the two holds. */
export function isHold(value: unknown): value is Hold {
  // Proof: reduced to `typeof value === 'string'` and `admit exactly their own
  // closed sets` failed with `Expected: false, Received: true`; watched
  // 2026-09-28.
  return typeof value === 'string' && (HOLDS as readonly string[]).includes(value);
}

/**
 * Whether a value off the wire is a status a row may be set to.
 *
 * Proof: `blocked_by_proxy` admitted here made `admits the seven statuses a
 * row may be set to…` fail on `Expected: false, Received: true`; watched
 * 2026-09-29.
 */
export function isSettableStatus(value: unknown): value is SettableStatus {
  return typeof value === 'string' && (SETTABLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Two readings of one thing, combined: **they agree, or the thing is in
 * progress.**
 *
 * That is the whole rule, and it is the answer to "what is an item whose steps
 * disagree". Dev finished and QA has not started is not a finished item and it
 * is not an untouched one — it is an item somebody is part-way through, which is
 * the only reading that is true of every plan it can arise on.
 *
 * **`done` is therefore unanimous.** An item is finished when every step with
 * work on it says so, and one silent step is enough to keep it in progress. The
 * alternative — done as soon as any step says done — would let a plan report
 * finished work that nobody has tested, which is precisely the claim a
 * completion state exists to stop somebody making by accident.
 *
 * Associative, commutative and idempotent, which is what lets a parent be
 * folded from its children's statuses rather than from every leaf step beneath
 * it: both routes reach the same answer, so there is no ordering of the tree
 * that changes what a branch reads as.
 */
export function agree(a: ProgressStatus, b: ProgressStatus): ProgressStatus {
  return a === b ? a : 'in_progress';
}

/**
 * The status a collection reads as: {@link agree} across all of it, and
 * {@link UNKNOWN} when there is nothing in it.
 *
 * Empty means nobody has said anything — an item with no steps, a branch with no
 * leaves, a plan on its first day. Reading that as "unknown" rather than as
 * "done vacuously" is the same choice `rollUp` makes when it leaves an
 * unestimated step absent instead of zero: an empty statement is not a
 * statement.
 */
export function statusOf(statuses: Iterable<ProgressStatus>): ProgressStatus {
  let answer: ProgressStatus | null = null;
  for (const status of statuses) answer = answer === null ? status : agree(answer, status);
  return answer ?? UNKNOWN;
}

/** The three facts a leaf's own status is read from; its predecessors come after. */
export interface LeafFacts {
  readonly progress: ProgressStatus;
  readonly hold: Hold | null;
  readonly readiness: Readiness | null;
}

/**
 * A leaf's status from its own facts, first match winning: finished work,
 * then a hold, then running work, then readiness, else unknown.
 *
 * **Done outranks a hold** because a hold on finished work stops nothing, and
 * the command refuses to set one. **A hold outranks running work** because it
 * is the planner's later word about work the steps said had started; clearing
 * it returns the leaf to `in_progress`. **Running work outranks readiness**:
 * once a step has spoken, whether the item was ready is history.
 * `blocked_by_proxy` ranks between running work and readiness and is applied
 * afterwards, from the graph, by {@link blockedByProxyOf}.
 */
export function leafStatusOf({ progress, hold, readiness }: LeafFacts): LeafStatus {
  if (progress === 'done') return 'done';
  if (hold !== null) return hold;
  if (progress === 'in_progress') return 'in_progress';
  return readiness ?? UNKNOWN;
}

/**
 * The statuses that say a work item is not moving: held, blocked, or behind
 * either.
 *
 * Proof: `blocked_by_proxy` dropped from this set and the partition property in
 * `progress.property.test.ts` failed on counterexample `["blocked_by_proxy"]`
 * (a lone proxy leaf folding to `ready`), as did `is blocked by proxy when
 * every child is stopped…`; watched 2026-09-28.
 */
export const STOPPED_STATUSES: ReadonlySet<WorkItemStatus> = new Set([
  'on_hold',
  'blocked',
  'blocked_by_proxy',
]);

/**
 * A parent's status from its children's, in order: all done, all on hold or
 * all blocked read as that; any done or in progress reads `in_progress`; all
 * {@link STOPPED_STATUSES} reads `blocked_by_proxy`; otherwise the children
 * that are not stopped decide — any `unknown`, else any `draft`, else `ready`.
 * No children reads `unknown`, for {@link statusOf}'s reason.
 *
 * Every clause is an all-or-any predicate over a class of statuses that a
 * child's own fold stays inside, so folding a parent from its children and
 * from every leaf beneath it give the same answer for any partition of the
 * leaves (`progress.property.test.ts`). That is what lets be-01 fold the tree
 * level by level while fe-01 folds whatever subset a filter leaves.
 */
export function foldStatuses(children: Iterable<WorkItemStatus>): WorkItemStatus {
  const seen = [...children];
  if (seen.length === 0) return UNKNOWN;
  const everyChild = (status: WorkItemStatus) => seen.every((child) => child === status);
  if (everyChild('done')) return 'done';
  if (everyChild('on_hold')) return 'on_hold';
  if (everyChild('blocked')) return 'blocked';
  if (seen.some((child) => child === 'done' || child === 'in_progress')) return 'in_progress';
  const moving = seen.filter((child) => !STOPPED_STATUSES.has(child));
  if (moving.length === 0) return 'blocked_by_proxy';
  if (moving.includes(UNKNOWN)) return UNKNOWN;
  if (moving.includes('draft')) return 'draft';
  return 'ready';
}
