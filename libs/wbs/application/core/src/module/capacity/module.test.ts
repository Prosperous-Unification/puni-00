import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installCapacity } from './check';
import { CAPACITY_LABEL } from './contract';
import { capacityModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';
const TEAM = 'team-1';

/** One memory source holding one project and one team, and the requirements a capacity write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  await source.stores.directory.addTeam({ id: TEAM, name: 'Platform' }, { at: 1, by: OWNER });
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      capacity: source.stores.capacity,
      clock: clockOf({ now: () => 2, newId: () => 'unused' }),
      broadcast,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.createProvider(() => source.stores.projects, {
      factoryReturnKind: 'sync-value',
    }),
    capacityStore: DiBag.createProvider(() => source.stores.capacity, {
      factoryReturnKind: 'sync-value',
    }),
    broadcast: DiBag.createProvider(() => recordingBroadcaster(), {
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
    .withInstalledModules([capacityModule])
    .withServices({
      ...hostRequirements(),
      clock: DiBag.createProvider(() => clockOf({ now: () => 0, newId: () => 'unused' }), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Capacity module', () => {
  it('announces a capacity write through the broadcaster installCapacity wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { capacity } = installCapacity(requirements);

    const written = await capacity.set(PROJECT, OWNER, TEAM, 3);

    expect(written).toEqual({ ok: true, value: [{ serviceTeamId: TEAM, size: 3 }] });
    expect(broadcast.published).toEqual([
      { projectId: PROJECT, event: { type: 'capacity_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `CapacityExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installCapacity(requirements);

    expect(Object.keys(exposed)).toEqual(['capacity']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('capacityOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "capacityOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${CAPACITY_LABEL}/capacityOptions`,
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
      .withInstalledModules([capacityModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('capacity')).toThrow(
      `Cannot resolve "${CAPACITY_LABEL}/capacityOptions": dependency "clock" is not registered. Resolution path: capacity -> ${CAPACITY_LABEL}/capacityOptions -> clock.`,
    );
  });
});
