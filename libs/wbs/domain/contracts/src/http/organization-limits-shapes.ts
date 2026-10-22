import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { responseSchema } from './schema-shape';

/**
 * The fields every organization limit refusal carries beside its code
 * (`wbs-organization-limits` L9): the cap, what the organization held and
 * what the refused write would have added.
 */
export const limitCrossed = { cap: 'number', current: 'number', added: 'number' } as const;

/** The three caps (`wbs-organization-limits` L1), each a whole number from 0 to 1,000,000. */
const organizationLimitValues = type({
  maxAgentPersons: 'number',
  maxConcurrentClaims: 'number',
  maxCapacityUnitsPerResource: 'number',
});

/** What the organization holds against each cap (L5); `capacityUnits` in resource-id order. */
const organizationLimitUsage = type({
  agentPersons: 'number',
  concurrentClaims: 'number',
  capacityUnits: type({
    resourceId: 'string',
    name: 'string',
    unitLabel: 'string',
    units: 'number',
  }).array(),
});

/**
 * Reads the active organization's caps beside its usage, for its admins and
 * super-admins (`organization-limits`). `source` says whether the caps are the
 * organization's own or the deployment default. Nothing writes limits over HTTP.
 */
export const readOrganizationLimits = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/limits',
  operationId: 'getApiOrganizationLimits',
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'signed-in' },
  ],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          source: "'default' | 'organization'",
          limits: organizationLimitValues,
          usage: organizationLimitUsage,
        }),
      ),
    },
  ],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'Read the active organization limits with usage beside each.' },
});
