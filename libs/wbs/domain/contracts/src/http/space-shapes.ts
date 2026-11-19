import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { scheduleError } from './schedule-error-shape';
import { requestSchema, responseSchema } from './schema-shape';
import { workPackage } from './work-package-response';

/**
 * One space as every space route answers it (`add-spaces`, spec `space-read`).
 * `virtual` is true only for All work packages, addressed as `all`, which has no
 * author, instant or revision of its own: those read `null`, `null` and 0.
 */
const space = type({
  id: 'string',
  name: 'string',
  virtual: 'boolean',
  workPackageCount: 'number',
  revision: 'number',
  createdById: 'string | null',
  createdAt: 'number | null',
});
const spaceParams = requestSchema(type({ id: 'string' }));
const memberParams = requestSchema(type({ id: 'string', projectId: 'string' }));
const spaceReply = responseSchema(type({ space }));
const positionReply = responseSchema(type({ position: 'number' }));
const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const bodyMedia = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
] as const;
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
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const writing = [
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
] as const;
const malformedName = {
  status: 422,
  schema: responseSchema(type({ error: "'malformed'", field: "'name'" })),
} as const;
const virtualSpace = {
  status: 409,
  schema: responseSchema(type({ error: "'virtual_space'" })),
} as const;

/**
 * The organization's named spaces by name then id; All work packages is never
 * listed. `writable` says whether the caller may create, rename, delete and
 * edit membership, so a client offers no control a write would refuse.
 */
export const listSpaces = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces',
  operationId: 'getApiSpaces',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ spaces: space.array(), writable: 'boolean' })),
    },
  ],
  refusals: common,
  document: { summary: 'List the spaces of the active organization.' },
});

/** Creates a named space in the caller's organization; members and above only. */
export const createSpace = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces',
  operationId: 'postApiSpaces',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  body: requestSchema(type({ name: 'string' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 201, schema: spaceReply }],
  refusals: [
    ...writing,
    { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) },
    malformedName,
  ],
  document: { summary: 'Create a space.' },
});

/**
 * A space and its readable work packages in membership order, each as
 * `GET /api/work-packages` carries it. `all` answers the caller's work package list.
 * `writable` says whether the caller may edit this space's membership; it is
 * false for `all`, which no write addresses.
 */
export const readSpace = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces/:id',
  operationId: 'getApiSpacesById',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: spaceParams,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          space,
          writable: 'boolean',
          rows: type({
            // `updatedAt` is `GET /api/work-packages`' update instant (`list-reads`);
            // optional so an older be-01 mid-swap still parses.
            workPackage: workPackage.and({
              createdByName: 'string',
              lastOpenedAt: 'number | null',
              'updatedAt?': 'number | null',
            }),
            position: 'number',
          }).array(),
        }),
      ),
    },
  ],
  refusals: [...common, notFound],
  document: { summary: 'Read a space and its work packages.' },
});

/** Renames a space; no work package changes. */
export const renameSpace = defineEndpointShape({
  method: 'PATCH',
  path: '/api/spaces/:id',
  operationId: 'patchApiSpacesById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: spaceParams,
  body: requestSchema(type({ name: 'string' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: spaceReply }],
  refusals: [
    ...writing,
    notFound,
    { status: 409, schema: responseSchema(type({ error: "'name_taken' | 'virtual_space'" })) },
    malformedName,
  ],
  document: { summary: 'Rename a space.' },
});

/** Deletes a space and its membership; no work package changes. */
export const removeSpace = defineEndpointShape({
  method: 'DELETE',
  path: '/api/spaces/:id',
  operationId: 'deleteApiSpacesById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: spaceParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Delete a space.' },
});

/**
 * Adds a work package after `afterWorkPackageId`, or first when it is absent or null.
 * A work package the caller cannot open answers the work package routes' own 404.
 */
export const addSpaceProject = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces/:id/projects',
  operationId: 'postApiSpacesByIdProjects',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: spaceParams,
  body: requestSchema(type({ projectId: 'string', 'afterProjectId?': 'string | null' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 201, schema: positionReply }],
  refusals: [
    ...writing,
    notFound,
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'already_in_space' | 'virtual_space'" }).or({
          error: "'project_in_other_space'",
          spaceId: 'string > 0',
        }),
      ),
    },
  ],
  document: { summary: 'Add a work package to a space.' },
});

/** Removes a work package from a space; the work package is unchanged. */
export const removeSpaceProject = defineEndpointShape({
  method: 'DELETE',
  path: '/api/spaces/:id/projects/:projectId',
  operationId: 'deleteApiSpacesByIdProjectsByProjectId',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: memberParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Remove a work package from a space.' },
});

/** Moves a member after `afterProjectId`, or first when it is absent or null. */
export const moveSpaceProject = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces/:id/projects/:projectId/move',
  operationId: 'postApiSpacesByIdProjectsByProjectIdMove',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params: memberParams,
  body: requestSchema(type({ 'afterProjectId?': 'string | null' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: positionReply }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Move a work package within a space.' },
});

const statusCounts = type({
  unknown: 'number',
  draft: 'number',
  ready: 'number',
  in_progress: 'number',
  blocked_by_proxy: 'number',
  on_hold: 'number',
  blocked: 'number',
  done: 'number',
});
const rolledUp = type({
  kind: "'rolled_up'",
  dates: type({ startsOn: 'string', endsOn: 'string' }).or('null'),
  finalTotal: 'number',
  status:
    "'unknown' | 'draft' | 'ready' | 'in_progress' | 'blocked_by_proxy' | 'on_hold' | 'blocked' | 'done'",
  counts: { byStatus: statusCounts, leaves: 'number', estimated: 'number' },
  scheduleError,
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  displayed: 'string | null',
  workPackageRevision: 'number',
  seq: 'number',
});
const unavailable = type({ kind: "'unavailable'" });

/**
 * Roll-ups for up to 50 comma-separated `projectIds`, each a member of the
 * space the caller can open (`all`: any work package the caller can open). Any
 * other id answers 404 for the whole request; more than 50, or none, 400.
 * Separate from the space read so the rows paint first (design memo §8).
 */
export const readSpaceRollUps = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces/:id/roll-ups',
  operationId: 'getApiSpacesByIdRoll-ups',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: spaceParams,
  query: requestSchema(type({ workPackageIds: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ rollUps: type.Record('string', rolledUp.or(unavailable)) })),
    },
  ],
  refusals: [...common, notFound],
  document: { summary: 'Read roll-ups for work packages of a space.' },
});

const inProgressItem = type({
  workPackageId: 'string',
  workPackageName: 'string',
  position: 'number',
  workItemId: 'string',
  number: 'string',
  name: 'string',
  dates: type({ startsOn: 'string', endsOn: 'string' }).or('null'),
  lateBy: 'number | null',
  assignees: type({ id: 'string', name: 'string' }).array(),
  step: type({ id: 'string', name: 'string' }).or('null'),
});

/**
 * The leaves in progress across the readable members of a space, by end date
 * with undated last, then space position, then number. `limit` defaults to
 * 200 and refuses above 1000 with 400; `truncated` says whether items were
 * cut; `unavailable` names members whose scheduler engine is down.
 */
export const readSpaceInProgress = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces/:id/in-progress',
  operationId: 'getApiSpacesByIdIn-progress',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: spaceParams,
  query: requestSchema(type({ 'limit?': 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          items: inProgressItem.array(),
          truncated: 'boolean',
          unavailable: type('string').array(),
        }),
      ),
    },
  ],
  refusals: [...common, notFound],
  document: { summary: 'List the work in progress across a space.' },
});
