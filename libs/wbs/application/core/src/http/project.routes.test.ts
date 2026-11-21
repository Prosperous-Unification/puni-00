import type { AuthenticatedUser } from '@wbs/contracts';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, it } from 'bun:test';

import { clockOf } from '../ports/clock';
import type {
  OrganizationAccess,
  OrganizationAccessResolution,
} from '../ports/organization-access';
import type { ProjectAdministration } from '../ports/project-administration';
import type { ProjectRead, ProjectView } from '../ports/project-read';
import { ProjectResource } from '../service/project.resource';
import { EMPTY } from './endpoint';
import { projectRoutes } from './project.routes';

const PROJECT: ProjectView = {
  spaceId: null,
  spacePosition: null,
  id: 'p',
  organizationId: 'org',
  name: 'Plan',
  revision: 0,
  createdAt: 1,
  updatedAt: null,
  createdBy: 'reader',
  workPackageCount: 0,
};
const PRINCIPAL: AuthenticatedUser = {
  id: 'reader',
  username: 'Reader',
  scopes: ['read', 'write'],
  authentication: { kind: 'machine', credentialId: 'credential', personId: 'person' },
  delegation: { organizationId: 'org', audience: 'wbs-be-01/direct' },
};
const SCOPED: OrganizationAccessResolution = {
  ok: true,
  access: {
    kind: 'scoped',
    principal: { id: 'reader' },
    scope: { organizationId: 'org', userId: 'reader', cap: null },
  },
};
const request = {
  method: 'POST',
  url: new URL('http://localhost/api/projects'),
  headers: new Headers({ 'X-WBS-Expected-Organization': 'org' }),
  signal: new AbortController().signal,
};
function fixture() {
  let resolved: OrganizationAccessResolution = SCOPED;
  let creation: Awaited<ReturnType<ProjectAdministration['create']>> = {
    kind: 'created',
    project: PROJECT,
  };
  let renamed: Awaited<ReturnType<ProjectAdministration['rename']>> = {
    kind: 'renamed',
    project: PROJECT,
  };
  let deleted: Awaited<ReturnType<ProjectAdministration['delete']>> = { kind: 'deleted' };
  let listed: Awaited<ReturnType<ProjectRead['list']>> = { ok: true, value: [PROJECT] };
  let detail: Awaited<ReturnType<ProjectRead['read']>> = {
    ok: true,
    value: { ...PROJECT, workPackages: [] },
  };
  const calls: unknown[] = [];
  const administration: ProjectAdministration = {
    moveWorkPackage() {
      return Promise.resolve({ ok: false, refusal: 'no_active_organization' });
    },
    create(caller, draft, act, first) {
      calls.push({ caller, draft, act, ...(first === undefined ? {} : { first }) });
      return Promise.resolve(creation);
    },
    rename(caller, id, name, act) {
      calls.push({ caller, id, name, act });
      return Promise.resolve(renamed);
    },
    delete(caller, id, act) {
      calls.push({ caller, id, act });
      return Promise.resolve(deleted);
    },
  };
  const read: ProjectRead = {
    list(caller) {
      calls.push({ caller });
      return Promise.resolve(listed);
    },
    read(caller, id) {
      calls.push({ caller, id });
      return Promise.resolve(detail);
    },
  };
  let identity = 0;
  const resource = new ProjectResource({
    settings: {
      read: () => Promise.reject(new Error('project settings reader is unused in this fixture')),
      writeBudget: () =>
        Promise.reject(new Error('project settings writer is unused in this fixture')),
    },
    administration,
    read,
    clock: clockOf({ now: () => 10, newId: () => String(++identity) }),
  });
  const organizations: OrganizationAccess = {
    resolve() {
      return Promise.resolve(resolved);
    },
  };
  return {
    routes: projectRoutes(resource, organizations),
    calls,
    resolve(value: typeof resolved) {
      resolved = value;
    },
    create(value: typeof creation) {
      creation = value;
    },
    rename(value: typeof renamed) {
      renamed = value;
    },
    delete(value: typeof deleted) {
      deleted = value;
    },
    list(value: typeof listed) {
      listed = value;
    },
    read(value: typeof detail) {
      detail = value;
    },
  };
}
const input = {
  params: { id: 'p' },
  query: undefined,
  body: undefined,
  principal: PRINCIPAL,
  request,
};
it('binds five real project handlers with explicit success bodies and DELETE EMPTY', async () => {
  const scope = fixture(),
    [create, list, read, rename, remove] = scope.routes;
  expect(await create.handle({ ...input, params: {}, body: { name: 'New' } })).toEqual({
    ok: true,
    status: 201,
    body: { project: PROJECT },
  });
  expect(await list.handle({ ...input, params: {} })).toEqual({
    ok: true,
    status: 200,
    body: { projects: [PROJECT] },
  });
  expect(await read.handle(input)).toEqual({
    ok: true,
    status: 200,
    body: { project: { ...PROJECT, workPackages: [] } },
  });
  expect(await rename.handle({ ...input, body: { name: 'New' } })).toEqual({
    ok: true,
    status: 200,
    body: { project: PROJECT },
  });
  expect(await remove.handle(input)).toEqual({ ok: true, status: 204, body: EMPTY });
  expect(scope.calls[0]).toMatchObject({
    caller: {
      kind: 'human',
      principal: PRINCIPAL,
      expectedAccess: SCOPED.access,
    },
    draft: { name: 'New' },
  });
  expect(scope.calls).toHaveLength(5);
});
it('answers missing and foreign-like null/not_found with the same404 and preserves readable-only not_empty IDs', async () => {
  const scope = fixture();
  scope.read({ ok: true, value: null });
  scope.rename('not_found');
  scope.delete('not_found');
  for (const reply of [
    await scope.routes[2].handle(input),
    await scope.routes[3].handle({ ...input, body: { name: 'New' } }),
    await scope.routes[4].handle(input),
  ])
    expect(reply).toEqual({ ok: false, status: 404, body: { error: 'not_found' } });
  scope.delete({ kind: 'not_empty', workPackageIds: [] });
  expect(await scope.routes[4].handle(input)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'not_empty', workPackageIds: [] },
  });
  scope.delete({ kind: 'not_empty', workPackageIds: ['visible'] });
  expect(await scope.routes[4].handle(input)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'not_empty', workPackageIds: ['visible'] },
  });
  scope.delete('last_super_admin');
  expect(await scope.routes[4].handle(input)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'last_super_admin' },
  });
});
it('maps name conflicts and the exact E41 permission without substituting final project grants', async () => {
  const scope = fixture();
  scope.create('name_taken');
  scope.rename('name_taken');
  expect(await scope.routes[0].handle({ ...input, params: {}, body: { name: 'New' } })).toEqual({
    ok: false,
    status: 409,
    body: { error: 'name_taken' },
  });
  expect(await scope.routes[3].handle({ ...input, body: { name: 'New' } })).toEqual({
    ok: false,
    status: 409,
    body: { error: 'name_taken' },
  });
  scope.rename({ ok: false, error: 'forbidden', permission: 'organization.create_project' });
  expect(await scope.routes[3].handle({ ...input, body: { name: 'New' } })).toEqual({
    ok: false,
    status: 403,
    body: { error: 'forbidden', permission: 'organization.create_project' },
  });
});
it('refuses legacy before any project collaborator and keeps current-context409 and credential bodies', async () => {
  const scope = fixture();
  scope.resolve({ ok: true, access: { kind: 'legacy' } });
  expect(await scope.routes[0].handle({ ...input, params: {}, body: { name: 'New' } })).toEqual({
    ok: false,
    status: 403,
    body: { error: 'no_active_organization' },
  });
  expect(scope.calls).toHaveLength(0);
  scope.resolve({
    ok: false,
    refusal: 'sso_required',
    organizationId: 'org',
    login: '/login',
    link: true,
  });
  expect(await scope.routes[1].handle({ ...input, params: {} })).toEqual({
    ok: false,
    status: 403,
    body: { error: 'sso_required', organizationId: 'org', login: '/login', link: true },
  });
  scope.resolve(SCOPED);
  scope.list({ ok: false, refusal: 'organization_context_changed' });
  expect(await scope.routes[1].handle({ ...input, params: {} })).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
});

it('dispatches the complete returned variant and independently maps modeled package allocation refusals', async () => {
  const scope = fixture(),
    child = workPackageRow({ id: 'w', projectId: 'p' }),
    steps = [
      {
        id: 's',
        workPackageId: 'w',
        name: 'Research',
        position: 10,
        code: 'RES',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ];
  scope.create({
    kind: 'created_with_work_package',
    project: { ...PROJECT, workPackageCount: 1 },
    workPackage: child,
    steps,
  });
  expect(
    await scope.routes[0].handle({
      ...input,
      params: {},
      body: { name: 'New', workPackage: { name: 'First' } },
    }),
  ).toEqual({
    ok: true,
    status: 201,
    body: { project: { ...PROJECT, workPackageCount: 1 }, workPackage: child, steps },
  });
  expect(scope.calls).toMatchObject([
    {
      first: {
        workPackage: { name: 'First', projectId: '1' },
        steps: [],
        creatorGrant: { id: '6', auditId: '7' },
      },
    },
  ]);
  for (const reason of ['abbreviation_taken', 'abbreviation_exhausted'] as const) {
    scope.create({ kind: 'work_package_refused', reason });
    expect(
      await scope.routes[0].handle({
        ...input,
        params: {},
        body: { name: 'New', workPackage: { name: 'First' } },
      }),
    ).toEqual({ ok: false, status: 409, body: { error: reason } });
  }
  scope.create({ kind: 'created', project: PROJECT });
  expect(
    await scope.routes[0].handle({
      ...input,
      params: {},
      body: { name: 'New', workPackage: { name: 'First' } },
    }),
  ).toEqual({ ok: true, status: 201, body: { project: PROJECT } });
});

it('returns list shells unchanged and maps full-detail denial separately from organization refusals', async () => {
  const scope = fixture();
  scope.list({ ok: true, value: [{ id: 'shell', name: 'Shell' }, PROJECT] });
  expect(await scope.routes[1].handle({ ...input, params: {} })).toEqual({
    ok: true,
    status: 200,
    body: { projects: [{ id: 'shell', name: 'Shell' }, PROJECT] },
  });
  scope.read({ ok: false, error: 'forbidden', permission: 'project.read' });
  expect(await scope.routes[2].handle(input)).toEqual({
    ok: false,
    status: 403,
    body: { error: 'forbidden', permission: 'project.read' },
  });
  scope.read({ ok: true, value: null });
  expect(await scope.routes[2].handle(input)).toEqual({
    ok: false,
    status: 404,
    body: { error: 'not_found' },
  });
  scope.read({ ok: false, refusal: 'organization_context_changed' });
  expect(await scope.routes[2].handle(input)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
});
