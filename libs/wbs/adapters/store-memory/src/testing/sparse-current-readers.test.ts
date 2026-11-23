import { rejects } from 'node:assert/strict';

import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import type {
  StoredStepBlockage,
  StoredStepParallel,
  TransactionalStores,
  WriteStamp,
} from '@wbs/core';
import { WorkPackageStepMissing } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import { bindStores, MemoryState } from '../memory-stores';
import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

type Family = 'blockage' | 'parallel';
type SparseStores = Pick<TransactionalStores, 'blockages' | 'stepParallels'>;
const openFixture = () =>
  openMemoryStepCatalogueCase('current-sparse-memory', stepCatalogueFixtureFromSource);
type Fixture = Awaited<ReturnType<typeof openFixture>>;
const LEAF = 'memory-sparse-leaf',
  PEER = 'memory-sparse-peer',
  SIBLING = 'memory-sparse-sibling';
const GLOBAL = 'z-memory-sparse-global',
  LOCAL = 'a-memory-sparse-project',
  TYPED = 'memory-sparse-typed';

async function withinFixture(exercise: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openFixture();
  let primary: { cause: unknown } | undefined;
  try {
    await exercise(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'memory sparse owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

/** Authored current catalogue state only: the legacy physical Step rows stay absent. */
async function seedScope(fixture: Fixture): Promise<void> {
  const { source, seed, port } = fixture;
  for (const [id, scopeKind, scopeId, position, bindingPosition] of [
    [GLOBAL, 'organization', seed.organizationId, 900, 10],
    [LOCAL, 'project', seed.projectId, 1, 5],
  ] as const) {
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id,
            code: id,
            name: id,
            position,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: id + ':binding',
            scopeKind,
            scopeId,
            workItemTypeId: null,
            position: bindingPosition,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    expect(await source.stores.steps.findById(id)).toBeNull();
  }
  for (const [id, workPackageId, position] of [
    [LEAF, seed.workPackageId, 10],
    [PEER, seed.workPackageId, 20],
    [SIBLING, seed.siblingWorkPackageId, 10],
  ] as const)
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId, name: id, position }),
      [],
      seed.stamp,
    );
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual([GLOBAL, LOCAL]);
  expect(await source.stores.estimates.readTarget(LEAF, GLOBAL)).toMatchObject({
    kind: 'resolved',
    step: { stepId: GLOBAL },
  });
  expect(await source.stores.estimates.readTarget(SIBLING, GLOBAL)).toMatchObject({
    kind: 'resolved',
    step: { stepId: GLOBAL },
  });
}

function createFact(family: Family, workItemId: string, stepId: string, value: number) {
  return family === 'blockage'
    ? { workItemId, stepId, blockedAt: value }
    : { workItemId, stepId, maxParallel: value };
}
async function setFact(
  stores: SparseStores,
  family: Family,
  workItemId: string,
  stepId: string,
  value: number,
  stamp: WriteStamp,
): Promise<void> {
  if (family === 'blockage')
    expect(await stores.blockages.set({ workItemId, stepId, blockedAt: value }, stamp)).toBe(
      'written',
    );
  else await stores.stepParallels.set({ workItemId, stepId, maxParallel: value }, stamp);
}
function readFacts(
  stores: SparseStores,
  family: Family,
  workPackageId: string,
  ids: readonly string[] | null,
): Promise<readonly (StoredStepBlockage | StoredStepParallel)[]> {
  if (family === 'blockage')
    return ids === null
      ? stores.blockages.listByWorkPackage(workPackageId)
      : stores.blockages.listByWorkItems(workPackageId, ids);
  return ids === null
    ? stores.stepParallels.listByWorkPackage(workPackageId)
    : stores.stepParallels.listByWorkItems(workPackageId, ids);
}
async function expectHealthy(fixture: Fixture, family: Family): Promise<void> {
  const before = fixture.readEvidence();
  expect(await readFacts(fixture.source.stores, family, fixture.seed.workPackageId, null)).toEqual([
    createFact(family, LEAF, GLOBAL, 2),
  ]);
  expect(
    await readFacts(fixture.source.stores, family, fixture.seed.workPackageId, [LEAF]),
  ).toEqual([createFact(family, LEAF, GLOBAL, 2)]);
  expect(fixture.readEvidence()).toEqual(before);
}
async function expectClosed(
  stores: SparseStores,
  family: Family,
  workPackageId: string,
): Promise<void> {
  await rejects(readFacts(stores, family, workPackageId, null), /closed/);
  await rejects(readFacts(stores, family, workPackageId, [LEAF]), /closed/);
  await rejects(readFacts(stores, family, workPackageId, []), /closed/);
}

for (const family of ['blockage', 'parallel'] as const) {
  test(
    'current memory sparse ' +
      family +
      ' full and targeted reads use leaf SC18 rather than legacy package positions',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed } = fixture;
        await setFact(source.stores, family, LEAF, LOCAL, 3, seed.stamp);
        await setFact(source.stores, family, LEAF, GLOBAL, 2, seed.stamp);
        await setFact(source.stores, family, PEER, GLOBAL, 4, seed.stamp);
        const before = fixture.readEvidence();
        expect(await readFacts(source.stores, family, seed.workPackageId, null)).toEqual([
          createFact(family, LEAF, GLOBAL, 2),
          createFact(family, LEAF, LOCAL, 3),
          createFact(family, PEER, GLOBAL, 4),
        ]);
        expect(await readFacts(source.stores, family, seed.workPackageId, [LEAF])).toEqual([
          createFact(family, LEAF, GLOBAL, 2),
          createFact(family, LEAF, LOCAL, 3),
        ]);
        expect(await readFacts(source.stores, family, seed.workPackageId, [])).toEqual([]);
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
    15000,
  );

  test(
    'current memory sparse ' +
      family +
      ' writes and reads a lawful sibling sharing the current global definition',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed } = fixture;
        await setFact(source.stores, family, LEAF, GLOBAL, 2, seed.stamp);
        await expectHealthy(fixture, family);
        await setFact(source.stores, family, SIBLING, GLOBAL, 5, seed.stamp);
        const before = fixture.readEvidence();
        expect(await readFacts(source.stores, family, seed.siblingWorkPackageId, null)).toEqual([
          createFact(family, SIBLING, GLOBAL, 5),
        ]);
        expect(
          await readFacts(source.stores, family, seed.siblingWorkPackageId, [SIBLING]),
        ).toEqual([createFact(family, SIBLING, GLOBAL, 5)]);
        expect(await readFacts(source.stores, family, seed.workPackageId, [SIBLING])).toEqual([]);
        await expectHealthy(fixture, family);
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
    15000,
  );

  test(
    'current memory sparse ' +
      family +
      ' refuses a retained fact after its own direct type stops resolving the current binding',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed, port } = fixture;
        expect(
          (
            await port.defineAndBindStep(
              seed.organizationId,
              {
                id: TYPED,
                code: TYPED,
                name: TYPED,
                position: 2,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
              {
                bindingId: TYPED + ':binding',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: seed.typeId,
                position: 7,
              },
              seed.stamp,
            )
          ).ok,
        ).toBe(true);
        expect(await source.stores.steps.findById(TYPED)).toBeNull();
        expect(
          (await source.stores.workItems.patch(LEAF, { typeIds: [seed.typeId] }, seed.stamp)).ok,
        ).toBe(true);
        expect(await source.stores.estimates.readTarget(LEAF, TYPED)).toMatchObject({
          kind: 'resolved',
          step: { stepId: TYPED },
        });
        await setFact(source.stores, family, LEAF, TYPED, 2, seed.stamp);
        expect(await readFacts(source.stores, family, seed.workPackageId, null)).toEqual([
          createFact(family, LEAF, TYPED, 2),
        ]);
        expect((await source.stores.workItems.patch(LEAF, { typeIds: [] }, seed.stamp)).ok).toBe(
          true,
        );
        expect(await source.stores.estimates.readTarget(LEAF, TYPED)).toMatchObject({
          kind: 'step_not_resolved',
        });
        const before = fixture.readEvidence();
        await rejects(readFacts(source.stores, family, seed.workPackageId, null), /resolved/);
        await rejects(readFacts(source.stores, family, seed.workPackageId, [LEAF]), /resolved/);
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
    15000,
  );

  test(
    'current memory sparse ' +
      family +
      ' public full targeted and empty reads reject after Source close',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        await setFact(fixture.source.stores, family, LEAF, GLOBAL, 2, fixture.seed.stamp);
        await expectHealthy(fixture, family);
        await fixture.close();
        await expectClosed(fixture.source.stores, family, fixture.seed.workPackageId);
      });
    },
    15000,
  );

  test(
    'current memory sparse ' +
      family +
      ' borrowed reader expires after rollback and cannot revive in a fresh loan',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed } = fixture;
        await setFact(source.stores, family, LEAF, GLOBAL, 2, seed.stamp);
        await expectHealthy(fixture, family);
        const captured: { stores: SparseStores | undefined } = { stores: undefined };
        await source.uow.run(async ({ stores }) => {
          expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
            createFact(family, LEAF, GLOBAL, 2),
          ]);
          captured.stores = stores;
          return { commit: false, value: undefined };
        });
        const retained = captured.stores;
        if (retained === undefined) throw new Error('actual sparse ordinary loan was not captured');
        const before = fixture.readEvidence();
        await expectClosed(retained, family, seed.workPackageId);
        await source.uow.run(async ({ stores }) => {
          expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
            createFact(family, LEAF, GLOBAL, 2),
          ]);
          await expectClosed(retained, family, seed.workPackageId);
          return { commit: false, value: undefined };
        });
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
    15000,
  );

  test(
    'current memory sparse ' +
      family +
      ' repair reader expires and cannot revive in a fresh repair loan',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed } = fixture;
        await setFact(source.stores, family, LEAF, GLOBAL, 2, seed.stamp);
        await expectHealthy(fixture, family);
        const captured: { stores: SparseStores | undefined } = { stores: undefined };
        await source.uow.run<undefined>(() =>
          Promise.resolve({
            commit: false,
            value: undefined,
            afterRollback: async ({ stores }) => {
              expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
                createFact(family, LEAF, GLOBAL, 2),
              ]);
              captured.stores = stores;
            },
          }),
        );
        const retained = captured.stores;
        if (retained === undefined) throw new Error('actual sparse repair loan was not captured');
        const before = fixture.readEvidence();
        await expectClosed(retained, family, seed.workPackageId);
        await source.uow.run<undefined>(() =>
          Promise.resolve({
            commit: false,
            value: undefined,
            afterRollback: async ({ stores }) => {
              expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
                createFact(family, LEAF, GLOBAL, 2),
              ]);
              await expectClosed(retained, family, seed.workPackageId);
            },
          }),
        );
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
    15000,
  );
}

/** Uses only detached tables actually captured by this Source; no test state is attached back to it. */
function ownMemoryState(fixture: Fixture): MemoryState {
  const snapshot = fixture.readEvidence().snapshot;
  if (typeof snapshot !== 'object' || snapshot === null)
    throw new Error('memory Source evidence snapshot is absent');
  const state = new MemoryState();
  expect(Reflect.ownKeys(snapshot)).toEqual(Reflect.ownKeys(state.tables));
  Object.assign(state.tables, structuredClone(snapshot));
  const observed: unknown = state.tables;
  expect(observed).toEqual(snapshot);
  expect(state.tables.steps.rows).toEqual([]);
  expect([...state.tables.workPackages.steps.values()].flat()).toEqual([]);
  return state;
}

for (const family of ['blockage', 'parallel'] as const) {
  test(
    'current memory sparse ' +
      family +
      ' direct reader projects actual current-only persisted facts without a legacy writer prerequisite',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { seed } = fixture;
        const sourceBefore = fixture.readEvidence();
        const state = ownMemoryState(fixture),
          stores = bindStores(state);
        expect(await stores.estimates.readTarget(LEAF, GLOBAL)).toMatchObject({
          kind: 'resolved',
          step: { stepId: GLOBAL },
        });
        expect(await stores.estimates.readTarget(SIBLING, GLOBAL)).toMatchObject({
          kind: 'resolved',
          step: { stepId: GLOBAL },
        });
        expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([]);
        expect(await readFacts(stores, family, seed.workPackageId, [LEAF])).toEqual([]);
        if (family === 'blockage')
          state.tables.blockages.rows.push(
            { workItemId: LEAF, stepId: LOCAL, blockedAt: 3 },
            { workItemId: LEAF, stepId: GLOBAL, blockedAt: 2 },
            { workItemId: PEER, stepId: GLOBAL, blockedAt: 4 },
            { workItemId: SIBLING, stepId: GLOBAL, blockedAt: 5 },
          );
        else
          state.tables.stepParallels.rows.push(
            { workItemId: LEAF, stepId: LOCAL, maxParallel: 3 },
            { workItemId: LEAF, stepId: GLOBAL, maxParallel: 2 },
            { workItemId: PEER, stepId: GLOBAL, maxParallel: 4 },
            { workItemId: SIBLING, stepId: GLOBAL, maxParallel: 5 },
          );
        const before = structuredClone(state.tables);
        expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
          createFact(family, LEAF, GLOBAL, 2),
          createFact(family, LEAF, LOCAL, 3),
          createFact(family, PEER, GLOBAL, 4),
        ]);
        expect(await readFacts(stores, family, seed.workPackageId, [LEAF])).toEqual([
          createFact(family, LEAF, GLOBAL, 2),
          createFact(family, LEAF, LOCAL, 3),
        ]);
        expect(await readFacts(stores, family, seed.siblingWorkPackageId, null)).toEqual([
          createFact(family, SIBLING, GLOBAL, 5),
        ]);
        expect(await readFacts(stores, family, seed.workPackageId, [SIBLING])).toEqual([]);
        expect(await readFacts(stores, family, seed.workPackageId, [])).toEqual([]);
        expect(state.tables).toEqual(before);
        expect(fixture.readEvidence()).toEqual(sourceBefore);
      });
    },
    15000,
  );
}

async function withinSparseDeadline<Value>(pending: Promise<Value>): Promise<Value> {
  const timer: { value: ReturnType<typeof setTimeout> | undefined } = { value: undefined };
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer.value = setTimeout(() => {
          reject(new Error('memory sparse read did not settle independently of held writer'));
        }, 2000);
      }),
    ]);
  } finally {
    if (timer.value !== undefined) clearTimeout(timer.value);
  }
}

for (const family of ['blockage', 'parallel'] as const) {
  for (const corruption of ['explicit values', 'scalar', 'orphan'] as const) {
    test(
      'current memory sparse ' +
        family +
        ' raw factory refuses ' +
        corruption +
        ' after a healthy current capture',
      async () => {
        await withinFixture(async (fixture) => {
          await seedScope(fixture);
          const { seed } = fixture,
            sourceBefore = fixture.readEvidence();
          const state = ownMemoryState(fixture),
            stores = bindStores(state);
          expect(await stores.estimates.readTarget(LEAF, GLOBAL)).toMatchObject({
            kind: 'resolved',
            step: { stepId: GLOBAL },
          });
          if (family === 'blockage')
            state.tables.blockages.rows.push({ workItemId: LEAF, stepId: GLOBAL, blockedAt: 2 });
          else
            state.tables.stepParallels.rows.push({
              workItemId: LEAF,
              stepId: GLOBAL,
              maxParallel: 2,
            });
          const healthy = structuredClone(state.tables);
          expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
            createFact(family, LEAF, GLOBAL, 2),
          ]);
          expect(await readFacts(stores, family, seed.workPackageId, [LEAF])).toEqual([
            createFact(family, LEAF, GLOBAL, 2),
          ]);
          expect(state.tables).toEqual(healthy);
          if (corruption === 'explicit values') {
            const values = state.tables.stepCatalogue.packageValues.get(seed.workPackageId);
            if (values === undefined)
              throw new Error('actual current package values are absent before raw fault');
            expect(values.delete(GLOBAL)).toBe(true);
          } else if (corruption === 'orphan')
            expect(state.tables.workItems.byId.delete(LEAF)).toBe(true);
          else {
            const rows =
              family === 'blockage' ? state.tables.blockages.rows : state.tables.stepParallels.rows;
            const fact = rows.find((row) => row.workItemId === LEAF && row.stepId === GLOBAL);
            if (fact === undefined) throw new Error('actual sparse raw scalar target is absent');
            expect(
              Reflect.set(fact, family === 'blockage' ? 'blockedAt' : 'maxParallel', '2'),
            ).toBe(true);
          }
          const before = structuredClone(state.tables);
          for (const ids of [null, [LEAF]] as const) {
            const pending = readFacts(stores, family, seed.workPackageId, ids);
            if (corruption === 'explicit values') {
              await rejects(pending, WorkPackageStepMissing);
              await rejects(pending, {
                workPackageId: seed.workPackageId,
                stepId: GLOBAL,
              });
            } else if (corruption === 'orphan') await rejects(pending, /work.item|work item/);
            else
              await rejects(
                pending,
                family === 'blockage' ? /invalid blocked time/ : /invalid maximum/,
              );
          }
          if (corruption === 'orphan') {
            await rejects(
              readFacts(stores, family, seed.siblingWorkPackageId, null),
              /work.item|work item/,
            );
            expect(await readFacts(stores, family, seed.workPackageId, [PEER])).toEqual([]);
            expect(await readFacts(stores, family, seed.workPackageId, [])).toEqual([]);
          }
          expect(state.tables).toEqual(before);
          expect(fixture.readEvidence()).toEqual(sourceBefore);
        });
      },
      15000,
    );
  }

  test(
    'current memory sparse ' +
      family +
      ' public reader retains committed facts while an actual writer loan holds staged facts',
    async () => {
      await withinFixture(async (fixture) => {
        await seedScope(fixture);
        const { source, seed } = fixture;
        await setFact(source.stores, family, LEAF, GLOBAL, 2, seed.stamp);
        await expectHealthy(fixture, family);
        const entered = Promise.withResolvers<undefined>(),
          release = Promise.withResolvers<undefined>();
        const writer = source.uow
          .run(async ({ stores }) => {
            await setFact(stores, family, LEAF, GLOBAL, 6, seed.stamp);
            expect(await readFacts(stores, family, seed.workPackageId, null)).toEqual([
              createFact(family, LEAF, GLOBAL, 6),
            ]);
            entered.resolve(undefined);
            await release.promise;
            return { commit: true, value: undefined };
          })
          .then(
            () => ({ ok: true as const }),
            (cause: unknown) => {
              entered.reject(cause);
              return { ok: false as const, cause };
            },
          );
        let primary: { cause: unknown } | undefined;
        const observations: ReturnType<typeof readFacts>[] = [];
        try {
          await withinSparseDeadline(entered.promise);
          const full = readFacts(source.stores, family, seed.workPackageId, null);
          observations.push(full);
          expect(await withinSparseDeadline(full)).toEqual([createFact(family, LEAF, GLOBAL, 2)]);
          const targeted = readFacts(source.stores, family, seed.workPackageId, [LEAF]);
          observations.push(targeted);
          expect(await withinSparseDeadline(targeted)).toEqual([
            createFact(family, LEAF, GLOBAL, 2),
          ]);
        } catch (cause: unknown) {
          primary = { cause };
        }
        release.resolve(undefined);
        const settled = await writer;
        const lateObservations = await Promise.all(
          observations.map((observed) =>
            observed.then(
              () => ({ ok: true as const }),
              (cause: unknown) => ({ ok: false as const, cause }),
            ),
          ),
        );
        const readFailures: unknown[] = [];
        for (const late of lateObservations)
          if (
            !late.ok &&
            (primary === undefined || !Object.is(primary.cause, late.cause)) &&
            !readFailures.some((cause) => Object.is(cause, late.cause))
          )
            readFailures.push(late.cause);
        if (readFailures.length > 0)
          primary = {
            cause:
              primary === undefined
                ? new AggregateError(readFailures, 'memory sparse late reads failed')
                : new AggregateError(
                    [primary.cause, ...readFailures],
                    'memory sparse deadline and late reads failed',
                  ),
          };
        if (!settled.ok) {
          if (primary !== undefined)
            throw new AggregateError(
              [primary.cause, settled.cause],
              'memory sparse held writer and public read failed',
            );
          throw settled.cause;
        }
        if (primary !== undefined) throw primary.cause;
        expect(await readFacts(source.stores, family, seed.workPackageId, null)).toEqual([
          createFact(family, LEAF, GLOBAL, 6),
        ]);
      });
    },
    15000,
  );
}
