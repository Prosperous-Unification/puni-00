import type { AuthenticatedUser } from '@wbs/contracts';
import { expect, it } from 'bun:test';

import { clockOf } from '../ports/clock';
import type {
  OrganizationAccess,
  OrganizationAccessResolution,
} from '../ports/organization-access';
import type { ProjectAdministration, ProjectMove } from '../ports/project-administration';
import { ProjectResource } from '../service/project.resource';
import { workPackageMoveRoutes } from './work-package-move.routes';

const SCOPED: OrganizationAccessResolution = {
  ok: true,
  access: {
    kind: 'scoped',
    principal: { id: 'actor' },
    scope: { organizationId: 'org', userId: 'actor', cap: null },
  },
};
const MOVED = {
  kind: 'moved',
  workPackageId: 'moving',
  projectId: 'target',
  revision: 2,
  sourceProject: { id: 'source', revision: 3 },
  targetProject: { id: 'target', revision: 4 },
} as const;
function input() {
  const principal: AuthenticatedUser = {
    id: 'actor',
    username: 'Actor',
    scopes: ['read', 'write'],
    authentication: { kind: 'machine', credentialId: 'credential', personId: 'person' },
    delegation: { organizationId: 'org', audience: 'wbs-be-01/direct' },
  };
  return {
    principal,
    params: { id: 'moving' },
    body: { projectId: 'target' },
    query: undefined,
    request: {
      method: 'POST',
      url: new URL('http://localhost/api/work-packages/moving/move'),
      headers: new Headers({ 'X-WBS-Expected-Organization': 'org' }),
      signal: new AbortController().signal,
    },
  };
}

/** Pure port forwarding only; this fixture supplies no current grant or storage admission evidence. */
function fixture() {
  const calls: unknown[] = [];
  let moved: ProjectMove = MOVED;
  let resolved: OrganizationAccessResolution = SCOPED;
  let wait = () => Promise.resolve();
  const administration: ProjectAdministration = {
    create: () => Promise.reject(new Error('unused create port')),
    rename: () => Promise.reject(new Error('unused rename port')),
    delete: () => Promise.reject(new Error('unused delete port')),
    moveWorkPackage(caller, workPackageId, targetProjectId, act) {
      calls.push({ caller, workPackageId, targetProjectId, act });
      return Promise.resolve(moved);
    },
  };
  const projects = new ProjectResource({
    settings: {
      read: () => Promise.reject(new Error('project settings reader is unused in this fixture')),
      writeBudget: () =>
        Promise.reject(new Error('project settings writer is unused in this fixture')),
    },
    administration,
    read: {
      list: () => Promise.reject(new Error('unused read port')),
      read: () => Promise.reject(new Error('unused read port')),
    },
    clock: clockOf({ now: () => 42, newId: () => 'move-audit' }),
  });
  const organizations: OrganizationAccess = {
    async resolve() {
      await wait();
      return resolved;
    },
  };
  return {
    endpoint: workPackageMoveRoutes(projects, organizations)[0],
    calls,
    moved(value: ProjectMove) {
      moved = value;
    },
    resolved(value: OrganizationAccessResolution) {
      resolved = value;
    },
    waitFor(value: () => Promise<void>) {
      wait = value;
    },
  };
}

it('projects only the explicit committed move fields for moved and same-parent success', async () => {
  const scope = fixture();
  const expected = {
    workPackageId: 'moving',
    projectId: 'target',
    revision: 2,
    sourceProject: { id: 'source', revision: 3 },
    targetProject: { id: 'target', revision: 4 },
  };
  expect(await scope.endpoint.handle(input())).toEqual({ ok: true, status: 200, body: expected });
  scope.moved({ ...MOVED, kind: 'unchanged' });
  expect(await scope.endpoint.handle(input())).toEqual({ ok: true, status: 200, body: expected });
});

it('retains both move identities and complete authentication before the resolver await', async () => {
  const scope = fixture(),
    asked = input(),
    retained = structuredClone(asked.principal),
    release = Promise.withResolvers<undefined>();
  scope.waitFor(() => release.promise);
  const pending = scope.endpoint.handle(asked);
  asked.params.id = 'replaced';
  asked.body.projectId = 'replaced';
  Object.assign(asked.principal, { id: 'replaced', username: 'Replaced' });
  const authentication = asked.principal.authentication;
  if (authentication === undefined) throw new Error('retention fixture lacks authentication');
  Object.assign(authentication, { credentialId: 'replaced' });
  release.resolve(undefined);
  expect((await pending).status).toBe(200);
  expect(scope.calls).toEqual([
    {
      caller: {
        kind: 'human',
        principal: {
          ...retained,
          organizationOperation: {
            kind: 'mutation',
            expected: { kind: 'present', organizationId: 'org' },
          },
        },
        expectedAccess: SCOPED.access,
      },
      workPackageId: 'moving',
      targetProjectId: 'target',
      act: { at: 42, auditId: 'move-audit' },
    },
  ]);
});

it('maps typed visibility dependency and exact permission refusals without an internal storage code', async () => {
  const scope = fixture();
  scope.moved('not_found');
  expect(await scope.endpoint.handle(input())).toEqual({
    ok: false,
    status: 404,
    body: { error: 'not_found' },
  });
  scope.moved({ kind: 'dependency_crosses_project', dependencyIds: ['edge'] });
  expect(await scope.endpoint.handle(input())).toEqual({
    ok: false,
    status: 409,
    body: { error: 'dependency_crosses_project', dependencyIds: ['edge'] },
  });
  for (const permission of ['organization.create_project', 'package.write'] as const) {
    scope.moved({ ok: false, error: 'forbidden', permission });
    expect(await scope.endpoint.handle(input())).toEqual({
      ok: false,
      status: 403,
      body: { error: 'forbidden', permission },
    });
  }
});

it('refuses legacy or changed request context before invoking the required move port', async () => {
  const scope = fixture();
  scope.resolved({ ok: true, access: { kind: 'legacy' } });
  expect(await scope.endpoint.handle(input())).toEqual({
    ok: false,
    status: 403,
    body: { error: 'no_active_organization' },
  });
  scope.resolved({ ok: false, refusal: 'organization_context_changed' });
  expect(await scope.endpoint.handle(input())).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
  expect(scope.calls).toEqual([]);
});
