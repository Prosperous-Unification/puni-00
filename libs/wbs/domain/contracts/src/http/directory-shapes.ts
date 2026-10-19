import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { responseSchema } from './schema-shape';

const namedRow = type({ id: 'string', name: 'string' });
// Proof: removing identity returned200 instead of401 in the mounted
// requires-identity case in directory.controller.db.test.ts.
const policies = [{ kind: 'identity', require: 'signed-in' }] as const;
const refusals = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
] as const;

/**
 * Reads the teams directory: deployment-wide before organization activation,
 * the active organization's own under its local names after it.
 * Proof: optional serviceIds admitted a damaged row,200 instead of500 in the
 * mounted damaged-directory case. Adding a tolerant query declaration returned
 *200 instead of400 in the mounted undeclared-query case.
 */
export const listTeams = defineEndpointShape({
  method: 'GET',
  path: '/api/teams',
  operationId: 'getApiTeams',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ teams: type({ id: 'string', name: 'string', serviceIds: 'string[]' }).array() }),
      ),
    },
  ],
  refusals,
  document: { summary: 'List teams.' },
});

/**
 * Reads people with their kind, complete team memberships and the account
 * bound to act as each (`accountId`, null when unbound; `wbs-team-claims` D5).
 *
 * `accountId` is optional on the wire although this release always sends it:
 * fe-01 reads this shape too, and mid-swap a new fe-01 is answered by the
 * outgoing be-01, which knows no binding. Required, every people read there
 * would be refused and the plan would stop refreshing. be-01's own answer is
 * held to the field by `person-account.controller.db.test.ts`.
 * Proof: optional kind, optional teamIds and unrestricted kind each returned200
 * instead of500 in the mounted damaged-directory case. Using requestSchema
 * rejected additive audit fields,500 instead of200 in the mounted audit case.
 */
export const listPeople = defineEndpointShape({
  method: 'GET',
  path: '/api/people',
  operationId: 'getApiPeople',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          people: type({
            id: 'string',
            name: 'string',
            kind: "'person' | 'agent'",
            teamIds: 'string[]',
            'accountId?': 'string | null',
          }).array(),
        }),
      ),
    },
  ],
  refusals,
  document: { summary: 'List people.' },
});

/**
 * Reads the tags directory: deployment-wide before organization
 * activation, the active organization's own under its local names after it.
 */
export const listTags = defineEndpointShape({
  method: 'GET',
  path: '/api/tags',
  operationId: 'getApiTags',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ tags: namedRow.array() })) },
  ],
  refusals,
  document: { summary: 'List tags.' },
});

/**
 * Reads the services directory: deployment-wide before organization
 * activation, the active organization's own under its local names after it.
 */
export const listServices = defineEndpointShape({
  method: 'GET',
  path: '/api/services',
  operationId: 'getApiServices',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ services: namedRow.array() })) },
  ],
  refusals,
  document: { summary: 'List services.' },
});

/**
 * Reads the work-item-types directory: deployment-wide before organization
 * activation, the active organization's own under its local names after it.
 */
export const listWorkItemTypes = defineEndpointShape({
  method: 'GET',
  path: '/api/work-item-types',
  operationId: 'getApiWork-item-types',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ workItemTypes: namedRow.array() })),
    },
  ],
  refusals,
  document: { summary: 'List work-item-types.' },
});

/**
 * Reads the external-systems directory: deployment-wide before organization
 * activation, the active organization's own under its local names after it.
 */
export const listExternalSystems = defineEndpointShape({
  method: 'GET',
  path: '/api/external-systems',
  operationId: 'getApiExternal-systems',
  policies: [...policies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ externalSystems: namedRow.array() })),
    },
  ],
  refusals,
  document: { summary: 'List external-systems.' },
});
