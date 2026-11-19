import type { RuntimeAuthority, RuntimeClaim, RuntimeScope } from '@wbs/contracts';
import { type } from 'arktype';

import { parseStoredRuntimeAcceptance1 } from './runtime-command-history1';
import type {
  RuntimeLedger,
  StoredRuntimeAcceptance,
  StoredRuntimeAcceptance2,
} from './runtime-command-values';

const identity = type('string > 0');
// Proof: P13 removed safe-integer narrowing; unsafe counters and generations passed trusted parsing.
const count = type('number.integer >= 0').narrow(Number.isSafeInteger);
const generation = type('number.integer > 0').narrow(Number.isSafeInteger);
// Proof: P14 removed strict field handling; undeclared marker/scope/binding/receipt fields passed parsing.
const scope = type({
  organizationId: identity,
  workPackageId: identity,
  personId: identity,
}).onDeepUndeclaredKey('reject');
const authority = type({ ownerId: identity, generation }).onDeepUndeclaredKey('reject');
const claim = type({
  claimId: identity,
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution: {
    storeId: identity,
    runId: identity,
    attemptId: identity,
    sessionId: '0 < string <= 256',
  },
}).onDeepUndeclaredKey('reject');
const digest = type(/^[0-9a-f]{64}$/);
const basis = type(/^rb1:[0-9a-f]{64}$/);
const acceptance = type({ kind: '"authority"', authority })
  .or({ kind: '"claim"', authority, claim, basisAfter: basis })
  .or({
    kind: '"write"',
    authority,
    claim,
    basisAfter: basis,
    applied: type({
      index: count,
      kind: '"setProgress" | "setMeasure" | "patchWorkItem" | "releaseWorkItem"',
    }).array(),
  });
const ledger = type({
  schemaVersion: '1',
  ledgerId: identity,
  authorityCount: count,
  bindingCount: count,
  receiptCount: count,
}).onDeepUndeclaredKey('reject');
// Proof: runtime-record-current-grammar changed the current acceptance discriminator; 'raw runtime acceptance2 grant admits only matching current receipt2' failed and restored GREEN.
const stored = type({
  schemaVersion: '2',
  scope,
  commandId: identity,
  canonicalRequest: identity,
  requestDigest: digest,
  receipt: {
    schemaVersion: '2',
    ledgerId: identity,
    scope,
    commandId: identity,
    requestDigest: digest,
    actorId: identity,
    acceptance,
  },
}).onDeepUndeclaredKey('reject');

/** Validates trusted persisted marker bytes; absence never means an unused ledger. */
export function parseRuntimeLedger(candidate: unknown): RuntimeLedger {
  // Proof: P31 bypassed marker parsing; malformed marker/counter negatives stopped throwing.
  return ledger.assert(candidate);
}
/** Validates trusted authority including safe monotonic generation arithmetic. */
export function parseRuntimeAuthority(candidate: unknown): RuntimeAuthority {
  // Proof: P31 bypassed authority parsing; invalid generation/owner negatives stopped throwing.
  return authority.assert(candidate);
}
/** Validates exact retained execution identity read from persistence. */
export function parseRuntimeClaim(candidate: unknown): RuntimeClaim {
  // Proof: P31 bypassed binding parsing; missing IDs and invalid sessions stopped throwing.
  return claim.assert(candidate);
}
/** Validates a persisted envelope and the receipt identities it repeats. */
export function parseStoredRuntimeAcceptance(candidate: unknown): StoredRuntimeAcceptance {
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'schemaVersion' in candidate &&
    // Proof: runtime-record-legacy-dispatch removed raw acceptance1 dispatch; 'raw runtime acceptance1 grant retains original scope receipt and canonical strings' failed and restored GREEN.
    candidate.schemaVersion === 1
  )
    return parseStoredRuntimeAcceptance1(candidate);
  return parseStoredRuntimeAcceptance2(candidate);
}

/** Current-only trusted insertion decoder; historical records are read evidence, never new writes. */
export function parseStoredRuntimeAcceptance2(candidate: unknown): StoredRuntimeAcceptance2 {
  // Proof: P31 bypassed stored-record parsing; malformed versions and acceptance variants stopped throwing.
  const accepted = stored.assert(candidate);
  // Proof: P12 removed correspondence; five receipt/envelope identity disagreements passed parsing.
  if (
    accepted.commandId !== accepted.receipt.commandId ||
    accepted.requestDigest !== accepted.receipt.requestDigest ||
    accepted.scope.organizationId !== accepted.receipt.scope.organizationId ||
    accepted.scope.workPackageId !== accepted.receipt.scope.workPackageId ||
    accepted.scope.personId !== accepted.receipt.scope.personId
  )
    throw new Error('runtime acceptance receipt identity mismatch');
  return accepted;
}

/** Validates an opaque persisted scope at its storage boundary. */
export function parseRuntimeScope(candidate: unknown): RuntimeScope {
  // Proof: P31 bypassed scope parsing; empty/missing/coerced scope IDs stopped throwing.
  return scope.assert(candidate);
}

/** Projects only a validated raw record's address for current SQL/admission comparisons. No identity bytes change. */
export function readRuntimeAcceptanceScope(accepted: StoredRuntimeAcceptance): RuntimeScope {
  return accepted.schemaVersion === 2
    ? accepted.scope
    : {
        organizationId: accepted.scope.organizationId,
        // Proof: runtime-record-address-projection substituted the projected historical owner for memory and native readers; 'memory reads original runtime1 grant under the current scope key'; 'mounted migrated runtime1 grant replay and lookup return original receipt without effects' failed and restored GREEN.
        workPackageId: accepted.scope.projectId,
        personId: accepted.scope.personId,
      };
}
