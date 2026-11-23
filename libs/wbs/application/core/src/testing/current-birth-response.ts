import { expect } from 'bun:test';

import { WorkPackageService } from '../module/work-package/work-package.resource';
import { prepareWorkPackageBirth } from '../module/work-package/work-package-birth';
import { clockOf } from '../ports/clock';
import type { Source } from '../ports/source';
import type { TransactionalStores } from '../ports/stores';
import type { WorkPackageCreationScope, WorkPackageStore } from '../ports/work-package-store';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';

export const BIRTH_ACTOR = 'current-birth-actor';
export const BIRTH_ORGANIZATION = 'fixture-legacy-org';
export const BIRTH_PROJECT = 'fixture-project';
const STAMP = { at: 100, by: BIRTH_ACTOR };
type BirthSource = Source<TransactionalStores>;

/** Authors actual current definitions; no local Step DTO or inferred metadata is used. */
export async function seedCurrentBirth(source: BirthSource, hasBindings: boolean): Promise<void> {
  await source.stores.users.create(
    { id: BIRTH_ACTOR, username: BIRTH_ACTOR, passwordHash: 'x', createdAt: 1 },
    STAMP,
  );
  if (!hasBindings) return;
  for (const [
    id,
    name,
    scopeKind,
    scopeId,
    position,
    defaultEstimateUnit,
    defaultAllowancePercent,
  ] of [
    ['birth-step-z', 'Review', 'organization', BIRTH_ORGANIZATION, 30, 'workdays', 5.25],
    ['birth-step-a', 'Research', 'project', BIRTH_PROJECT, 10, 'minutes', 12.5],
  ] as const)
    expect(
      (
        await source.stores.stepCatalogue.defineAndBindStep(
          BIRTH_ORGANIZATION,
          {
            id,
            name,
            code: id,
            position,
            defaultEstimateUnit,
            defaultAllowancePercent,
          },
          { bindingId: id + ':binding', scopeKind, scopeId, workItemTypeId: null, position },
          STAMP,
        )
      ).ok,
    ).toBe(true);
}

/** The actual service must publish catalogue identities and mint only its one legacy birth identity. */
export async function assertCurrentBirth(
  source: BirthSource,
  hasBindings: boolean,
  renameAfterBirth = false,
): Promise<void> {
  let minted = 0,
    wasRenamed = false;
  const workPackages = new Proxy(source.stores.workPackages, {
    get(target, key, receiver) {
      if (key === 'createWithSteps' && renameAfterBirth)
        return async (...args: Parameters<WorkPackageStore['createWithSteps']>) => {
          const born = await target.createWithSteps(...args);
          if (typeof born === 'string') throw new Error('actual birth refused: ' + born);
          expect(
            (
              await source.stores.stepCatalogue.patchStepDefinition(
                BIRTH_ORGANIZATION,
                'birth-step-z',
                { name: 'Review after birth' },
                { at: 200, by: BIRTH_ACTOR },
              )
            ).ok,
          ).toBe(true);
          wasRenamed = true;
          return born;
        };
      const operation: unknown = Reflect.get(target, key, receiver);
      return operation;
    },
  });
  const service = new WorkPackageService({
    workPackages,
    clock: clockOf({ now: () => 100, newId: () => 'current-born-' + String(++minted) }),
    broadcast: recordingBroadcaster(),
    dependencyContext: createLocalDependencyContext(source.stores),
  });
  const born = await service.create('Current birth', BIRTH_PROJECT, BIRTH_ACTOR);
  if (typeof born === 'string') throw new Error('service birth refused: ' + born);
  expect(
    born.steps.map(({ id, name, estimateUnit, allowancePercent, position }) => ({
      id,
      name,
      estimateUnit,
      allowancePercent,
      position,
    })),
  ).toEqual(
    hasBindings
      ? [
          {
            id: 'birth-step-z',
            name: 'Review',
            estimateUnit: 'workdays',
            allowancePercent: 5.25,
            position: 30,
          },
          {
            id: 'birth-step-a',
            name: 'Research',
            estimateUnit: 'minutes',
            allowancePercent: 12.5,
            position: 10,
          },
        ]
      : [],
  );
  expect(minted).toBe(1);
  expect(born.workPackage).toMatchObject({
    id: 'current-born-1',
    projectId: BIRTH_PROJECT,
    revision: 0,
    createdAt: 100,
  });
  expect(born.steps.every((step) => step.workPackageId === born.workPackage.id)).toBe(true);
  if (renameAfterBirth) {
    expect(wasRenamed).toBe(true);
    expect(
      (await source.stores.workPackages.stepsOf(born.workPackage.id)).map(({ name }) => name),
    ).toEqual(['Review after birth', 'Research']);
    expect((await source.stores.workPackages.findById(born.workPackage.id))?.revision).toBe(1);
  } else {
    expect(await source.stores.workPackages.stepsOf(born.workPackage.id)).toEqual(born.steps);
    expect(await source.stores.workPackages.findById(born.workPackage.id)).toEqual(
      born.workPackage,
    );
  }
}

/** Preserves both the exercised birth failure and a failing owner cleanup. */
export async function withinBirthFixture(
  close: () => Promise<void>,
  exercise: () => Promise<void>,
): Promise<void> {
  let primary: { cause: unknown } | undefined;
  try {
    await exercise();
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError([primary.cause, cleanup], 'birth case and owner cleanup failed', {
        cause: cleanup,
      });
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

/** Settles an actual asynchronous birth, including synchronous failures from a missing owner. */
export async function expectBirthFailure(
  create: () => Promise<unknown>,
  message: string,
): Promise<void> {
  const settled = await Promise.resolve()
    .then(create)
    .then(
      () => ({ kind: 'answered' }) as const,
      (cause: unknown) => ({ kind: 'failed', cause }) as const,
    );
  expect(settled.kind).toBe('failed');
  if (settled.kind !== 'failed') throw new Error('birth unexpectedly answered');
  expect(String(settled.cause)).toContain(message);
}

/** Required current birth capabilities cannot outlive their actual commit, rollback or repair loan. */
export async function assertBirthLoanExpiry(
  source: BirthSource,
  settlement: 'commit' | 'rollback' | 'repair',
): Promise<void> {
  let retained: WorkPackageStore | undefined;
  await source.uow.run(({ stores }) => {
    if (settlement !== 'repair') retained = stores.workPackages;
    return Promise.resolve(
      settlement === 'commit'
        ? { commit: true, value: undefined }
        : {
            commit: false,
            value: undefined,
            afterRollback: ({ stores: repair }: { stores: BirthSource['stores'] }) => {
              if (settlement === 'repair') retained = repair.workPackages;
              return Promise.resolve();
            },
          },
    );
  });
  if (retained === undefined) throw new Error('actual birth loan was not captured');
  const workPackages = retained;
  const { workPackage } = prepareWorkPackageBirth(
    'Expired birth',
    BIRTH_PROJECT,
    STAMP,
    () => 'expired-current-birth',
  );
  await expectBirthFailure(
    () => workPackages.createWithSteps(workPackage, STAMP, { kind: 'legacy' }),
    'closed',
  );
  expect(await source.stores.workPackages.findById(workPackage.id)).toBeNull();
  await source.uow.run(async ({ stores }) => {
    await expectBirthFailure(
      () => workPackages.createWithSteps(workPackage, STAMP, { kind: 'legacy' }),
      'closed',
    );
    expect(await stores.workPackages.findById(workPackage.id)).toBeNull();
    return { commit: true, value: undefined };
  });
}

/** Valid current draft so owner controls cannot accidentally pass on malformed payload refusal. */
export function createBirthDraft(id: string) {
  return prepareWorkPackageBirth('Current birth', BIRTH_PROJECT, STAMP, () => id).workPackage;
}

/** A pending reply cannot escape its refused owner, and its writes cannot appear after rollback. */
export async function assertPendingBirthExpiry(source: BirthSource): Promise<void> {
  const workPackage = createBirthDraft('pending-current-birth');
  const settled = await source.uow.run(({ stores }) =>
    Promise.resolve({
      commit: false,
      value: stores.workPackages.createWithSteps(workPackage, STAMP, { kind: 'legacy' }).then(
        () => ({ kind: 'answered' }) as const,
        (cause: unknown) => ({ kind: 'failed', cause }) as const,
      ),
    }),
  );
  expect(settled.kind).toBe('failed');
  if (settled.kind !== 'failed') throw new Error('birth reply escaped its owner');
  expect(String(settled.cause)).toContain('closed');
  expect(await source.stores.workPackages.findById(workPackage.id)).toBeNull();
}

/** Holds the actual writer and mutates all caller-owned birth structures after invocation. */
export async function assertQueuedBirth(
  source: BirthSource,
  projectId: string,
  actorId: string,
  scope: WorkPackageCreationScope,
): Promise<void> {
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const holding = source.uow.run(async () => {
    entered.resolve(undefined);
    await release.promise;
    return { commit: true, value: undefined };
  });
  // Notification only: cleanup below still awaits the original holder and preserves its failure.
  void holding.catch((cause: unknown) => {
    entered.reject(cause);
  });
  const stamp = { at: 700, by: actorId };
  const weights = { optimistic: 2, realistic: 5, pessimistic: 3 };
  const workPackage = {
    ...prepareWorkPackageBirth(
      'Queued current birth',
      projectId,
      stamp,
      () => 'queued-current-birth',
    ).workPackage,
    pertWeights: weights,
  };
  const creation =
    scope.kind === 'legacy'
      ? { kind: 'legacy' as const }
      : {
          kind: 'scoped' as const,
          organizationId: scope.organizationId,
          creatorGrant: { ...scope.creatorGrant },
        };
  type Outcome =
    | {
        readonly kind: 'answered';
        readonly born: Awaited<ReturnType<WorkPackageStore['createWithSteps']>>;
      }
    | { readonly kind: 'failed'; readonly cause: unknown };
  const captured: { reply?: Promise<Outcome> } = {};
  await withinBirthFixture(
    async () => {
      release.resolve(undefined);
      await holding;
    },
    async () => {
      await entered.promise;
      captured.reply = source.stores.workPackages
        .createWithSteps(workPackage, stamp, creation)
        .then(
          (born) => ({ kind: 'answered', born }) as const,
          (cause: unknown) => ({ kind: 'failed', cause }) as const,
        );
      workPackage.name = 'Mutated queued name';
      workPackage.projectId = 'missing-mutated-parent';
      weights.realistic = 99;
      stamp.at = 999;
      stamp.by = 'missing-mutated-actor';
      if (creation.kind === 'scoped') {
        creation.organizationId = 'missing-mutated-organization';
        creation.creatorGrant.id = 'mutated-grant';
        creation.creatorGrant.auditId = 'mutated-audit';
      }
    },
  );
  if (captured.reply === undefined) throw new Error('actual queued birth was not invoked');
  const settled = await captured.reply;
  if (settled.kind === 'failed') throw settled.cause;
  if (typeof settled.born === 'string') throw new Error('queued birth refused: ' + settled.born);
  expect(settled.born.workPackage).toMatchObject({
    id: 'queued-current-birth',
    name: 'Queued current birth',
    projectId,
    createdAt: 700,
    pertWeights: { optimistic: 2, realistic: 5, pessimistic: 3 },
  });
  expect(await source.stores.workPackages.findById('queued-current-birth')).toEqual(
    settled.born.workPackage,
  );
}
