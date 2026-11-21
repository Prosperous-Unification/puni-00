import { openMemorySource } from '@wbs/store-memory';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { createLegacyWorkPackageFixture } from '../../testing/legacy-work-package-fixture';
import { installWorkPackage } from './check';
import { WORK_PACKAGE_LABEL } from './contract';
import { workPackageModule } from './module';

const WORK_PACKAGE = 'work-package-1';
const OWNER = 'owner';
const PROJECT_ID = 'module-fixture-parent';

/**
 * One memory source holding one work package, and the requirements a settings
 * write needs, on a deployment that has an optimizer.
 */
async function seeded() {
  const { source } = await createLegacyWorkPackageFixture(OWNER, 'module-legacy', PROJECT_ID);
  await source.stores.workPackages.create(
    workPackageRow({ id: WORK_PACKAGE, projectId: PROJECT_ID }),
    [],
    {
      at: 1,
      by: OWNER,
    },
  );
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      workPackages: source.stores.workPackages,
      clock: clockOf({ now: () => 2, newId: () => 'unused' }),
      broadcast,
      optimizerAvailable: () => true,
      dependencyContext: createLocalDependencyContext(source.stores),
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    accessDecisions: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
    workPackageStore: DiBag.createProvider(() => source.stores.workPackages, {
      factoryReturnKind: 'sync-value',
    }),
    broadcast: DiBag.createProvider(() => recordingBroadcaster(), {
      factoryReturnKind: 'sync-value',
    }),
    optimizerAvailable: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
    dependencyContext: DiBag.createProvider(() => createLocalDependencyContext(source.stores), {
      factoryReturnKind: 'sync-value',
    }),
    beforeUpdate: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
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
    .withInstalledModules([workPackageModule])
    .withServices({
      ...hostRequirements(),
      clock: DiBag.createProvider(() => clockOf({ now: () => 0, newId: () => 'unused' }), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Work package module', () => {
  it('switches the optimizer on through the availability installWorkPackage wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { workPackages } = installWorkPackage(requirements);

    const updated = await workPackages.update(WORK_PACKAGE, OWNER, { optimizationEnabled: true });

    expect(updated).toMatchObject({ ok: true, value: { optimizationEnabled: true } });
    expect(broadcast.published.map((entry) => entry.event.type)).toEqual([
      'work_package_settings_changed',
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `WorkPackageExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installWorkPackage(requirements);

    expect(Object.keys(exposed)).toEqual(['workPackages']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('workPackageOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "workPackageOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${WORK_PACKAGE_LABEL}/workPackageOptions`,
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
      .withInstalledModules([workPackageModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('workPackages')).toThrow(
      `Cannot resolve "${WORK_PACKAGE_LABEL}/workPackageOptions": dependency "clock" is not registered. Resolution path: workPackages -> ${WORK_PACKAGE_LABEL}/workPackageOptions -> clock.`,
    );
  });

  it('refuses a host without its dependency graph guard', () => {
    const source = openMemorySource();
    const partial = DiBag.createBuilder()
      .withInstalledModules([workPackageModule])
      .withServices({
        accessDecisions: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
        workPackageStore: DiBag.createProvider(() => source.stores.workPackages, {
          factoryReturnKind: 'sync-value',
        }),
        clock: DiBag.createProvider(() => clockOf({ now: () => 0, newId: () => 'unused' }), {
          factoryReturnKind: 'sync-value',
        }),
        broadcast: DiBag.createProvider(() => recordingBroadcaster(), {
          factoryReturnKind: 'sync-value',
        }),
        optimizerAvailable: DiBag.createProvider(() => undefined, {
          factoryReturnKind: 'sync-value',
        }),
      }) as unknown as { buildContainer: () => { resolve: (key: string) => unknown } };
    const host = partial.buildContainer();

    // Proof: removing dependencyContext from both module provider inputs and options made this
    // assertion fail (10 pass, 2 fail across the two module suites): resolution did not refuse it.
    expect(() => host.resolve('workPackages')).toThrow(
      'dependency "dependencyContext" is not registered',
    );
  });
});
