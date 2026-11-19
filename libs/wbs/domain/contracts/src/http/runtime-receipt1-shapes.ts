import { type } from 'arktype';

// The published response bound stays with this frozen version1 grammar.
const MOST_COMMANDS_IN_A_BATCH = 200;

const identity = type('string > 0');

const count = type('0 <= number.integer <= 9007199254740991');

const generation = type('0 < number.integer <= 9007199254740991');

const scope = type({ organizationId: identity, projectId: identity, personId: identity });

const authority = type({ ownerId: identity, generation });

const execution = type({
  storeId: identity,
  runId: identity,
  attemptId: identity,
  sessionId: '0 < string <= 256',
});

const claim = type({
  claimId: identity,
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution,
});

const basis = type(/^rb1:[0-9a-f]{64}$/);

// Proof: runtime-http-legacy-discriminator allowed historical owner fields under receipt2; 'HTTP refuses runtime2 grant response relabeled around historical owner fields' failed and restored GREEN.
const receiptFields = {
  schemaVersion: '1',
  ledgerId: identity,
  scope,
  commandId: identity,
  requestDigest: /^[0-9a-f]{64}$/,
  actorId: identity,
} as const;

const authorityAcceptance = type({ kind: '"authority"', authority });

const claimAcceptance = type({ kind: '"claim"', authority, claim, basisAfter: basis });

const writeAcceptance = type({
  kind: '"write"',
  authority,
  claim,
  basisAfter: basis,
  applied: type({
    index: count,
    kind: '"setProgress" | "setMeasure" | "patchWorkItem" | "releaseWorkItem"',
  })
    .array()
    // Proof: fix1-P01 omitted this bound; empty applied sequences became
    // successful command and lookup replies in the isolated client negatives.
    .atLeastLength(1)
    // Proof: fix1-P02 omitted this bound; 201 applied entries became
    // successful command and lookup replies with every other field valid.
    // Proof: codec-T1-cap changed the shared limit to 201; independent command/lookup
    // response negatives both accepted otherwise-valid 201-entry applied arrays.
    .atMostLength(MOST_COMMANDS_IN_A_BATCH)
    .describe(
      'Ordered applied commands; each index equals its zero-based position. Standard Schema additionally validates this dependent order.',
    ),
});
/** Frozen original receipt1 field grammar; current response wrappers preserve strictness and applied ordering. */
export const runtimeReceipt1 = type({
  ...receiptFields,
  acceptance: authorityAcceptance.or(claimAcceptance).or(writeAcceptance),
});
/** Frozen authority1 response branch for historical replay. */
export const authorityReceipt1 = type({ ...receiptFields, acceptance: authorityAcceptance });
/** Frozen claim/write1 response branches for historical replay. */
export const commandReceipt1 = type({ ...receiptFields, acceptance: claimAcceptance }).or({
  ...receiptFields,
  acceptance: writeAcceptance,
});
