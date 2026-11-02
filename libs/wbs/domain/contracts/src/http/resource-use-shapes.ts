import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
const nonempty = '0 < string <= 2048';
const state =
  "'active' | 'cleanup_pending' | 'blocked' | 'retained' | 'release_reported' | 'release_verified'";
export const resourceUse = type({
  id: 'string',
  source: "'reported' | 'runtime'",
  organizationId: 'string | null',
  projectId: 'string',
  projectName: 'string',
  resourceId: 'string',
  resourceName: 'string',
  unitLabel: 'string',
  providerId: 'string | null',
  providerName: 'string | null',
  workItemId: 'string',
  workItemName: 'string',
  stepId: 'string | null',
  attemptNumber: 'number | null',
  agentRun: 'string',
  responsiblePersonId: 'string',
  responsiblePersonName: 'string',
  locator: 'string',
  units: 'number',
  state,
  revision: 'number',
  createdAt: 'number',
  updatedAt: 'number',
  createdBy: 'string',
  updatedBy: 'string',
  'runtimeId?': 'string',
  'runtimeRevision?': 'number',
  'incarnation?': 'string',
  'pendingCleanupRequest?': 'boolean',
  'reclaimedBytes?': 'null',
  retention: type({ ownerPersonId: 'string', reason: 'string', reviewAt: 'number' }).or('null'),
});
export const resourceUseEvent = type({
  id: 'string',
  useId: 'string',
  revision: 'number',
  kind: "'registered' | 'cleanup_requested' | 'cleanup_blocked' | 'retained' | 'release_reported' | 'cleanup_pending' | 'blocked' | 'release_verified'",
  source: "'reported' | 'runtime'",
  actorId: 'string',
  actorPersonId: 'string | null',
  actorName: 'string',
  'evidenceDigest?': 'string',
  'observedAt?': 'number',
  at: 'number',
  reason: 'string',
  evidence: 'string | null',
  ownerPersonId: 'string | null',
  reviewAt: 'number | null',
});
const registration = type({
  requestId: nonempty,
  resourceId: nonempty,
  workItemId: nonempty,
  'stepId?': nonempty,
  'attemptNumber?': 'number.integer > 0',
  agentRun: nonempty,
  responsiblePersonId: nonempty,
  locator: nonempty,
  units: 'number.integer > 0',
});
const event = type({
  eventId: nonempty,
  expectedRevision: 'number.integer > 0',
  kind: "'cleanup_requested' | 'cleanup_blocked' | 'retained' | 'release_reported'",
  reason: nonempty,
  'evidence?': nonempty,
  'ownerPersonId?': nonempty,
  'reviewAt?': 'number',
});
const refusals = [
  {
    status: 400,
    schema: responseSchema(
      type({ error: "'invalid_body' | 'invalid_json' | 'invalid_query' | 'invalid_params'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  { status: 409, schema: responseSchema(type({ error: "'conflict'" })) },
  { status: 503, schema: responseSchema(type({ error: "'resource_tracking_unavailable'" })) },
  organizationRefusal,
  organizationContextRefusal,
] as const;
const reads = [
  { kind: 'identity', require: 'signed-in' },
  { kind: 'organization-resource', operation: 'read' },
] as const;
const writes = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
  { kind: 'organization-resource', operation: 'mutation' },
] as const;
const params = requestSchema(type({ id: 'string' }));
const useParams = requestSchema(type({ id: 'string', useId: 'string' }));
const page = { 'cursor?': 'string', 'limit?': 'string' } as const;
/** Registers a reported use; each physical copy is a separate registration request. */
export const registerResourceUse = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/resource-uses',
  operationId: 'postApiProjectsByIdResourceUses',
  policies: writes,
  params,
  body: requestSchema(registration),
  responses: [{ kind: 'json', status: 201, schema: responseSchema(type({ use: resourceUse })) }],
  refusals,
  document: {
    summary: 'Register an operator-reported resource use; no physical reservation is created.',
  },
});
export const listResourceUses = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/resource-uses',
  operationId: 'getApiProjectsByIdResourceUses',
  policies: reads,
  params,
  query: requestSchema(type({ ...page, 'workItemId?': 'string', 'state?': state })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ uses: resourceUse.array(), nextCursor: 'string | null' })),
    },
  ],
  refusals,
  document: {
    summary:
      'List reported resource uses with bounded pagination, including same-organization admin orphan reads.',
  },
});
export const appendResourceUseEvent = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/resource-uses/:useId/events',
  operationId: 'postApiProjectsByIdResourceUsesByUseIdEvents',
  policies: writes,
  params: useParams,
  body: requestSchema(event),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ use: resourceUse })) }],
  refusals,
  document: {
    summary:
      'Append an immutable reported cleanup event. Evidence is a reference, not independent verification.',
  },
});
export const readResourceUseHistory = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/resource-uses/:useId/history',
  operationId: 'getApiProjectsByIdResourceUsesByUseIdHistory',
  policies: reads,
  params: useParams,
  query: requestSchema(type(page)),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ events: resourceUseEvent.array(), nextCursor: 'string | null' }),
      ),
    },
  ],
  refusals,
  document: { summary: 'Read immutable reported resource-use history in revision order.' },
});
