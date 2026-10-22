import { type } from 'arktype';

import type {
  RuntimeAuthority,
  RuntimeClaim,
  RuntimeLedger,
  RuntimeScope,
  StoredRuntimeAcceptance,
} from './runtime-command-store';

const identity = type('string > 0');
// Proof: P13 removed safe-integer narrowing; unsafe counters and generations passed trusted parsing.
const count = type('number.integer >= 0').narrow(Number.isSafeInteger);
const generation = type('number.integer > 0').narrow(Number.isSafeInteger);
// Proof: P14 removed strict field handling; undeclared marker/scope/binding/receipt fields passed parsing.
const scope = type({
  organizationId: identity,
  projectId: identity,
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
const stored = type({
  schemaVersion: '1',
  scope,
  commandId: identity,
  canonicalRequest: identity,
  requestDigest: digest,
  receipt: {
    schemaVersion: '1',
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
  // Proof: P31 bypassed stored-record parsing; malformed versions and acceptance variants stopped throwing.
  const accepted = stored.assert(candidate);
  // Proof: P12 removed correspondence; five receipt/envelope identity disagreements passed parsing.
  if (
    accepted.commandId !== accepted.receipt.commandId ||
    accepted.requestDigest !== accepted.receipt.requestDigest ||
    accepted.scope.organizationId !== accepted.receipt.scope.organizationId ||
    accepted.scope.projectId !== accepted.receipt.scope.projectId ||
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
