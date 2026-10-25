import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** The four instance kinds (`compute-providers` P1), as every provider shape spells them. */
export const providerKind = "'ssh_host' | 'docker' | 'kubernetes' | 'puni_pool'";

/**
 * One provider instance as listed (`compute-providers` P2): its kind, its name
 * unique in the organization, a display-only locator WBS never dials, and the
 * count of resources it fulfils.
 */
export const computeProviderSummary = type({
  id: 'string',
  kind: providerKind,
  name: 'string',
  locator: 'string',
  createdAt: 'number',
  createdBy: 'string | null',
  resources: 'number',
});

const readPolicy = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicy = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const administrationCommon = [
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
  // A delegation or a machine credential never administers provider instances.
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  // A member or a viewer: only an admin registers what reports for every project.
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
] as const;
const malformed = {
  status: 400,
  schema: responseSchema(
    type({ error: "'invalid_json' | 'invalid_body' | 'invalid_params' | 'invalid_query'" }),
  ),
} as const;
const unknownProvider = {
  status: 404,
  schema: responseSchema(type({ error: "'unknown_provider'" })),
} as const;

/** Lists the active organization's provider instances, for its admins. */
export const listComputeProviders = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/compute-providers',
  operationId: 'getApiOrganizationCompute-providers',
  policies: [...readPolicy, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ computeProviders: computeProviderSummary.array() })),
    },
  ],
  refusals: [...administrationCommon, malformed],
  document: { summary: 'List the compute provider instances of the active organization.' },
});

/**
 * Registers a provider instance: a `kind`, a `name` unique among the
 * organization's instances (`name_taken`) and a `locator` that is display
 * text only. Written with one `compute_provider_registered` audit row.
 */
export const registerComputeProvider = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/compute-providers',
  operationId: 'postApiOrganizationCompute-providers',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(
    type({ kind: providerKind, name: '0 < string <= 80', locator: '0 < string <= 256' }),
  ),
  responses: [{ kind: 'json', status: 201, schema: responseSchema(computeProviderSummary) }],
  refusals: [
    ...administrationCommon,
    malformed,
    { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) },
  ],
  document: { summary: 'Register a compute provider instance for the active organization.' },
});

/** Renames or relocates one instance, with a `compute_provider_updated` audit row. */
export const updateComputeProvider = defineEndpointShape({
  method: 'PATCH',
  path: '/api/organization/compute-providers/:id',
  operationId: 'patchApiOrganizationCompute-providersById',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(type({ 'name?': '0 < string <= 80', 'locator?': '0 < string <= 256' })),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(computeProviderSummary) }],
  refusals: [
    ...administrationCommon,
    malformed,
    unknownProvider,
    { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) },
  ],
  document: { summary: 'Rename or relocate a compute provider instance.' },
});

/**
 * Removes one instance. While resources name it, `in_use` lists them unless
 * `cascade=true`, which clears every reference and deletes the instance's
 * capacity reports in the same transaction.
 */
export const removeComputeProvider = defineEndpointShape({
  method: 'DELETE',
  path: '/api/organization/compute-providers/:id',
  operationId: 'deleteApiOrganizationCompute-providersById',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ id: 'string' })),
  query: requestSchema(type({ 'cascade?': "'true'" })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...administrationCommon,
    malformed,
    unknownProvider,
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'in_use'", resources: type({ id: 'string', name: 'string' }).array() }),
      ),
    },
  ],
  document: {
    summary: 'Remove a compute provider instance, or clear its references with cascade.',
  },
});

/**
 * A capacity report as stored and answered (`compute-providers` P5): the
 * instance it came through, what the provider answered in the resource's own
 * unit, when the reporter observed it and at what cadence, the agent person
 * whose credential sent it, and when WBS stored it.
 */
export const capacityReport = type({
  providerId: 'string',
  observedAt: 'number',
  cadenceSeconds: 'number',
  outcome: type({ kind: "'measured'", capacityUnits: 'number', usageUnits: 'number' }).or({
    kind: "'unreachable'",
    reason: 'string',
  }),
  reportedBy: 'string',
  reportedAt: 'number',
});

const units = '0 <= number.integer <= 1000000000';

/**
 * Stores the latest capacity report of one resource (`compute-providers` P5,
 * P6). Accepted only from a machine credential pinned to an `agent` person of
 * the instance's organization (`not_an_agent_principal` otherwise, naming the
 * session, the delegation or the person kind). An instance of another
 * organization or none is `unknown_provider`; a resource the organization
 * does not hold is `not_found`; a resource naming another instance is
 * `provider_mismatch` with the one it names. Idempotent: the same body again
 * answers the stored report; a newer `observedAt` replaces it; anything else
 * is `report_superseded` with the stored instant. `observedAt` is epoch
 * milliseconds at most five minutes ahead of WBS (`observedAt_in_future`).
 * Never audited, never a planning input.
 */
export const putCapacityReport = defineEndpointShape({
  method: 'PUT',
  path: '/api/compute-providers/:providerId/resources/:resourceId/capacity-report',
  operationId: 'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
  policies: [...writePolicy, { kind: 'organization-resource', operation: 'mutation' }],
  params: requestSchema(type({ providerId: 'string', resourceId: 'string' })),
  body: requestSchema(
    type({
      observedAt: 'number.integer >= 0',
      cadenceSeconds: '30 <= number.integer <= 86400',
      outcome: type({ kind: "'measured'", capacityUnits: units, usageUnits: units }).or({
        kind: "'unreachable'",
        reason: '0 < string <= 200',
      }),
    }),
  ),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(capacityReport) }],
  refusals: [
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    malformed,
    {
      status: 400,
      schema: responseSchema(type({ error: "'observedAt_in_future'", skewMs: 'number' })),
    },
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    {
      status: 403,
      schema: responseSchema(
        type({ error: "'not_an_agent_principal'", authentication: "'session' | 'delegation'" }).or({
          error: "'not_an_agent_principal'",
          personKind: "'person'",
        }),
      ),
    },
    unknownProvider,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'provider_mismatch'", providerId: 'string | null' }).or({
          error: "'report_superseded'",
          storedObservedAt: 'number',
        }),
      ),
    },
  ],
  document: {
    summary: 'Report the measured capacity of one resource through its compute provider instance.',
  },
});
