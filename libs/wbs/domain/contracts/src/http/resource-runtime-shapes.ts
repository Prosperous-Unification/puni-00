import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const label = '0 < string <= 2048';
export const resourceRuntimeUse = type({
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
});
/**
 * A host job (`dash-host-jobs` J10), the use variant of `resourceRuntimeUse` v2: admitted by
 * Dash's host pool alone and published afterwards, so its project, work item and person links
 * are optional and its owner is the authority the event arrives through (and that authority's
 * organization), never a planning row. `reservations` holds one entry per dimension the
 * envelope names (`cpuCores`, `memoryGib`, `tmpDiskGib`, one per exclusive id). `payloadSha` is
 * the payload's commit, null while the launcher records none. A v1 use (`resourceRuntimeUse`)
 * is unchanged byte for byte.
 */
// Proof: with `projectId` required, a gate without a link failed to register in
// `projects two gates with no planning link` (host-job-use.controller.db.test.ts) and Dash's
// outbox move refused it in host-job-publication.test.ts; watched 2026-11-01.
export const resourceRuntimeHostJobUse = type({
  kind: "'host_job'",
  'projectId?': label,
  'workItemId?': label,
  'responsiblePersonId?': label,
  type: label,
  label,
  host: label,
  payloadSha: type(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).or('null'),
  reservations: type({ dimension: label, units: 'number.integer >= 0' }).array(),
}).onUndeclaredKey('reject');
export type ResourceRuntimeHostJobUse = typeof resourceRuntimeHostJobUse.infer;
/** Ordered attestation from an admin-bound runtime credential, never an ordinary worker assertion. */
export const resourceRuntimeEvent = type({
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
  use: resourceRuntimeUse.or(resourceRuntimeHostJobUse),
  /** `returned` is a host job's: every reservation entry settled on its terminal evidence (J2'). */
  'evidence?': {
    digest: 'string',
    locator: label,
    disposition: "'removed' | 'not_created' | 'returned'",
    reclaimedBytes: 'null',
  },
  'retention?': { ownerPersonId: label, reviewAt: 'number.integer > 0' },
});
export type ResourceRuntimeEvent = typeof resourceRuntimeEvent.infer;
/**
 * Durable attribution admission precedes physical work and ordered source publication. Only a
 * v1 use is admitted: a host job is admitted by its host pool and never by WBS (J10).
 */
export const resourceRuntimeAdmission = type({
  eventId: label,
  epoch: label,
  useId: label,
  incarnation: label,
  observedAt: 'number.integer >= 0',
  reason: label,
  use: resourceRuntimeUse,
}).onUndeclaredKey('reject');
export type ResourceRuntimeAdmission = typeof resourceRuntimeAdmission.infer;
export const resourceRuntimeAdmissionReceipt = type({
  eventId: label,
  useId: label,
  incarnation: label,
});
export type ResourceRuntimeAdmissionReceipt = typeof resourceRuntimeAdmissionReceipt.infer;
export const resourceCleanupRequest = type({
  requestId: 'number',
  useId: 'string',
  incarnation: 'string',
  expectedRevision: 'number',
  reason: 'string',
  at: 'number',
});
export type ResourceCleanupRequest = typeof resourceCleanupRequest.infer;
export const resourceAuthority = type({
  authorityId: 'string',
  organizationId: 'string',
  providerId: 'string',
  credentialId: 'string',
  epoch: 'string',
  acceptedSequence: 'number',
});
export type ResourceAuthority = typeof resourceAuthority.infer;
const refusals = [
  {
    status: 400,
    schema: responseSchema(
      type({ error: "'invalid_body' | 'invalid_json' | 'invalid_params' | 'invalid_query'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
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
const params = requestSchema(type({ authorityId: 'string' }));
export const bindResourceAuthority = defineEndpointShape({
  method: 'PUT',
  path: '/api/organization/resource-authorities/:authorityId',
  operationId: 'putApiOrganizationResourceAuthoritiesByAuthorityId',
  params,
  policies: writes,
  body: requestSchema(type({ providerId: label, credentialId: label, epoch: label })),
  responses: [{ kind: 'json', status: 200, schema: responseSchema(resourceAuthority) }],
  refusals,
  document: {
    summary:
      'Bind one runtime epoch to a provider and exact machine credential. Admin session only; rebinding refuses.',
  },
});
export const readResourceAuthority = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/resource-authorities/:authorityId',
  operationId: 'getApiOrganizationResourceAuthoritiesByAuthorityId',
  params,
  policies: reads,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(resourceAuthority) }],
  refusals,
  document: { summary: 'Inspect one resource runtime authority binding, for organization admins.' },
});
export const admitResourceRuntimeUse = defineEndpointShape({
  method: 'PUT',
  path: '/api/resource-authorities/:authorityId/admissions',
  operationId: 'putApiResourceAuthoritiesByAuthorityIdAdmissions',
  params,
  policies: writes,
  body: requestSchema(resourceRuntimeAdmission),
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(resourceRuntimeAdmissionReceipt) },
  ],
  refusals,
  document: {
    summary:
      'Durably admit immutable attribution before physical work; exact credential-bound replay survives planning deletion.',
  },
});
export const ingestResourceRuntimeEvent = defineEndpointShape({
  method: 'PUT',
  path: '/api/resource-authorities/:authorityId/events',
  operationId: 'putApiResourceAuthoritiesByAuthorityIdEvents',
  params,
  policies: writes,
  body: requestSchema(resourceRuntimeEvent),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ acceptedSequence: 'number', useId: 'string', revision: 'number' }),
      ),
    },
  ],
  refusals,
  document: {
    summary: 'Ingest an ordered runtime resource event through its exact admin-bound credential.',
  },
});
export const readResourceCleanupRequests = defineEndpointShape({
  method: 'GET',
  path: '/api/resource-authorities/:authorityId/cleanup-requests',
  operationId: 'getApiResourceAuthoritiesByAuthorityIdCleanupRequests',
  params,
  policies: reads,
  query: requestSchema(type({ 'after?': 'string', 'limit?': 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ requests: resourceCleanupRequest.array(), nextCursor: 'string | null' }),
      ),
    },
  ],
  refusals,
  document: {
    summary:
      'Read durable cleanup requests for the bound runtime. A request is acknowledged only by a matching runtime event.',
  },
});
