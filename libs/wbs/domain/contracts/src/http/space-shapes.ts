import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { project } from './project-response';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * One space as every space route answers it (`add-spaces`, spec `space-read`).
 * `virtual` is true only for All projects, addressed as `all`, which has no
 * author, instant or revision of its own: those read `null`, `null` and 0.
 */
const space = type({
  id: 'string',
  name: 'string',
  virtual: 'boolean',
  projectCount: 'number',
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
  { status: 409, schema: responseSchema(type({ error: "'organization_required'" })) },
] as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const writing = [
  ...common,
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
] as const;
const malformedName = {
  status: 422,
  schema: responseSchema(type({ error: "'malformed'", field: "'name'" })),
} as const;
const virtualSpace = {
  status: 409,
  schema: responseSchema(type({ error: "'virtual_space'" })),
} as const;

/** The organization's named spaces by name then id; All projects is never listed. */
export const listSpaces = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces',
  operationId: 'getApiSpaces',
  policies: readPolicies,
  responses: [
    { kind: 'json', status: 200, schema: responseSchema(type({ spaces: space.array() })) },
  ],
  refusals: common,
  document: { summary: 'List the spaces of the active organization.' },
});

/** Creates a named space in the caller's organization; members and above only. */
export const createSpace = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces',
  operationId: 'postApiSpaces',
  policies: writePolicies,
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
 * A space and its readable projects in membership order, each as
 * `GET /api/projects` carries it. `all` answers the caller's project list.
 */
export const readSpace = defineEndpointShape({
  method: 'GET',
  path: '/api/spaces/:id',
  operationId: 'getApiSpacesById',
  policies: readPolicies,
  params: spaceParams,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          space,
          rows: type({
            project: project.and({ ownerName: 'string', lastOpenedAt: 'number | null' }),
            position: 'number',
          }).array(),
        }),
      ),
    },
  ],
  refusals: [...common, notFound],
  document: { summary: 'Read a space and its projects.' },
});

/** Renames a space; no project changes. */
export const renameSpace = defineEndpointShape({
  method: 'PATCH',
  path: '/api/spaces/:id',
  operationId: 'patchApiSpacesById',
  policies: writePolicies,
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

/** Deletes a space and its membership; no project changes. */
export const removeSpace = defineEndpointShape({
  method: 'DELETE',
  path: '/api/spaces/:id',
  operationId: 'deleteApiSpacesById',
  policies: writePolicies,
  params: spaceParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Delete a space.' },
});

/**
 * Adds a project after `afterProjectId`, or first when it is absent or null.
 * A project the caller cannot open answers the project routes' own 404.
 */
export const addSpaceProject = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces/:id/projects',
  operationId: 'postApiSpacesByIdProjects',
  policies: writePolicies,
  params: spaceParams,
  body: requestSchema(type({ projectId: 'string', 'afterProjectId?': 'string | null' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 201, schema: positionReply }],
  refusals: [
    ...writing,
    notFound,
    {
      status: 409,
      schema: responseSchema(type({ error: "'already_in_space' | 'virtual_space'" })),
    },
  ],
  document: { summary: 'Add a project to a space.' },
});

/** Removes a project from a space; the project is unchanged. */
export const removeSpaceProject = defineEndpointShape({
  method: 'DELETE',
  path: '/api/spaces/:id/projects/:projectId',
  operationId: 'deleteApiSpacesByIdProjectsByProjectId',
  policies: writePolicies,
  params: memberParams,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Remove a project from a space.' },
});

/** Moves a member after `afterProjectId`, or first when it is absent or null. */
export const moveSpaceProject = defineEndpointShape({
  method: 'POST',
  path: '/api/spaces/:id/projects/:projectId/move',
  operationId: 'postApiSpacesByIdProjectsByProjectIdMove',
  policies: writePolicies,
  params: memberParams,
  body: requestSchema(type({ 'afterProjectId?': 'string | null' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: positionReply }],
  refusals: [...writing, notFound, virtualSpace],
  document: { summary: 'Move a project within a space.' },
});
