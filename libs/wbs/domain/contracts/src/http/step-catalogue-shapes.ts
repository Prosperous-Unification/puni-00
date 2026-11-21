import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
import { stepInUsePairSchema } from './step-usage-shapes';

const scope = { scopeKind: "'organization' | 'space' | 'project'", scopeId: 'string > 0' } as const;
const definition = type({
  id: 'string > 0',
  organizationId: 'string > 0',
  code: 'string > 0',
  name: 'string > 0',
  position: '-9007199254740991 <= number.integer <= 9007199254740991',
  defaultEstimateUnit: "'workdays' | 'minutes'",
  defaultAllowanceBps: '0 <= number.integer <= 100000',
  definedAt: type(scope),
  origin: "'migration' | 'authored'",
});
const binding = type({
  ...scope,
  bindingId: 'string > 0',
  organizationId: 'string > 0',
  stepId: 'string > 0',
  workItemTypeId: type('string > 0').or('null'),
  position: '-9007199254740991 <= number.integer <= 9007199254740991',
  origin: "'migration' | 'authored'",
});
const bindingInput = {
  ...scope,
  workItemTypeId: type('string > 0').or('null'),
  position: '-9007199254740991 <= number.integer <= 9007199254740991',
} as const;
const definitionInput = type({
  code: 'string',
  name: 'string',
  position: '-9007199254740991 <= number.integer <= 9007199254740991',
  defaultEstimateUnit: "'workdays' | 'minutes'",
  defaultAllowanceBps: '0 <= number.integer <= 100000',
});
const params = requestSchema(type({ stepId: 'string > 0' }));
const readPolicies = [
  { kind: 'identity', require: 'signed-in' },
  { kind: 'organization-resource', operation: 'read' },
] as const;
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
  { kind: 'organization-resource', operation: 'mutation' },
] as const;
const common = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(
      type({
        error: "'forbidden'",
        permission: type.enumerated(...PERMISSIONS.map(({ id }) => id)),
      }),
    ),
  },
  organizationRefusal,
  organizationContextRefusal,
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
] as const;
const writeRefusals = [
  ...common,
  { status: 400, schema: responseSchema(type({ error: "'invalid_json'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
  { status: 422, schema: responseSchema(type({ error: "'name_required'" })) },
  { status: 422, schema: responseSchema(type({ error: "'invalid_code'" })) },
  { status: 422, schema: responseSchema(type({ error: "'reserved_code'" })) },
] as const;
const media = ['application/json'] as const;

/** Active organization definitions and bindings, without package values or retired identities. */
export const listStepCatalogue = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/steps',
  operationId: 'listStepCatalogue',
  policies: readPolicies,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ definitions: definition.array(), bindings: binding.array() })),
    },
  ],
  refusals: common,
  document: { summary: 'Read the selected organization active step catalogue.' },
} as const);

/** One actual scope binding, optionally created atomically with its organization definition. */
export const bindCatalogueStep = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/step-bindings',
  operationId: 'bindCatalogueStep',
  policies: writePolicies,
  body: requestSchema(
    type({ ...bindingInput, stepId: 'string > 0', 'define?': 'never' }).or({
      ...bindingInput,
      define: definitionInput,
      'stepId?': 'never',
    }),
  ),
  bodyMedia: media,
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(type({ binding, 'definition?': definition })),
    },
  ],
  refusals: [
    ...writeRefusals,
    {
      status: 409,
      schema: responseSchema(type({ error: "'code_taken' | 'name_taken' | 'duplicate_binding'" })),
    },
  ],
  document: {
    summary: 'Bind an existing step or atomically define and bind one at the selected scope.',
  },
} as const);

/** Definition metadata only; changed defaults apply to future materialization, never existing package rows. */
export const patchStepDefinition = defineEndpointShape({
  method: 'PATCH',
  path: '/api/organization/steps/:stepId',
  operationId: 'patchStepDefinition',
  policies: writePolicies,
  params,
  body: requestSchema(
    type({
      'name?': 'string',
      'defaultEstimateUnit?': "'workdays' | 'minutes'",
      'defaultAllowanceBps?': '0 <= number.integer <= 100000',
    }),
  ),
  bodyMedia: media,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ definition })) }],
  refusals: [
    ...writeRefusals,
    { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) },
  ],
  document: {
    summary: 'Change a global step name or defaults without changing authored package values.',
  },
} as const);

/** Retires an unbound definition while retaining its identity and historical package values. */
export const retireStepDefinition = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/steps/:stepId',
  operationId: 'retireStepDefinition',
  policies: writePolicies,
  params,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...writeRefusals,
    { status: 409, schema: responseSchema(type({ error: "'step_bound'" })) },
  ],
  document: { summary: 'Retire an unbound step definition from the active catalogue.' },
} as const);

// Proof: omitting the200pair cap made the real browser oversized-preview decoder accept success; exact restore passed (verification-unbind-20261119.json).
const protectedUsage = {
  count: '1 <= number.integer <= 9007199254740991',
  pairs: stepInUsePairSchema.array().atLeastLength(1).atMostLength(200),
} as const;

/** Preview and apply share one stored-scope admission; apply preserves definition/package/history records. */
export const unbindCatalogueStep = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/step-bindings/:bindingId',
  operationId: 'unbindCatalogueStep',
  policies: writePolicies,
  params: requestSchema(type({ bindingId: 'string > 0' })),
  // Proof: making mode optional changed actual admin DELETE{}from422to500; the lower mode guard remained intact. Exact restore passed (verification-unbind-20261119.json).
  body: requestSchema(type({ dryRun: 'boolean' })),
  bodyMedia: media,
  responses: [
    { kind: 'empty', status: 204 },
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ wouldRefuse: 'null' }).or({ wouldRefuse: "'step_nodes_in_use'", ...protectedUsage }),
      ),
    },
  ],
  refusals: [
    ...writeRefusals,
    {
      status: 409,
      schema: responseSchema(type({ error: "'step_nodes_in_use'", ...protectedUsage })),
    },
  ],
  document: {
    summary:
      'Preview protected step facts with dryRun:true, or remove this binding with dryRun:false.',
  },
} as const);

/** Exact complete census of one admitted scope; empty and same-order requests retain revisions. */
export const reorderCatalogueBindings = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/step-bindings/reorder',
  operationId: 'reorderCatalogueBindings',
  policies: writePolicies,
  body: requestSchema(type({ ...scope, ids: type('string > 0').array() })),
  bodyMedia: media,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...writeRefusals,
    { status: 409, schema: responseSchema(type({ error: "'stale_order'" })) },
  ],
  document: {
    summary:
      'Reorder exactly this scope’s complete binding set across all types, preserving inherited bindings and explicit values.',
  },
} as const);

/**
 * Every resolved step retains at least one organization, space or project binding.
 * Proof: removing the nonempty bound accepted empty via; widening only scopeKind
 * accepted work_package. Both actual browser decoder owners failed, then passed
 * after exact restoration (verification-project-step-read-20261119.json).
 */
export const resolvedStep = type({
  stepId: 'string > 0',
  code: 'string > 0',
  name: 'string > 0',
  via: type({
    bindingId: 'string > 0',
    scopeKind: "'organization' | 'space' | 'project'",
    scopeId: 'string > 0',
    workItemTypeId: type('string > 0').or('null'),
  })
    .array()
    .atLeastLength(1)
    .readonly(),
});

/** Actual project-chain resolution; absent type is untyped and no package-specific values are inferred. */
export const readProjectSteps = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/steps',
  operationId: 'readProjectSteps',
  policies: readPolicies,
  params: requestSchema(type({ id: 'string > 0' })),
  query: requestSchema(type({ 'type?': 'string > 0' })),
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ steps: resolvedStep.array() })) },
  ],
  refusals: common,
  document: {
    summary:
      'Read this project’s resolved steps and all matching provenance. Omit type for untyped resolution; supply an owned work-item type id for its mapping.',
  },
} as const);

/** Current protected usage of a reachable project step, filtered to readable children before count and cap. */
export const readProjectStepUsage = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/step-nodes-in-use',
  operationId: 'readProjectStepUsage',
  policies: readPolicies,
  params: requestSchema(type({ id: 'string > 0' })),
  query: requestSchema(type({ stepId: 'string > 0' })),
  // Proof: removing either bound made the actual browser decoder accept201pairs
  // or count-1; both selected owners passed restored (verification-project-usage-read-20261119.json).
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          count: '0 <= number.integer <= 9007199254740991',
          pairs: stepInUsePairSchema.array().atMostLength(200),
        }),
      ),
    },
  ],
  refusals: common,
  document: {
    summary:
      'Read protected pairs for this project step, including redundant bindings. Counts and the first200pairs include only readable work packages.',
  },
} as const);

/** Revision-bound typed/untyped project applicability; a type ID default remains distinct from the untyped default. */
export const readProjectStepManifest = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/step-manifest',
  operationId: 'readProjectStepManifest',
  policies: readPolicies,
  params: requestSchema(type({ id: 'string > 0' })),
  query: requestSchema(type({})),
  // Proof: separate omissions admitted negative/fractional/unsafe revisions,version2
  // and empty default code through actual browser decoding; all restored green.
  // Upper-bound proof uses corrected valid lower-only syntax (verification-project-manifest-20261119.json).
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          version: '1',
          project: type({ id: 'string > 0', revision: '0 <= number.integer <= 9007199254740991' }),
          default: type('string > 0').array(),
          types: type({ workItemTypeId: 'string > 0', codes: type('string > 0').array() }).array(),
        }),
      ),
    },
  ],
  refusals: common,
  document: {
    summary:
      'Read this project revision with untyped default codes and every owned work-item type mapping, using stable type IDs and current scope inheritance.',
  },
} as const);
