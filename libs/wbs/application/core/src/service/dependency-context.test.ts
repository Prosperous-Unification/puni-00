import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { expect, test } from 'bun:test';

import { servicesOver } from '../compose';
import type { DependencyContext } from '../ports/dependency-context';
import { withDependencyContext } from '../ports/dependency-context';
import { CREATOR_ADMISSION, NO_ADMISSION } from '../ports/edit-admission';
import { LEGACY_ACCESS } from '../ports/organization-access';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { createDependencyContext, createLocalDependencyContext } from './dependency-context';

async function seeded() {
  const source = openMemorySource();
  for (const projectId of ['a', 'b']) {
    await source.stores.projects.create(projectRow({ id: projectId, ownerId: 'actor' }), [], {
      at: 1,
      by: 'actor',
    });
    for (const suffix of ['1', '2'])
      await source.stores.workItems.insert(
        workItemRow({ id: `${projectId}${suffix}`, projectId, position: Number(suffix) * 10 }),
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
        await context.endpoints.readEndpoint({ scope: 'whole', projectId: 'a', workItemId: 'a1' }),
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
    { projectId: 'a', actorId: 'actor', access: LEGACY_ACCESS, admission: CREATOR_ADMISSION },
    () => {
      if (!observing) throw new Error('observation closed');
    },
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
  const service = (admission: typeof CREATOR_ADMISSION) =>
    servicesOver(source.stores, {
      dependencyContext: local,
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      admission,
    }).workItems;
  for (const projectId of ['a', 'b'])
    expect(
      await service(CREATOR_ADMISSION).addTypedDependency(projectId, 'actor', {
        predecessor: { projectId, scope: 'whole', workItemId: `${projectId}1` },
        successor: { projectId, scope: 'whole', workItemId: `${projectId}2` },
        type: 'FS',
      }),
    ).toMatchObject({ ok: true });
  await source.stores.typedDependencies.add(
    {
      id: 'external',
      projectId: 'b',
      predecessor: { projectId: 'a', scope: 'whole', workItemId: 'a1' },
      successor: { projectId: 'b', scope: 'whole', workItemId: 'b2' },
      type: 'FS',
    },
    { at: 2, by: 'actor' },
  );
  const input = {
    predecessor: { projectId: 'a', scope: 'whole' as const, workItemId: 'a2' },
    successor: { projectId: 'a', scope: 'whole' as const, workItemId: 'a1' },
    type: 'FS',
  };
  expect(await service(NO_ADMISSION).addTypedDependency('a', 'actor', input)).toEqual({
    ok: false,
    reason: 'forbidden',
  });
  await rejects(
    service(CREATOR_ADMISSION).addTypedDependency('a', 'actor', input),
    'external incidents',
  );
  await withDependencyContext(local, 'a', 'actor', async (context) => {
    await rejects(context.graph.findCycle('a'), 'external incidents');
  });
});

test('a local typed operation refuses a proposed foreign endpoint without relabelling its project', async () => {
  const source = await seeded();
  const graph = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    admission: CREATOR_ADMISSION,
  });
  expect(
    await graph.workItems.addTypedDependency('b', 'actor', {
      predecessor: { scope: 'whole', projectId: 'a', workItemId: 'a1' },
      successor: { scope: 'whole', projectId: 'b', workItemId: 'b1' },
      type: 'FS',
    }),
  ).toEqual({ ok: false, reason: 'forbidden' });
  expect(await source.stores.typedDependencies.listByProject('b')).toEqual([]);
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
          admission: CREATOR_ADMISSION,
        } as never),
    ).toThrow('external dependency authoring');
  }
});

test('actual service cannot borrow a bound context for another owner or actor', async () => {
  const source = await seeded();
  const opened = createDependencyContext(
    source.stores,
    { projectId: 'a', actorId: 'actor', access: LEGACY_ACCESS, admission: CREATOR_ADMISSION },
    () => undefined,
  );
  try {
    const service = servicesOver(source.stores, {
      dependencyContext: { kind: 'bound', context: opened.context },
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      admission: CREATOR_ADMISSION,
    }).workItems;
    for (const [projectId, actorId] of [
      ['a', 'rival'],
      ['b', 'actor'],
    ])
      await rejects(
        service.addTypedDependency(projectId, actorId, {
          predecessor: { projectId, scope: 'whole', workItemId: `${projectId}1` },
          successor: { projectId, scope: 'whole', workItemId: `${projectId}2` },
          type: 'FS',
        }),
        'owner or actor mismatch',
      );
    expect(await source.stores.typedDependencies.listByProject('a')).toEqual([]);
    expect(await source.stores.typedDependencies.listByProject('b')).toEqual([]);
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
      _projectId: string,
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
