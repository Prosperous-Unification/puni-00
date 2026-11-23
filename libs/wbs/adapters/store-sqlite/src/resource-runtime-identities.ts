import {
  type ResourceRuntimeAdmission,
  resourceRuntimeAdmission,
  type ResourceRuntimeEvent,
  resourceRuntimeEvent,
  resourceRuntimeHostJobUse,
  resourceRuntimeUse,
} from '@wbs/contracts';
import { type } from 'arktype';

const label = '0 < string <= 2048';
const legacyUse = type({
  projectId: label,
  resourceId: label,
  workItemId: label,
  'stepId?': label,
  'attemptNumber?': 'number.integer > 0',
  agentRun: label,
  responsiblePersonId: label,
  locator: label,
  units: 'number.integer > 0',
  kind: "'temporary_directory' | 'git_worktree'",
  reservedDiskUnits: 'number.integer >= 0',
  reservedWorkspaceUnits: 'number.integer >= 0',
}).onDeepUndeclaredKey('reject');
const legacyHostJobUse = type({
  kind: "'host_job'",
  'projectId?': label,
  'workItemId?': label,
  'responsiblePersonId?': label,
  type: label,
  label,
  host: label,
  launcherSha: type(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).or('null'),
  reservations: type({ dimension: label, units: 'number.integer >= 0' }).array(),
})
  .onUndeclaredKey('reject')
  .onDeepUndeclaredKey('reject');
const legacyEvent = type({
  eventId: label,
  epoch: label,
  sequence: 'number.integer > 0',
  useId: label,
  incarnation: label,
  revision: 'number.integer > 0',
  kind: "'registered' | 'cleanup_pending' | 'blocked' | 'retained' | 'release_verified'",
  observedAt: 'number.integer >= 0',
  reason: label,
  'requestId?': 'number.integer > 0',
  use: legacyUse.or(legacyHostJobUse),
  /**
   * `returned` is a host job's: every reservation entry settled on its terminal evidence (J2'),
   * the digest and locator naming its run record ({@link hostJobRunRecordLocator}); a host job
   * whose gate never opened is `not_created` ({@link hostJobRunRecordAbsence}).
   */
  'evidence?': {
    digest: 'string',
    locator: label,
    disposition: "'removed' | 'not_created' | 'returned'",
    reclaimedBytes: 'null',
  },
  'retention?': { ownerPersonId: label, reviewAt: 'number.integer > 0' },
}).onDeepUndeclaredKey('reject');
const legacyAdmission = type({
  eventId: label,
  epoch: label,
  useId: label,
  incarnation: label,
  observedAt: 'number.integer >= 0',
  reason: label,
  use: legacyUse,
})
  .onUndeclaredKey('reject')
  .onDeepUndeclaredKey('reject');
const legacyAdmissionIdentity = type({
  authorityId: label,
  admission: legacyAdmission,
}).onDeepUndeclaredKey('reject');
const currentAdmissionIdentity = type({
  schemaVersion: '2',
  authorityId: label,
  admission: resourceRuntimeAdmission,
}).onDeepUndeclaredKey('reject');
const currentEventIdentity = type({
  schemaVersion: '2',
  event: resourceRuntimeEvent,
}).onDeepUndeclaredKey('reject');
const currentDeclarationIdentity = type({
  schemaVersion: '2',
  use: resourceRuntimeUse.or(resourceRuntimeHostJobUse),
}).onDeepUndeclaredKey('reject');
const legacyDeclaration = legacyUse.or(legacyHostJobUse);

/** Only JSON.stringify-produced identity columns use this exact-byte grammar; never snapshots/manual positional fingerprints. */
function readProducerIdentity(bytes: unknown): unknown {
  // Proof: resource-identity-producer-boundary.
  // Injected fault failed `resource identity rejects nontext native bytes before replay effects`; restored GREEN.
  // Injected fault failed `migrated runtime identity refuses trusted whitespace bytes before replay effects`; restored GREEN.
  // Injected fault failed `migrated runtime identity refuses trusted duplicate bytes before replay effects`; restored GREEN.
  // Evidence scope: ONE grouped text/producer-byte boundary. Native Uint8Array case proves contextual type-error diagnostic only (JSON.parse also throws); whitespace/duplicate cases are500→409. No independent per-line or native admission-bypass claim..
  if (typeof bytes !== 'string') throw new Error('resource runtime identity is not text');
  const candidate: unknown = JSON.parse(bytes);
  if (JSON.stringify(candidate) !== bytes)
    throw new Error('resource runtime identity is not an original JSON encoding');
  return candidate;
}
/** A present invalid tag stays on the tagged refusal path; optional owner absence never selects a format. */
function hasFormat(candidate: unknown): boolean {
  // Proof: resource-identity-format-dispatch.
  // Injected fault failed `new admission2 replays exactly and preserves its original current projection`; restored GREEN.
  // Evidence scope: producer/retained-reader schema consistency; valid current record is misrouted, not admission bypass.
  return typeof candidate === 'object' && candidate !== null && 'schemaVersion' in candidate;
}

/** Maps just the owned key in place; original entry order and absent optional host-job links remain distinct. */
function encodeLegacyUse(use: ResourceRuntimeEvent['use']): Record<string, unknown> {
  return Object.fromEntries(
    // Proof: resource-legacy-owned-key.
    // Injected fault failed `migrated registered resource replay compares old ordered owner spelling and returns original receipt`; restored GREEN.
    // Evidence scope: production-behavior.
    // Proof: resource-legacy-use-order.
    // Injected fault failed `migrated registered resource replay compares old ordered owner spelling and returns original receipt`; restored GREEN.
    // Evidence scope: production-behavior.
    Object.entries(use).map(([key, value]) => [key === 'workPackageId' ? 'projectId' : key, value]),
  );
}

/** Emits only new private admission2; public admission bodies retain their existing grammar. */
export function encodeResourceAdmission(
  authorityId: string,
  admission: ResourceRuntimeAdmission,
): string {
  // Proof: resource-new-admission-format.
  // Injected fault failed `new admission2 replays exactly and preserves its original current projection`; restored GREEN.
  // Evidence scope: current producer format/value contract; not separately a replay admission bypass.
  return JSON.stringify({ schemaVersion: 2, authorityId, admission });
}
/** Validates retained1/2 once and compares exact incoming identity in that format; never rewrites the retained string. */
export function matchesResourceAdmissionIdentity(
  bytes: string,
  authorityId: string,
  admission: ResourceRuntimeAdmission,
): boolean {
  const candidate = readProducerIdentity(bytes);
  if (hasFormat(candidate)) {
    // Proof: resource-current-admission-grammar.
    // Injected fault failed `resource admission rejects malformed tagged2 identity before original replay`; restored GREEN.
    // Evidence scope: production-behavior.
    currentAdmissionIdentity.assert(candidate);
    // Proof: resource-current-admission-equality.
    // Injected fault failed `new admission2 replays exactly and preserves its original current projection`; restored GREEN.
    // Evidence scope: actual current2 exact-byte retry admission; valid fresh stored2 and same identity keys with changed payload.
    return bytes === encodeResourceAdmission(authorityId, admission);
  }
  // Proof: resource-legacy-admission-grammar.
  // Injected fault failed `resource admission rejects malformed untagged1 identity before original replay`; restored GREEN.
  // Evidence scope: production-behavior.
  legacyAdmissionIdentity.assert(candidate);
  return (
    bytes ===
    JSON.stringify({
      authorityId,
      admission: { ...admission, use: encodeLegacyUse(admission.use) },
    })
  );
}

/** Emits event2 even for an unlinked host job, whose absent owner cannot discriminate historical format. */
export function encodeResourceEvent(event: ResourceRuntimeEvent): string {
  // Proof: resource-new-event-format.
  // Injected fault failed `new resource runtime identity has explicit format2 even without an optional planning owner`; restored GREEN.
  // Evidence scope: current producer format/value contract; not separately a replay admission bypass.
  return JSON.stringify({ schemaVersion: 2, event });
}
/** Original property order is part of replay identity; semantic equality or key sorting would broaden acceptance. */
export function matchesResourceEventIdentity(bytes: string, event: ResourceRuntimeEvent): boolean {
  const candidate = readProducerIdentity(bytes);
  if (hasFormat(candidate)) {
    // Proof: resource-current-event-grammar.
    // Injected fault failed `migrated runtime identity refuses trusted unknown_tag bytes before replay effects`; restored GREEN.
    // Evidence scope: production-behavior.
    currentEventIdentity.assert(candidate);
    // Proof: resource-current-event-equality.
    // Injected fault failed `new resource runtime identity has explicit format2 even without an optional planning owner`; restored GREEN.
    // Evidence scope: actual current2 exact-byte retry admission; valid fresh stored2 and same identity keys with changed payload.
    return bytes === encodeResourceEvent(event);
  }
  // Proof: resource-legacy-event-grammar.
  // Injected fault failed `migrated runtime identity refuses trusted mixed_owner bytes before replay effects`; restored GREEN.
  // Evidence scope: production-behavior.
  legacyEvent.assert(candidate);
  // Proof: resource-event-exact-retained-equality.
  // Injected fault failed `old runtime replay preserves exact root_order identity and refuses changed bytes`; restored GREEN.
  // Injected fault failed `old runtime replay preserves exact use_order identity and refuses changed bytes`; restored GREEN.
  // Injected fault failed `old runtime replay preserves exact linked_owner_absent identity and refuses changed bytes`; restored GREEN.
  // Injected fault failed `old runtime replay preserves exact unlinked_owner_present identity and refuses changed bytes`; restored GREEN.
  // Evidence scope: production-behavior.
  return bytes === JSON.stringify({ ...event, use: encodeLegacyUse(event.use) });
}
/**
 * Reads only the proof consumed by a resource-use terminal acknowledgment after validating
 * its complete original identity. No owner projection or retained-byte rewrite occurs.
 * @throws when recorded terminal state lacks the release kind/proof that ingestion required.
 */
export function readStoredResourceEvidence(
  bytes: string,
): NonNullable<ResourceRuntimeEvent['evidence']> {
  const candidate = readProducerIdentity(bytes);
  const observed = hasFormat(candidate)
    ? // Proof: resource-terminal-tagged-full-identity.
      // Injected fault failed `refuses malformed tagged original terminal event shape before acknowledgment`; restored GREEN.
      // Evidence scope: production-behavior.
      currentEventIdentity.assert(candidate).event
    : // Proof: resource-terminal-legacy-full-identity.
      // Injected fault failed `refuses malformed legacy original terminal event shape before acknowledgment`; restored GREEN.
      // Evidence scope: production-behavior.
      legacyEvent.assert(candidate);
  const proof = observed.evidence;
  if (
    // Proof: resource-terminal-kind.
    // Injected fault failed `refuses corrupt legacy terminal kind as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal kind as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: production-behavior.
    observed.kind !== 'release_verified' ||
    // Proof: resource-terminal-host-kind.
    // Injected fault failed `refuses corrupt legacy terminal host-job as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal host-job as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: production-behavior.
    observed.use.kind === 'host_job' ||
    // Proof: resource-terminal-proof-presence.
    // Injected fault failed `refuses corrupt legacy terminal missing-proof as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal missing-proof as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: contextual trusted-state refusal; accidental TypeError is rejected by actual adapter error oracle.
    proof === undefined ||
    // Proof: resource-terminal-digest.
    // Injected fault failed `refuses corrupt legacy terminal digest as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal digest as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: production-behavior.
    !/^[a-f0-9]{64}$/.test(proof.digest) ||
    // Proof: resource-terminal-locator.
    // Injected fault failed `refuses corrupt legacy terminal locator as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal locator as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: production-behavior.
    !proof.locator.trim() ||
    // Proof: resource-terminal-disposition.
    // Injected fault failed `refuses corrupt legacy terminal disposition as trusted failure before acknowledgment`; restored GREEN.
    // Injected fault failed `refuses corrupt tagged terminal disposition as trusted failure before acknowledgment`; restored GREEN.
    // Evidence scope: production-behavior.
    proof.disposition === 'returned'
  )
    throw new Error('stored terminal resource evidence is invalid for event ' + observed.eventId);
  return proof;
}

/** Emits current private declaration2 without changing the public use declaration. */
export function encodeResourceDeclaration(use: ResourceRuntimeEvent['use']): string {
  // Proof: resource-new-declaration-format.
  // Injected fault failed `new resource runtime identity has explicit format2 even without an optional planning owner`; restored GREEN.
  // Evidence scope: current producer format/value contract; not separately a replay admission bypass.
  return JSON.stringify({ schemaVersion: 2, use });
}
/** Strict tagged/untagged declaration equality also preserves absent optional host-job owner fields. */
export function matchesResourceDeclaration(
  bytes: string,
  use: ResourceRuntimeEvent['use'],
): boolean {
  const candidate = readProducerIdentity(bytes);
  if (hasFormat(candidate)) {
    // Proof: resource-current-declaration-grammar.
    // Injected fault failed `resource declaration rejects malformed tagged2 identity before followup effects`; restored GREEN.
    // Evidence scope: production-behavior.
    currentDeclarationIdentity.assert(candidate);
    // Proof: resource-current-declaration-equality.
    // Injected fault failed `new resource runtime identity has explicit format2 even without an optional planning owner`; restored GREEN.
    // Evidence scope: actual current2 exact-byte retry admission; valid fresh stored2 and same identity keys with changed payload.
    return bytes === encodeResourceDeclaration(use);
  }
  // Proof: resource-legacy-declaration-grammar.
  // Injected fault failed `resource declaration rejects malformed untagged1 identity before followup effects`; restored GREEN.
  // Evidence scope: production-behavior.
  legacyDeclaration.assert(candidate);
  return bytes === JSON.stringify(encodeLegacyUse(use));
}

/** Validates the original host-job declaration before extracting its recorded provider display fields. */
export function readStoredHostJob(bytes: string) {
  const candidate = readProducerIdentity(bytes);
  const use = hasFormat(candidate)
    ? // Proof: resource-host-reading-tagged-identity.
      // Injected fault failed `refuses corrupt tagged host-job shape before returning provider observations`; restored GREEN.
      // Evidence scope: production-behavior.
      currentDeclarationIdentity.assert(candidate).use
    : // Proof: resource-host-reading-legacy-identity.
      // Injected fault failed `refuses corrupt legacy host-job shape before returning provider observations`; restored GREEN.
      // Evidence scope: production-behavior.
      legacyDeclaration.assert(candidate);
  // Proof: resource-host-reading-kind.
  // Injected fault failed `refuses corrupt legacy host-job kind before returning provider observations`; restored GREEN.
  // Injected fault failed `refuses corrupt tagged host-job kind before returning provider observations`; restored GREEN.
  // Evidence scope: actual provider-store contextual refusal; response-schema500 alone would mask removed kind guard.
  if (use.kind !== 'host_job') throw new Error('stored host-job declaration is not a host job');
  return { label: use.label, type: use.type, host: use.host, reservations: use.reservations };
}
