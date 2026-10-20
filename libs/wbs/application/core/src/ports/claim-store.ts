import type { CredentialPair } from '@wbs/contracts';

export type { CredentialPair } from '@wbs/contracts';
import type { Claim } from '@wbs/domain';

import type { DirectoryStore } from './directory-store';
import type { ProgressKey } from './progress-store';
import type { WriteStamp } from './write-stamp';

export type { Claim } from '@wbs/domain';

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

/**
 * What {@link ClaimStore.add} answers: written, a claim's step or subtree was
 * already held (a unique index refused it), or a step to state already holds
 * progress. Either refusal writes nothing.
 */
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
  /**
   * Moves every claim on `fromWorkItemId` to `toWorkItemId` in place: ids,
   * steps, holders, runs, parents, writing account and write instant kept, so
   * whatever names a claim by id (a delegated claim, a later satellite) moves
   * with it. Both work items' revisions move. The hand-down of a leaf's claims
   * to its first child, and back on that child's undo, beside the other step
   * facts' `moveAll`.
   *
   * @throws when `toWorkItemId` already holds a claim on a moved step (the
   * unique index), and on every store failure.
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}

/**
 * Who may act as a person and whom a credential is pinned to: the two reads
 * `person_not_bound` and `credential_not_for_person` need (D5, D6).
 */
export interface ClaimIdentity {
  /**
   * The account bound to act as `personId` (`person.account_id`), or null when
   * none is.
   *
   * @throws when no person has this id; the claim reads the person first.
   */
  boundAccountOf(personId: string): Promise<string | null>;
  /**
   * The person the request's credential is pinned to
   * (`external_identity.person_id`), or null for an unpinned one. A request
   * with no upstream pair (a password or native session) is unpinned: pass null.
   */
  pinnedPersonOf(credential: CredentialPair | null): Promise<string | null>;
}

/**
 * The {@link ClaimIdentity} a directory answers: its binding and its pin reads
 * (`wbs-team-claims` D5, D6), so a claim reads the same rows `patchPerson`
 * and `link-credential-cli.ts` write.
 *
 * Proof: the pin read answering null made `refuses a pinned credential claiming
 * as another agent` (`claim-command.test.ts`, memory) and `claims as its
 * person and is refused as any other …` (`claim-identity.controller.db.test.ts`,
 * SQLite) accept the claim (watched 2026-10-20).
 */
export function claimIdentityOf(
  directory: Pick<DirectoryStore, 'boundAccountOf' | 'credentialPinOf'>,
): ClaimIdentity {
  return {
    boundAccountOf: (personId) => directory.boundAccountOf(personId),
    pinnedPersonOf: (credential) =>
      credential === null
        ? Promise.resolve(null)
        : directory.credentialPinOf(credential.issuer, credential.subject),
  };
}
