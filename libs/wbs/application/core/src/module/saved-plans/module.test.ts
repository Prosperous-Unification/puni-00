import { createHash } from 'node:crypto';

import { StepParallelInputError } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { expectCreated } from '../../testing/expect-created';
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
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: CREATOR_ADMISSION,
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const created = expectCreated(await projects.create('Plan', owner.id));
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

  it('refuses installed shared save and current before capture without admitted access', async () => {
    const { projectId, requirements } = await seeded();
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
      .save({ projectId, createdBy: owner.username, createdById: owner.id })
      .then(
        () => null,
        (failure: unknown) => failure,
      );
    const currentFailure = await savedPlans.projectCurrentPlan(projectId).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(sharedReads).toBe(0);
    expect(localReads).toBe(0);
    expect(await requirements.plans.listOf(projectId)).toEqual([]);
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
      { projectId, actor: owner, name: 'Announced', access: LEGACY_ACCESS },
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

describe('a saved plan and step allowances', () => {
  it('keeps the allowance it was saved with when the live step changes later', async () => {
    const source = openMemorySource();
    let next = 0;
    const clock = clockOf({ now: () => STAMP_AT, newId: () => `id-${String(++next)}` });
    const { projects } = servicesOver(source.stores, {
      dependencyContext: createLocalDependencyContext(source.stores),
      admission: CREATOR_ADMISSION,
      clock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    });
    const created = expectCreated(await projects.create('Plan', owner.id));
    const qa = created.steps.find((step) => step.name === 'QA');
    if (qa === undefined) throw new Error('no QA step');
    const stamp = { at: STAMP_AT, by: owner.id };
    await source.stores.projects.setStepAllowance(created.project.id, qa.id, 30, stamp);
    const { savedPlans } = installSavedPlans({
      digest: lengthDigest,
      capture: source.history.savedPlanCapture,
      plans: source.history.savedPlans,
      scheduler: fastScheduler,
      newId: () => clock.newId(),
      now: () => Math.floor(clock.now() / 1_000),
    });
    const saved = await savedPlans.save({
      projectId: created.project.id,
      name: 'Baseline',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error(`save answered ${saved.outcome}`);

    await source.stores.projects.setStepAllowance(created.project.id, qa.id, 50, stamp);
    await source.stores.steps.rename(created.project.id, qa.id, 'Renamed QA', stamp);

    const read = await savedPlans.read(saved.record.id);
    if (read.outcome !== 'read') throw new Error(`read answered ${read.outcome}`);
    const body = JSON.parse(read.plan.input.bytes) as {
      steps: { id: string; code: string | null; name: string; allowancePercent: number }[];
    };
    expect(read.plan.input.schemaVersion).toBe(9);
    expect(body.steps.find((step) => step.id === qa.id)?.allowancePercent).toBe(30);
    expect(body.steps.find((step) => step.id === qa.id)?.code).toBe(qa.code);
    expect(body.steps.find((step) => step.id === qa.id)?.name).toBe(qa.name);
  });
});

describe('historical7–10 memory reads do not rewrite stored evidence', () => {
  it('reads and compares immutable original headers, hashes and retired schedules', async () => {
    const { projectId, requirements } = await seeded();
    const digest: Digest = {
      sha256: (bytes) => Promise.resolve(createHash('sha256').update(bytes).digest('hex')),
    };
    const { savedPlans } = installSavedPlans({ ...requirements, digest });
    const saved = await savedPlans.save({
      projectId,
      name: 'Source',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error('memory fixture save refused');
    const scheduleBytes = JSON.stringify({
      version: 1,
      algorithmId: 'retired-memory-v1',
      workItems: {},
      slices: {},
      waitingForPerson: 0,
      waitingForCapacity: 0,
    });
    const scheduleHash = await digest.sha256(new TextEncoder().encode(scheduleBytes));
    for (const version of [7, 8, 9, 10]) {
      const body = JSON.parse(saved.record.input.bytes) as Record<string, unknown>;
      body['schemaVersion'] = version;
      if (version < 9) {
        Reflect.deleteProperty(body['project'] as object, 'budgetFactor');
        Reflect.deleteProperty(body, 'measureEstimates');
        Reflect.deleteProperty(body, 'budgets');
      }
      if (version === 7) Reflect.deleteProperty(body, 'stepParallels');
      if (version === 10) body['dependencyHistory'] = { kind: 'local' };
      const bytes = JSON.stringify(body);
      const sha256 = await digest.sha256(new TextEncoder().encode(bytes));
      const id = `historical-${String(version)}`;
      expect(
        await requirements.plans.write(
          {
            id,
            projectId,
            name: id,
            createdBy: owner.username,
            createdById: owner.id,
            createdAt: 1,
            input: { schemaVersion: version, bytes, sha256 },
            schedule: {
              present: true,
              algorithmId: 'retired-memory-v1',
              inputSha256: sha256,
              body: { schemaVersion: 1, bytes: scheduleBytes, sha256: scheduleHash },
            },
          },
          () => Promise.resolve(null),
        ),
      ).toEqual({ outcome: 'written' });
      const original = structuredClone(await requirements.plans.readOf(id));
      expect(await savedPlans.read(id)).toMatchObject({
        outcome: 'read',
        plan: {
          input: { schemaVersion: version, bytes, sha256 },
          schedule: {
            present: true,
            algorithmId: 'retired-memory-v1',
            body: { bytes: scheduleBytes },
          },
        },
      });
      expect(
        await savedPlans.compare(
          projectId,
          { kind: 'saved', savedPlanId: id },
          { kind: 'saved', savedPlanId: id },
        ),
      ).toMatchObject({ outcome: 'compared', diff: { input: [], schedule: [] } });
      expect(await requirements.plans.readOf(id)).toEqual(original);
    }
  });
});

describe('trusted captures are never modeled as stored corruption', () => {
  it('throws for malformed current sparse capture before any saved write', async () => {
    const { projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans({
      ...requirements,
      capture: {
        readPlanInput: async (id) => {
          const captured = await requirements.capture.readPlanInput(id);
          if (captured === null) throw new Error('fixture capture missing');
          return {
            ...captured,
            stepParallels: [{ workItemId: 'missing', stepId: 'missing', maxParallel: 1001 }],
          };
        },
      },
    });
    const thrown: unknown = await savedPlans
      .save({ projectId, name: 'Invalid', createdBy: owner.username, createdById: owner.id })
      .catch((cause: unknown) => cause);
    expect(thrown).toBeInstanceOf(StepParallelInputError);
    expect(await requirements.plans.listOf(projectId)).toEqual([]);
  });
  it('propagates unexpected capture reader failure identity', async () => {
    const { projectId, requirements } = await seeded();
    const failure = new Error('unreadable current capture');
    const { savedPlans } = installSavedPlans({
      ...requirements,
      capture: { readPlanInput: () => Promise.reject(failure) },
    });
    const thrown: unknown = await savedPlans
      .save({ projectId, name: 'Unreadable', createdBy: owner.username, createdById: owner.id })
      .catch((cause: unknown) => cause);
    expect(thrown).toBe(failure);
    expect(await requirements.plans.listOf(projectId)).toEqual([]);
  });
});
