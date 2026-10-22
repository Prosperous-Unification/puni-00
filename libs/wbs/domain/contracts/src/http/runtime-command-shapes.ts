import { type } from 'arktype';

import type {
  AuthorityReceipt,
  ClaimReceipt,
  RuntimeReceipt,
  RuntimeState,
  WriteReceipt,
} from '../runtime-command-values';
import { defineEndpointShape, type EndpointShape } from './endpoint-shape';
import { requestSchema, responseSchema, type SchemaShape } from './schema-shape';
import { applyProjectCommands } from './work-item-shapes';

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
const command = type({
  kind: '"setProgress"',
  workItemId: identity,
  stepId: identity,
  state: '"in_progress" | "done"',
})
  .or({
    kind: '"setMeasure"',
    workItemId: identity,
    stepId: identity,
    metric: '"token_actual"',
    value: 'number',
  })
  .or({
    kind: '"patchWorkItem"',
    workItemId: identity,
    patch: { externalRefs: type({ systemId: 'string', url: 'string', 'name?': 'string' }).array() },
  })
  .or({
    kind: '"releaseWorkItem"',
    workItemId: identity,
    personId: identity,
    steps: identity.array(),
  });
const action = type({
  kind: '"claim"',
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution,
}).or({ kind: '"write"', claim, commands: command.array().atLeastLength(1).atMostLength(200) });
// Proof: P6-05 made the wire pin optional; missing-pin mounted input reached
// the strict application parser (500), losing the required boundary 400.
const common = {
  schemaVersion: '1',
  commandId: identity,
  personId: identity,
  expectedLedgerId: identity,
} as const;
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
    .atMostLength(200)
    .describe(
      'Ordered applied commands; each index equals its zero-based position. Standard Schema additionally validates this dependent order.',
    ),
});
const receiptResponse: SchemaShape<RuntimeReceipt> = enforceAppliedOrder(
  responseSchema(
    type({
      ...receiptFields,
      acceptance: authorityAcceptance.or(claimAcceptance).or(writeAcceptance),
    }),
  ),
);
// Proof: P6-06 replaced this response schema with unknown; the shared client
// accepted wrong versions, missing authority and unsafe generations.
const authorityResponse: SchemaShape<AuthorityReceipt> = responseSchema(
  type({ ...receiptFields, acceptance: authorityAcceptance }),
);
const commandResponse: SchemaShape<ClaimReceipt | WriteReceipt> = enforceAppliedOrder(
  responseSchema(
    type({ ...receiptFields, acceptance: claimAcceptance }).or({
      ...receiptFields,
      acceptance: writeAcceptance,
    }),
  ),
);
const liveClaim = type({
  id: identity,
  workItemId: identity,
  stepId: identity.or('null'),
  personId: identity,
  runId: identity.or('null'),
  parentClaimId: identity.or('null'),
  accountId: identity,
});
const state = type({
  schemaVersion: '1',
  ledgerId: identity,
  scope,
  basis,
  facts: {
    projectRevision: count,
    workItems: type({
      id: identity,
      parentId: identity.or('null'),
      revision: count,
      externalRefs: type({
        id: identity,
        systemId: identity,
        url: 'string',
        name: 'string',
      }).array(),
    }).array(),
    steps: type({ id: identity, code: 'string | null', position: 'number' }).array(),
  },
  authority: type({ kind: '"uninitialized"' }).or({
    kind: '"held"',
    ownerId: identity,
    generation,
  }),
  claims: type({ kind: '"ordinary"', claim: liveClaim })
    .or({ kind: '"runtime"', claim: liveClaim, binding: claim })
    .array(),
});
const stateResponse: SchemaShape<RuntimeState> = responseSchema(state);
const refusals = [
  ...applyProjectCommands.refusals,
  {
    status: 403,
    schema: responseSchema(
      type({ error: '"runtime_scope_unavailable"' })
        .or({ error: '"person_not_bound"' })
        .or({ error: '"credential_not_for_person"' }),
    ),
  },
  {
    status: 404,
    schema: responseSchema(
      type({ error: '"runtime_receipt_not_found"' }).or({ error: '"unknown_person"' }),
    ),
  },
  {
    status: 409,
    schema: responseSchema(
      type({
        error:
          '"runtime_generation_conflict" | "runtime_authority_stale" | "runtime_revision_conflict" | "runtime_claim_mismatch" | "runtime_claim_unmanaged" | "runtime_attempt_bound" | "runtime_command_conflict" | "runtime_ledger_mismatch"',
      }),
    ),
  },
  {
    status: 400,
    schema: responseSchema(
      type({ error: '"runtime_command_target_mismatch" | "runtime_command_not_supported"' }),
    ),
  },
] as const;
const params = requestSchema(type({ id: identity }));
// Proof: P6-08 removed identity; anonymous mounted state read returned 500
// instead of the declared 401, after a real authority acquisition still succeeded.
const readPolicies = [
  { kind: 'identity', require: 'read-scope' },
  { kind: 'organization-resource', operation: 'read' },
] as const;
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
  { kind: 'organization-resource', operation: 'mutation' },
] as const;

/** Discovery can omit the pin; every retained intent must supply its already durable pin. */
export const readRuntimeState = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/runtime-state',
  operationId: 'readRuntimeState',
  policies: readPolicies,
  params,
  query: requestSchema(type({ personId: identity, 'expectedLedgerId?': identity })),
  responses: [{ kind: 'json', status: 200, schema: stateResponse }],
  refusals,
  document: { summary: 'Read coherent runtime facts, authority and claims.' },
} as const satisfies EndpointShape);
/** Acquires the receiver generation through an explicit pinned compare-and-swap. */
export const acquireRuntimeAuthority = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/runtime-authority',
  operationId: 'acquireRuntimeAuthority',
  policies: writePolicies,
  params,
  // Proof: P6-04 changed this to delete unknown keys; an extra wire field
  // disappeared before application parsing and replay returned 200 instead of 400.
  body: requestSchema(
    type({ ...common, ownerId: identity, expectedGeneration: generation.or('null') }),
  ),
  responses: [{ kind: 'json', status: 200, schema: authorityResponse }],
  refusals,
  document: { summary: 'Acquire receiver runtime authority.' },
} as const satisfies EndpointShape);
/** Atomically accepts one exact claim or restricted claimed command batch and its immutable receipt. */
export const applyRuntimeCommands = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/runtime-commands',
  operationId: 'applyRuntimeCommands',
  policies: writePolicies,
  params,
  body: requestSchema(type({ ...common, authority, expectedBasis: basis, action })),
  responses: [{ kind: 'json', status: 200, schema: commandResponse }],
  refusals,
  document: { summary: 'Accept a conditional runtime claim or write.' },
} as const satisfies EndpointShape);
/** Absence is only absence at this read; recovery must first fence delayed old dispatch. */
export const lookupRuntimeReceipt = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/runtime-commands/:commandId',
  operationId: 'lookupRuntimeReceipt',
  policies: readPolicies,
  params: requestSchema(type({ id: identity, commandId: identity })),
  query: requestSchema(type({ personId: identity, expectedLedgerId: identity })),
  responses: [{ kind: 'json', status: 200, schema: receiptResponse }],
  refusals,
  document: { summary: 'Look up an immutable accepted runtime receipt.' },
} as const satisfies EndpointShape);

export const runtimeCommandShapes = [
  readRuntimeState,
  acquireRuntimeAuthority,
  applyRuntimeCommands,
  lookupRuntimeReceipt,
] as const;

/**
 * Preserves the validated receipt while rejecting impossible applied sequences.
 * JSON Schema carries array bounds and the order description; Standard Schema
 * enforces the dependent correspondence between each index and its position.
 */
function enforceAppliedOrder<T extends RuntimeReceipt>(shape: SchemaShape<T>): SchemaShape<T> {
  const standard = shape.validator['~standard'];
  return {
    ...shape,
    validator: {
      '~standard': {
        ...standard,
        validate: async (candidate: unknown) => {
          const checked = await standard.validate(candidate);
          // Proof: fix1-P04 omitted forwarding; a wrong receipt variant
          // threw TypeError instead of returning the modeled client failure.
          if (checked.issues !== undefined) return checked;
          const acceptance = checked.value.acceptance;
          if (acceptance.kind === 'write') {
            const invalidPosition = acceptance.applied.findIndex(
              (command, index) => command.index !== index,
            );
            // Proof: fix1-P03 omitted this check; nonzero/gapped/duplicate/
            // reversed indexes became successful replies on both endpoints.
            if (invalidPosition !== -1)
              return {
                issues: [
                  {
                    message: 'Applied command index must equal its zero-based position',
                    path: ['acceptance', 'applied', invalidPosition, 'index'],
                  },
                ],
              };
          }
          return checked;
        },
      },
    },
  };
}
