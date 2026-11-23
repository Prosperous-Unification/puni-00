import type { RuntimeReceipt1, RuntimeScope1 } from '@wbs/contracts';
import { type } from 'arktype';

/** Raw original acceptance1; its scope and receipt remain in published vocabulary. */
export type StoredRuntimeAcceptance1 = Readonly<{
  schemaVersion: 1;
  scope: RuntimeScope1;
  commandId: string;
  canonicalRequest: string;
  requestDigest: string;
  receipt: RuntimeReceipt1;
}>;

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

/** Validates a persisted envelope and the receipt identities it repeats. */
export function parseStoredRuntimeAcceptance1(candidate: unknown): StoredRuntimeAcceptance1 {
  // Proof: P31 bypassed stored-record parsing; malformed versions and acceptance variants stopped throwing.
  // Proof: runtime-record-legacy-grammar bypassed the frozen acceptance1 grammar; 'raw runtime acceptance2 grant admits only matching current receipt2' failed and restored GREEN.
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
