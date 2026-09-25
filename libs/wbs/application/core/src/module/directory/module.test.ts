import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installDirectory } from './check';
import { DIRECTORY_LABEL } from './contract';
import { directoryModule } from './module';

const ACTOR = 'owner';

/** One memory source, and the requirements a directory write needs. */
function seeded() {
  const source = openMemorySource();
  let next = 0;
  return {
    requirements: {
      directory: source.stores.directory,
      broadcast: recordingBroadcaster(),
      clock: clockOf({ now: () => 2, newId: () => `team-${String(++next)}` }),
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    directoryStore: DiBag.createProvider(() => source.stores.directory, {
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
    .withInstalledModules([directoryModule])
    .withServices({
      ...hostRequirements(),
      clock: DiBag.createProvider(() => clockOf({ now: () => 0, newId: () => 'unused' }), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Directory module', () => {
  it('names a new team with the clock installDirectory wires', async () => {
    const { requirements } = seeded();
    const { directory } = installDirectory(requirements);

    const team = await directory.addTeam(ACTOR, ' Platform ');

    expect(team).toEqual({ id: 'team-1', name: 'Platform' });
    expect((await directory.listTeams()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'team-1', name: 'Platform' },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `DirectoryExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const { requirements } = seeded();
    const exposed: object = installDirectory(requirements);

    expect(Object.keys(exposed)).toEqual(['directory']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('directoryOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "directoryOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${DIRECTORY_LABEL}/directoryOptions`,
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
      .withInstalledModules([directoryModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('directory')).toThrow(
      `Cannot resolve "${DIRECTORY_LABEL}/directoryOptions": dependency "clock" is not registered. Resolution path: directory -> ${DIRECTORY_LABEL}/directoryOptions -> clock.`,
    );
  });
});
