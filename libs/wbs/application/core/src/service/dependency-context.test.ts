import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { servicesOver } from '../compose';
import type { DependencyContext } from '../ports/dependency-context';
import { withDependencyContext } from '../ports/dependency-context';
import { LEGACY_EDIT_ADMISSION, NO_ADMISSION } from '../ports/edit-admission';
import { LEGACY_ACCESS } from '../ports/organization-access';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { seedLegacyPackageParent } from '../testing/legacy-package-source-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { createDependencyContext, createLocalDependencyContext } from './dependency-context';

async function seeded() {
  const parentFixture = openMemorySourceFixture();
  const source = parentFixture.source;
  await source.stores.users.create(
    { id: 'actor', username: 'actor', passwordHash: null, createdAt: 1 },
    { at: 1, by: 'actor' },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: 'actor',
  });
  for (const workPackageId of ['a', 'b']) {
    await source.stores.workPackages.create(
      workPackageRow({ id: workPackageId, projectId: 'fixture-project' }),
      [],
      {
        at: 1,
        by: 'actor',
      },
    );
    for (const suffix of ['1', '2'])
      await source.stores.workItems.insert(
        workItemRow({
          id: `${workPackageId}${suffix}`,
          workPackageId,
          position: Number(suffix) * 10,
        }),
        [],
        { at: 1, by: 'actor' },
      );
  }
  return source;
}

async function rejects(call: Promise<unknown>, message: string) {
  const failure: unknown = await call.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : failure).toContain(message);
}

test('closes each local operation on success, refusal and throw without reviving old contexts', async () => {
  const source = await seeded();
  const local = createLocalDependencyContext(source.stores);
  const retained: DependencyContext[] = [];
  for (const end of ['success', 'refusal', 'throw']) {
    const operation = withDependencyContext(local, 'a', 'actor', async (context) => {
      retained.push(context);
      expect(
        await context.endpoints.readEndpoint({
          scope: 'whole',
          workPackageId: 'a',
          workItemId: 'a1',
        }),
      ).toMatchObject({ ok: true });
      if (end === 'throw') throw new Error('controlled test failure');
      return end;
    });
    if (end === 'throw') await rejects(operation, 'controlled test failure');
    else expect(await operation).toBe(end);
    for (const context of retained) {
      expect(() => {
        context.assertUsable('a', 'actor');
      }).toThrow('closed');
      await rejects(context.graph.findCycle('a'), 'closed');
      await rejects(context.endpoints.readRevisions([]), 'closed');
    }
  }
});

test('bound contexts reject a different owner, actor and closed observation', async () => {
  const source = await seeded();
  let observing = true;
  const opened = createDependencyContext(
    source.stores,
    {
      workPackageId: 'a',
      actorId: 'actor',
      access: LEGACY_ACCESS,
      admission: LEGACY_EDIT_ADMISSION,
    },
    () => {
      if (!observing) throw new Error('observation closed');
    },
    { kind: 'raw' },
  );
  const bound = { kind: 'bound' as const, context: opened.context };
  await rejects(
    withDependencyContext(bound, 'b', 'actor', () => Promise.resolve(undefined)),
    'owner or actor',
  );
  await rejects(
    withDependencyContext(bound, 'a', 'rival', () => Promise.resolve(undefined)),
    'owner or actor',
  );
  observing = false;
  await rejects(opened.context.graph.findCycle('a'), 'observation closed');
  await rejects(opened.context.endpoints.readRevisions([]), 'observation closed');
});

test('local service owner admission precedes factory access, and outgoing foreign incidents fail closed', async () => {
  const source = await seeded();
  const local = createLocalDependencyContext(source.stores);
  const service = (admission: typeof LEGACY_EDIT_ADMISSION) =>
    servicesOver(source.stores, {
      dependencyContext: local,
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      admission,
    }).workItems;
  for (const workPackageId of ['a', 'b'])
    expect(
      await service(LEGACY_EDIT_ADMISSION).addTypedDependency(workPackageId, 'actor', {
        predecessor: { workPackageId, scope: 'whole', workItemId: `${workPackageId}1` },
        successor: { workPackageId, scope: 'whole', workItemId: `${workPackageId}2` },
        type: 'FS',
      }),
    ).toMatchObject({ ok: true });
  await source.stores.typedDependencies.add(
    {
      id: 'external',
      workPackageId: 'b',
      predecessor: { workPackageId: 'a', scope: 'whole', workItemId: 'a1' },
      successor: { workPackageId: 'b', scope: 'whole', workItemId: 'b2' },
      type: 'FS',
    },
    { at: 2, by: 'actor' },
  );
  const input = {
    predecessor: { workPackageId: 'a', scope: 'whole' as const, workItemId: 'a2' },
    successor: { workPackageId: 'a', scope: 'whole' as const, workItemId: 'a1' },
    type: 'FS',
  };
  expect(await service(NO_ADMISSION).addTypedDependency('a', 'actor', input)).toEqual({
    ok: false,
    reason: 'forbidden',
  });
  await rejects(
    service(LEGACY_EDIT_ADMISSION).addTypedDependency('a', 'actor', input),
    'external incidents',
  );
  await withDependencyContext(local, 'a', 'actor', async (context) => {
    await rejects(context.graph.findCycle('a'), 'external incidents');
  });
});

test('a local typed operation refuses a proposed foreign endpoint without relabelling its work package', async () => {
  const source = await seeded();
  const graph = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    admission: LEGACY_EDIT_ADMISSION,
  });
  expect(
    await graph.workItems.addTypedDependency('b', 'actor', {
      predecessor: { scope: 'whole', workPackageId: 'a', workItemId: 'a1' },
      successor: { scope: 'whole', workPackageId: 'b', workItemId: 'b1' },
      type: 'FS',
    }),
  ).toEqual({ ok: false, reason: 'forbidden' });
  expect(await source.stores.typedDependencies.listByWorkPackage('b')).toEqual([]);
});

test('actual typed service rejects an unknown or missing required authoring capability', async () => {
  const { WorkItemService } = await import('../module/work-item/work-item.resource');
  const source = await seeded();
  for (const capability of [undefined, null, { state: 'unknown' }]) {
    expect(
      () =>
        new WorkItemService({
          ...source.stores,
          dependencyContext: createLocalDependencyContext(source.stores),
          externalDependencyAuthoring: capability,
          clock: testClock,
          broadcast: recordingBroadcaster(),
          scheduler: fastScheduler,
          admission: LEGACY_EDIT_ADMISSION,
        } as never),
    ).toThrow('external dependency authoring');
  }
});

test('actual service cannot borrow a bound context for another owner or actor', async () => {
  const source = await seeded();
  const opened = createDependencyContext(
    source.stores,
    {
      workPackageId: 'a',
      actorId: 'actor',
      access: LEGACY_ACCESS,
      admission: LEGACY_EDIT_ADMISSION,
    },
    () => undefined,
    { kind: 'raw' },
  );
  try {
    const service = servicesOver(source.stores, {
      dependencyContext: { kind: 'bound', context: opened.context },
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      admission: LEGACY_EDIT_ADMISSION,
    }).workItems;
    for (const [workPackageId, actorId] of [
      ['a', 'rival'],
      ['b', 'actor'],
    ])
      await rejects(
        service.addTypedDependency(workPackageId, actorId, {
          predecessor: { workPackageId, scope: 'whole', workItemId: `${workPackageId}1` },
          successor: { workPackageId, scope: 'whole', workItemId: `${workPackageId}2` },
          type: 'FS',
        }),
        'owner or actor mismatch',
      );
    expect(await source.stores.typedDependencies.listByWorkPackage('a')).toEqual([]);
    expect(await source.stores.typedDependencies.listByWorkPackage('b')).toEqual([]);
  } finally {
    opened.close();
  }
});

test('runner-facing graph inspection requires owner admission before opening local dependency evidence', async () => {
  const source = await seeded();
  let called = false;
  const dependencyContext = {
    kind: 'local-only' as const,
    withContext: <T>(
      _work_packageId: string,
      _actorId: string,
      _act: (context: DependencyContext) => Promise<T>,
    ): Promise<T> => {
      called = true;
      return Promise.reject(new Error('unadmitted graph reached dependency evidence'));
    },
  };
  const service = servicesOver(source.stores, {
    dependencyContext,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    admission: NO_ADMISSION,
  }).workItems;
  await rejects(
    service.findDependencyCycle('a', 'actor'),
    'dependency graph owner is not admitted',
  );
  expect(called).toBe(false);
});

test('incident transition enforces owner actor and observation lifetime around its genuine suspended incident read', async () => {
  const source = await seeded();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const readEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const readRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  const opened = createDependencyContext(
    {
      ...source.stores,
      typedDependencies: {
        ...source.stores.typedDependencies,
        listIncident: async (workPackages) => {
          const relationships = await source.stores.typedDependencies.listIncident(workPackages);
          if (entered === undefined) throw new Error('fixture continuation missing');
          entered();
          await readRelease;
          return relationships;
        },
      },
    },
    {
      workPackageId: 'a',
      actorId: 'actor',
      access: LEGACY_ACCESS,
      admission: LEGACY_EDIT_ADMISSION,
    },
    () => undefined,
    { kind: 'raw' },
  );
  let writes = 0;
  const request = { kind: 'fresh' as const, fromWorkItemId: 'a1', toWorkItemId: 'child' };
  for (const [owner, actor] of [
    ['b', 'actor'],
    ['a', 'rival'],
  ])
    await rejects(
      opened.context.incidents.run(owner, actor, request, { at: 2, by: actor }, () => {
        writes++;
        return Promise.resolve({ ok: true });
      }),
      'owner or actor',
    );
  const pending = opened.context.incidents.run(
    'a',
    'actor',
    request,
    { at: 2, by: 'actor' },
    () => {
      writes++;
      return Promise.resolve({ ok: true });
    },
  );
  await readEntered;
  opened.close();
  if (release === undefined) throw new Error('fixture release missing');
  release();
  await rejects(pending, 'closed');
  expect(writes).toBe(0);
  await rejects(
    opened.context.incidents.run('a', 'actor', request, { at: 2, by: 'actor' }, () =>
      Promise.resolve({
        ok: true,
      }),
    ),
    'closed',
  );
});

for (const retention of [
  undefined,
  null,
  { kind: 'unknown' },
  { kind: 'owner' },
  { kind: 'owner', refresh: 42 },
])
  test(`required incident retention refuses malformed construction ${JSON.stringify(retention)}`, async () => {
    const source = await seeded();
    expect(() =>
      createDependencyContext(
        source.stores,
        {
          workPackageId: 'a',
          actorId: 'actor',
          access: LEGACY_ACCESS,
          admission: LEGACY_EDIT_ADMISSION,
        },
        () => undefined,
        retention as never,
      ),
    ).toThrow('incident retention');
  });

for (const missing of ['all', 'capture', 'detach', 'restore'] as const)
  test(`admitted incident persistence requires ${missing} at construction`, async () => {
    const source = await seeded();
    const persistence =
      missing === 'all'
        ? undefined
        : { ...source.stores.typedDependencies.incidents, [missing]: undefined };
    expect(() =>
      createDependencyContext(
        {
          ...source.stores,
          typedDependencies: { ...source.stores.typedDependencies, incidents: persistence },
        } as never,
        {
          workPackageId: 'a',
          actorId: 'actor',
          access: LEGACY_ACCESS,
          admission: LEGACY_EDIT_ADMISSION,
        },
        () => undefined,
        { kind: 'raw' },
      ),
    ).toThrow('incident persistence is missing');
  });

for (const phase of ['before-call', 'ownership-read', 'grant-read'] as const) {
  test('refuses typed write authorization after context closes at ' + phase, async () => {
    const fixture = openMemorySourceFixture(),
      source = fixture.source;
    fixture.addOrganization('org', { legacy: false });
    await source.stores.users.create(
      { id: 'actor', username: 'Actor', passwordHash: null, createdAt: 1 },
      { at: 1, by: 'actor' },
    );
    fixture.setPackageCreationMembers('org', ['actor']);
    fixture.seedPackageParent({
      spaceId: null,
      spacePosition: null,
      id: 'fixture-project',
      organizationId: 'org',
      name: 'Fixture project',
      createdBy: 'actor',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
    });
    for (const id of ['a', 'b'])
      await source.stores.workPackages.createInOrganization(
        workPackageRow({ id, projectId: 'fixture-project' }),
        [],
        { at: 1, by: 'actor' },
        'org',
        { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
      );
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    let ownershipReads = 0;
    let grantReads = 0;
    const opened = createDependencyContext(
      {
        ...source.stores,
        workPackages: {
          ...source.stores.workPackages,
          findInOrganization: async (id, organizationId) => {
            return source.stores.workPackages.findInOrganization(id, organizationId);
          },
        },
        accessDecisions: {
          packageTargetOf: async (id, organizationId) => {
            ownershipReads += 1;
            if (phase === 'ownership-read') {
              entered.resolve(undefined);
              await release.promise;
            }
            return source.stores.settings.readTarget({ level: 'work_package', id }, organizationId);
          },
          effectiveRoleAt: async (principal, target) => {
            if (
              principal.id !== 'actor' ||
              target.kind !== 'work_package' ||
              target.chain.organizationId !== 'org'
            )
              throw new Error('unexpected grant subject/scope');
            grantReads += 1;
            if (phase === 'grant-read') {
              entered.resolve(undefined);
              await release.promise;
            }
            return { permissions: new Set(['package.read', 'package.write'] as const), via: [] };
          },
          readablePackageIds: () => Promise.reject(new Error('unexpected grant listing')),
        },
      },
      {
        workPackageId: 'a',
        actorId: 'actor',
        admission: LEGACY_EDIT_ADMISSION,
        access: {
          kind: 'scoped',
          principal: { id: 'actor' },
          scope: { userId: 'actor', organizationId: 'org', cap: null },
        },
      },
      () => undefined,
      { kind: 'raw' },
    );
    const capability = opened.context.authorizeTypedWrites;
    if (capability === undefined) throw new Error('actual factory omitted write authorization');
    if (phase === 'before-call') opened.close();
    const pending = capability([
      {
        id: 'relation',
        workPackageId: 'b',
        type: 'FS',
        predecessor: { workPackageId: 'a', scope: 'whole', workItemId: 'a1' },
        successor: { workPackageId: 'b', scope: 'whole', workItemId: 'b1' },
      },
    ]);
    if (phase !== 'before-call') {
      await entered.promise;
      opened.close();
      release.resolve(undefined);
    }
    await rejects(pending, 'closed');
    if (phase === 'before-call') expect(ownershipReads).toBe(0);
    if (phase === 'ownership-read') expect(grantReads).toBe(0);
    if (phase === 'grant-read') expect(ownershipReads).toBe(1);
    await source.close();
  });
}
