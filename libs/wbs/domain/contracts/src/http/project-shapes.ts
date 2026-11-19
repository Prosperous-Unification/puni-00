import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
import { stepShape } from './step-shapes';
import { workPackage } from './work-package-response';

const metadata = {
  id: 'string > 0',
  organizationId: 'string > 0',
  spaceId: type('string > 0').or('null'),
  spacePosition: type('number.integer').or('null'),
  name: 'string > 0',
  revision: 'number.integer >= 0',
  createdAt: 'number.integer',
  updatedAt: 'number.integer | null',
  createdBy: type('string > 0').or('null'),
  workPackageCount: 'number.integer >= 0',
} as const;
const project = type(metadata);
const projectShell = type({
  id: 'string > 0',
  name: 'string > 0',
  // Proof: omitting this composite closure made 'rejects partial malformed and hybrid known metadata instead of falling through to the shell arm'
  // fail its partial-revision runtime issues assertion; canonical passed before/after (project-shapes.test.ts, 2026-11-14). No per-field proof.
  'organizationId?': 'never',
  'spaceId?': 'never',
  'spacePosition?': 'never',
  'revision?': 'never',
  'createdAt?': 'never',
  'updatedAt?': 'never',
  'createdBy?': 'never',
  'workPackageCount?': 'never',
  'workPackages?': 'never',
});
const listedProject = project.or(projectShell);
const detail = type({
  ...metadata,
  workPackages: type({ id: 'string > 0', name: 'string' }).array(),
});
const projectReply = responseSchema(type({ project }));
const params = requestSchema(type({ id: 'string > 0' }));
const nameBody = requestSchema(type({ name: 'string > 0' }));
const createBody = requestSchema(
  type({ name: 'string > 0', 'workPackage?': type({ name: 'string > 0' }) }),
);
const createdReply = responseSchema(
  type({ project, 'workPackage?': 'never', 'steps?': 'never' }).or({
    project,
    workPackage,
    steps: stepShape.array(),
  }),
);
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
      type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body' | 'invalid_json'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
] as const;
const forbidden = {
  status: 403,
  schema: responseSchema(
    type({
      error: "'forbidden'",
      permission: type.enumerated(...PERMISSIONS.map(({ id }) => id)),
    }),
  ),
} as const;
const writing = [
  ...common,
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  forbidden,
] as const;
const invalidBody = {
  status: 422,
  schema: responseSchema(type({ error: "'invalid_body'" })),
} as const;
const nameTaken = { status: 409, schema: responseSchema(type({ error: "'name_taken'" })) } as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;

const projectRevision = type({ id: 'string > 0', revision: 'number.integer >= 0' });

/** E45 moves within the current organization after scoped visibility and both interim write decisions. */
export const moveWorkPackage = defineEndpointShape({
  method: 'POST',
  path: '/api/work-packages/:id/move',
  operationId: 'postApiWorkPackagesByIdMove',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: requestSchema(type({ projectId: 'string > 0' })),
  bodyMedia,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          workPackageId: 'string > 0',
          projectId: 'string > 0',
          revision: 'number.integer >= 0',
          sourceProject: projectRevision,
          targetProject: projectRevision,
        }),
      ),
    },
  ],
  refusals: [
    ...writing,
    invalidBody,
    notFound,
    {
      status: 409,
      schema: responseSchema(
        type({
          error: "'dependency_crosses_project'",
          dependencyIds: type('string > 0').array(),
        }),
      ),
    },
  ],
  document: { summary: 'Move a work package between projects of its current organization.' },
});

/** Creates an empty project or its complete first package under one current E41 owner. */
export const createProject = defineEndpointShape({
  method: 'POST',
  path: '/api/projects',
  operationId: 'postApiProjects',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  body: createBody,
  bodyMedia,
  responses: [{ kind: 'json', status: 201, schema: createdReply }],
  refusals: [
    ...writing,
    invalidBody,
    nameTaken,
    {
      status: 409,
      schema: responseSchema(type({ error: "'abbreviation_taken' | 'abbreviation_exhausted'" })),
    },
  ],
  document: { summary: 'Create an engagement project with an optional first work package.' },
});
/** Lists full project metadata or exact id/name shells derived from actual readable children. */
export const listProjects = defineEndpointShape({
  method: 'GET',
  path: '/api/projects',
  operationId: 'getApiProjects',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ projects: listedProject.array() })),
    },
  ],
  refusals: common,
  document: { summary: 'List engagement projects with readable child counts.' },
});
/** Requires current project.read; a LIST-visible shell receives403 while invisible and absent IDs receive404. */
export const readProject = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id',
  operationId: 'getApiProjectsById',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ project: detail })) }],
  refusals: [...common, forbidden, notFound],
  document: { summary: 'Read an engagement project and its readable work packages.' },
});
/** Renames under organization.create_project until the separately ordered project-permission cutover. */
export const renameProject = defineEndpointShape({
  method: 'PATCH',
  path: '/api/projects/:id',
  operationId: 'patchApiProjectsById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: nameBody,
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: projectReply }],
  refusals: [...writing, invalidBody, nameTaken, notFound],
  document: { summary: 'Rename an engagement project.' },
});
/** Refuses every actual child while disclosing only readable IDs; empty deletion preserves CP14. */
export const deleteProject = defineEndpointShape({
  method: 'DELETE',
  path: '/api/projects/:id',
  operationId: 'deleteApiProjectsById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...writing,
    notFound,
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'not_empty'", workPackageIds: type('string').array() }),
      ),
    },
    { status: 409, schema: responseSchema(type({ error: "'last_super_admin'" })) },
  ],
  document: { summary: 'Delete an empty engagement project.' },
});

const settingProvenance = type({
  level: "'organization' | 'space' | 'project' | 'work_package'",
  id: 'string > 0',
}).or({ level: "'default'" });
const settingsReply = responseSchema(
  type({
    settings: {
      timezone: { value: 'string', provenance: settingProvenance },
      pertWeights: {
        value: { optimistic: 'number >= 0', realistic: 'number >= 0', pessimistic: 'number >= 0' },
        provenance: settingProvenance,
      },
      allowedWorkItemTypes: { value: type('string').array(), provenance: settingProvenance },
      budgetFactor: { value: 'number > 0', provenance: settingProvenance },
      calendarMarkers: type({
        marker: {
          id: 'string > 0',
          date: 'string',
          name: 'string',
          color: 'string | null',
          createdAt: 'number.integer',
        },
        provenance: settingProvenance,
      }).array(),
    },
  }),
);

/** Resolves current project settings only after actual project.read admission. */
export const readProjectSettings = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/settings',
  operationId: 'getApiProjectsByIdSettings',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  responses: [{ kind: 'json', status: 200, schema: settingsReply }],
  refusals: [...common, forbidden, notFound],
  document: { summary: 'Read resolved project settings and actual provenance.' },
});

/** Writes or clears only this project budget override under project.manage_settings. */
export const patchProjectSettings = defineEndpointShape({
  method: 'PATCH',
  path: '/api/projects/:id/settings',
  operationId: 'patchApiProjectsByIdSettings',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: requestSchema(type({ '+': 'reject', budgetFactor: 'number | null' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: settingsReply }],
  refusals: [
    ...writing,
    invalidBody,
    notFound,
    {
      status: 422,
      schema: responseSchema(type({ error: "'invalid_value'", key: "'budgetFactor'" })),
    },
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'not_overridable_here'", key: "'budgetFactor'", level: "'project'" }),
      ),
    },
  ],
  document: { summary: 'Write the admitted project budget factor without a package-level alias.' },
});
