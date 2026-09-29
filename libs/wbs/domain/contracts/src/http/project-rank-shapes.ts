import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** The organization's projects in rank order (`share-people-across-projects`, spec `project-rank`). */
const rankReply = responseSchema(
  type({
    projects: type({
      projectId: 'string',
      name: 'string',
      rank: 'number',
      ranked: 'boolean',
    }).array(),
  }),
);
const common = [
  {
    status: 400,
    schema: responseSchema(
      type({ error: "'invalid_params' | 'invalid_query' | 'invalid_json' | 'invalid_body'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  { status: 409, schema: responseSchema(type({ error: "'organization_required'" })) },
] as const;

/** Every project of the caller's organization in rank order; any current member reads it. */
export const readProjectRank = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/project-rank',
  operationId: 'getApiOrganizationProject-rank',
  policies: [{ kind: 'identity', require: 'signed-in' }],
  responses: [{ kind: 'json', status: 200, schema: rankReply }],
  refusals: common,
  document: { summary: 'Read the active organization’s projects in rank order.' },
});

/**
 * Moves a project directly after `afterProjectId`, or first when it is absent
 * or null; admins and super-admins only. Not a plan command: no journal, no
 * undo. A rank moves other people's dates once people are shared (ADR 0034).
 */
export const moveProjectRank = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/projects/:id/rank',
  operationId: 'postApiOrganizationProjectsByIdRank',
  policies: [
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
  ],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(type({ 'afterProjectId?': 'string | null' })),
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: rankReply }],
  refusals: [
    ...common,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  ],
  document: { summary: 'Move a project in the active organization’s project rank.' },
});
