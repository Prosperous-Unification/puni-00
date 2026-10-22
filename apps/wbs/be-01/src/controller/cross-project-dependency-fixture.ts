import type { PlanTransactionalStores, StoredTypedDependency } from '@wbs/core';
import { clockOf } from '@wbs/core';
import { grantAdmission } from '@wbs/core';
import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { AnnouncementCollector } from '@wbs/core/ports/announcement-collector';
import { createDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

export let harness: OrganizationHarness;
let afterRequestResolve: (() => void) | undefined;
export async function closeFixture() {
  await harness.closeComposed();
}
export async function openFixture(options?: {
  syntheticExternalCommands?: true;
  pushes?: string[];
}) {
  afterRequestResolve = undefined;
  harness = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    ...(options?.syntheticExternalCommands === undefined
      ? {}
      : { syntheticExternalCommands: options.syntheticExternalCommands }),
    pushFetch: (request) => {
      options?.pushes?.push(request);
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
    afterResolve: () => afterRequestResolve?.(),
  });
  // Synthetic stored authority permits historical external edges in this fixture; production authoring stays inactive.
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
  const request = (path: string, body?: unknown) =>
    harness.request(path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${harness.token('ada')}`,
        cookie,
        'X-WBS-Expected-Organization': 'org-a',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  for (const name of ['Predecessor', 'Owner', 'Successor', 'Second successor']) {
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
  const readEndpoint = (name: string) => {
    const found = harness.sqlite
      .query<{ projectId: string; workItemId: string }, [string]>(
        'SELECT project.id AS projectId, work_item.id AS workItemId FROM project JOIN work_item ON work_item.project_id=project.id WHERE project.name=?',
      )
      .get(name);
    if (found === null) throw new Error('fixture endpoint missing');
    return found;
  };
  const predecessor = readEndpoint('Predecessor');
  const successor = readEndpoint('Successor');
  const secondSuccessor = readEndpoint('Second successor');
  const owner = readEndpoint('Owner');
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
  return {
    predecessor,
    owner,
    successor,
    secondSuccessor,
    principal,
    expectedAccess,
    request,
    input,
  };
}

export async function runSemantic<T extends { ok: boolean }>(
  fixture: Awaited<ReturnType<typeof openFixture>>,
  operation: (service: WorkItemService) => Promise<T>,
  configure?: (stores: PlanTransactionalStores) => PlanTransactionalStores,
) {
  const boundary = harness.publicWrites();
  return boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok || resolved.access.kind !== 'scoped')
      throw new Error('fixture current authority refused');
    await requireOwnerEdit(scope.stores, fixture);
    const granted = grantAdmission(fixture.owner.projectId, fixture.principal.id);
    const plan = createWorkingPlan(scope, fixture.owner.projectId);
    const opened = createDependencyContext(
      configure === undefined ? scope.stores : configure(scope.stores),
      {
        projectId: fixture.owner.projectId,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: granted.admission,
      },
      () => undefined,
      { kind: 'owner', refresh: plan.refreshRows },
    );
    const broadcast = recordingBroadcaster();
    try {
      const service = new WorkItemService({
        ...plan.stores,
        clock: clockOf({ now: () => Date.now(), newId: () => crypto.randomUUID() }),
        scheduler: fastScheduler,
        admission: granted.admission,
        dependencyContext: { kind: 'bound', context: opened.context },
        externalDependencyAuthoring: { state: 'inactive' },
        broadcast: new AnnouncementCollector(broadcast),
      });
      const collected = await service.collect(() => operation(service));
      if (collected.result.ok)
        await service.recordCollected(
          fixture.owner.projectId,
          fixture.principal.id,
          collected.recordings,
        );
      return { commit: collected.result.ok, value: collected.result };
    } finally {
      expect(broadcast.published).toEqual([]);
      opened.close();
      plan.close();
      granted.expire();
    }
  });
}

export async function seedIncidents() {
  const fixture = await openFixture();
  expect(
    (
      await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
        commands: [
          { kind: 'createWorkItem', name: 'Local peer', ref: 'peer' },
          { kind: 'createWorkItem', name: 'Ancestor', ref: 'ancestor' },
          {
            kind: 'moveWorkItem',
            workItemId: fixture.owner.workItemId,
            parentRef: 'ancestor',
            afterId: null,
          },
        ],
      })
    ).status,
  ).toBe(200);
  const readWorkItemId = (name: string) => {
    const row = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE name=?')
      .get(name);
    if (row === null) throw new Error('fixture named row missing');
    return row.id;
  };
  const readSteps = (projectId: string) =>
    harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY position')
      .all(projectId);
  const createNodeEndpoint = (address: { projectId: string; workItemId: string }) => {
    const step = readSteps(address.projectId).at(0);
    if (step === undefined) throw new Error('fixture step missing');
    return { ...address, scope: 'node' as const, stepId: step.id };
  };
  const localPeer = readWorkItemId('Local peer');
  const ancestor = readWorkItemId('Ancestor');
  const ownerId = fixture.owner.projectId;
  const links: StoredTypedDependency[] = [
    {
      id: 'incoming',
      projectId: ownerId,
      predecessor: createNodeEndpoint(fixture.predecessor),
      successor: createNodeEndpoint(fixture.owner),
      type: 'SS',
    },
    {
      id: 'outgoing-1',
      projectId: fixture.successor.projectId,
      predecessor: createNodeEndpoint(fixture.owner),
      successor: createNodeEndpoint(fixture.successor),
      type: 'FF',
    },
    {
      id: 'outgoing-2',
      projectId: fixture.secondSuccessor.projectId,
      predecessor: createNodeEndpoint(fixture.owner),
      successor: createNodeEndpoint(fixture.secondSuccessor),
      type: 'FS',
    },
    {
      id: 'local',
      projectId: ownerId,
      predecessor: createNodeEndpoint(fixture.owner),
      successor: createNodeEndpoint({ projectId: ownerId, workItemId: localPeer }),
      type: 'SS',
    },
    {
      id: 'whole',
      projectId: fixture.successor.projectId,
      predecessor: { ...fixture.owner, scope: 'whole' },
      successor: { ...fixture.successor, scope: 'whole' },
      type: 'FS',
    },
    {
      id: 'ancestor',
      projectId: fixture.secondSuccessor.projectId,
      predecessor: {
        ...createNodeEndpoint({ projectId: ownerId, workItemId: ancestor }),
        scope: 'descendant-step',
      },
      successor: { ...fixture.secondSuccessor, scope: 'whole' },
      type: 'SS',
    },
    {
      id: 'unrelated',
      projectId: ownerId,
      predecessor: { ...fixture.predecessor, scope: 'whole' },
      successor: { projectId: ownerId, workItemId: localPeer, scope: 'whole' },
      type: 'FS',
    },
  ];
  const boundary = harness.publicWrites();
  await boundary.uow.run(async (scope) => {
    for (const relationship of links)
      await scope.stores.typedDependencies.add(relationship, { at: 10, by: fixture.principal.id });
    return { commit: true, value: undefined };
  });
  return { ...fixture, links, localPeer, ancestor, steps: readSteps(ownerId) };
}

export async function readIncidentRows(projectId: string) {
  return harness.publicWrites().uow.run(async (scope) => ({
    commit: false,
    value: await scope.stores.typedDependencies.listIncident([projectId]),
  }));
}

export function readTables() {
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

export function setRequestAdmissionObserver(observer: (() => void) | undefined) {
  afterRequestResolve = observer;
}

/** Uses the real source admission before issuing the test's scoped lease. */
export async function requireOwnerEdit(
  stores: PlanTransactionalStores,
  fixture: Awaited<ReturnType<typeof openFixture>>,
): Promise<void> {
  const admitted = await stores.projects.admitEditInOrganization(
    fixture.owner.projectId,
    fixture.expectedAccess.scope.organizationId,
    fixture.principal.id,
    { commands: ['createWorkItem'] },
    fixture.expectedAccess.scope.role,
  );
  if (admitted === null || admitted === 'forbidden')
    throw new Error('fixture owner admission refused');
}
