import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installWorkItem } from './check';
import { WORK_ITEM_LABEL } from './contract';
import { workItemModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/** One memory source holding one project, and the fifteen requirements a work item write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  const { stores } = source;
  let next = 0;
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      workItems: stores.workItems,
      projects: stores.projects,
      estimates: stores.estimates,
      actuals: stores.actuals,
      measures: stores.measures,
      progress: stores.progress,
      directory: stores.directory,
      capacity: stores.capacity,
      priorityBands: stores.priorityBands,
      dependencies: stores.dependencies,
      typedDependencies: stores.typedDependencies,
      subtrees: stores.subtrees,
      journal: stores.journal,
      broadcast,
      admission: CREATOR_ADMISSION,
      scheduler: fastScheduler,
      clock: clockOf({ now: () => 2, newId: () => `item-${String(++next)}` }),
    },
  };
}

const hostRequirements = () => {
  const { stores } = openMemorySource();
  return {
    workItemStore: DiBag.createProvider(() => stores.workItems, {
      factoryReturnKind: 'sync-value',
    }),
    livePlans: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
    projectStore: DiBag.createProvider(() => stores.projects, { factoryReturnKind: 'sync-value' }),
    estimateStore: DiBag.createProvider(() => stores.estimates, {
      factoryReturnKind: 'sync-value',
    }),
    actualStore: DiBag.createProvider(() => stores.actuals, { factoryReturnKind: 'sync-value' }),
    measureStore: DiBag.createProvider(() => stores.measures, { factoryReturnKind: 'sync-value' }),
    progressStore: DiBag.createProvider(() => stores.progress, { factoryReturnKind: 'sync-value' }),
    directoryStore: DiBag.createProvider(() => stores.directory, {
      factoryReturnKind: 'sync-value',
    }),
    capacityStore: DiBag.createProvider(() => stores.capacity, { factoryReturnKind: 'sync-value' }),
    priorityBandStore: DiBag.createProvider(() => stores.priorityBands, {
      factoryReturnKind: 'sync-value',
    }),
    typedDependencyStore: DiBag.createProvider(() => stores.typedDependencies, {
      factoryReturnKind: 'sync-value',
    }),
    dependencyStore: DiBag.createProvider(() => stores.dependencies, {
      factoryReturnKind: 'sync-value',
    }),
    subtreeStore: DiBag.createProvider(() => stores.subtrees, { factoryReturnKind: 'sync-value' }),
    journalStore: DiBag.createProvider(() => stores.journal, { factoryReturnKind: 'sync-value' }),
    broadcast: DiBag.createProvider(() => recordingBroadcaster(), {
      factoryReturnKind: 'sync-value',
    }),
    editAdmission: DiBag.createProvider(() => CREATOR_ADMISSION, {
      factoryReturnKind: 'sync-value',
    }),
    scheduler: DiBag.createProvider(() => fastScheduler, { factoryReturnKind: 'sync-value' }),
    schedulerMode: DiBag.createProvider(() => 'capture' as const, {
      factoryReturnKind: 'sync-value',
    }),
  };
};

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([workItemModule])
    .withServices({
      ...hostRequirements(),
      clock: DiBag.createProvider(() => clockOf({ now: () => 0, newId: () => 'unused' }), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Work item module', () => {
  it('refuses an SF write at the application boundary', async () => {
    const { requirements } = await seeded();
    const { workItems } = installWorkItem(requirements);
    const first = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'A',
    });
    const second = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'B',
    });
    if (!first.ok || !second.ok) throw new Error('fixture work items were refused');
    const proposed = await workItems.addTypedDependency(PROJECT, OWNER, {
      predecessor: { scope: 'whole', workItemId: first.value.id },
      successor: { scope: 'whole', workItemId: second.value.id },
      type: 'SF',
    });
    expect(proposed).toEqual({ ok: false, reason: 'unsupported_relationship_type' });
  });

  it('refuses a direct legacy write that closes a typed SS cycle', async () => {
    const { requirements } = await seeded();
    const { workItems } = installWorkItem(requirements);
    const first = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'A',
    });
    const second = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'B',
    });
    if (!first.ok || !second.ok) throw new Error('fixture work items were refused');
    const typed = await workItems.addTypedDependency(PROJECT, OWNER, {
      predecessor: { scope: 'whole', workItemId: first.value.id },
      successor: { scope: 'whole', workItemId: second.value.id },
      type: 'SS',
    });
    expect(typed.ok).toBe(true);
    const legacy = await workItems.addDependency(first.value.id, OWNER, second.value.id);
    expect(legacy).toEqual({ ok: false, reason: 'cycle' });
    expect(await requirements.dependencies.listByProject(PROJECT)).toEqual([]);
  });

  it('announces a created work item through the broadcaster installWorkItem wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { workItems } = installWorkItem(requirements);

    const created = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'Scope',
    });

    expect(created).toMatchObject({ ok: true, value: { id: 'item-1', name: 'Scope' } });
    expect(
      broadcast.published.map(({ event }) =>
        event.type === 'tree_replaced' ? event.workItems.map((row) => row.name) : event.type,
      ),
    ).toEqual([['Scope']]);
  });

  // Proof: handing the resource `{ admits: () => true }` instead of the
  // supplied admission made this test receive `ok: true` (5 pass, 1 fail);
  // watched 2026-09-28.
  it('asks the admission installWorkItem wires before a work item write', async () => {
    const { broadcast, requirements } = await seeded();
    const { workItems } = installWorkItem({ ...requirements, admission: { admits: () => false } });

    const created = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'Scope',
    });

    expect(created).toEqual({ ok: false, reason: 'forbidden' });
    expect(broadcast.published).toEqual([]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `WorkItemExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installWorkItem(requirements);

    expect(Object.keys(exposed)).toEqual(['workItems']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('workItemOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "workItemOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${WORK_ITEM_LABEL}/workItemOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .withInstalledModules([workItemModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('workItems')).toThrow(
      `Cannot resolve "${WORK_ITEM_LABEL}/workItemOptions": dependency "clock" is not registered. Resolution path: workItems -> ${WORK_ITEM_LABEL}/workItemOptions -> clock.`,
    );
  });
});
