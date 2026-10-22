import type { StoredTypedDependency } from '@wbs/core';
import type { TypedDependencyStore, WritingServices } from '@wbs/core';
import { clockOf, grantAdmission } from '@wbs/core';
import { commandTransaction } from '@wbs/core/module/plan-commands/composition';
import { PlanCommandRunner } from '@wbs/core/module/plan-commands/plan-commands.feature';
import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import {
  type CollectedRecording,
  WorkItemService,
} from '@wbs/core/module/work-item/work-item.resource';
import { AnnouncementCollector } from '@wbs/core/ports/announcement-collector';
import type { DependencyContext } from '@wbs/core/ports/dependency-context';
import type { CompensatingCommand } from '@wbs/core/service/compensating';
import { createDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { openDrizzle } from '@wbs/store-sqlite/db';
import { beginOptimizationDrain } from '@wbs/store-sqlite/optimization-drain';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function open(pushUrls?: string[]) {
  harness = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    ...(pushUrls === undefined
      ? {}
      : {
          pushFetch: (url) => {
            pushUrls.push(url);
            return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
          },
        }),
  });
  // Synthetic stored authority supports this suite's admitted semantic fixture; mounted production admission stays dormant.
  seedDependencyAuthority(harness.databasePath());
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'super_admin');
  harness.activate();
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('ada')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-a' }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('fixture binding cookie missing');
  const request = (path: string, body?: unknown, method = 'POST') =>
    harness.request(path, {
      method,
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${harness.token('ada')}`,
        cookie,
        'X-WBS-Expected-Organization': 'org-a',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  for (const name of ['Predecessor', 'Owner']) {
    expect((await request('/api/projects', { name })).status).toBe(200);
    const project = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (project === null) throw new Error('fixture project missing');
    expect(
      (
        await request(`/api/projects/${project.id}/commands`, {
          commands: [{ kind: 'createWorkItem', name: `${name} row` }],
        })
      ).status,
    ).toBe(200);
  }
  const project = (name: string) => {
    const found = harness.sqlite
      .query<{ projectId: string; workItemId: string }, [string]>(
        'SELECT project.id AS projectId, work_item.id AS workItemId FROM project JOIN work_item ON work_item.project_id=project.id WHERE project.name=?',
      )
      .get(name);
    if (found === null) throw new Error('fixture endpoint missing');
    return found;
  };
  const predecessor = project('Predecessor');
  const owner = project('Owner');
  const principal = await harness.authenticatedCommandPrincipal(
    'ada',
    decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)),
  );
  const expectedAccess = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' as const },
  };
  const input = {
    predecessor: { ...predecessor, scope: 'whole' as const },
    successor: { ...owner, scope: 'whole' as const },
    type: 'FS' as const,
  };
  return { predecessor, owner, principal, expectedAccess, request, input };
}

async function foreignEndpoint() {
  await harness.register('grace');
  harness.organization('org-b');
  harness.member('org-b', 'grace', 'super_admin');
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('grace')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-b' }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('fixture foreign cookie missing');
  const request = (path: string, body: unknown) =>
    harness.request(path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${harness.token('grace')}`,
        cookie,
        'X-WBS-Expected-Organization': 'org-b',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  expect((await request('/api/projects', { name: 'Foreign' })).status).toBe(200);
  const project = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM project WHERE name='Foreign'")
    .get();
  if (project === null) throw new Error('fixture foreign project missing');
  expect(
    (
      await request(`/api/projects/${project.id}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Concealed foreign row' }],
      })
    ).status,
  ).toBe(200);
  const row = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
    .get(project.id);
  if (row === null) throw new Error('fixture foreign row missing');
  return { projectId: project.id, workItemId: row.id };
}

function effects() {
  return harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: harness.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}

test('mounted external authoring stays dormant and rolls back an earlier successful command', async () => {
  const fixture = await open();
  const before = effects();
  const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: fixture.owner.workItemId,
        patch: { name: 'Must roll back' },
      },
      { kind: 'addTypedDependency', ...fixture.input },
    ],
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: 'external_dependencies_inactive',
    at: 1,
    kind: 'addTypedDependency',
  });
  expect(effects()).toEqual(before);
  const alone = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [{ kind: 'addTypedDependency', ...fixture.input }],
  });
  expect(alone.status).toBe(409);
  expect(await alone.json()).toEqual({
    error: 'external_dependencies_inactive',
    at: 0,
    kind: 'addTypedDependency',
  });
  expect(effects()).toEqual(before);
});

async function semantic<T extends { readonly ok: boolean }>(
  fixture: Awaited<ReturnType<typeof open>>,
  act: (
    service: WorkItemService,
    graph: WritingServices,
    typedDependencies: TypedDependencyStore,
  ) => Promise<T>,
  inspectCollected?: (recordings: CollectedRecording[]) => void,
  refusedProjectRead?: string,
  failedGraphRead?: 'findCycle' | 'findStepReferences' | 'proposedCycle',
  omitRecordedRevision = false,
  corruptStoredScope = false,
  restoredEndpointRefusal?: 'forbidden' | 'unknown_step',
  endpointDelivery?: 'foreign-project' | 'wrong-identity',
  stepDelivery?: 'step-identity' | 'step-project',
  forbiddenSuccessor?: string,
): Promise<T> {
  const boundary = harness.publicWrites();
  const broadcast = recordingBroadcaster();
  const held = new AnnouncementCollector(broadcast);
  return boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok || resolved.access.kind !== 'scoped')
      throw new Error('fixture current authority refused');
    const admitted = await scope.stores.projects.admitEditInOrganization(
      fixture.owner.projectId,
      'org-a',
      fixture.principal.id,
      { commands: ['addTypedDependency'] },
      resolved.access.scope.role,
    );
    if (admitted === null || admitted === 'forbidden')
      throw new Error('fixture owner admission refused');
    const granted = grantAdmission(fixture.owner.projectId, fixture.principal.id);
    const projects =
      refusedProjectRead === undefined
        ? scope.stores.projects
        : new Proxy(scope.stores.projects, {
            get(target, key) {
              if (key === 'findInOrganization')
                return (projectId: string, organizationId: string) =>
                  projectId === refusedProjectRead
                    ? Promise.resolve(null)
                    : target.findInOrganization(projectId, organizationId);
              const member: unknown = Reflect.get(target, key);
              if (typeof member === 'function')
                return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
              return member;
            },
          });
    const endpointProjects =
      stepDelivery === undefined
        ? projects
        : new Proxy(projects, {
            get(target, key) {
              if (key === 'stepsOf')
                return async (projectId: string) =>
                  (await target.stepsOf(projectId)).map((step) =>
                    projectId !== fixture.predecessor.projectId
                      ? step
                      : stepDelivery === 'step-identity'
                        ? { ...step, id: 'wrong-step-identity' }
                        : { ...step, projectId: fixture.owner.projectId },
                  );
              const member: unknown = Reflect.get(target, key);
              return typeof member === 'function'
                ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                : member;
            },
          });
    const workItems =
      endpointDelivery === undefined
        ? scope.stores.workItems
        : new Proxy(scope.stores.workItems, {
            get(target, key) {
              if (key === 'findById')
                return async (workItemId: string) => {
                  const row = await target.findById(workItemId);
                  if (row === null || workItemId !== fixture.predecessor.workItemId) return row;
                  return endpointDelivery === 'foreign-project'
                    ? { ...row, projectId: fixture.owner.projectId }
                    : { ...row, id: 'wrong-delivered-identity' };
                };
              const member: unknown = Reflect.get(target, key);
              if (typeof member === 'function')
                return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
              return member;
            },
          });
    const plan = createWorkingPlan(scope, fixture.owner.projectId);
    const dependencies = createDependencyContext(
      { ...scope.stores, projects: endpointProjects, workItems },
      {
        projectId: fixture.owner.projectId,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: granted.admission,
      },
      () => undefined,
      { kind: 'owner', refresh: plan.refreshRows },
    );
    // Negative-only dependency fault: finish the genuine connected SQLite read,
    // then reject its delivery. No permissive graph is installed for positives.
    const graphContext =
      failedGraphRead === undefined
        ? dependencies.context
        : {
            ...dependencies.context,
            graph: new Proxy(dependencies.context.graph, {
              get(target, key) {
                const member: unknown = Reflect.get(target, key);
                if (
                  key === (failedGraphRead === 'proposedCycle' ? 'findCycle' : failedGraphRead) &&
                  typeof member === 'function'
                )
                  return async (...args: unknown[]) => {
                    const read: unknown = Reflect.apply(member, target, args);
                    const value = await read;
                    const change = args[1];
                    if (
                      failedGraphRead === 'proposedCycle' &&
                      (typeof change !== 'object' || change === null || !('rows' in change))
                    )
                      return value;
                    throw new Error(`injected connected ${failedGraphRead} read failure`);
                  };
                if (typeof member === 'function')
                  return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
                return member;
              },
            }),
          };
    const guardedContext =
      forbiddenSuccessor === undefined
        ? graphContext
        : {
            ...graphContext,
            endpoints: {
              ...graphContext.endpoints,
              readEndpoint: (
                endpoint: Parameters<DependencyContext['endpoints']['readEndpoint']>[0],
              ) => {
                if (
                  endpoint.projectId === forbiddenSuccessor &&
                  endpoint.workItemId !== fixture.predecessor.workItemId
                )
                  throw new Error('second successor owner facts were read');
                return graphContext.endpoints.readEndpoint(endpoint);
              },
            },
          };
    let revisionReads = 0;
    const revisionContext: DependencyContext = !omitRecordedRevision
      ? guardedContext
      : {
          ...graphContext,
          endpoints: {
            ...graphContext.endpoints,
            readRevisions: async (addresses) => {
              const read = await graphContext.endpoints.readRevisions(addresses);
              revisionReads++;
              // Negative-only fault after the write: omit the genuine remote
              // revision when recordCollected reads its final expected set.
              return read.ok && revisionReads > 2
                ? { ok: true, revisions: read.revisions.slice(1) }
                : read;
            },
          },
        };
    const dependencyContext: DependencyContext =
      restoredEndpointRefusal === undefined
        ? revisionContext
        : {
            ...revisionContext,
            endpoints: {
              ...revisionContext.endpoints,
              readEndpoint: async (endpoint) => {
                const read = await revisionContext.endpoints.readEndpoint(endpoint);
                // Negative-only delivery fault: retain the real absent-row read and
                // all other evidence, but demand propagation of this exact refusal.
                return endpoint.projectId === fixture.owner.projectId &&
                  !read.ok &&
                  read.reason === 'not_found'
                  ? { ok: false, reason: restoredEndpointRefusal }
                  : read;
              },
            },
          };
    try {
      expect(
        (await plan.stores.workItems.listByProject(fixture.owner.projectId)).length,
      ).toBeGreaterThan(0);
      const graph = boundary.batch(
        { stores: plan.stores },
        held,
        granted.admission,
        dependencyContext,
      );
      const authoredStores = !corruptStoredScope
        ? plan.stores
        : {
            ...plan.stores,
            typedDependencies: new Proxy(plan.stores.typedDependencies, {
              get(target, key) {
                if (key === 'listByProject')
                  return async (projectId: string) =>
                    (await target.listByProject(projectId)).map((relationship) => ({
                      ...relationship,
                      predecessor: { ...relationship.predecessor, projectId },
                    }));
                const member: unknown = Reflect.get(target, key);
                if (typeof member === 'function')
                  return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
                return member;
              },
            }),
          };
      const service = new WorkItemService({
        ...authoredStores,
        ...(stepDelivery === undefined
          ? {}
          : {
              typedDependencies: new Proxy(authoredStores.typedDependencies, {
                get(target, key) {
                  if (key === 'add' || key === 'update')
                    return () => {
                      throw new Error('misdelivered step reached storage');
                    };
                  const member: unknown = Reflect.get(target, key);
                  return typeof member === 'function'
                    ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                    : member;
                },
              }),
            }),
        clock: clockOf({ now: () => Date.now(), newId: () => crypto.randomUUID() }),
        scheduler: fastScheduler,
        admission: granted.admission,
        dependencyContext: { kind: 'bound', context: dependencyContext },
        externalDependencyAuthoring: { state: 'active' },
        broadcast: held,
      });
      const collected = await service.collect(() =>
        act(service, graph, scope.stores.typedDependencies),
      );
      inspectCollected?.(collected.recordings);
      if (collected.result.ok)
        await service.recordCollected(
          fixture.owner.projectId,
          fixture.principal.id,
          collected.recordings,
        );
      expect(broadcast.published).toEqual([]);
      return { commit: collected.result.ok, value: collected.result };
    } finally {
      plan.close();
      dependencies.close();
      granted.expire();
    }
  });
}

async function observed<T>(operation: Promise<T>): Promise<T | Error> {
  return operation.then(
    (value) => value,
    (cause: unknown) => {
      if (cause instanceof Error) return cause;
      throw cause;
    },
  );
}

test('an explicitly admitted semantic SQLite graph records external revisions through the real writer and journal', async () => {
  const fixture = await open();
  const added = await observed(
    semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    ),
  );
  expect(added).toMatchObject({ ok: true });
  if (added instanceof Error) throw added;
  if (!added.ok) throw new Error('semantic typed add refused');
  const dependencyId = added.value;
  const relationship = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM external_dependency WHERE id=?')
    .get(dependencyId);
  expect(relationship?.id).toBe(dependencyId);
  const journal = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (journal === null) throw new Error('semantic journal missing');
  const preconditions: unknown = JSON.parse(journal.preconditions);
  expect(preconditions).toMatchObject({
    externalRevisions: {
      from: [{ ...fixture.predecessor, revision: 0 }],
      expected: [{ ...fixture.predecessor, revision: 1 }],
    },
  });
});

test('admitted external evidence reads a restricted predecessor without granting predecessor edit authority', async () => {
  const fixture = await open();
  await harness.register('grace');
  harness.member('org-a', 'grace', 'member');
  harness.sqlite
    .query('UPDATE organization_membership SET role=? WHERE organization_id=? AND user_id=?')
    .run('member', 'org-a', fixture.principal.id);
  harness.sqlite
    .query('UPDATE project SET owner_id=?,restricted=1 WHERE id=?')
    .run(harness.userId('grace'), fixture.predecessor.projectId);
  const refused = await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: fixture.predecessor.workItemId,
        patch: { name: 'Forbidden predecessor edit' },
      },
    ],
  });
  expect(refused.status).toBe(403);
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    ),
  ).toMatchObject({ ok: true });
  expect(
    harness.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM work_item WHERE id=?')
      .get(fixture.predecessor.workItemId)?.name,
  ).toBe('Predecessor row');
});

test('real SQLite external undo redo checks remote revisions and flips exact metadata', async () => {
  const fixture = await open();
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('semantic typed add refused');
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(harness.sqlite.query('SELECT * FROM external_dependency').all()).toEqual([]);
  expect(
    await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(
    harness.sqlite.query<{ id: string }, []>('SELECT id FROM external_dependency').get()?.id,
  ).toBe(added.value);
  harness.sqlite
    .query('UPDATE work_item SET name=?, revision=revision+1 WHERE id=?')
    .run('Rival edit', fixture.predecessor.workItemId);
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: false, reason: 'stale_undo' });
  expect(effects()).toEqual(before);
});

for (const defect of [
  'scoped-alias',
  'malformed-project',
  'blank-project',
  'foreign-project',
  'foreign-organization',
  'wrong-row-project',
  'absent-row',
  'foreign-successor',
  'foreign-step',
  'owner-step',
] as const)
  test(`mounted ${defect} refuses before writes and conceals endpoint facts`, async () => {
    const fixture = await open();
    const steps = harness.sqlite
      .query<{ id: string; projectId: string }, []>(
        'SELECT id, project_id AS projectId FROM step ORDER BY position',
      )
      .all();
    const remoteStep = steps.find((step) => step.projectId === fixture.predecessor.projectId);
    if (remoteStep === undefined) throw new Error('fixture remote step missing');
    const foreign = defect === 'foreign-organization' ? await foreignEndpoint() : null;
    const malformed = ['scoped-alias', 'malformed-project', 'blank-project'].includes(defect);
    const endpoint =
      foreign === null
        ? defect === 'absent-row'
          ? { ...fixture.input.predecessor, workItemId: 'absent-row' }
          : defect === 'malformed-project'
            ? { ...fixture.input.predecessor, projectId: 7 }
            : defect === 'blank-project'
              ? { ...fixture.input.predecessor, projectId: '' }
              : defect === 'wrong-row-project'
                ? { ...fixture.input.predecessor, projectId: fixture.owner.projectId }
                : defect === 'scoped-alias'
                  ? { projectId: fixture.predecessor.projectId, scope: 'whole', workItemRef: 'new' }
                  : defect === 'foreign-project'
                    ? { ...fixture.input.predecessor, projectId: 'absent' }
                    : defect === 'foreign-step'
                      ? { ...fixture.input.predecessor, scope: 'node', stepId: 'absent' }
                      : fixture.input.predecessor
        : { ...foreign, scope: 'whole' };
    const successor =
      defect === 'owner-step'
        ? { ...fixture.input.successor, scope: 'node', stepId: remoteStep.id }
        : defect === 'foreign-successor'
          ? { ...fixture.input.successor, projectId: fixture.predecessor.projectId }
          : fixture.input.successor;
    const before = effects();
    const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.owner.workItemId,
          patch: { name: 'Must roll back' },
        },
        { kind: 'addTypedDependency', predecessor: endpoint, successor, type: 'FS' },
      ],
    });
    expect(response.status).toBe(malformed ? 400 : 404);
    expect(await response.json()).toMatchObject({
      error: malformed ? 'invalid_typed_endpoint' : 'not_found',
      at: 1,
      kind: 'addTypedDependency',
    });
    expect(effects()).toEqual(before);
  });

test('real SQLite connected guard accepts step interleaving and refuses the reverse node cycle', async () => {
  const fixture = await open();
  const steps = harness.sqlite
    .query<{ id: string; projectId: string; name: string }, []>(
      'SELECT id, project_id AS projectId, name FROM step ORDER BY position',
    )
    .all();
  const step = (projectId: string, name: string) => {
    const found = steps.find(
      (candidate) => candidate.projectId === projectId && candidate.name === name,
    );
    if (found === undefined) throw new Error('fixture workflow step missing');
    return found.id;
  };
  const a = { ...fixture.predecessor, scope: 'node' as const };
  const b = { ...fixture.owner, scope: 'node' as const };
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(b.projectId, fixture.principal.id, {
        predecessor: { ...a, stepId: step(a.projectId, 'Dev') },
        successor: { ...b, stepId: step(b.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  const reverse = { ...fixture, owner: fixture.predecessor };
  const added = await semantic(reverse, (service) =>
    service.addTypedDependency(a.projectId, fixture.principal.id, {
      predecessor: { ...b, stepId: step(b.projectId, 'QA') },
      successor: { ...a, stepId: step(a.projectId, 'QA') },
      type: 'FS',
    }),
  );
  expect(added).toMatchObject({ ok: true });
  if (!added.ok) throw new Error('interleaved dependency refused');
  const before = effects();
  expect(
    await semantic(reverse, (service) =>
      service.updateTypedDependency(a.projectId, fixture.principal.id, added.value, {
        predecessor: { ...b, stepId: step(b.projectId, 'Dev') },
        successor: { ...a, stepId: step(a.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: false, reason: 'cycle' });
  expect(effects()).toEqual(before);
});

test('real SQLite history refuses missing external revision metadata without partial effects', async () => {
  const fixture = await open();
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    ),
  ).toMatchObject({ ok: true });
  harness.sqlite
    .query(
      "UPDATE command_journal SET preconditions=json_remove(preconditions, '$.externalRevisions') WHERE kind='add_typed_dependency'",
    )
    .run();
  const before = effects();
  const failure: unknown = await semantic(fixture, (service) =>
    service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
  ).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : failure).toContain(
    'external revision coverage is missing',
  );
  expect(effects()).toEqual(before);
});

for (const defect of [
  'missing-from',
  'non-list',
  'invalid-revision',
  'duplicate',
  'extra',
  'omitted',
] as const)
  test(`real SQLite replay refuses ${defect} trusted external metadata without partial effects`, async () => {
    const fixture = await open();
    expect(
      await semantic(fixture, (service) =>
        service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
      ),
    ).toMatchObject({ ok: true });
    const revision = { ...fixture.predecessor, revision: 1 };
    const externalRevisions =
      defect === 'missing-from'
        ? { expected: [revision] }
        : defect === 'non-list'
          ? { expected: null, from: [revision] }
          : defect === 'invalid-revision'
            ? { expected: [{ ...revision, revision: -1 }], from: [revision] }
            : defect === 'duplicate'
              ? { expected: [revision, revision], from: [revision] }
              : defect === 'extra'
                ? { expected: [revision, { ...fixture.owner, revision: 1 }], from: [revision] }
                : { expected: [], from: [revision] };
    harness.sqlite
      .query(
        "UPDATE command_journal SET preconditions=json_set(preconditions,'$.externalRevisions',json(?)) WHERE project_id=?",
      )
      .run(JSON.stringify(externalRevisions), fixture.owner.projectId);
    const before = effects();
    const failure = await observed(
      semantic(fixture, (service) =>
        service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      ),
    );
    expect(failure).toBeInstanceOf(Error);
    const message =
      defect === 'missing-from'
        ? 'journal external revisions are malformed'
        : defect === 'non-list'
          ? 'journal external revisions are not a list'
          : defect === 'invalid-revision'
            ? 'journal external revision is malformed'
            : defect === 'duplicate'
              ? 'journal external revisions contain a duplicate'
              : 'journal external revision coverage is not exact';
    expect(failure instanceof Error ? failure.message : failure).toBe(message);
    expect(effects()).toEqual(before);
  });

test('structural first-child creation hands a remote-owned pinned node to its first child', async () => {
  const fixture = await open();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.predecessor.projectId);
  if (step === null) throw new Error('fixture step missing');
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        ...fixture.input,
        predecessor: { ...fixture.input.predecessor, scope: 'node', stepId: step.id },
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await observed(
      semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
        service.create(fixture.predecessor.projectId, fixture.principal.id, {
          parentId: fixture.predecessor.workItemId,
          afterId: null,
          name: 'Would make a pinned node a parent',
        }),
      ),
    ),
  ).toMatchObject({ ok: true });
  const child = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE parent_id=?')
    .get(fixture.predecessor.workItemId);
  if (child === null) throw new Error('fixture child missing');
  expect(
    harness.sqlite.query('SELECT predecessor_work_item_id FROM external_dependency').get(),
  ).toEqual({ predecessor_work_item_id: child.id });
});

test('mounted first-child creation publishes a remote-owned pinned node on the new child', async () => {
  const fixture = await open();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.predecessor.projectId);
  if (step === null) throw new Error('fixture step missing');
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        ...fixture.input,
        predecessor: { ...fixture.input.predecessor, scope: 'node', stepId: step.id },
      }),
    ),
  ).toMatchObject({ ok: true });

  const response = await fixture.request(
    `/api/projects/${fixture.predecessor.projectId}/commands`,
    {
      commands: [
        {
          kind: 'createWorkItem',
          parentId: fixture.predecessor.workItemId,
          afterId: null,
          name: 'Mounted incident child',
        },
      ],
    },
  );
  expect(response.status).toBe(200);
  const child = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE parent_id=?')
    .get(fixture.predecessor.workItemId);
  if (child === null) throw new Error('mounted child missing');
  expect(
    harness.sqlite.query('SELECT predecessor_work_item_id FROM external_dependency').get(),
  ).toEqual({ predecessor_work_item_id: child.id });
});

test('external predecessor deletion returns a modeled conflict without changing any table', async () => {
  const fixture = await open();
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture link refused');
  const before = effects();
  const refusal = await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
    service.remove(
      fixture.predecessor.workItemId,
      fixture.principal.id,
      'cascade',
      fixture.expectedAccess,
    ),
  );
  expect(refusal).toMatchObject({
    ok: false,
    reason: 'referenced_by_external_dependency',
    dependencyIds: [added.value],
  });
  expect(effects()).toEqual(before);
  const mounted = await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: fixture.predecessor.workItemId,
        patch: { name: 'Roll back this rename' },
      },
      { kind: 'deleteWorkItem', workItemId: fixture.predecessor.workItemId, strategy: 'cascade' },
    ],
  });
  expect(mounted.status).toBe(409);
  expect(await mounted.json()).toMatchObject({
    error: 'referenced_by_external_dependency',
    dependencyIds: [added.value],
    at: 1,
  });
  expect(effects()).toEqual(before);
});

test('undo-create refuses a newly linked outgoing predecessor even when its local revision matches', async () => {
  const fixture = await open();
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture link refused');
  // Force the local revision back to the create entry's expected value so the
  // incident policy itself, rather than the ordinary revision guard, is tested.
  harness.sqlite
    .query('UPDATE work_item SET revision=0 WHERE id=?')
    .run(fixture.predecessor.workItemId);
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  const before = effects();
  expect(
    await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
      service.undoWithin(
        fixture.predecessor.projectId,
        fixture.principal.id,
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'stale_undo' });
  expect(effects()).toEqual(before);
});

test('undo-create refuses a newly linked incoming successor even when its local revision matches', async () => {
  const fixture = await open();
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture link refused');
  // Select the older create entry while keeping the real link: its later
  // ordinary successor-owned journal entry would otherwise be undone first.
  harness.sqlite
    .query("DELETE FROM command_journal WHERE project_id=? AND kind='add_typed_dependency'")
    .run(fixture.owner.projectId);
  harness.sqlite.query('UPDATE work_item SET revision=0 WHERE id=?').run(fixture.owner.workItemId);
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: false, reason: 'stale_undo' });
  expect(effects()).toEqual(before);
});

for (const strategy of ['cascade', 'promote'] as const) {
  test(`external predecessor ${strategy} deletion refuses before mutation`, async () => {
    const fixture = await open();
    expect(
      (
        await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
          commands: [
            { kind: 'createWorkItem', parentId: fixture.predecessor.workItemId, name: 'Child' },
          ],
        })
      ).status,
    ).toBe(200);
    const added = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!added.ok) throw new Error('fixture link refused');
    const before = effects();
    expect(
      await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
        service.remove(
          fixture.predecessor.workItemId,
          fixture.principal.id,
          strategy,
          fixture.expectedAccess,
        ),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'referenced_by_external_dependency',
      dependencyIds: [added.value],
    });
    expect(effects()).toEqual(before);
  });
}

test('external successor deletion removes its owned incoming link and undo restores its identity', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Retained owner row' }],
      })
    ).status,
  ).toBe(200);
  const retained = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Retained owner row'")
    .get();
  if (retained === null) throw new Error('retained row missing');
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture link refused');
  const dependencyId = added.value;
  const unrelated = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      ...fixture.input,
      successor: { ...fixture.input.successor, workItemId: retained.id },
    }),
  );
  if (!unrelated.ok) throw new Error('unrelated fixture link refused');
  const local = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      ...fixture.input,
      predecessor: { projectId: fixture.owner.projectId, workItemId: retained.id, scope: 'whole' },
    }),
  );
  if (!local.ok) throw new Error('local fixture link refused');
  const removed = await semantic(fixture, (service) =>
    service.remove(
      fixture.owner.workItemId,
      fixture.principal.id,
      'cascade',
      fixture.expectedAccess,
    ),
  );
  expect(removed).toMatchObject({ ok: true });
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(dependencyId),
  ).toBeNull();
  expect(
    harness.sqlite.query('SELECT id FROM typed_dependency WHERE id=?').get(local.value),
  ).toBeNull();
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(unrelated.value),
  ).toEqual({ id: unrelated.value });
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  const undone = await semantic(fixture, (service) =>
    service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
  );
  expect(undone).toMatchObject({ ok: true });
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(dependencyId),
  ).toEqual({ id: dependencyId });
  expect(
    harness.sqlite.query('SELECT id FROM typed_dependency WHERE id=?').get(local.value),
  ).toEqual({ id: local.value });
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(unrelated.value),
  ).toEqual({ id: unrelated.value });
  const redone = await semantic(fixture, (service) =>
    service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
  );
  expect(redone).toMatchObject({ ok: true });
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(dependencyId),
  ).toBeNull();
  expect(
    harness.sqlite.query('SELECT id FROM typed_dependency WHERE id=?').get(local.value),
  ).toBeNull();
  expect(
    harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(unrelated.value),
  ).toEqual({ id: unrelated.value });
});

test('external successor deletion undo refuses a concurrent predecessor revision', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Retained owner row' }],
      })
    ).status,
  ).toBe(200);
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture link refused');
  expect(
    await semantic(fixture, (service) =>
      service.remove(
        fixture.owner.workItemId,
        fixture.principal.id,
        'cascade',
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: true });
  harness.sqlite
    .query('UPDATE work_item SET revision=revision+1 WHERE id=?')
    .run(fixture.predecessor.workItemId);
  harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: false, reason: 'stale_undo' });
  expect(effects()).toEqual(before);
});

for (const strategy of ['cascade', 'promote'] as const) {
  test(`external successor ${strategy} deletion removes its owned incoming link`, async () => {
    const fixture = await open();
    expect(
      (
        await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
          commands: [{ kind: 'createWorkItem', parentId: fixture.owner.workItemId, name: 'Child' }],
        })
      ).status,
    ).toBe(200);
    const added = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!added.ok) throw new Error('fixture link refused');
    expect(
      await semantic(fixture, (service) =>
        service.remove(
          fixture.owner.workItemId,
          fixture.principal.id,
          strategy,
          fixture.expectedAccess,
        ),
      ),
    ).toMatchObject({ ok: true });
    expect(
      harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(added.value),
    ).toBeNull();
    expect(harness.sqlite.query("SELECT id FROM work_item WHERE name='Child'").get() === null).toBe(
      strategy === 'cascade',
    );
  });
}

test('a connected move refuses making a remote-owned pinned node a parent', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Mover' }],
      })
    ).status,
  ).toBe(200);
  const mover = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Mover'")
    .get();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.predecessor.projectId);
  if (mover === null || step === null) throw new Error('fixture move facts missing');
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        ...fixture.input,
        predecessor: { ...fixture.input.predecessor, scope: 'node', stepId: step.id },
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  expect(
    await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
      service.move(
        mover.id,
        fixture.principal.id,
        { parentId: fixture.predecessor.workItemId, afterId: null },
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'node_on_parent' });
  expect(effects()).toEqual(before);
});

test('last-child deletion refuses making a remote-owned descendant-step endpoint a leaf', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
        commands: [
          { kind: 'createWorkItem', name: 'Only child', parentId: fixture.predecessor.workItemId },
        ],
      })
    ).status,
  ).toBe(200);
  const child = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Only child'")
    .get();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.predecessor.projectId);
  if (child === null || step === null) throw new Error('fixture descendant facts missing');
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        ...fixture.input,
        predecessor: { ...fixture.input.predecessor, scope: 'descendant-step', stepId: step.id },
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  expect(
    await observed(
      semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
        service.remove(child.id, fixture.principal.id, 'cascade', fixture.expectedAccess),
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'descendant_step_on_leaf' });
  expect(effects()).toEqual(before);
});

test('external removal and both replay directions preserve the same stable relationship identity', async () => {
  const fixture = await open();
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!added.ok) throw new Error('fixture external add refused');
  expect(
    await semantic(fixture, (service) =>
      service.removeTypedDependency(fixture.owner.projectId, fixture.principal.id, added.value),
    ),
  ).toMatchObject({ ok: true });
  expect(harness.sqlite.query('SELECT id FROM external_dependency').all()).toEqual([]);
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(
    harness.sqlite.query<{ id: string }, []>('SELECT id FROM external_dependency').get()?.id,
  ).toBe(added.value);
  expect(
    await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(harness.sqlite.query('SELECT id FROM external_dependency').all()).toEqual([]);
});

for (const operation of [
  'create',
  'move',
  'duplicate',
  'cascade',
  'promote',
  'set-estimate',
  'clear-estimate',
  'add-legacy',
  'remove-legacy',
  'project-reach',
  'step-add',
  'step-remove',
  'step-references',
  'typed-add',
  'typed-update',
  'typed-remove',
  'replay-move',
  'replay-delete',
  'replay-restore',
] as const)
  test(`connected ${operation} refuses an injected failed graph read without partial effects`, async () => {
    const fixture = await open();
    expect(
      (
        await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
          commands: [
            { kind: 'createWorkItem', name: 'Local parent', ref: 'parent' },
            { kind: 'createWorkItem', name: 'Local child', parentRef: 'parent' },
          ],
        })
      ).status,
    ).toBe(200);
    const parent = harness.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM work_item WHERE project_id=? AND name='Local parent'",
      )
      .get(fixture.owner.projectId);
    const child = harness.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM work_item WHERE project_id=? AND name='Local child'",
      )
      .get(fixture.owner.projectId);
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(fixture.owner.projectId);
    if (parent === null || child === null || step === null)
      throw new Error('fixture connected consumer facts missing');
    expect(
      await semantic(fixture, (service) =>
        service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
      ),
    ).toMatchObject({ ok: true });
    const relationship = harness.sqlite
      .query<{ id: string }, []>('SELECT id FROM external_dependency')
      .get();
    if (relationship === null) throw new Error('fixture external relationship missing');
    if (operation === 'replay-move')
      expect(
        await semantic(fixture, (service) =>
          service.move(
            child.id,
            fixture.principal.id,
            { parentId: null, afterId: null },
            fixture.expectedAccess,
          ),
        ),
      ).toMatchObject({ ok: true });
    if (operation === 'replay-delete')
      expect(
        await semantic(fixture, (service) =>
          service.create(fixture.owner.projectId, fixture.principal.id, {
            parentId: null,
            afterId: null,
            name: 'Replay-created leaf',
          }),
        ),
      ).toMatchObject({ ok: true });
    if (operation === 'replay-restore')
      expect(
        await semantic(fixture, (service) =>
          service.remove(parent.id, fixture.principal.id, 'cascade', fixture.expectedAccess),
        ),
      ).toMatchObject({ ok: true });
    const before = effects();
    const failedGraphRead =
      operation === 'step-references'
        ? 'findStepReferences'
        : operation.startsWith('replay-')
          ? 'proposedCycle'
          : 'findCycle';
    const failure = await observed(
      semantic<{ readonly ok: boolean }>(
        fixture,
        async (service, graph) => {
          const actor = fixture.principal.id;
          switch (operation) {
            case 'create':
              return service.create(fixture.owner.projectId, actor, {
                parentId: null,
                afterId: null,
                name: 'Never written',
              });
            case 'move':
              return service.move(
                child.id,
                actor,
                { parentId: null, afterId: null },
                fixture.expectedAccess,
              );
            case 'duplicate':
              return service.duplicate(parent.id, actor);
            case 'cascade':
              return service.remove(parent.id, actor, 'cascade', fixture.expectedAccess);
            case 'promote':
              return service.remove(parent.id, actor, 'promote', fixture.expectedAccess);
            case 'set-estimate':
              return service.setEstimate(child.id, actor, step.id, {
                optimistic: 1,
                realistic: 2,
                pessimistic: 3,
              });
            case 'clear-estimate':
              return service.clearEstimate(child.id, actor, step.id);
            case 'add-legacy':
              return service.addDependency(child.id, actor, fixture.owner.workItemId);
            case 'remove-legacy':
              return service.removeDependency(child.id, actor, fixture.owner.workItemId);
            case 'project-reach':
              return graph.projects.updateWithin(
                fixture.owner.projectId,
                actor,
                { depReach: 'anchor-slice' },
                fixture.expectedAccess,
              );
            case 'step-add':
              return graph.steps.addWithin(
                fixture.owner.projectId,
                actor,
                'Never written',
                0,
                undefined,
                fixture.expectedAccess,
              );
            case 'step-remove':
            case 'step-references':
              return graph.steps.removeWithin(
                fixture.owner.projectId,
                step.id,
                actor,
                true,
                fixture.expectedAccess,
              );
            case 'replay-move':
            case 'replay-delete':
            case 'replay-restore':
              return service.undoWithin(fixture.owner.projectId, actor, fixture.expectedAccess);
            case 'typed-add':
              return service.addTypedDependency(fixture.owner.projectId, actor, {
                ...fixture.input,
                type: 'SS',
              });
            case 'typed-update':
              return service.updateTypedDependency(
                fixture.owner.projectId,
                actor,
                relationship.id,
                { ...fixture.input, type: 'SS' },
              );
            case 'typed-remove':
              return service.removeTypedDependency(fixture.owner.projectId, actor, relationship.id);
          }
        },
        undefined,
        undefined,
        failedGraphRead,
      ),
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof Error ? failure.message : failure).toBe(
      `injected connected ${failedGraphRead} read failure`,
    );
    expect(effects()).toEqual(before);
  });

async function ownerRow(fixture: Awaited<ReturnType<typeof open>>, name: string): Promise<string> {
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', name }],
      })
    ).status,
  ).toBe(200);
  const row = harness.sqlite
    .query<{ id: string }, [string, string]>(
      'SELECT id FROM work_item WHERE project_id=? AND name=?',
    )
    .get(fixture.owner.projectId, name);
  if (row === null) throw new Error('fixture owner row missing');
  return row.id;
}

function workflowStep(projectId: string, name: string): string {
  const step = harness.sqlite
    .query<{ id: string }, [string, string]>('SELECT id FROM step WHERE project_id=? AND name=?')
    .get(projectId, name);
  if (step === null) throw new Error('fixture workflow step missing');
  return step.id;
}

async function localBranch(fixture: Awaited<ReturnType<typeof open>>, name: string) {
  const parent = await ownerRow(fixture, `${name} parent`);
  const children: string[] = [];
  for (const suffix of ['first', 'second']) {
    const created = await semantic(fixture, (service) =>
      service.create(fixture.owner.projectId, fixture.principal.id, {
        name: `${name} ${suffix}`,
        parentId: parent,
        afterId: null,
      }),
    );
    if (!created.ok) throw new Error('fixture branch creation refused');
    children.push(created.value.id);
  }
  return { parent, children };
}

// Proof: bypassing typedRefusal's connected cycle consumer admitted the closing edge;
// a reciprocal-project shortcut instead refused the valid interleaving (2026-10-22).
test('admitted distinct tasks interleave projects until a local edge closes the remote cycle', async () => {
  const fixture = await open();
  const a = fixture.predecessor;
  const b = fixture.owner;
  const reverse = { ...fixture, owner: a };
  const c = await ownerRow(reverse, 'Distinct returning task');
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(b.projectId, fixture.principal.id, {
        predecessor: { ...a, scope: 'node', stepId: workflowStep(a.projectId, 'Dev') },
        successor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(reverse, (service) =>
      service.addTypedDependency(a.projectId, fixture.principal.id, {
        predecessor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'QA') },
        successor: {
          projectId: a.projectId,
          workItemId: c,
          scope: 'node',
          stepId: workflowStep(a.projectId, 'QA'),
        },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  expect(
    await semantic(reverse, (service) =>
      service.addTypedDependency(a.projectId, fixture.principal.id, {
        predecessor: {
          projectId: a.projectId,
          workItemId: c,
          scope: 'node',
          stepId: workflowStep(a.projectId, 'QA'),
        },
        successor: { ...a, scope: 'node', stepId: workflowStep(a.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: false, reason: 'cycle' });
  expect(effects()).toEqual(before);
});

// Proof: retaining only the first predecessor leaf admitted a reverse edge for
// an omitted pair; the selected cycle assertion failed (2026-10-22).
test('admitted remote scopes expand all four pairs under their own trees and steps', async () => {
  const fixture = await open();
  const remote = { ...fixture, owner: fixture.predecessor };
  const a = await localBranch(remote, 'Remote');
  const b = await localBranch(fixture, 'Owner');
  const aStep = workflowStep(remote.owner.projectId, 'QA');
  const bStep = workflowStep(fixture.owner.projectId, 'Dev');
  expect(aStep).not.toBe(bStep);
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        predecessor: {
          projectId: remote.owner.projectId,
          workItemId: a.parent,
          scope: 'descendant-step',
          stepId: aStep,
        },
        successor: {
          projectId: fixture.owner.projectId,
          workItemId: b.parent,
          scope: 'descendant-step',
          stepId: bStep,
        },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  for (const left of a.children)
    for (const right of b.children) {
      expect(
        await semantic(remote, (service) =>
          service.addTypedDependency(remote.owner.projectId, fixture.principal.id, {
            predecessor: {
              projectId: fixture.owner.projectId,
              workItemId: right,
              scope: 'node',
              stepId: bStep,
            },
            successor: {
              projectId: remote.owner.projectId,
              workItemId: left,
              scope: 'node',
              stepId: aStep,
            },
            type: 'FS',
          }),
        ),
      ).toMatchObject({ ok: false, reason: 'cycle' });
      expect(effects()).toEqual(before);
    }
});

// Proof: bypassing structuralRefusal's cycle consumer made this move succeed
// after the valid external setup, rather than refuse cycle (2026-10-22).
test('admitted subtree move closes a real remote descendant cycle and rolls back', async () => {
  const fixture = await open();
  const branch = await localBranch(fixture, 'Move');
  const moving = fixture.owner.workItemId;
  expect(
    await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
      service.addTypedDependency(fixture.predecessor.projectId, fixture.principal.id, {
        predecessor: {
          projectId: fixture.owner.projectId,
          workItemId: branch.parent,
          scope: 'descendant-step',
          stepId: workflowStep(fixture.owner.projectId, 'QA'),
        },
        successor: {
          ...fixture.predecessor,
          scope: 'node',
          stepId: workflowStep(fixture.predecessor.projectId, 'Dev'),
        },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        predecessor: {
          ...fixture.predecessor,
          scope: 'node',
          stepId: workflowStep(fixture.predecessor.projectId, 'QA'),
        },
        successor: {
          ...fixture.owner,
          scope: 'node',
          stepId: workflowStep(fixture.owner.projectId, 'Dev'),
        },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.move(
        moving,
        fixture.principal.id,
        {
          parentId: branch.parent,
          afterId: null,
        },
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'cycle' });
  expect(effects()).toEqual(before);
});

// Proof: independently bypassing the clear-estimate structural cycle consumer,
// step-removal cycle condition, and project-reach cycle condition made each
// corresponding real SQLite transition succeed instead of refuse (2026-10-22).
for (const transition of ['clear-estimate', 'step-remove', 'project-reach'] as const)
  test(`admitted ${transition} moves a legacy anchor into a real remote cycle and rolls back`, async () => {
    const fixture = await open();
    const a = fixture.owner;
    const b = fixture.predecessor;
    const c = await ownerRow(fixture, 'Legacy successor');
    const dev = workflowStep(a.projectId, 'Dev');
    const qa = workflowStep(a.projectId, 'QA');
    expect(
      await semantic(fixture, (_service, graph) =>
        graph.projects.updateWithin(
          a.projectId,
          fixture.principal.id,
          { depReach: 'anchor-slice' },
          fixture.expectedAccess,
        ),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await semantic(fixture, (service) =>
        service.setEstimate(a.workItemId, fixture.principal.id, dev, {
          optimistic: 0,
          realistic: 0,
          pessimistic: 0,
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await semantic(fixture, (service) =>
        service.addDependency(c, fixture.principal.id, a.workItemId),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await semantic({ ...fixture, owner: b }, (service) =>
        service.addTypedDependency(b.projectId, fixture.principal.id, {
          predecessor: { projectId: a.projectId, workItemId: c, scope: 'node', stepId: qa },
          successor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'Dev') },
          type: 'FS',
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await semantic(fixture, (service) =>
        service.addTypedDependency(a.projectId, fixture.principal.id, {
          predecessor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'QA') },
          successor: { ...a, scope: 'node', stepId: qa },
          type: 'FS',
        }),
      ),
    ).toMatchObject({ ok: true });
    const before = effects();
    const refused = await semantic<{ readonly ok: boolean }>(fixture, (service, graph) => {
      switch (transition) {
        case 'clear-estimate':
          return service.clearEstimate(a.workItemId, fixture.principal.id, dev);
        case 'step-remove':
          return graph.steps.removeWithin(
            a.projectId,
            dev,
            fixture.principal.id,
            true,
            fixture.expectedAccess,
          );
        case 'project-reach':
          return graph.projects.updateWithin(
            a.projectId,
            fixture.principal.id,
            { depReach: 'whole-item' },
            fixture.expectedAccess,
          );
      }
    });
    expect(refused).toMatchObject({
      ok: false,
      reason: transition === 'clear-estimate' ? 'cycle' : 'dependency_cycle',
    });
    expect(effects()).toEqual(before);
  });

// Proof: bypassing typedRefusal's cycle consumer admitted the second command;
// forcing UoW COMMIT on refusal instead retained the first link and revisions,
// failing the all-table equality assertion (2026-10-22).
test('admitted batch rolls back an actual external write when a later command closes the remote cycle', async () => {
  const fixture = await open();
  const c = await ownerRow(fixture, 'Batch closing task');
  expect(
    await semantic({ ...fixture, owner: fixture.predecessor }, (service) =>
      service.addTypedDependency(fixture.predecessor.projectId, fixture.principal.id, {
        predecessor: {
          projectId: fixture.owner.projectId,
          workItemId: c,
          scope: 'node',
          stepId: workflowStep(fixture.owner.projectId, 'QA'),
        },
        successor: {
          ...fixture.predecessor,
          scope: 'node',
          stepId: workflowStep(fixture.predecessor.projectId, 'Dev'),
        },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  expect(
    await semantic(fixture, async (service, _graph, typedDependencies) => {
      const first = await service.addTypedDependency(
        fixture.owner.projectId,
        fixture.principal.id,
        fixture.input,
      );
      expect(first).toMatchObject({ ok: true });
      const staged = await typedDependencies.listIncident([fixture.owner.projectId]);
      expect(staged).toHaveLength(2);
      if (!first.ok) throw new Error('fixture first external write refused');
      expect(staged.find((relationship) => relationship.id === first.value)).toMatchObject({
        predecessor: fixture.input.predecessor,
        successor: fixture.input.successor,
      });
      return service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
        predecessor: {
          ...fixture.input.successor,
          scope: 'node',
          stepId: workflowStep(fixture.owner.projectId, 'QA'),
        },
        successor: {
          projectId: fixture.owner.projectId,
          workItemId: c,
          scope: 'node',
          stepId: workflowStep(fixture.owner.projectId, 'Dev'),
        },
        type: 'FS',
      });
    }),
  ).toMatchObject({ ok: false, reason: 'cycle' });
  expect(effects()).toEqual(before);
});

test('admitted estimate insertion and appended step preserve a valid connected interleaving', async () => {
  const fixture = await open();
  const a = fixture.owner;
  const b = fixture.predecessor;
  expect(
    await semantic({ ...fixture, owner: b }, (service) =>
      service.addTypedDependency(b.projectId, fixture.principal.id, {
        predecessor: { ...a, scope: 'node', stepId: workflowStep(a.projectId, 'Dev') },
        successor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(a.projectId, fixture.principal.id, {
        predecessor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'QA') },
        successor: { ...a, scope: 'node', stepId: workflowStep(a.projectId, 'QA') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.setEstimate(a.workItemId, fixture.principal.id, workflowStep(a.projectId, 'Dev'), {
        optimistic: 0,
        realistic: 0,
        pessimistic: 0,
      }),
    ),
  ).toMatchObject({ ok: true });
  const added = await semantic(fixture, (_service, graph) =>
    graph.steps.addWithin(
      a.projectId,
      fixture.principal.id,
      'Release',
      0,
      undefined,
      fixture.expectedAccess,
    ),
  );
  expect(added).toMatchObject({ ok: true });
  const steps = harness.sqlite
    .query<{ name: string }, [string]>('SELECT name FROM step WHERE project_id=? ORDER BY position')
    .all(a.projectId);
  expect(steps.map((step) => step.name)).toEqual(['Dev', 'QA', 'Release']);
  expect(harness.sqlite.query('SELECT id FROM external_dependency').all()).toHaveLength(2);
  expect(
    await semantic(fixture, async (service) => ({
      ok: (await service.findDependencyCycle(a.projectId, fixture.principal.id)) === null,
    })),
  ).toEqual({ ok: true });
});

// Proof: applying the requested owner's reach to every captured project refused
// the final valid estimate write as cycle after all setup succeeded (2026-10-22).
test('admitted remote legacy anchors retain their own reach when the owner uses whole-item reach', async () => {
  const fixture = await open();
  const remote = { ...fixture, owner: fixture.predecessor };
  const a = remote.owner;
  const b = fixture.owner;
  const c = await ownerRow(remote, 'Remote legacy successor');
  expect(
    await semantic(remote, (_service, graph) =>
      graph.projects.updateWithin(
        a.projectId,
        fixture.principal.id,
        { depReach: 'anchor-slice' },
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(remote, (service) =>
      service.setEstimate(a.workItemId, fixture.principal.id, workflowStep(a.projectId, 'Dev'), {
        optimistic: 0,
        realistic: 0,
        pessimistic: 0,
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(remote, (service) =>
      service.addDependency(c, fixture.principal.id, a.workItemId),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(b.projectId, fixture.principal.id, {
        predecessor: {
          projectId: a.projectId,
          workItemId: c,
          scope: 'node',
          stepId: workflowStep(a.projectId, 'QA'),
        },
        successor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'Dev') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(remote, (service) =>
      service.addTypedDependency(a.projectId, fixture.principal.id, {
        predecessor: { ...b, scope: 'node', stepId: workflowStep(b.projectId, 'QA') },
        successor: { ...a, scope: 'node', stepId: workflowStep(a.projectId, 'QA') },
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.setEstimate(b.workItemId, fixture.principal.id, workflowStep(b.projectId, 'Dev'), {
        optimistic: 1,
        realistic: 1,
        pessimistic: 1,
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    harness.sqlite
      .query<{ depReach: string }, [string]>('SELECT dep_reach AS depReach FROM project WHERE id=?')
      .get(a.projectId),
  ).toEqual({ depReach: 'anchor-slice' });
  expect(
    harness.sqlite
      .query<{ depReach: string }, [string]>('SELECT dep_reach AS depReach FROM project WHERE id=?')
      .get(b.projectId),
  ).toEqual({ depReach: 'whole-item' });
});

function lastPreconditions(projectId: string): unknown {
  const entry = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(projectId);
  if (entry === null) throw new Error('fixture journal missing');
  return JSON.parse(entry.preconditions);
}

test('local external local updates preserve identity and both-direction history through undo redo', async () => {
  const fixture = await open();
  const localId = await ownerRow(fixture, 'Local predecessor');
  const local = {
    ...fixture.input,
    predecessor: {
      projectId: fixture.owner.projectId,
      workItemId: localId,
      scope: 'whole' as const,
    },
  };
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, local),
  );
  if (!added.ok) throw new Error('fixture local relationship refused');
  expect(
    await semantic(fixture, (service) =>
      service.updateTypedDependency(
        fixture.owner.projectId,
        fixture.principal.id,
        added.value,
        fixture.input,
      ),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await semantic(fixture, (service) =>
      service.updateTypedDependency(fixture.owner.projectId, fixture.principal.id, added.value, {
        ...local,
        type: 'FF',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(lastPreconditions(fixture.owner.projectId)).toMatchObject({
    externalRevisions: {
      from: [{ ...fixture.predecessor, revision: 1 }],
      expected: [{ ...fixture.predecessor, revision: 2 }],
    },
  });
  for (const direction of ['undo', 'undo', 'redo', 'redo'] as const) {
    expect(
      await semantic(fixture, (service) =>
        direction === 'undo'
          ? service.undoWithin(
              fixture.owner.projectId,
              fixture.principal.id,
              fixture.expectedAccess,
            )
          : service.redoWithin(
              fixture.owner.projectId,
              fixture.principal.id,
              fixture.expectedAccess,
            ),
      ),
    ).toMatchObject({ ok: true });
    const relationships = harness.sqlite
      .query<{ id: string }, []>(
        'SELECT id FROM typed_dependency UNION ALL SELECT id FROM external_dependency',
      )
      .all();
    expect(relationships).toEqual([{ id: added.value }]);
  }
});

test('collected history keeps an external endpoint first seen after the first owner snapshot', async () => {
  const fixture = await open();
  expect(
    await semantic(fixture, async (service) => {
      const renamed = await service.patch(fixture.owner.workItemId, fixture.principal.id, {
        name: 'Owner renamed first',
      });
      if (!renamed.ok) return renamed;
      const added = await service.addTypedDependency(
        fixture.owner.projectId,
        fixture.principal.id,
        fixture.input,
      );
      if (!added.ok) return added;
      return service.updateTypedDependency(
        fixture.owner.projectId,
        fixture.principal.id,
        added.value,
        { ...fixture.input, type: 'SS' },
      );
    }),
  ).toMatchObject({ ok: true });
  expect(lastPreconditions(fixture.owner.projectId)).toMatchObject({
    externalRevisions: {
      from: [{ ...fixture.predecessor, revision: 0 }],
      expected: [{ ...fixture.predecessor, revision: 2 }],
    },
  });
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(harness.sqlite.query('SELECT * FROM external_dependency').all()).toEqual([]);
  expect(
    harness.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM work_item WHERE id=?')
      .get(fixture.owner.workItemId)?.name,
  ).toBe('Owner row');
});

for (const operation of ['update', 'remove'] as const)
  test(`${operation} refuses an injected denial of the old predecessor scoped project read`, async () => {
    const fixture = await open();
    const added = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!added.ok) throw new Error('fixture relationship refused');
    // Reject exactly the old predecessor's scoped read; immutable ownership and
    // external composite FKs prohibit moving that live root between organizations.
    const before = effects();
    expect(
      await observed(
        semantic(
          fixture,
          (service) =>
            operation === 'remove'
              ? service.removeTypedDependency(
                  fixture.owner.projectId,
                  fixture.principal.id,
                  added.value,
                )
              : service.updateTypedDependency(
                  fixture.owner.projectId,
                  fixture.principal.id,
                  added.value,
                  { ...fixture.input, predecessor: fixture.input.successor },
                ),
          undefined,
          fixture.predecessor.projectId,
        ),
      ),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    expect(effects()).toEqual(before);
  });

test('mounted local batch aliases survive create link undo redo under current admission', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [
          { kind: 'createWorkItem', name: 'Alias predecessor', ref: 'created' },
          {
            kind: 'addTypedDependency',
            predecessor: { scope: 'whole', workItemRef: 'created' },
            successor: { scope: 'whole', workItemId: fixture.owner.workItemId },
            type: 'FS',
          },
        ],
      })
    ).status,
  ).toBe(200);
  expect((await fixture.request(`/api/projects/${fixture.owner.projectId}/undo`)).status).toBe(200);
  expect((await fixture.request(`/api/projects/${fixture.owner.projectId}/redo`)).status).toBe(200);
});

for (const peerEdit of [false, true])
  test(`external neighbor restamping preserves ${peerEdit ? 'a genuine intervening edit' : 'an unbroken history chain'}`, async () => {
    const fixture = await open();
    const added = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!added.ok) throw new Error('fixture relationship refused');
    if (peerEdit)
      harness.sqlite
        .query('UPDATE work_item SET revision=revision+1 WHERE id=?')
        .run(fixture.predecessor.workItemId);
    expect(
      await semantic(fixture, (service) =>
        service.updateTypedDependency(fixture.owner.projectId, fixture.principal.id, added.value, {
          ...fixture.input,
          type: 'SS',
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await semantic(fixture, (service) =>
        service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      ),
    ).toMatchObject({ ok: true });
    const before = effects();
    const undone = await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    );
    expect(undone).toMatchObject(peerEdit ? { ok: false, reason: 'stale_undo' } : { ok: true });
    if (peerEdit) expect(effects()).toEqual(before);
  });

test('recordCollected refuses incomplete remote before evidence and rolls back the preceding typed write', async () => {
  const fixture = await open();
  const before = effects();
  const outcome = await observed(
    semantic(
      fixture,
      (service) =>
        service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
      (recordings) => {
        const recording = recordings.at(0);
        if (recording === undefined) throw new Error('fixture recording missing');
        recording.recording.externalBefore = [];
      },
    ),
  );
  expect(outcome).toBeInstanceOf(Error);
  if (!(outcome instanceof Error)) throw new Error('incomplete collection unexpectedly committed');
  expect(outcome.message).toContain('external revision coverage is not exact');
  expect(effects()).toEqual(before);
});

test('recordCollected rejects an omitted final remote revision and rolls back the actual SQLite typed write', async () => {
  const fixture = await open();
  const before = effects();
  const failure = await observed(
    semantic(
      fixture,
      (service) =>
        service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
      undefined,
      undefined,
      undefined,
      true,
    ),
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : failure).toBe(
    'journal external revision coverage is not exact',
  );
  expect(effects()).toEqual(before);
});

test('replay refuses a corrupt scoped stored-row delivery even when its unqualified endpoint IDs match', async () => {
  const fixture = await open();
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    ),
  ).toMatchObject({ ok: true });
  const before = effects();
  // Negative-only projection fault: the database and checked endpoint evidence
  // remain genuine; only listByProject's delivered predecessor qualifier lies.
  expect(
    await semantic(
      fixture,
      (service) =>
        service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      undefined,
      undefined,
      undefined,
      false,
      true,
    ),
  ).toMatchObject({
    ok: false,
    reason: 'stale_undo',
    detail: 'that relationship has changed since this command.',
  });
  expect(effects()).toEqual(before);
});

test('mixed nested replay keeps an unrelated foreign patch outside typed endpoint authority', async () => {
  const fixture = await open();
  expect(
    await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    ),
  ).toMatchObject({ ok: true });
  const entry = harness.sqlite
    .query<{ id: string; payload: string }, [string]>(
      'SELECT id, payload FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (entry === null) throw new Error('fixture journal missing');
  const payload = JSON.parse(entry.payload) as {
    forward: { dependency: StoredTypedDependency };
  };
  const inverse = {
    do: 'batch',
    steps: [
      { do: 'remove_typed_dependency', dependency: payload.forward.dependency },
      {
        do: 'batch',
        steps: [
          {
            do: 'patch',
            workItemId: fixture.predecessor.workItemId,
            patch: { name: 'Unrelated forbidden patch' },
          },
        ],
      },
    ],
  };
  harness.sqlite
    .query('UPDATE command_journal SET inverse=? WHERE id=?')
    .run(JSON.stringify(inverse), entry.id);
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: false, reason: 'not_found' });
  expect(effects()).toEqual(before);
});

for (const direction of ['undo', 'redo'] as const)
  test(`real SQLite ${direction} closes its graph before writer settlement`, async () => {
    const fixture = await open();
    harness.sqlite
      .query('DELETE FROM command_journal WHERE project_id=?')
      .run(fixture.owner.projectId);
    const boundary = harness.publicWrites();
    const contexts: DependencyContext[] = [];
    const actual = commandTransaction(
      boundary.uow,
      (scope, broadcast, admission, context) => {
        contexts.push(context);
        return boundary.batch(scope, broadcast, admission, context);
      },
      boundary.commandAccess,
      boundary.committedFanout,
    );
    const runner = new PlanCommandRunner({
      // Empty replay has no public announcement; accidental use must fail loudly.
      publicServices: {} as never,
      announcements: recordingBroadcaster(),
      transaction: {
        run: (act, settled) =>
          actual.run(async (resources) => {
            const decision = await act(resources);
            expect(contexts.length).toBe(1);
            expect(() => {
              contexts[0]?.assertUsable(fixture.owner.projectId, fixture.principal.id);
            }).toThrow('dependency context is closed');
            return decision;
          }, settled),
      },
    });
    const before = effects();
    const outcome = await observed(
      direction === 'undo'
        ? runner.undoWithin(fixture.owner.projectId, fixture.principal, fixture.expectedAccess)
        : runner.redoWithin(fixture.owner.projectId, fixture.principal, fixture.expectedAccess),
    );
    expect(outcome).toMatchObject({ ok: false, reason: 'nothing_to_undo' });
    expect(effects()).toEqual(before);
  });

for (const ending of ['success', 'refusal', 'throw'] as const)
  test(`real SQLite command observation closes escaped capabilities on ${ending} and a later run cannot revive them`, async () => {
    const fixture = await open();
    const boundary = harness.publicWrites();
    const contexts: DependencyContext[] = [];
    const transaction = commandTransaction(
      boundary.uow,
      (scope, broadcast, admission, dependencies) => {
        contexts.push(dependencies);
        return boundary.batch(scope, broadcast, admission, dependencies);
      },
      boundary.commandAccess,
      boundary.committedFanout,
    );
    const run = () =>
      transaction.run(async (resources) => {
        const resolved = await resources.resolveAccess({
          kind: 'human',
          principal: fixture.principal,
          expectedAccess: fixture.expectedAccess,
        });
        if (!resolved.ok || resolved.access.kind !== 'scoped')
          throw new Error('fixture authority refused');
        const refused = await resources.refuseOutsideScope(
          fixture.owner.projectId,
          fixture.principal.id,
          resolved.access.scope,
          { commands: [] },
        );
        if (refused !== null) throw new Error('fixture owner admission refused');
        const grant = grantAdmission(fixture.owner.projectId, fixture.principal.id);
        try {
          resources.openCommandGraph(fixture.owner.projectId, recordingBroadcaster(), {
            projectId: fixture.owner.projectId,
            actorId: fixture.principal.id,
            access: resolved.access,
            admission: grant.admission,
          });
          // Deliberately escape without close: the mapped observation must close it independently.
          if (ending === 'throw') throw new Error('injected callback throw');
          return { commit: ending === 'success', value: undefined };
        } finally {
          grant.expire();
        }
      });
    for (let pass = 0; pass < 2; pass++) {
      const outcome = await observed(run());
      if (ending === 'throw')
        expect(outcome instanceof Error ? outcome.message : outcome).toBe(
          'injected callback throw',
        );
      else expect(outcome).toBeUndefined();
      for (const context of contexts) {
        const evidence = await observed(context.endpoints.readEndpoint(fixture.input.successor));
        expect(evidence).toBeInstanceOf(Error);
        expect(evidence).toBeInstanceOf(Error);
        expect(evidence instanceof Error ? evidence.message : evidence).toContain(
          'observation is closed',
        );
        const graph = await observed(context.graph.findCycle(fixture.owner.projectId));
        expect(graph instanceof Error ? graph.message : graph).toContain('observation is closed');
      }
    }
  });

for (const missing of [false, true])
  test(`real SQLite ${missing ? 'refusal' : 'endpoint evidence'} suspended across command observation close cannot escape after await`, async () => {
    const fixture = await open();
    const boundary = harness.publicWrites();
    let release: () => void = () => {
      throw new Error('fixture barrier absent');
    };
    let enter: () => void = () => {
      throw new Error('fixture entry barrier absent');
    };
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const pending: Promise<unknown>[] = [];
    const uow = {
      run: <T>(act: Parameters<typeof boundary.uow.run<T>>[0]) =>
        boundary.uow.run<T>((scope) => {
          const projects = new Proxy(scope.stores.projects, {
            get(target, key) {
              if (key === 'findInOrganization')
                return async (id: string, organizationId: string) => {
                  const project = await target.findInOrganization(id, organizationId);
                  reads++;
                  enter();
                  await held;
                  return project;
                };
              const member: unknown = Reflect.get(target, key);
              if (typeof member === 'function')
                return (...args: unknown[]): unknown => Reflect.apply(member, target, args);
              return member;
            },
          });
          return act({ ...scope, stores: { ...scope.stores, projects } });
        }),
    };
    const transaction = commandTransaction(
      uow,
      (scope, broadcast, admission, dependencies) => {
        pending.push(
          dependencies.endpoints.readEndpoint(
            missing
              ? { ...fixture.input.successor, projectId: 'absent-project' }
              : fixture.input.successor,
          ),
        );
        return boundary.batch(scope, broadcast, admission, dependencies);
      },
      boundary.commandAccess,
      boundary.committedFanout,
    );
    await transaction.run(async (resources) => {
      const resolved = await resources.resolveAccess({
        kind: 'human',
        principal: fixture.principal,
        expectedAccess: fixture.expectedAccess,
      });
      if (!resolved.ok || resolved.access.kind !== 'scoped')
        throw new Error('fixture authority refused');
      const refused = await resources.refuseOutsideScope(
        fixture.owner.projectId,
        fixture.principal.id,
        resolved.access.scope,
        { commands: [] },
      );
      if (refused !== null) throw new Error('fixture owner admission refused');
      const grant = grantAdmission(fixture.owner.projectId, fixture.principal.id);
      try {
        resources.openCommandGraph(fixture.owner.projectId, recordingBroadcaster(), {
          projectId: fixture.owner.projectId,
          actorId: fixture.principal.id,
          access: resolved.access,
          admission: grant.admission,
        });
        await entered;
        return { commit: false, value: undefined };
      } finally {
        grant.expire();
      }
    });
    expect(reads).toBe(1);
    release();
    expect(pending).toHaveLength(1);
    for (const read of pending) {
      const evidence = await observed(read);
      expect(evidence).toBeInstanceOf(Error);
      expect(evidence instanceof Error ? evidence.message : evidence).toContain(
        'observation is closed',
      );
    }
  });

test('ordered restore lets an external create-link batch redo its local successor', async () => {
  const fixture = await open();
  const added = await semantic(fixture, async (service) => {
    const created = await service.create(fixture.owner.projectId, fixture.principal.id, {
      name: 'New external successor',
      parentId: null,
      afterId: null,
    });
    if (!created.ok) return created;
    return service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      ...fixture.input,
      successor: {
        scope: 'whole',
        projectId: fixture.owner.projectId,
        workItemId: created.value.id,
      },
    });
  });
  expect(added).toMatchObject({ ok: true });
  const undone = await semantic(fixture, (service) =>
    service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
  );
  expect(undone).toMatchObject({ ok: true });
  const redone = await semantic(fixture, (service) =>
    service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
  );
  expect(redone).toMatchObject({ ok: true });
});

for (const nested of [false, true])
  test(`ordered restore lets a mounted local create-update batch redo its predecessor${nested ? ' through nested replay' : ''}`, async () => {
    const fixture = await open();
    const route = `/api/projects/${fixture.owner.projectId}`;
    const initial = await fixture.request(`${route}/commands`, {
      commands: [
        { kind: 'createWorkItem', name: 'Original local predecessor', ref: 'original' },
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'whole', workItemRef: 'original' },
          successor: { scope: 'whole', workItemId: fixture.owner.workItemId },
          type: 'FS',
        },
      ],
    });
    expect(initial.status).toBe(200);
    const relationship = harness.sqlite
      .query<{ id: string }, []>('SELECT id FROM typed_dependency')
      .get();
    if (relationship === null) throw new Error('fixture local relationship missing');
    const updated = await fixture.request(`${route}/commands`, {
      commands: [
        { kind: 'createWorkItem', name: 'Replacement local predecessor', ref: 'replacement' },
        {
          kind: 'updateTypedDependency',
          dependencyId: relationship.id,
          predecessor: { scope: 'whole', workItemRef: 'replacement' },
          successor: { scope: 'whole', workItemId: fixture.owner.workItemId },
          type: 'FS',
        },
      ],
    });
    expect(updated.status).toBe(200);
    const replacement = harness.sqlite
      .query<{ id: string }, []>(
        "SELECT id FROM work_item WHERE name='Replacement local predecessor'",
      )
      .get();
    if (replacement === null) throw new Error('fixture replacement row missing');
    const undone = await fixture.request(`${route}/undo`);
    expect(undone.status).toBe(200);
    expect(
      harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(replacement.id),
    ).toBeNull();
    if (nested) {
      const entry = harness.sqlite
        .query<{ id: string; payload: string }, [string]>(
          'SELECT id,payload FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(fixture.owner.projectId);
      if (entry === null) throw new Error('fixture update history missing');
      const payload = JSON.parse(entry.payload) as { forward: CompensatingCommand };
      if (payload.forward.do !== 'batch')
        throw new Error('fixture update forward is not collected');
      payload.forward = nestedReplay(
        ...payload.forward.steps.map((step) => nestedReplay(nestedReplay(step))),
      );
      harness.sqlite
        .query('UPDATE command_journal SET payload=? WHERE id=?')
        .run(JSON.stringify(payload), entry.id);
    }
    const redone = await fixture.request(`${route}/redo`);
    expect(redone.status).toBe(200);
    expect(
      harness.sqlite
        .query<{ id: string; predecessor: string }, [string]>(
          'SELECT id,predecessor_work_item_id AS predecessor FROM typed_dependency WHERE id=?',
        )
        .get(relationship.id),
    ).toEqual({ id: relationship.id, predecessor: replacement.id });
  });

async function undoneExternalCreate() {
  const fixture = await open();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (step === null) throw new Error('fixture restored successor step missing');
  let successorId: string | undefined;
  const added = await semantic(fixture, async (service) => {
    const created = await service.create(fixture.owner.projectId, fixture.principal.id, {
      parentId: null,
      afterId: null,
      name: 'Nested external successor',
    });
    if (!created.ok) return created;
    successorId = created.value.id;
    return service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      ...fixture.input,
      successor: {
        projectId: fixture.owner.projectId,
        workItemId: created.value.id,
        scope: 'node',
        stepId: step.id,
      },
    });
  });
  expect(added).toMatchObject({ ok: true });
  if (!added.ok || successorId === undefined) throw new Error('fixture external create refused');
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  const entry = harness.sqlite
    .query<{ id: string; payload: string; inverse: string }, [string]>(
      'SELECT id,payload,inverse FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (entry === null) throw new Error('fixture external create history missing');
  // These are the real collected journal's commands; corrupt variants below
  // change only trusted-history delivery/setup and never create valid grants.
  const payload = JSON.parse(entry.payload) as { label: string; forward: CompensatingCommand };
  if (payload.forward.do !== 'batch') throw new Error('fixture collected forward is not a batch');
  const restore = payload.forward.steps.find((command) => command.do === 'restore_subtree');
  const typed = payload.forward.steps.find((command) => command.do === 'add_typed_dependency');
  if (restore?.do !== 'restore_subtree' || typed?.do !== 'add_typed_dependency')
    throw new Error('fixture external create commands missing');
  return { fixture, entry, payload, restore, typed, successorId, dependencyId: added.value };
}

const nestedReplay = (...steps: CompensatingCommand[]): CompensatingCommand => ({
  do: 'batch',
  steps,
});

function replaceForward(
  prepared: Awaited<ReturnType<typeof undoneExternalCreate>>,
  forward: CompensatingCommand,
) {
  harness.sqlite
    .query('UPDATE command_journal SET payload=? WHERE id=?')
    .run(JSON.stringify({ ...prepared.payload, forward }), prepared.entry.id);
}

test('ordered restore replays nested local restoration before an external typed add with exact revisions and identity', async () => {
  const prepared = await undoneExternalCreate();
  replaceForward(
    prepared,
    nestedReplay(nestedReplay(prepared.restore), nestedReplay(nestedReplay(prepared.typed))),
  );
  const { fixture } = prepared;
  expect(
    await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  expect(
    harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE id=?')
      .get(prepared.successorId)?.id,
  ).toBe(prepared.successorId);
  expect(
    harness.sqlite
      .query<{ id: string; successor: string }, [string]>(
        'SELECT id,successor_work_item_id AS successor FROM external_dependency WHERE id=?',
      )
      .get(prepared.dependencyId),
  ).toEqual({ id: prepared.dependencyId, successor: prepared.successorId });
  expect(lastPreconditions(fixture.owner.projectId)).toMatchObject({
    externalRevisions: {
      expected: [{ ...fixture.predecessor, revision: 3 }],
      from: [{ ...fixture.predecessor, revision: 2 }],
    },
  });
});

for (const defect of [
  'later-restore',
  'other-direction',
  'different-address',
  'ordinary-reference',
  'foreign-restore',
  'mixed-restore',
  'missing-step',
  'shape',
] as const)
  test(`ordered restore refuses ${defect} in nested external replay without partial effects`, async () => {
    const prepared = await undoneExternalCreate();
    const { fixture, restore, typed } = prepared;
    const root = restore.rows.at(0);
    if (root === undefined) throw new Error('fixture restored root missing');
    const malformedRestore: CompensatingCommand = {
      ...restore,
      rows: [
        {
          ...root,
          ...(defect === 'foreign-restore'
            ? { projectId: fixture.predecessor.projectId }
            : { id: 'different-restored-address' }),
        },
      ],
    };
    let forward: CompensatingCommand;
    switch (defect) {
      case 'other-direction':
        harness.sqlite
          .query('UPDATE command_journal SET inverse=? WHERE id=?')
          .run(JSON.stringify(nestedReplay(restore, typed)), prepared.entry.id);
        forward = nestedReplay(typed);
        break;
      case 'later-restore':
        forward = nestedReplay(nestedReplay(typed), nestedReplay(restore));
        break;
      case 'mixed-restore':
        forward = nestedReplay(
          {
            ...restore,
            rows: [
              ...restore.rows,
              { ...root, id: 'foreign-insert', projectId: fixture.predecessor.projectId },
            ],
          },
          typed,
        );
        break;
      case 'different-address':
      case 'foreign-restore':
        forward = nestedReplay(nestedReplay(malformedRestore), nestedReplay(typed));
        break;
      case 'ordinary-reference':
        forward = nestedReplay(
          { do: 'patch', workItemId: prepared.successorId, patch: { name: 'Not a restore' } },
          nestedReplay(typed),
        );
        break;
      case 'missing-step':
        forward = nestedReplay(nestedReplay(restore), {
          ...typed,
          dependency: {
            ...typed.dependency,
            successor: {
              projectId: fixture.owner.projectId,
              workItemId: prepared.successorId,
              scope: 'node',
              stepId: 'absent-step',
            },
          },
        });
        break;
      case 'shape':
        forward = nestedReplay(nestedReplay(restore), {
          ...typed,
          dependency: {
            ...typed.dependency,
            successor: {
              projectId: fixture.owner.projectId,
              workItemId: prepared.successorId,
              scope: 'descendant-step',
              stepId:
                typed.dependency.successor.scope === 'whole'
                  ? 'absent-step'
                  : typed.dependency.successor.stepId,
            },
          },
        });
        break;
    }
    replaceForward(prepared, forward);
    const before = effects();
    const redone = await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    );
    expect(redone).toMatchObject(
      defect === 'shape'
        ? {
            ok: false,
            reason: 'stale_undo',
            detail: 'that relationship would now be refused: not_a_parent.',
          }
        : { ok: false, reason: 'not_found' },
    );
    expect(effects()).toEqual(before);
  });

for (const refusal of ['forbidden', 'unknown_step'] as const)
  test(`ordered restore propagates a delivered ${refusal} instead of exempting it as a missing row`, async () => {
    const prepared = await undoneExternalCreate();
    const { fixture } = prepared;
    const before = effects();
    const redone = await semantic(
      fixture,
      (service) =>
        service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      undefined,
      undefined,
      undefined,
      false,
      false,
      refusal,
    );
    expect(redone).toMatchObject({
      ok: false,
      reason: refusal === 'forbidden' ? 'forbidden' : 'not_found',
      detail: null,
    });
    expect(effects()).toEqual(before);
  });

test('ordered restore never defers a missing remote row even when replay carries a foreign restore', async () => {
  const prepared = await undoneExternalCreate();
  const { fixture } = prepared;
  const root = prepared.restore.rows.at(0);
  if (root === undefined) throw new Error('fixture owner restore missing');
  // Undo removed the external FK row, so actual remote endpoint deletion is a
  // legitimate current state. The attempted foreign restore is corrupt history.
  harness.sqlite.query('DELETE FROM work_item WHERE id=?').run(fixture.predecessor.workItemId);
  const foreign: CompensatingCommand = {
    ...prepared.restore,
    rows: [
      { ...root, id: fixture.predecessor.workItemId, projectId: fixture.predecessor.projectId },
    ],
  };
  replaceForward(prepared, nestedReplay(foreign, nestedReplay(prepared.restore), prepared.typed));
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: false, reason: 'not_found', detail: null });
  expect(effects()).toEqual(before);
});

test('mounted predecessor deletion names every incident ID in sorted order', async () => {
  const fixture = await open();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Second successor' }],
      })
    ).status,
  ).toBe(200);
  const first = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!first.ok) throw new Error('first link refused');
  const secondRow = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Second successor'")
    .get();
  if (secondRow === null) throw new Error('second successor missing');
  const second = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      ...fixture.input,
      successor: { ...fixture.input.successor, workItemId: secondRow.id },
    }),
  );
  if (!second.ok) throw new Error('second link refused');
  const before = effects();
  const response = await fixture.request(
    `/api/projects/${fixture.predecessor.projectId}/commands`,
    {
      commands: [
        { kind: 'deleteWorkItem', workItemId: fixture.predecessor.workItemId, strategy: 'cascade' },
      ],
    },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: 'referenced_by_external_dependency',
    dependencyIds: [first.value, second.value].sort(),
  });
  expect(effects()).toEqual(before);
});

for (const strategy of ['cascade', 'promote'] as const) {
  test(`successor parent ${strategy} undo redo retains exact external identity`, async () => {
    const fixture = await open();
    expect(
      (
        await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
          commands: [
            { kind: 'createWorkItem', parentId: fixture.owner.workItemId, name: 'Child' },
            { kind: 'createWorkItem', name: 'Retained sibling' },
          ],
        })
      ).status,
    ).toBe(200);
    const linked = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!linked.ok) throw new Error('fixture link refused');
    const original = harness.sqlite
      .query(
        'SELECT id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type FROM external_dependency WHERE id=?',
      )
      .get(linked.value);
    expect(
      await semantic(fixture, (service) =>
        service.remove(
          fixture.owner.workItemId,
          fixture.principal.id,
          strategy,
          fixture.expectedAccess,
        ),
      ),
    ).toMatchObject({ ok: true });
    harness.sqlite.query("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1").run();
    expect(
      await semantic(fixture, (service) =>
        service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      ),
    ).toMatchObject({ ok: true });
    expect(
      harness.sqlite
        .query(
          'SELECT id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type FROM external_dependency WHERE id=?',
        )
        .get(linked.value),
    ).toEqual(original);
    expect(
      await semantic(fixture, (service) =>
        service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      ),
    ).toMatchObject({ ok: true });
    expect(
      harness.sqlite.query('SELECT id FROM external_dependency WHERE id=?').get(linked.value),
    ).toBeNull();
  });
}

// Proof: skipping typedRefusal's connected read changed this exact refusal to
// walkStack's final cycle refusal. Skipping both real graph calls admitted the
// cyclic undo (ok:true); A/B revisions remained unchanged in both runs (2026-10-22).
test('undo reaches the actual remote cycle guard after only unguarded remote endpoints change', async () => {
  const fixture = await open();
  const a = fixture.predecessor;
  const b = fixture.owner;
  const remoteOwner = { ...fixture, owner: a };
  const x = { projectId: b.projectId, workItemId: await ownerRow(fixture, 'Cycle bridge X') };
  const y = { projectId: a.projectId, workItemId: await ownerRow(remoteOwner, 'Cycle bridge Y') };
  const node = (address: typeof a) => ({
    ...address,
    scope: 'node' as const,
    stepId: workflowStep(address.projectId, 'Dev'),
  });
  for (const [owner, predecessor, successor] of [
    [fixture, b, x],
    [remoteOwner, y, a],
  ] as const) {
    expect(
      await semantic(owner, (service) =>
        service.addTypedDependency(owner.owner.projectId, fixture.principal.id, {
          predecessor: node(predecessor),
          successor: node(successor),
          type: 'FS',
        }),
      ),
    ).toMatchObject({ ok: true });
  }
  const added = await semantic(fixture, (service) =>
    service.addTypedDependency(b.projectId, fixture.principal.id, {
      predecessor: node(a),
      successor: node(b),
      type: 'FS',
    }),
  );
  if (!added.ok) throw new Error('fixture cycle-closing relationship refused');
  expect(
    await semantic(fixture, (service) =>
      service.removeTypedDependency(b.projectId, fixture.principal.id, added.value),
    ),
  ).toMatchObject({ ok: true });
  const guardedRevisions = () =>
    harness.sqlite
      .query<{ id: string; revision: number }, [string, string]>(
        'SELECT id, revision FROM work_item WHERE id IN (?,?) ORDER BY id',
      )
      .all(a.workItemId, b.workItemId);
  const revisions = guardedRevisions();
  expect(
    await semantic(remoteOwner, (service) =>
      service.addTypedDependency(a.projectId, fixture.principal.id, {
        predecessor: node(x),
        successor: node(y),
        type: 'FS',
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(guardedRevisions()).toEqual(revisions);
  const before = effects();
  const undone = await semantic(fixture, async (service) => {
    const patched = await service.patch(x.workItemId, fixture.principal.id, {
      name: 'This earlier successful action must roll back',
    });
    expect(patched).toMatchObject({ ok: true });
    if (!patched.ok) return patched;
    return service.undoWithin(b.projectId, fixture.principal.id, fixture.expectedAccess);
  });
  expect(undone).toMatchObject({
    ok: false,
    reason: 'stale_undo',
    detail: 'that relationship would now be refused: cycle.',
  });
  expect(effects()).toEqual(before);
});

for (const defect of ['project-read', 'foreign-project', 'wrong-identity'] as const)
  test(`external redo revalidates ${defect} delivery and rolls back an earlier successful action`, async () => {
    const { fixture } = await undoneExternalCreate();
    const before = effects();
    const redone = await observed(
      semantic(
        fixture,
        async (service) => {
          const patched = await service.patch(fixture.owner.workItemId, fixture.principal.id, {
            name: 'Must roll back before replay admission',
          });
          expect(patched).toMatchObject({ ok: true });
          if (!patched.ok) return patched;
          return service.redoWithin(
            fixture.owner.projectId,
            fixture.principal.id,
            fixture.expectedAccess,
          );
        },
        undefined,
        defect === 'project-read' ? fixture.predecessor.projectId : undefined,
        undefined,
        false,
        false,
        undefined,
        defect === 'project-read' ? undefined : defect,
      ),
    );
    if (defect === 'wrong-identity') {
      expect(redone).toBeInstanceOf(Error);
      expect(redone instanceof Error ? redone.message : redone).toBe(
        'endpoint row identity mismatch',
      );
    } else expect(redone).toMatchObject({ ok: false, reason: 'not_found', detail: null });
    expect(effects()).toEqual(before);
  });

test('mounted external redo checks revoked current membership before opening its graph', async () => {
  const { fixture } = await undoneExternalCreate();
  harness.sqlite
    .query('DELETE FROM organization_membership WHERE organization_id=? AND user_id=?')
    .run('org-a', fixture.principal.id);
  const before = effects();
  const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/redo`);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: 'not_a_member' });
  expect(effects()).toEqual(before);
});

for (const command of ['addTypedDependency', 'updateTypedDependency'] as const) {
  test(`mounted ${command} models a delete-pending endpoint as conflict without effects`, async () => {
    const pushUrls: string[] = [];
    const fixture = await open(pushUrls);
    const projectId = fixture.owner.projectId;
    expect(
      (
        await fixture.request(`/api/projects/${projectId}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Second local row' }],
        })
      ).status,
    ).toBe(200);
    const second = harness.sqlite
      .query<{ id: string }, [string, string]>(
        'SELECT id FROM work_item WHERE project_id=? AND id<>?',
      )
      .get(projectId, fixture.owner.workItemId);
    if (second === null) throw new Error('second local endpoint missing');
    const input = {
      predecessor: { projectId, workItemId: fixture.owner.workItemId, scope: 'whole' },
      successor: { projectId, workItemId: second.id, scope: 'whole' },
      type: 'FS',
    };
    if (command === 'updateTypedDependency')
      expect(
        (
          await fixture.request(`/api/projects/${projectId}/commands`, {
            commands: [{ kind: 'addTypedDependency', ...input }],
          })
        ).status,
      ).toBe(200);
    const dependency = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM typed_dependency WHERE project_id=?')
      .get(projectId);
    let release = (): void => {
      throw new Error('writer was not held');
    };
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markEntered = (): void => {
      throw new Error('writer entry was not observed');
    };
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const held = harness.holdWriteTurn(until, markEntered);
    await entered;
    const pending = fixture.request(`/api/projects/${projectId}/commands`, {
      commands: [
        { kind: 'patchWorkItem', workItemId: second.id, patch: { name: 'Must roll back' } },
        {
          kind: command,
          ...input,
          ...(dependency === null ? {} : { dependencyId: dependency.id }),
          type: 'SS',
        },
      ],
    });
    expect(
      beginOptimizationDrain(openDrizzle(harness.databasePath()), projectId, { at: 2, by: 'ada' }),
    ).toBe(0);
    const before = effects();
    const pushedBefore = [...pushUrls];
    release();
    await held;
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'project_deleting',
      at: 1,
      kind: command,
    });
    expect(effects()).toEqual(before);
    expect(pushUrls).toEqual(pushedBefore);
  });
}

for (const command of ['createWorkItem', 'duplicateWorkItem'] as const) {
  test(`mounted ${command} refuses implicit typed writes on a deleting project without effects`, async () => {
    const pushUrls: string[] = [];
    const fixture = await open(pushUrls);
    const projectId = fixture.owner.projectId;
    expect(
      (
        await fixture.request(`/api/projects/${projectId}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Local prerequisite' }],
        })
      ).status,
    ).toBe(200);
    const peer = harness.sqlite
      .query<{ id: string }, [string, string]>(
        'SELECT id FROM work_item WHERE project_id=? AND id<>?',
      )
      .get(projectId, fixture.owner.workItemId);
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(projectId);
    if (peer === null || step === null) throw new Error('implicit-write fixture endpoints missing');
    expect(
      (
        await fixture.request(`/api/projects/${projectId}/commands`, {
          commands: [
            {
              kind: 'addTypedDependency',
              type: 'FS',
              predecessor: { projectId, workItemId: peer.id, scope: 'whole' },
              successor: {
                projectId,
                workItemId: fixture.owner.workItemId,
                scope: 'node',
                stepId: step.id,
              },
            },
          ],
        })
      ).status,
    ).toBe(200);
    expect(
      beginOptimizationDrain(openDrizzle(harness.databasePath()), projectId, { at: 2, by: 'ada' }),
    ).toBe(0);
    const before = effects();
    const pushedBefore = [...pushUrls];
    const response = await fixture.request(`/api/projects/${projectId}/commands`, {
      commands: [
        { kind: 'patchWorkItem', workItemId: peer.id, patch: { name: 'Must roll back' } },
        command === 'createWorkItem'
          ? { kind: command, name: 'First child', parentId: fixture.owner.workItemId }
          : { kind: command, workItemId: fixture.owner.workItemId },
      ],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'project_deleting',
      at: 1,
      kind: command,
    });
    expect(effects()).toEqual(before);
    expect(pushUrls).toEqual(pushedBefore);
  });
}

for (const source of ['owner', 'third'] as const)
  test(`mounted remote predecessor refuses a real ${source} project step with equal labels`, async () => {
    const fixture = await open();
    if (source === 'third')
      expect((await fixture.request('/api/projects', { name: 'Third' })).status).toBe(200);
    const steps = harness.sqlite
      .query<{ id: string; projectId: string }, []>(
        'SELECT id, project_id AS projectId FROM step ORDER BY position',
      )
      .all();
    const remote = steps.find((step) => step.projectId === fixture.predecessor.projectId);
    const other = steps.find((step) =>
      source === 'owner'
        ? step.projectId === fixture.owner.projectId
        : step.projectId !== fixture.owner.projectId &&
          step.projectId !== fixture.predecessor.projectId,
    );
    if (remote === undefined || other === undefined) throw new Error('fixture steps missing');
    harness.sqlite
      .query("UPDATE step SET name='Equal design', code='design' WHERE id IN (?,?)")
      .run(remote.id, other.id);
    const before = effects();
    const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.owner.workItemId,
          patch: { name: 'Must roll back' },
        },
        {
          kind: 'addTypedDependency',
          ...fixture.input,
          predecessor: { ...fixture.input.predecessor, scope: 'node', stepId: other.id },
        },
      ],
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: 'not_found',
      at: 1,
      kind: 'addTypedDependency',
    });
    expect(effects()).toEqual(before);
  });

for (const fault of ['step-identity', 'step-project'] as const)
  test(`admitted add refuses ${fault} misdelivery before storage`, async () => {
    const fixture = await open();
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(fixture.predecessor.projectId);
    if (step === null) throw new Error('remote step missing');
    const before = effects();
    expect(
      await semantic(
        fixture,
        (service) =>
          service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
            ...fixture.input,
            predecessor: { ...fixture.input.predecessor, scope: 'node', stepId: step.id },
          }),
        undefined,
        undefined,
        undefined,
        false,
        false,
        undefined,
        undefined,
        fault,
      ),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(effects()).toEqual(before);
  });

for (const operation of ['add', 'update'] as const)
  test(`second successor owner ${operation} refuses before protected facts and rolls back earlier local work`, async () => {
    const fixture = await open();
    const linked = await semantic(fixture, (service) =>
      service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
    );
    if (!linked.ok) throw new Error('fixture relationship refused');
    expect(
      (
        await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Protected successor' }],
        })
      ).status,
    ).toBe(200);
    const protectedRow = harness.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM work_item WHERE project_id=? AND name='Protected successor'",
      )
      .get(fixture.predecessor.projectId);
    if (protectedRow === null) throw new Error('protected row missing');
    const input = {
      ...fixture.input,
      successor: { ...fixture.predecessor, workItemId: protectedRow.id, scope: 'whole' as const },
    };
    const before = effects();
    expect(
      await semantic(
        fixture,
        async (service) => {
          const patched = await service.patch(fixture.owner.workItemId, fixture.principal.id, {
            name: 'Must roll back',
          });
          if (!patched.ok) throw new Error('prior patch refused');
          return operation === 'add'
            ? service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, input)
            : service.updateTypedDependency(
                fixture.owner.projectId,
                fixture.principal.id,
                linked.value,
                input,
              );
        },
        undefined,
        undefined,
        undefined,
        false,
        false,
        undefined,
        undefined,
        undefined,
        fixture.predecessor.projectId,
      ),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(effects()).toEqual(before);
    const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.owner.workItemId,
          patch: { name: 'Must roll back' },
        },
        operation === 'add'
          ? { kind: 'addTypedDependency', ...input }
          : { kind: 'updateTypedDependency', dependencyId: linked.value, ...input },
      ],
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: 'not_found',
      at: 1,
      kind: operation === 'add' ? 'addTypedDependency' : 'updateTypedDependency',
    });
    expect(effects()).toEqual(before);
  });

test('mounted low priority prerequisite finishes before its high priority successor starts', async () => {
  const fixture = await open();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (step === null) throw new Error('local step absent');
  const response = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'prerequisite', name: 'Low priority prerequisite' },
      { kind: 'patchWorkItem', workItemRef: 'prerequisite', patch: { priority: 100 } },
      { kind: 'patchWorkItem', workItemId: fixture.owner.workItemId, patch: { priority: 1 } },
      {
        kind: 'setEstimate',
        workItemRef: 'prerequisite',
        stepId: step.id,
        days: { optimistic: 2, realistic: 2, pessimistic: 2 },
      },
      {
        kind: 'setEstimate',
        workItemId: fixture.owner.workItemId,
        stepId: step.id,
        days: { optimistic: 1, realistic: 1, pessimistic: 1 },
      },
      {
        kind: 'addTypedDependency',
        predecessor: { scope: 'whole', workItemRef: 'prerequisite' },
        successor: { scope: 'whole', workItemId: fixture.owner.workItemId },
        type: 'FS',
      },
    ],
  });
  expect(response.status).toBe(200);
  const read = await fixture.request(
    `/api/projects/${fixture.owner.projectId}/work-items`,
    undefined,
    'GET',
  );
  expect(read.status).toBe(200);
  const view = (await read.json()) as {
    slices: { workItemId: string; earliestStart: number; earliestFinish: number }[];
  };
  const predecessor = harness.sqlite
    .query<{ id: string }, [string]>(
      "SELECT id FROM work_item WHERE project_id=? AND name='Low priority prerequisite'",
    )
    .get(fixture.owner.projectId);
  if (predecessor === null) throw new Error('local prerequisite absent');
  const prerequisite = view.slices.filter(
    (slice: { workItemId: string }) => slice.workItemId === predecessor.id,
  );
  const successor = view.slices.filter(
    (slice: { workItemId: string }) => slice.workItemId === fixture.owner.workItemId,
  );
  expect(prerequisite.length).toBeGreaterThan(0);
  expect(successor.length).toBeGreaterThan(0);
  const finish = Math.max(
    ...prerequisite.map((slice: { earliestFinish: number }) => slice.earliestFinish),
  );
  const start = Math.min(
    ...successor.map((slice: { earliestStart: number }) => slice.earliestStart),
  );
  expect(finish).toBeGreaterThan(0);
  expect(start).toBeGreaterThanOrEqual(finish);
});

test('admitted redo refuses a misowned resulting relationship before storage', async () => {
  const fixture = await open();
  const linked = await semantic(fixture, (service) =>
    service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, fixture.input),
  );
  if (!linked.ok) throw new Error('fixture link refused');
  expect(
    await semantic(fixture, (service) =>
      service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({ ok: true });
  const entry = harness.sqlite
    .query<{ id: string; payload: string }, [string]>(
      'SELECT id,payload FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (entry === null) throw new Error('journal missing');
  const payload = JSON.parse(entry.payload) as { forward: CompensatingCommand };
  if (payload.forward.do !== 'add_typed_dependency') throw new Error('typed forward missing');
  const forward = {
    ...payload.forward,
    dependency: {
      ...payload.forward.dependency,
      projectId: fixture.predecessor.projectId,
      successor: { ...fixture.predecessor, scope: 'whole' as const },
    },
  };
  harness.sqlite
    .query('UPDATE command_journal SET payload=? WHERE id=?')
    .run(JSON.stringify({ ...payload, forward }), entry.id);
  const before = effects();
  expect(
    await semantic(fixture, (service) =>
      service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
    ),
  ).toMatchObject({
    ok: false,
    reason: 'stale_undo',
    detail: 'that relationship would now be refused: not_found.',
  });
  expect(effects()).toEqual(before);
});
