import type { Claim } from '@wbs/domain';

import type { ProgressKey } from './progress-store';
import type { WriteStamp } from './write-stamp';

export type { Claim } from '@wbs/domain';

/**
 * What {@link ClaimStore.add} answers: written, a claim's step or subtree was
 * already held (a unique index refused it), or a step to state already holds
 * progress. Either refusal writes nothing.
 */
/**
 * A stored claim with the instant it was written: `created_at`, which an undo
 * of a release writes afresh, so it reads when the claim last came into force.
 */
export interface StampedClaim extends Claim {
  readonly claimedAt: number;
}

/** The claim without its write instant, as {@link ClaimStore.listByProject} answers it. */
export function unstampClaim({
  claimedAt: _claimedAt,
  ...claim
}: Claim & { readonly claimedAt: number | null }): Claim {
  return claim;
}

export type ClaimWriteOutcome = 'written' | 'taken' | 'progress_stated';

/**
 * The claims of one project (`wbs-team-claims` D1–D8) and the one progress
 * statement a claim makes: `in_progress` on a step nobody has spoken about.
 *
 * The two travel in one call so a claim and its statement land in one
 * transaction with one revision bump per work item, and an undo takes both
 * back the same way. Neither method reads or writes assignments.
 *
 * It also answers the two identity reads the claim rules need
 * ({@link ClaimIdentity}), so the claim and its rules read one admitted scope.
 */
export interface ClaimStore extends ClaimIdentity {
  /** Every claim on a work item of the project, ordered by work item then step. */
  listByProject(projectId: string): Promise<Claim[]>;
  /**
   * {@link listByProject} with each claim's write instant, for the startable
   * read's list of claimed steps.
   *
   * @throws for a stored claim with no write instant: every claim is written
   * through {@link add}, which stamps it.
   */
  listStampedByProject(projectId: string): Promise<StampedClaim[]>;
  /** One claim of the project by id; null when absent, released or another project's. */
  findById(projectId: string, claimId: string): Promise<Claim | null>;
  /**
   * Inserts `claims` verbatim — id, run, parent and writing account included —
   * and states each of `stated` `in_progress` at the stamp's instant.
   */
  add(
    claims: readonly Claim[],
    stated: readonly ProgressKey[],
    stamp: WriteStamp,
  ): Promise<ClaimWriteOutcome>;
  /**
   * Removes exactly `claims` by id and the progress statements on `cleared`.
   *
   * @throws when a claim to remove is no longer stored: every caller read it in
   * the same unit of work, or replays it behind a revision precondition.
   */
  remove(
    claims: readonly Claim[],
    cleared: readonly ProgressKey[],
    stamp: WriteStamp,
  ): Promise<void>;
}

/**
 * Who may act as a person and whom a credential is pinned to: the two reads
 * `person_not_bound` and `credential_not_for_person` need (D5, D6).
 */
export interface ClaimIdentity {
  /** The account bound to act as `personId`, or null when none is. */
  boundAccountOf(personId: string): Promise<string | null>;
  /** The person the actor's credential is pinned to, or null for an unpinned credential. */
  pinnedPersonOf(actorId: string): Promise<string | null>;
}

/**
 * The identity reads before `person.account_id` and `external_identity.person_id`
 * exist (`wbs-team-claims` task 2.1, branch `feat/wbs-person-account`): no
 * person is bound and no credential is pinned. Until then only an organization
 * admin can claim, through the `person_not_bound` bypass.
 */
export const UNBOUND_CLAIM_IDENTITY: ClaimIdentity = {
  boundAccountOf: () => Promise.resolve(null),
  pinnedPersonOf: () => Promise.resolve(null),
};
