import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** The organization's work packages in rank order (`share-people-across-work-packages`, spec `work-package-rank`). */
const rankReply = responseSchema(
  type({
    workPackages: type({
      workPackageId: 'string',
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
  organizationContextRefusal,
  { status: 409, schema: responseSchema(type({ error: "'organization_required'" })) },
] as const;

/** Every work package of the caller's organization in rank order; any current member reads it. */
export const readWorkPackageRank = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/work-package-rank',
  operationId: 'getApiOrganizationWorkPackage-rank',
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'signed-in' },
  ],
  responses: [{ kind: 'json', status: 200, schema: rankReply }],
  refusals: common,
  document: { summary: 'Read the active organization’s work packages in rank order.' },
});

/**
 * Moves a work package directly after `afterWorkPackageId`, or first when it is absent
 * or null; admins and super-admins only. Naming the work package itself as
 * `afterWorkPackageId` is a no-op answering 200 with the current order. Not a plan command: no journal, no
 * undo. A rank moves other people's dates once people are shared (ADR 0034).
 */
export const moveWorkPackageRank = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/work-packages/:id/rank',
  operationId: 'postApiOrganizationWorkPackagesByIdRank',
  policies: [
    { kind: 'organization-resource', operation: 'mutation' },
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
  ],
  params: requestSchema(type({ id: 'string' })),
  body: requestSchema(type({ 'afterWorkPackageId?': 'string | null' })),
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: rankReply }],
  refusals: [
    ...common,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    {
      status: 403,
      schema: responseSchema(
        type({
          error: "'forbidden'",
          'permission?': type.enumerated(...PERMISSIONS.map(({ id }) => id)),
        }),
      ),
    },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  ],
  document: { summary: 'Move a work package in the active organization’s work package rank.' },
});
