import { expect, it } from 'bun:test';

import type { GrantRefusal } from '../ports/access-grants';
import { clockOf } from '../ports/clock';
import type { ProjectAdministration, ProjectCaller } from '../ports/project-administration';
import type { ProjectRead, ProjectView } from '../ports/project-read';
import { ProjectResource } from './project.resource';

const PROJECT: ProjectView = {
  spaceId: null,
  spacePosition: null,
  id: 'project',
  organizationId: 'org',
  name: 'Plan',
  revision: 0,
  createdAt: 1,
  updatedAt: null,
  createdBy: 'reader',
  workPackageCount: 0,
};
function caller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'reader',
      username: 'Reader',
      scopes: ['read', 'write'],
      authentication: { kind: 'machine', credentialId: 'credential', personId: 'person' },
      delegation: { organizationId: 'org', audience: 'wbs-be-01/direct' },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'reader' },
      scope: { organizationId: 'org', userId: 'reader', cap: null },
    },
  };
}
function fixture() {
  const calls: unknown[] = [];
  let creation: Awaited<ReturnType<ProjectAdministration['create']>> = {
    kind: 'created',
    project: PROJECT,
  };
  let rename: Awaited<ReturnType<ProjectAdministration['rename']>> = {
    kind: 'renamed',
    project: PROJECT,
  };
  let deletion: Awaited<ReturnType<ProjectAdministration['delete']>> = { kind: 'deleted' };
  let wait = () => Promise.resolve();
  const administration: ProjectAdministration = {
    moveWorkPackage(evidence, workPackageId, targetProjectId, act) {
      calls.push({ operation: 'move', evidence, workPackageId, targetProjectId, act });
      return Promise.resolve({
        kind: 'moved',
        workPackageId,
        projectId: targetProjectId,
        revision: 1,
        sourceProject: { id: 'source', revision: 1 },
        targetProject: { id: targetProjectId, revision: 1 },
      });
    },
    async create(evidence, draft, act, first) {
      await wait();
      calls.push({
        operation: 'create',
        evidence,
        draft,
        act,
        ...(first === undefined ? {} : { first }),
      });
      return creation;
    },
    rename(evidence, id, name, act) {
      calls.push({ operation: 'rename', evidence, id, name, act });
      return Promise.resolve(rename);
    },
    delete(evidence, id, act) {
      calls.push({ operation: 'delete', evidence, id, act });
      return Promise.resolve(deletion);
    },
  };
  const read: ProjectRead = {
    list(evidence) {
      calls.push({ operation: 'list', evidence });
      return Promise.resolve({ ok: true, value: [PROJECT] });
    },
    read(evidence, id) {
      calls.push({ operation: 'read', evidence, id });
      return Promise.resolve({ ok: true, value: { ...PROJECT, workPackages: [] } });
    },
  };
  let tick = 0,
    id = 0;
  const resource = new ProjectResource({
    settings: {
      read: () => Promise.reject(new Error('project settings reader is unused in this fixture')),
      writeBudget: () =>
        Promise.reject(new Error('project settings writer is unused in this fixture')),
    },
    administration,
    read,
    clock: clockOf({
      now() {
        tick++;
        return 42;
      },
      newId() {
        id++;
        return 'id-' + String(id);
      },
    }),
  });
  return {
    resource,
    calls,
    counts: () => ({ tick, id }),
    creation(value: typeof creation) {
      creation = value;
    },
    rename(value: typeof rename) {
      rename = value;
    },
    deletion(value: typeof deletion) {
      deletion = value;
    },
    waitFor(value: () => Promise<void>) {
      wait = value;
    },
  };
}
it('retains move caller and captures one instant and audit identity before delegation', async () => {
  const scope = fixture(),
    evidence = caller(),
    original = structuredClone(evidence);
  const pending = scope.resource.moveWorkPackage(evidence, 'moving', 'target');
  Object.assign(evidence.principal, { id: 'changed', username: 'Changed' });
  expect(await pending).toEqual({
    kind: 'moved',
    workPackageId: 'moving',
    projectId: 'target',
    revision: 1,
    sourceProject: { id: 'source', revision: 1 },
    targetProject: { id: 'target', revision: 1 },
  });
  expect(scope.calls).toEqual([
    {
      operation: 'move',
      evidence: original,
      workPackageId: 'moving',
      targetProjectId: 'target',
      act: { at: 42, auditId: 'id-1' },
    },
  ]);
  expect(scope.counts()).toEqual({ tick: 1, id: 1 });
});

it('mints four distinct create identities and one instant without supplying an actor or organization', async () => {
  const scope = fixture(),
    evidence = caller();
  expect(await scope.resource.create(evidence, 'Name')).toEqual({
    kind: 'created',
    project: PROJECT,
  });
  expect(scope.calls).toEqual([
    {
      operation: 'create',
      evidence,
      draft: { id: 'id-1', name: 'Name' },
      act: { at: 42, grantId: 'id-2', projectAuditId: 'id-3', grantAuditId: 'id-4' },
    },
  ]);
  expect(scope.counts()).toEqual({ tick: 1, id: 4 });
});
it('retains the complete caller before an admitted collaborator awaits', async () => {
  const scope = fixture(),
    evidence = caller(),
    original = structuredClone(evidence),
    release = Promise.withResolvers<undefined>();
  scope.waitFor(() => release.promise);
  const authentication = evidence.principal.authentication;
  const delegation = evidence.principal.delegation;
  if (authentication === undefined || delegation === undefined)
    throw new Error('retention fixture omitted credential evidence');
  const pending = scope.resource.create(evidence, 'Name');
  Object.assign(authentication, { credentialId: 'changed' });
  Object.assign(delegation, { organizationId: 'changed' });
  Object.assign(evidence.expectedAccess.scope, { organizationId: 'changed' });
  release.resolve(undefined);
  await pending;
  expect(scope.calls).toMatchObject([{ evidence: original }]);
  expect(scope.counts()).toEqual({ tick: 1, id: 4 });
});
it('rename and delete each mint only an audit identity and one instant', async () => {
  const scope = fixture(),
    evidence = caller();
  await scope.resource.rename(evidence, 'target', 'New');
  await scope.resource.delete(evidence, 'target');
  expect(scope.calls).toEqual([
    { operation: 'rename', evidence, id: 'target', name: 'New', act: { at: 42, auditId: 'id-1' } },
    { operation: 'delete', evidence, id: 'target', act: { at: 42, auditId: 'id-2' } },
  ]);
  expect(scope.counts()).toEqual({ tick: 2, id: 2 });
});
it('forwards the required reader caller without minting identities', async () => {
  const scope = fixture(),
    evidence = caller();
  expect(await scope.resource.list(evidence)).toEqual({ ok: true, value: [PROJECT] });
  expect(await scope.resource.read(evidence, 'target')).toEqual({
    ok: true,
    value: { ...PROJECT, workPackages: [] },
  });
  expect(scope.calls).toEqual([
    { operation: 'list', evidence },
    { operation: 'read', evidence, id: 'target' },
  ]);
  expect(scope.counts()).toEqual({ tick: 0, id: 0 });
});
it('retains expected public write refusals instead of interpreting them as name conflicts', async () => {
  const scope = fixture();
  scope.creation('name_taken');
  expect(await scope.resource.create(caller(), 'Name')).toBe('name_taken');
  scope.creation({ ok: false, refusal: 'organization_context_changed' });
  expect(await scope.resource.create(caller(), 'Name')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  scope.rename({ ok: false, error: 'forbidden', permission: 'organization.create_project' });
  expect(await scope.resource.rename(caller(), 'p', 'New')).toEqual({
    ok: false,
    error: 'forbidden',
    permission: 'organization.create_project',
  });
  scope.deletion({ kind: 'not_empty', workPackageIds: [] });
  expect(await scope.resource.delete(caller(), 'p')).toEqual({
    kind: 'not_empty',
    workPackageIds: [],
  });
});
for (const refusal of [
  'unknown_role',
  'role_scope_mismatch',
  'not_found',
  'not_a_member',
  'unknown_group',
  'unknown_credential',
  'already_granted',
] satisfies GrantRefusal[]) {
  it('throws context for internal creator-grant refusal ' + refusal, async () => {
    const scope = fixture();
    scope.creation(refusal);
    let failure: unknown;
    try {
      await scope.resource.create(caller(), 'Name');
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof Error && failure.message).toContain(
      'creator grant refused: ' + refusal,
    );
  });
}

it('mints nine distinct combined identities and consumes only one instant', async () => {
  const scope = fixture();
  await scope.resource.create(caller(), 'Plan', { name: 'First' });
  expect(scope.counts()).toEqual({ tick: 1, id: 9 });
});

it('retains complete first birth names steps identities and actual caller while the required owner waits', async () => {
  const scope = fixture(),
    evidence = caller(),
    child = { name: 'First' },
    release = Promise.withResolvers<undefined>();
  scope.waitFor(() => release.promise);
  const pending = scope.resource.create(evidence, 'Plan', child);
  child.name = 'Changed';
  evidence.principal.id = 'Changed';
  release.resolve(undefined);
  await pending;
  expect(scope.calls).toMatchObject([
    {
      evidence: { principal: { id: 'reader' } },
      draft: { id: 'id-1', name: 'Plan' },
      act: { at: 42 },
      first: {
        workPackage: { id: 'id-5', projectId: 'id-1', name: 'First', createdAt: 42 },
        steps: [
          { id: 'id-6', workPackageId: 'id-5', name: 'Dev' },
          { id: 'id-7', workPackageId: 'id-5', name: 'QA' },
        ],
        creatorGrant: { id: 'id-8', auditId: 'id-9' },
      },
    },
  ]);
  expect(scope.counts()).toEqual({ tick: 1, id: 9 });
});

it('retains complete caller evidence and forwards full shells and the precise detail refusal without minting an act', async () => {
  const calls: unknown[] = [];
  const unused = () => {
    throw new Error('Read must not invoke a writer or clock');
  };
  const resource = new ProjectResource({
    settings: {
      read: () => Promise.reject(new Error('project settings reader is unused in this fixture')),
      writeBudget: () =>
        Promise.reject(new Error('project settings writer is unused in this fixture')),
    },
    administration: { create: unused, rename: unused, delete: unused, moveWorkPackage: unused },
    clock: clockOf({ now: unused, newId: unused }),
    read: {
      async list(evidence) {
        await Promise.resolve();
        calls.push(evidence);
        return { ok: true, value: [{ id: 'shell', name: 'Shell' }, PROJECT] };
      },
      async read(evidence, id) {
        await Promise.resolve();
        calls.push({ evidence, id });
        return { ok: false, error: 'forbidden', permission: 'project.read' };
      },
    },
  });
  const evidence = caller(),
    original = structuredClone(evidence);
  const list = resource.list(evidence),
    detail = resource.read(evidence, 'shell');
  evidence.principal.id = 'mutated';
  expect(await list).toEqual({ ok: true, value: [{ id: 'shell', name: 'Shell' }, PROJECT] });
  expect(await detail).toEqual({ ok: false, error: 'forbidden', permission: 'project.read' });
  expect(calls).toEqual([original, { evidence: original, id: 'shell' }]);
});
