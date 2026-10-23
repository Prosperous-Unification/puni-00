import type { CredentialPin } from '@wbs/contracts';

export type { CredentialPair, CredentialPin } from '@wbs/contracts';
import type { Claim, LeaseReleaseReason, LeaseStanding, OccupancyRow } from '@wbs/domain';

import type { DirectoryStore } from './directory-store';
import type { ProgressKey } from './progress-store';
import type { WriteStamp } from './write-stamp';

export type { Claim, OccupancyRow, ResourceUnits } from '@wbs/domain';

/**
 * One stored `claim_occupancy` row: the copy of its leaf's units of one
 * resource that one claim carries (`wbs-resources` R3, {@link OccupancyRow}).
 */
export interface ClaimOccupancy {
  readonly claimId: string;
  readonly resourceId: string;
  readonly units: number;
}

/**
 * A stored claim with the instant it was written: `created_at`, which an undo
 * of a release writes afresh, so it reads when the claim last came into force.
 * `leaseExpiresAt` is the instant it must be renewed by, or null for a claim
 * nobody renews (`wbs-claim-leases` L1).
 */
export interface StampedClaim extends Claim {
  readonly claimedAt: number;
  readonly leaseExpiresAt: number | null;
}

/** The claim without its write instant or lease, as {@link ClaimStore.listByProject} answers it. */
export function unstampClaim({
  claimedAt: _claimedAt,
  leaseExpiresAt: _leaseExpiresAt,
  ...claim
}: Claim & { readonly claimedAt: number | null; readonly leaseExpiresAt: number | null }): Claim {
  return claim;
}

/** The lease one claim is written with: the instant it must be renewed by (L1). */
export interface ClaimLease {
  readonly claimId: string;
  readonly expiresAt: number;
}

/** A claim whose lease has run out, and why (`wbs-claim-leases` L5, L8). */
export interface ExpiredLease {
  readonly claimId: string;
  readonly reason: LeaseReleaseReason;
}

export type { LeaseStanding } from '@wbs/domain';

/**
 * What {@link ClaimStore.add} answers: written, a claim's step or subtree was
 * already held (a unique index refused it), a step to state already holds
 * progress, or an occupancy names a resource the directory no longer holds.
 * Every refusal writes nothing.
 */
export type ClaimWriteOutcome = 'written' | 'taken' | 'progress_stated' | 'unknown_resource';

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
   * Every occupancy row of the project's claims, each with its claim's work
   * item, person and run, ordered by work item, resource, then claim. The
   * occupancy a claim reads and the one every per-resource read folds
   * (`occupancyByResource`).
   */
  occupancyOf(projectId: string): Promise<OccupancyRow[]>;
  /**
   * Inserts `claims` verbatim — id, run, parent and writing account included —
   * with the `occupancy` rows they carry, and states each of `stated`
   * `in_progress` at the stamp's instant. The free-units check is not the
   * store's: the claim decides it inside the batch's transaction
   * (`refuseOccupancy`), so the store writes what it was given.
   *
   * A claim named in `leases` is written with that expiry; every other claim
   * is leaseless. Absent `leases` writes every claim leaseless.
   *
   * @throws when an occupancy row or a lease names a claim not in `claims`.
   */
  add(
    claims: readonly Claim[],
    stated: readonly ProgressKey[],
    stamp: WriteStamp,
    occupancy: readonly ClaimOccupancy[],
    leases?: readonly ClaimLease[],
  ): Promise<ClaimWriteOutcome>;
  /**
   * Moves every lease of `personId` that is in force at `at`, not revoked, and
   * expires before `renewal.dueBefore` to `renewal.expiresAt`, in every
   * project (`wbs-claim-leases` L4, L5), and answers the person's standing
   * after it. It reads first and takes the write turn only when one lease is
   * due, so a heartbeat within the resolution never waits for a write.
   */
  renewLeases(
    personId: string,
    at: number,
    renewal: { readonly expiresAt: number; readonly dueBefore: number },
  ): Promise<LeaseStanding>;
  /**
   * The project's claims whose lease has run out at `at` (expiry at or before
   * it), in claim-id order, each with its reason: `credential_revoked` when
   * the holder's last live credential was revoked, else `lease_expired`.
   */
  expiredLeasesOf(projectId: string, at: number): Promise<ExpiredLease[]>;
  /**
   * The projects holding a claim whose lease has run out at `at`, at most
   * `limit` of them, in project-id order: what one sweep tick works through.
   */
  projectsWithExpiredLeases(at: number, limit: number): Promise<string[]>;
  /**
   * Removes exactly `claims` by id, with their occupancy rows, and the
   * progress statements on `cleared`.
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
   * The person the request's credential is pinned to: a machine credential's
   * own person, or for an upstream pair `external_identity.person_id`; null
   * for an unpinned one. A request with neither (a password or native
   * session) is unpinned: pass null.
   */
  pinnedPersonOf(credential: CredentialPin | null): Promise<string | null>;
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
    pinnedPersonOf: (credential) => {
      if (credential === null) return Promise.resolve(null);
      if ('personId' in credential) return Promise.resolve(credential.personId);
      return directory.credentialPinOf(credential.issuer, credential.subject);
    },
  };
}
