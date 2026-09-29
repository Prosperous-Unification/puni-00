import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** The organization's capacity mode (`share-people-across-projects`, spec `shared-people-mode`). */
const modeReply = responseSchema(type({ sharedPeople: 'boolean' }));
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

/** Whether the caller's organization shares its people; any current member reads it. */
export const readSharedPeople = defineEndpointShape({
  method: 'GET',
  path: '/api/organization',
  operationId: 'getApiOrganization',
  policies: [{ kind: 'identity', require: 'signed-in' }],
  responses: [{ kind: 'json', status: 200, schema: modeReply }],
  refusals: common,
  document: { summary: 'Read whether the active organization shares its people.' },
});

/**
 * Switches the caller's organization between isolated and shared people;
 * super-admins only, and never through a delegation. A switch moves other
 * people's dates (ADR 0034), so it is audited and tells every project of the
 * organization; setting the mode it already has changes nothing.
 */
export const changeSharedPeople = defineEndpointShape({
  method: 'PATCH',
  path: '/api/organization',
  operationId: 'patchApiOrganization',
  policies: [
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
  ],
  body: requestSchema(type({ sharedPeople: 'boolean' })),
  responses: [{ kind: 'json', status: 200, schema: modeReply }],
  refusals: [
    ...common,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  ],
  document: { summary: 'Switch whether the active organization shares its people.' },
});
