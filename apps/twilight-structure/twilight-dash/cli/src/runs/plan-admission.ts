import { canonicalJson } from '@twilight-burokrat/contracts';

import { assertClock, isCurrentOwner } from './plan-ownership';
import { addInteger, decodeManifest } from './record-codecs';
import type { Admission, Attempt, Manifest, Ownership, Revision, Run, Timestamp } from './records';
import type { RunGuard, StoreReply } from './run-store';

export interface AdmissionFacts {
  readonly ownership: Ownership;
  readonly observedAt: Timestamp;
  readonly lastObservedAt: Timestamp;
  readonly capacity: { readonly limit: number; readonly reserved: number };
  readonly run: Run;
  readonly manifest: Manifest;
  readonly attempts: readonly Attempt[];
  readonly admissions: readonly Admission[];
}
export interface AdmissionChange {
  readonly attempt: Attempt;
  readonly runRevision: Revision;
  readonly reserveSlot: boolean;
}

export interface MutationAuthority {
  readonly current: Ownership | null;
  readonly requested: Ownership;
  readonly observedAt: Timestamp;
  readonly lastObservedAt: Timestamp;
}

/** Verifies live ownership before any mutation or duplicate lookup. */
export function permitsMutation(authority: MutationAuthority): boolean {
  assertClock(authority.observedAt, authority.lastObservedAt);
  // Proof: removing the null-owner fence made `unowned bootstrap refuses mutations before inspecting target records` throw instead of refusing.
  return (
    authority.current !== null &&
    isCurrentOwner(authority.current, authority.requested, authority.observedAt)
  );
}

/** Plans insert-or-identical retention of complete canonical manifest content. */
export function planManifestRetention(
  authority: MutationAuthority,
  manifest: Manifest,
  existing: Manifest | undefined,
): StoreReply<Manifest> {
  if (!permitsMutation(authority)) return { kind: 'refused', reason: 'owner_stale' };
  decodeManifest(manifest);
  if (existing !== undefined) {
    // Proof: removing content comparison failed `trusted missing records and arithmetic overflow throw without reservations` on a conflicting retained manifest.
    if (canonicalJson(existing) !== canonicalJson(manifest))
      throw new Error('manifest integrity conflict');
    return { kind: 'duplicate', value: existing };
  }
  return { kind: 'applied', value: manifest };
}

/** Plans immutable initial run configuration against retained manifest content. */
export function planRunCreation(
  authority: MutationAuthority,
  run: Run,
  initial: Run | undefined,
  current: Run | undefined,
  manifest: Manifest | undefined,
): StoreReply<Run> {
  if (!permitsMutation(authority)) return { kind: 'refused', reason: 'owner_stale' };
  // Proof: bypassing initial-revision rejection failed `exact run and admission identities are idempotent after revision advances`.
  if (run.revision !== 0) return { kind: 'refused', reason: 'revision_conflict' };
  // Proof: removing missing-manifest rejection failed `run creation requires a retained manifest before any reservation`.
  if (manifest === undefined) throw new Error('manifest does not exist');
  decodeManifest(manifest);
  // Proof: bypassing retained-manifest identity matching failed the trusted missing-records test.
  if (manifest.digest !== run.manifestDigest) throw new Error('run manifest differs');
  if (initial !== undefined) {
    // Proof: bypassing initial identity comparison failed the exact run/admission identity test.
    if (canonicalJson(initial) !== canonicalJson(run))
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: removing the trusted current-run guard failed the trusted missing-records test.
    if (current === undefined) throw new Error('run does not exist');
    return { kind: 'duplicate', value: current };
  }
  return { kind: 'applied', value: run };
}

/** Plans one queued admission from a consistent provider view. Duplicate identities precede revision checks but never current-owner validation. */
export function planAdmission(
  facts: AdmissionFacts,
  guard: RunGuard,
  admission: Admission,
): StoreReply<AdmissionChange> {
  assertClock(facts.observedAt, facts.lastObservedAt);
  if (!isCurrentOwner(facts.ownership, guard.ownership, facts.observedAt))
    return { kind: 'refused', reason: 'owner_stale' };
  // Proof: bypassing run identity matching failed `admission enforces run identity, stored budget, contiguous ordinals and active occurrence`.
  if (facts.run.runId !== guard.runId || admission.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'identity_conflict' };
  const manifest: unknown = facts.manifest;
  // Proof: removing this missing-manifest rejection failed the trusted missing-records test before an admission plan could reserve capacity.
  if (manifest === undefined) throw new Error('manifest does not exist');
  decodeManifest(facts.manifest);
  // Proof: bypassing manifest identity matching failed the trusted missing-records test.
  if (facts.manifest.digest !== facts.run.manifestDigest) throw new Error('run manifest differs');
  const previous = facts.admissions.find(
    (candidate) => candidate.attemptId === admission.attemptId,
  );
  if (previous !== undefined) {
    // Proof: bypassing immutable admission comparison failed the exact run/admission identity test.
    if (canonicalJson(previous) !== canonicalJson(admission))
      return { kind: 'refused', reason: 'identity_conflict' };
    const attempt = facts.attempts.find((candidate) => candidate.attemptId === admission.attemptId);
    // Proof: removing the retained-attempt guard failed the trusted missing-records test.
    if (attempt === undefined) throw new Error('admitted attempt does not exist');
    return {
      kind: 'duplicate',
      value: { attempt, runRevision: facts.run.revision, reserveSlot: false },
    };
  }
  // Proof: bypassing revision comparison made `stale run revision cannot reserve another slot` reserve a second slot.
  if (facts.run.revision !== guard.expectedRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  const history = facts.attempts.filter(
    (attempt) =>
      attempt.identity.runId === guard.runId &&
      attempt.identity.occurrenceId === admission.identity.occurrenceId,
  );
  // Proof: removing operation-key preservation failed the admission identity/budget/ordinal test.
  if (history.some((attempt) => attempt.identity.operationKey !== admission.identity.operationKey))
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: bypassing the stored budget failed the admission identity/budget/ordinal test with ordinal 4 and budget 3.
  if (admission.ordinal > facts.run.maxAttempts)
    return { kind: 'refused', reason: 'retry_exhausted' };
  const ordinal = addInteger(
    history.reduce((highest, attempt) => Math.max(highest, attempt.ordinal), 0),
    1,
  );
  // Proof: bypassing contiguity failed the admission identity/budget/ordinal test with initial ordinal 2.
  if (admission.ordinal !== ordinal) return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: bypassing active-occurrence rejection failed the admission identity/budget/ordinal test by admitting a queued predecessor's retry.
  if (history.length > 0) return { kind: 'refused', reason: 'attempt_active' };
  // Proof: bypassing capacity comparison made `capacity one admits exactly one concurrent run without changing the loser` admit both runs.
  if (facts.capacity.reserved >= facts.capacity.limit)
    return { kind: 'refused', reason: 'capacity_full' };
  return {
    kind: 'applied',
    value: {
      attempt: {
        version: 1,
        attemptId: admission.attemptId,
        identity: admission.identity,
        ordinal: admission.ordinal,
        revision: 0,
        admittedEpoch: facts.ownership.epoch,
        state: { kind: 'queued', claim: null },
        holdsCapacity: true,
      },
      runRevision: addInteger(facts.run.revision, 1),
      reserveSlot: true,
    },
  };
}
