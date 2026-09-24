import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
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
      subtrees: stores.subtrees,
      journal: stores.journal,
      broadcast,
      scheduler: fastScheduler,
      clock: clockOf({ now: () => 2, newId: () => `item-${String(++next)}` }),
    },
  };
}

const hostRequirements = () => {
  const { stores } = openMemorySource();
  return {
    workItemStore: DiBag.fromSyncFactory(() => stores.workItems),
    projectStore: DiBag.fromSyncFactory(() => stores.projects),
    estimateStore: DiBag.fromSyncFactory(() => stores.estimates),
    actualStore: DiBag.fromSyncFactory(() => stores.actuals),
    measureStore: DiBag.fromSyncFactory(() => stores.measures),
    progressStore: DiBag.fromSyncFactory(() => stores.progress),
    directoryStore: DiBag.fromSyncFactory(() => stores.directory),
    capacityStore: DiBag.fromSyncFactory(() => stores.capacity),
    priorityBandStore: DiBag.fromSyncFactory(() => stores.priorityBands),
    dependencyStore: DiBag.fromSyncFactory(() => stores.dependencies),
    subtreeStore: DiBag.fromSyncFactory(() => stores.subtrees),
    journalStore: DiBag.fromSyncFactory(() => stores.journal),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
    scheduler: DiBag.fromSyncFactory(() => fastScheduler),
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
    .installModule(workItemModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Work item module', () => {
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
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "workItemOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
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
      .installModule(workItemModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('workItems')).toThrow(
      `Cannot resolve "${WORK_ITEM_LABEL}/workItemOptions": dependency "clock" is not registered. Resolution path: workItems -> ${WORK_ITEM_LABEL}/workItemOptions -> clock.`,
    );
  });
});
