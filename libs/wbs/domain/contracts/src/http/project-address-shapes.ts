import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
const policies = [
  { kind: 'identity', require: 'signed-in' },
  { kind: 'organization-resource', operation: 'read' },
] as const;
const params = requestSchema(type({ id: 'string' }));
const pageQuery = requestSchema(type({ 'q?': 'string', 'limit?': 'string', 'cursor?': 'string' }));
const identity = type({ projectId: 'string', abbreviation: 'string', name: 'string' });
const endpoint = type({ scope: "'whole'", workItemId: 'string' }).or({
  scope: "'node' | 'descendant-step'",
  workItemId: 'string',
  stepId: 'string',
});
const candidate = type({
  projectId: 'string',
  workItemId: 'string',
  number: 'string',
  name: 'string',
  endpoint,
  reference: 'string | null',
  'stepNodeId?': 'string',
  'step?': {
    id: 'string',
    code: 'string | null',
    name: 'string',
    position: 'number',
    ordinal: 'number',
  },
});
const refusals = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
] as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const stale = {
  status: 409,
  schema: responseSchema(type({ error: "'stale_address_revision'", addressRevision: 'string' })),
} as const;
/** Bounded project metadata observations; equal legacy codes remain separate stable choices. */
export const discoverAddressProjects = defineEndpointShape({
  method: 'GET',
  path: '/api/project-addresses/projects',
  operationId: 'getApiProjectAddressesProjects',
  policies,
  query: pageQuery,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ projects: identity.array(), nextCursor: 'string | null' })),
    },
  ],
  refusals,
  document: { summary: 'Discover readable projects by abbreviation or name.' },
});
/** Whole and authored step candidates within one selected stable project. */
export const discoverAddressCandidates = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/address-candidates',
  operationId: 'getApiProjectsByIdAddressCandidates',
  policies,
  params,
  query: pageQuery,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          project: identity,
          addressRevision: 'string',
          candidates: candidate.array(),
          nextCursor: 'string | null',
        }),
      ),
    },
  ],
  refusals: [...refusals, notFound, stale],
  document: { summary: 'Discover bounded endpoint candidates in a selected project.' },
});
/** Resolves against an observed qualified revision without selecting another project by code. */
export const resolveAddressReference = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/address-references',
  operationId: 'getApiProjectsByIdAddressReferences',
  policies,
  params,
  query: requestSchema(type({ reference: 'string', revision: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          projectId: 'string',
          endpoint,
          reference: 'string',
          addressRevision: 'string',
          'stepNodeId?': 'string',
        }),
      ),
    },
  ],
  refusals: [
    ...refusals,
    notFound,
    stale,
    {
      status: 422,
      schema: responseSchema(
        type({
          error: "'unresolvable_reference'",
          reason: "'malformed' | 'ambiguous_work_item' | 'parent' | 'alias_mismatch'",
        }),
      ),
    },
  ],
  document: { summary: 'Resolve a reference within an observed stable project.' },
});
