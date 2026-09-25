import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Digest } from '../../ports/runtime';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installSavedPlans } from './check';
import { SAVED_PLANS_LABEL } from './contract';
import { savedPlansModule } from './module';
import { savePlan } from './save-plan';

const STAMP_AT = 1_757_851_200_000;

/** Deterministic and non-cryptographic: these tests are about the graph, not SHA-256. */
const lengthDigest: Digest = {
  sha256: (bytes) => Promise.resolve(`length:${String(bytes.length)}`),
};

const owner = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };

/** One memory source, a project in it, and the requirements that save it. */
async function seeded() {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `id-${String(++next)}` });
  const { projects } = servicesOver(source.stores, {
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const created = await projects.create('Plan', owner.id);
  return {
    projects,
    projectId: created.project.id,
    requirements: {
      digest: lengthDigest,
      capture: source.history.savedPlanCapture,
      plans: source.history.savedPlans,
      scheduler: fastScheduler,
      newId: () => clock.newId(),
      now: () => Math.floor(clock.now() / 1_000),
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    digest: DiBag.createProvider(() => lengthDigest, { factoryReturnKind: 'sync-value' }),
    capture: DiBag.createProvider(() => source.history.savedPlanCapture, {
      factoryReturnKind: 'sync-value',
    }),
    plans: DiBag.createProvider(() => source.history.savedPlans, {
      factoryReturnKind: 'sync-value',
    }),
    scheduler: DiBag.createProvider(() => fastScheduler, { factoryReturnKind: 'sync-value' }),
    newId: DiBag.createProvider(() => () => 'id', { factoryReturnKind: 'sync-value' }),
    now: DiBag.createProvider(() => () => STAMP_AT / 1_000, { factoryReturnKind: 'sync-value' }),
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
    .withInstalledModules([savedPlansModule])
    .withServices({
      ...hostRequirements(),
      quota: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();

describe('the Saved plans module', () => {
  it('saves and reads back a plan over the graph installSavedPlans wires', async () => {
    const { projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);

    const saved = await savedPlans.save({
      projectId,
      name: 'Baseline',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error(`save answered ${saved.outcome}`);

    expect(await savedPlans.read(saved.record.id)).toHaveProperty('outcome', 'read');
  });

  it('passes a supplied quota through to the installed feature', async () => {
    const { projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans({
      ...requirements,
      quota: {
        mostBytesPerBody: 1024 * 1024,
        mostPlansPerProject: 1,
        mostBytesPerProject: 1024 * 1024,
      },
    });
    const request = { projectId, createdBy: owner.username, createdById: owner.id };

    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'saved');
    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'refused');
  });

  it('saves and announces through savePlan over the installed feature', async () => {
    const { projects, projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const announcements = recordingBroadcaster();

    const outcome = await savePlan(
      { projects, plans: savedPlans, announcements },
      { projectId, actor: owner, name: 'Announced' },
    );

    expect(outcome).toHaveProperty('outcome', 'saved');
    expect(announcements.published).toEqual([
      { projectId, event: { type: 'saved_plans_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SavedPlansExports`, so only
   * enumerating the returned surface catches a leak the type checker would
   * not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installSavedPlans(requirements);

    expect(Object.keys(exposed)).toEqual(['savedPlans']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('savedPlanOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "savedPlanOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${SAVED_PLANS_LABEL}/savedPlanOptions`,
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
      .withInstalledModules([savedPlansModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('savedPlans')).toThrow(
      `Cannot resolve "${SAVED_PLANS_LABEL}/savedPlanOptions": dependency "quota" is not registered. Resolution path: savedPlans -> ${SAVED_PLANS_LABEL}/savedPlanOptions -> quota.`,
    );
  });
});
