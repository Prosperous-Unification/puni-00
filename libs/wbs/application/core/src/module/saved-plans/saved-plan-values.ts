import type { PlanDiff, PlanSide } from '@wbs/domain';

import type { SavedPlanIntegrityRefusal } from './saved-plan-integrity';

/** One side of a saved plan, as it was read back and verified. */
export interface SavedPlanReadBody {
  /** The version those bytes were written under, off the header. */
  readonly schemaVersion: number;
  /** The stored bytes, unparsed and unmodified. */
  readonly bytes: string;
  /** The header's hash, which this read recomputed over {@link bytes} and matched. */
  readonly sha256: string;
}

/**
 * The schedule side of a read — present with its bytes, or absent with a reason.
 *
 * A union for the same reason {@link SavedPlanScheduleWrite} is one: the two
 * states have disjoint fields, and a caller that has to test five nullable
 * columns to learn which it holds is a caller that will get it wrong once.
 */
export type SavedPlanReadSchedule =
  | {
      readonly present: true;
      readonly body: SavedPlanReadBody;
      /** The `input_sha256` these dates were computed from, as stored. */
      readonly inputSha256: string;
      readonly algorithmId: string;
    }
  | { readonly present: false; readonly absentReason: string };

/** One saved plan, handed back as it was stored. */
export interface SavedPlanRead {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly input: SavedPlanReadBody;
  readonly schedule: SavedPlanReadSchedule;
}

/**
 * Which side of a comparison a caller named (task 7.3b).
 *
 * A tagged union rather than `string | 'current'`, because the two are not the
 * same kind of thing and a plan whose id happened to be the literal `current`
 * would otherwise silently address the live plan.
 */
export type SavedPlanSideRef =
  { readonly kind: 'current' } | { readonly kind: 'saved'; readonly savedPlanId: string };

/**
 * What a comparison answers.
 *
 * The refusals name the *side* that produced them, because the two sides fail
 * independently and a caller shown "not found" with no id cannot tell which of
 * its two pickers to correct.
 */
export type SavedPlanCompareOutcome =
  | { readonly outcome: 'compared'; readonly diff: PlanDiff }
  | { readonly outcome: 'no_project' }
  | { readonly outcome: 'not_found'; readonly savedPlanId: string }
  | {
      readonly outcome: 'corrupt';
      readonly savedPlanId: string;
      readonly refusal: SavedPlanIntegrityRefusal;
    };

/** One resolved side, or the refusal {@link SavedPlanCompareOutcome} carries out. */
export type SavedPlanSideOutcome =
  | { readonly outcome: 'side'; readonly side: PlanSide }
  | Exclude<SavedPlanCompareOutcome, { outcome: 'compared' }>;

/**
 * The three answers a read has.
 *
 * `corrupt` is separate from `not_found` because they are different facts about
 * different things: one plan does not exist, the other exists and cannot be
 * trusted, and a surface that folded them would tell a user their saved plan
 * was never there.
 */
export type SavedPlanReadOutcome =
  | { readonly outcome: 'read'; readonly plan: SavedPlanRead }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'corrupt'; readonly refusal: SavedPlanIntegrityRefusal };

/**
 * One row of a project's saved-plan list.
 *
 * **No body and no integrity verdict**, and both absences are deliberate. The
 * list is the index of a project's permanent records: verifying a hundred plans
 * to render a hundred names would read every stored byte on a page nobody asked
 * to open a plan from, and a list is exactly where {@link SavedPlanService.read}
 * has not been called yet. A corrupt plan is therefore listed like any other and
 * says so when it is opened — which is the honest order, because a plan that
 * cannot be read still exists, still occupies its quota and still has to be
 * deletable.
 *
 * The hashes and lengths ride along because the header already carries them:
 * they cost nothing here and a surface that shows a plan's size has them.
 */
export interface SavedPlanListEntry {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly inputBytes: number;
  /** The schedule side's stored length, or `null` for a schedule-less save. */
  readonly scheduleBytes: number | null;
  /**
   * Why there is no schedule, or `null` when there is one.
   *
   * `string` and not {@link SavedPlanScheduleAbsentReason}, matching the read
   * path exactly: the column is `text`, and `readOfStored` deliberately passes
   * an unrecognised reason through rather than refusing a plan over a label
   * that says nothing about its bytes. A list that narrowed harder than the
   * read would hide a plan the read is willing to hand over.
   */
  readonly scheduleAbsentReason: string | null;
}

/**
 * What a rename or a delete answered, once the permission rule has run.
 *
 * The repository's `SavedPlanTouchOutcome` is the storage layer's three
 * answers; this adds the fourth that only an authorised call can give. They are
 * two different types on purpose: `forbidden` is a fact about an actor and
 * `no_such_plan` is a fact about a row, and the repository is never told who is
 * asking.
 *
 * `not_found` rather than the repository's `no_such_plan`, because this is the
 * vocabulary `statusForRefusal` already maps for every other route.
 */
export type SavedPlanTouchResult =
  /**
   * The `projectId` is carried out rather than left to the caller to look up
   * (TASK-255). `/api/saved-plans/:id` deliberately does not repeat the project
   * in its path — a URL that named a project the plan does not belong to and was
   * still answered would lie about what it addressed — so the controller has no
   * other honest source for the id it must announce on.
   *
   * It comes from the authorisation read, which already selects
   * `savedPlan.projectId` to reach the project's owner. Reading it again after
   * the touch would be a second query and, for a delete, a query for a row that
   * is gone; reading it before, separately, would open a window in which the
   * announced project is not the one that was written.
   */
  | { readonly outcome: 'touched'; readonly projectId: string }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'forbidden' }
  /** Another connection held the write lock. Nothing changed; a retry may succeed. */
  | { readonly outcome: 'snapshot_busy' };
