import { defaultSavedPlanName } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { expectCreated } from '../../testing/expect-created';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installSavedPlans } from './check';
import { SAVED_PLANS_LABEL } from './contract';
import { savedPlansModule } from './module';
import { SavedPlanWriteError, savePlan } from './save-plan';
import { UnknownSavedPlanBodyVersionError } from './saved-plan-integrity';

const STAMP_AT = 1_757_851_200_000;

/** Deterministic and non-cryptographic: these tests are about the graph, not SHA-256. */
const lengthDigest: Digest = {
  sha256: (bytes) => Promise.resolve(`length:${String(bytes.length)}`),
};

const owner = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };

/** One memory source, a work package in it, and the requirements that save it. */
async function seeded() {
  const parentFixture = openMemorySourceFixture();
  const source = parentFixture.source;
  await source.stores.users.create(
    { id: owner.id, username: owner.id, passwordHash: null, createdAt: 1 },
    { at: 1, by: owner.id },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: owner.id,
  });
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `id-${String(++next)}` });
  const { workPackages } = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: LEGACY_EDIT_ADMISSION,
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const created = expectCreated(await workPackages.create('Plan', 'fixture-project', owner.id));
  return {
    workPackages,
    workPackageId: created.workPackage.id,
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
    captureSharedPlan: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
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
  it('observed save preserves clock failure classification before any observation', async () => {
    const { workPackageId, requirements } = await seeded();
    const failure = new UnknownSavedPlanBodyVersionError('clock', 'input', 99, [1]);
    const { savedPlans } = installSavedPlans({
      ...requirements,
      now: () => {
        throw failure;
      },
    });
    let captures = 0;
    let thrown: unknown;
    try {
      await savedPlans.saveObserved(
        { workPackageId, actor: owner, access: LEGACY_ACCESS },
        {
          captureSavedPlan: () => {
            captures++;
            return Promise.reject(Error('clock failure reached observation'));
          },
        },
      );
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown).toBeInstanceOf(SavedPlanWriteError);
    if (!(thrown instanceof SavedPlanWriteError))
      throw Error('clock failure escaped its named boundary');
    expect(thrown.writeCause).toBe(failure);
    expect(captures).toBe(0);
    expect(await requirements.plans.listOf(workPackageId)).toEqual([]);
  });
  it('observed save stamps before acquisition and persists completed evidence without recapture', async () => {
    const { workPackageId, requirements } = await seeded();
    const reads = await requirements.capture.readPlanInput(workPackageId);
    if (reads === null) throw Error('observed save fixture requires captured input');
    let timestamp = STAMP_AT / 1_000;
    const { savedPlans } = installSavedPlans({
      ...requirements,
      now: () => timestamp,
      capture: {
        readPlanInput: () => Promise.reject(Error('observed save reacquired local input')),
      },
      captureSharedPlan: () => Promise.reject(Error('observed save reacquired shared input')),
      scheduler: {
        read: () => {
          throw Error('observed save rescheduled completed input');
        },
        supports: () => {
          throw Error('observed save consulted live engine');
        },
        readResolvedFast: () => {
          throw Error('observed save reran Fast');
        },
      },
    });
    let captures = 0;
    const saved = await savedPlans.saveObserved(
      { workPackageId, actor: owner, access: LEGACY_ACCESS },
      {
        captureSavedPlan: (caller, id) => {
          expect(caller).toEqual({
            kind: 'human',
            principal: owner,
            expectedAccess: LEGACY_ACCESS,
          });
          expect(id).toBe(workPackageId);
          captures++;
          timestamp += 3600;
          return Promise.resolve({
            ok: true,
            value: {
              kind: 'captured',
              access: LEGACY_ACCESS,
              captured: { kind: 'local', reads, scheduled: { kind: 'cycle' } },
            },
          });
        },
      },
    );
    expect(saved).toMatchObject({
      outcome: 'saved',
      record: {
        createdAt: STAMP_AT / 1_000,
        name: defaultSavedPlanName(STAMP_AT / 1_000),
        schedule: { present: false, absentReason: 'infeasible' },
      },
    });
    expect(captures).toBe(1);
    expect(await requirements.plans.listOf(workPackageId)).toHaveLength(1);
  });

  it('observed save retains complete policy refusals and never reaches persistence', async () => {
    const { workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const refusal = {
      ok: false,
      refusal: 'sso_required',
      organizationId: 'org',
      login: 'sso',
      link: true,
    } as const;
    expect(
      await savedPlans.saveObserved(
        { workPackageId, actor: owner, access: LEGACY_ACCESS },
        { captureSavedPlan: () => Promise.resolve(refusal) },
      ),
    ).toEqual({ outcome: 'access_refused', refusal });
    expect(await requirements.plans.listOf(workPackageId)).toEqual([]);
  });

  it('observed save leaves source version-shaped failures outside its write classifier', async () => {
    const { workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const failure = new UnknownSavedPlanBodyVersionError('source', 'input', 99, [1]);
    let observed: unknown;
    try {
      await savedPlans.saveObserved(
        { workPackageId, actor: owner, access: LEGACY_ACCESS },
        { captureSavedPlan: () => Promise.reject(failure) },
      );
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBe(failure);
    expect(await requirements.plans.listOf(workPackageId)).toEqual([]);
  });

  it('projects actual current parent into detached comparison evidence', async () => {
    const { workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const current = await savedPlans.workPackageCurrentPlan(workPackageId);
    expect(current).toMatchObject({
      inputEvidence: {
        parent: { kind: 'recorded', projectId: 'fixture-project' },
        dependencies: { kind: 'recorded', history: { kind: 'local' } },
      },
    });
    if (current === null) throw Error('seeded current comparison absent');
    expect(current.input.workPackage).not.toHaveProperty('projectId');
    expect(current.input.workPackage).not.toHaveProperty('ownerId');
    expect(current.input).not.toHaveProperty('schemaVersion');
  });

  it('saves and reads back a plan over the graph installSavedPlans wires', async () => {
    const { workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);

    const saved = await savedPlans.save({
      workPackageId,
      name: 'Baseline',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error(`save answered ${saved.outcome}`);

    expect(await savedPlans.read(saved.record.id)).toHaveProperty('outcome', 'read');
  });

  it('refuses installed shared save and current before capture without admitted access', async () => {
    const { workPackageId, requirements } = await seeded();
    let sharedReads = 0;
    let localReads = 0;
    const savedPlans = installSavedPlans({
      ...requirements,
      capture: {
        readPlanInput: async (id) => {
          localReads += 1;
          return requirements.capture.readPlanInput(id);
        },
      },
      captureSharedPlan: () => {
        sharedReads += 1;
        return Promise.resolve({ kind: 'isolated' as const });
      },
    }).savedPlans;
    const savedFailure = await savedPlans
      .save({ workPackageId, createdBy: owner.username, createdById: owner.id })
      .then(
        () => null,
        (failure: unknown) => failure,
      );
    const currentFailure = await savedPlans.workPackageCurrentPlan(workPackageId).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(sharedReads).toBe(0);
    expect(localReads).toBe(0);
    expect(await requirements.plans.listOf(workPackageId)).toEqual([]);
    expect(savedFailure).toBeInstanceOf(Error);
    expect(currentFailure).toBeInstanceOf(Error);
    expect((savedFailure as Error).message).toBe(
      'installed shared saved-plan capture requires admitted human access',
    );
    expect((currentFailure as Error).message).toBe(
      'installed shared saved-plan capture requires admitted human access',
    );
  });

  it('passes a supplied quota through to the installed feature', async () => {
    const { workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans({
      ...requirements,
      quota: {
        mostBytesPerBody: 1024 * 1024,
        mostPlansPerWorkPackage: 1,
        mostBytesPerWorkPackage: 1024 * 1024,
      },
    });
    const request = { workPackageId, createdBy: owner.username, createdById: owner.id };

    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'saved');
    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'refused');
  });

  it('saves and announces through savePlan over the installed feature', async () => {
    const { workPackages, workPackageId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const announcements = recordingBroadcaster();

    const outcome = await savePlan(
      { workPackages, plans: savedPlans, announcements },
      { workPackageId, actor: owner, name: 'Announced', access: LEGACY_ACCESS },
    );

    expect(outcome).toHaveProperty('outcome', 'saved');
    expect(announcements.published).toEqual([
      { workPackageId, event: { type: 'saved_plans_changed' } },
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

describe('a saved plan and step allowances', () => {
  it('keeps the allowance it was saved with when the live step changes later', async () => {
    const parentFixture = openMemorySourceFixture();
    const source = parentFixture.source;
    await source.stores.users.create(
      { id: owner.id, username: owner.id, passwordHash: null, createdAt: 1 },
      { at: 1, by: owner.id },
    );
    seedLegacyPackageParent(parentFixture, {
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      creator: owner.id,
    });
    let next = 0;
    const clock = clockOf({ now: () => STAMP_AT, newId: () => `id-${String(++next)}` });
    const { workPackages } = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    });
    const defined = await source.stores.stepCatalogue.defineAndBindStep(
      'fixture-legacy-org',
      {
        id: 'fixture-qa',
        code: 'qa',
        name: 'QA',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: 'fixture-qa-binding',
        scopeKind: 'project',
        scopeId: 'fixture-project',
        workItemTypeId: null,
        position: 10,
      },
      { at: STAMP_AT, by: owner.id },
    );
    expect(defined.ok).toBe(true);
    const created = expectCreated(await workPackages.create('Plan', 'fixture-project', owner.id));
    const qa = created.steps.find((step) => step.name === 'QA');
    if (qa === undefined) throw new Error('no QA step');
    const stamp = { at: STAMP_AT, by: owner.id };
    await source.stores.workPackages.setStepAllowance(created.workPackage.id, qa.id, 30, stamp);
    const { savedPlans } = installSavedPlans({
      digest: lengthDigest,
      capture: source.history.savedPlanCapture,
      plans: source.history.savedPlans,
      scheduler: fastScheduler,
      newId: () => clock.newId(),
      now: () => Math.floor(clock.now() / 1_000),
    });
    const saved = await savedPlans.save({
      workPackageId: created.workPackage.id,
      name: 'Baseline',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error(`save answered ${saved.outcome}`);

    await source.stores.workPackages.setStepAllowance(created.workPackage.id, qa.id, 50, stamp);
    expect(
      await source.stores.stepCatalogue.patchStepDefinition(
        'fixture-legacy-org',
        qa.id,
        { name: 'Renamed QA' },
        stamp,
      ),
    ).toMatchObject({ ok: true });

    const read = await savedPlans.read(saved.record.id);
    if (read.outcome !== 'read') throw new Error(`read answered ${read.outcome}`);
    const body = JSON.parse(read.plan.input.bytes) as {
      steps: { id: string; code: string | null; name: string; allowancePercent: number }[];
    };
    expect(read.plan.input.schemaVersion).toBe(13);
    expect(body.steps.find((step) => step.id === qa.id)?.allowancePercent).toBe(30);
    expect(body.steps.find((step) => step.id === qa.id)?.code).toBe(qa.code);
    expect(body.steps.find((step) => step.id === qa.id)?.name).toBe(qa.name);
  });
});
