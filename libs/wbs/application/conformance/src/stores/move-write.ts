import type { SubtreeStore } from '@wbs/core';
import { createLocalDependencyContext } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

/** Awaits the actual operation's terminal rejection before any persistence assertion. */
export async function observeMoveFailure(call: Promise<unknown>): Promise<unknown> {
  const observed = await call.then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  expect(observed.ok).toBe(false);
  if (observed.ok) throw Error('owned move unexpectedly resolved');
  return observed.cause;
}

/** Checks a real rejection after it settles, without awaiting a void matcher or using an untyped asymmetric field. */
export async function expectMoveError(call: Promise<unknown>, message: string): Promise<void> {
  const cause = await observeMoveFailure(call);
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw cause;
  expect(cause.message).toContain(message);
}

type OpenMoveFixture = () => Promise<StepCatalogueFixture>;

async function withinMoveFixture(
  open: OpenMoveFixture,
  act: (fixture: StepCatalogueFixture) => Promise<void>,
): Promise<void> {
  const fixture = await open();
  const execution = await act(fixture).then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  const closing = await fixture.close().then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'move assertion and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}

async function seedMove(fixture: StepCatalogueFixture) {
  const { source, seed } = fixture,
    { stores } = source;
  expect(
    await stores.stepCatalogue.defineAndBindStep(
      seed.organizationId,
      {
        id: 'owned-move-step',
        code: 'owned-move',
        name: 'Owned move step',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: 'owned-move-binding',
        scopeKind: 'organization',
        scopeId: seed.organizationId,
        workItemTypeId: null,
        position: 10,
      },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  for (const row of [
    workItemRow({
      id: 'move-destination',
      workPackageId: seed.workPackageId,
      name: 'Destination',
      position: 10,
      readiness: 'ready',
      hold: 'on_hold',
    }),
    workItemRow({
      id: 'move-existing',
      workPackageId: seed.workPackageId,
      name: 'Existing work',
      position: 20,
    }),
    workItemRow({ id: 'move-sibling', workPackageId: seed.workPackageId, position: 30 }),
  ])
    await stores.workItems.insert(row, [], seed.stamp);
  expect(await stores.demands.set('move-destination', 'move-resource', 2, seed.stamp)).toBe(
    'written',
  );
  const write = {
    workPackageId: seed.workPackageId,
    workItemId: 'move-existing',
    parentId: 'move-destination',
    position: 10,
    respaced: [],
  };
  return { source, stores, seed, write, stepId: 'owned-move-step' };
}

/** Registers actual Source operations; the adapter opener retains DB, migration and close ownership. */
export function registerMoveWriteCases(adapter: string, open: OpenMoveFixture): void {
  for (const kind of [
    'estimate',
    'actual',
    'progress',
    'measure',
    'blockage',
    'parallel',
  ] as const) {
    test(
      adapter +
        ' owned move refuses destination ' +
        kind +
        ' before statements, demand, positions or publication change',
      async () => {
        await withinMoveFixture(open, async (fixture) => {
          const { source, stores, seed, write, stepId } = await seedMove(fixture);
          const address = { workItemId: 'move-destination', stepId };
          switch (kind) {
            case 'estimate':
              expect(
                await stores.estimates.set(
                  { ...address, optimistic: 1, realistic: 2, pessimistic: 3 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'actual':
              expect(
                await stores.actuals.set({ ...address, days: 2, recordedAt: 100 }, seed.stamp),
              ).toBe('written');
              break;
            case 'progress':
              expect(
                await stores.progress.set(
                  { ...address, state: 'in_progress', statedAt: 100 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'measure':
              expect(
                await stores.measures.set(
                  { ...address, metric: 'token_actual', value: 3, recordedAt: 100 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'blockage':
              expect(await stores.blockages.set({ ...address, blockedAt: 100 }, seed.stamp)).toBe(
                'written',
              );
              break;
            case 'parallel':
              await stores.stepParallels.set({ ...address, maxParallel: 2 }, seed.stamp);
              expect(
                await stores.stepParallels.listByWorkItems(seed.workPackageId, [
                  address.workItemId,
                ]),
              ).toEqual([{ ...address, maxParallel: 2 }]);
              break;
          }
          const before = fixture.readEvidence();
          expect(await source.stores.subtrees.writeMove(write, seed.stamp)).toEqual({
            kind: 'step_nodes_in_use',
            count: 1,
            pairs: [
              {
                id: 'move-destination',
                name: 'Destination',
                stepId,
                workPackageId: seed.workPackageId,
                facts: [kind],
              },
            ],
          });
          expect(fixture.readEvidence()).toEqual(before);
        });
      },
    );
  }
  test(
    adapter +
      ' owned move commits an empty destination with its nonpoint clears and exact before-image',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, stores, seed, write } = await seedMove(fixture);
        expect(await source.stores.subtrees.writeMove(write, seed.stamp)).toMatchObject({
          kind: 'written',
          record: {
            workPackageId: seed.workPackageId,
            workItemId: 'move-existing',
            fromParentId: null,
            fromPosition: 20,
            parentId: 'move-destination',
            position: 10,
            destinationStatements: {
              workItemId: 'move-destination',
              readiness: 'ready',
              hold: 'on_hold',
            },
            clearedDemands: [
              { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
            ],
          },
        });
        expect(await stores.workItems.findById('move-existing')).toMatchObject({
          parentId: 'move-destination',
          position: 10,
        });
        expect(await stores.workItems.findById('move-destination')).toMatchObject({
          readiness: null,
          hold: null,
        });
        expect(await stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([]);
        expect(await stores.workItems.findById('move-sibling')).toMatchObject({
          parentId: null,
          position: 30,
        });
      });
    },
  );
  test(adapter + ' owned move refusal preserves unrelated writes in its actual loan', async () => {
    await withinMoveFixture(open, async (fixture) => {
      const { source, stores, seed, write, stepId } = await seedMove(fixture);
      expect(
        await stores.estimates.set(
          { workItemId: 'move-destination', stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
          seed.stamp,
        ),
      ).toBe('written');
      await source.uow.run(async ({ stores: borrowed }) => {
        expect(
          await borrowed.workItems.patch(
            'move-sibling',
            { name: 'Unrelated survives' },
            seed.stamp,
          ),
        ).toMatchObject({ ok: true });
        const before = await borrowed.workItems.listByWorkPackage(seed.workPackageId);
        expect(await borrowed.subtrees.writeMove(write, seed.stamp)).toMatchObject({
          kind: 'step_nodes_in_use',
          count: 1,
        });
        expect(await borrowed.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
        return { commit: true, value: undefined };
      });
      expect(await stores.workItems.findById('move-sibling')).toMatchObject({
        name: 'Unrelated survives',
      });
      expect(await stores.workItems.findById('move-destination')).toMatchObject({
        readiness: 'ready',
        hold: 'on_hold',
      });
      expect(await stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
        { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
      ]);
    });
  });
  test(adapter + ' owned move refuses stale respacing before any structural change', async () => {
    await withinMoveFixture(open, async (fixture) => {
      const { source, seed, write } = await seedMove(fixture),
        before = fixture.readEvidence();
      expect(
        await source.stores.subtrees.writeMove(
          { ...write, respaced: [{ id: 'move-sibling', position: 99 }] },
          seed.stamp,
        ),
      ).toEqual({ kind: 'stale_transition' });
      expect(fixture.readEvidence()).toEqual(before);
    });
  });
  test(
    adapter + ' owned move keeps missing and foreign destinations opaque and unchanged',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, stores, seed, write } = await seedMove(fixture);
        await stores.workItems.insert(
          workItemRow({ id: 'move-foreign-parent', workPackageId: seed.foreignWorkPackageId }),
          [],
          seed.stamp,
        );
        const before = fixture.readEvidence();
        for (const changed of [
          { ...write, workItemId: 'absent' },
          { ...write, parentId: 'absent' },
          { ...write, parentId: 'move-foreign-parent' },
        ]) {
          expect(await source.stores.subtrees.writeMove(changed, seed.stamp)).toEqual({
            kind: 'not_found',
          });
          expect(fixture.readEvidence()).toEqual(before);
        }
      });
    },
  );
  test(
    adapter + ' owned move rejects nonfinite positions and duplicate respacing without writes',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed, write } = await seedMove(fixture),
          before = fixture.readEvidence();
        for (const { changed, message } of [
          { changed: { ...write, position: NaN }, message: 'move position is not finite' },
          {
            changed: { ...write, respaced: [{ id: 'move-sibling', position: Infinity }] },
            message: 'move respaced position is not finite',
          },
          {
            changed: {
              ...write,
              respaced: [
                { id: 'move-sibling', position: 1 },
                { id: 'move-sibling', position: 2 },
              ],
            },
            message: 'move repeats a structural identity',
          },
          {
            changed: { ...write, respaced: [{ id: 'move-existing', position: 1 }] },
            message: 'move repeats a structural identity',
          },
        ]) {
          await expectMoveError(source.stores.subtrees.writeMove(changed, seed.stamp), message);
          expect(fixture.readEvidence()).toEqual(before);
        }
      });
    },
  );
  test(
    adapter + ' owned move refuses a candidate cycle before clearing its destination',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, stores, seed, write } = await seedMove(fixture);
        await stores.workItems.insert(
          workItemRow({
            id: 'move-descendant',
            workPackageId: seed.workPackageId,
            parentId: 'move-existing',
          }),
          [],
          seed.stamp,
        );
        const before = fixture.readEvidence();
        await expectMoveError(
          source.stores.subtrees.writeMove({ ...write, parentId: 'move-descendant' }, seed.stamp),
          'work items unreachable from any root',
        );
        expect(fixture.readEvidence()).toEqual(before);
      });
    },
  );

  for (const kind of ['ordinary', 'repair'] as const) {
    test(adapter + ' owned move expires with its ' + kind + ' loan', async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed, write } = await seedMove(fixture);
        const retained: { store: SubtreeStore | undefined } = { store: undefined };
        if (kind === 'ordinary')
          await source.uow.run(({ stores }) => {
            retained.store = stores.subtrees;
            return Promise.resolve({ commit: false, value: undefined });
          });
        else
          await source.uow.run<undefined>(() =>
            Promise.resolve({
              commit: false,
              value: undefined,
              afterRollback: ({ stores }) => {
                retained.store = stores.subtrees;
                return Promise.resolve();
              },
            }),
          );
        const expired = retained.store;
        if (expired === undefined) throw Error('actual move loan absent');
        const before = fixture.readEvidence();
        await expectMoveError(expired.writeMove(write, seed.stamp), 'closed');
        expect(fixture.readEvidence()).toEqual(before);
        await source.uow.run(async ({ stores }) => {
          await expectMoveError(expired.writeMove(write, seed.stamp), 'closed');
          expect(await stores.subtrees.writeMove(write, seed.stamp)).toMatchObject({
            kind: 'written',
          });
          return { commit: false, value: undefined };
        });
        expect(fixture.readEvidence()).toEqual(before);
      });
    });
  }
  test(adapter + ' owned move remains within its outer rollback', async () => {
    await withinMoveFixture(open, async (fixture) => {
      const { source, seed, write } = await seedMove(fixture),
        before = fixture.readEvidence();
      await source.uow.run(async ({ stores }) => {
        expect(await stores.subtrees.writeMove(write, seed.stamp)).toMatchObject({
          kind: 'written',
        });
        expect(await stores.workItems.findById(write.workItemId)).toMatchObject({
          parentId: write.parentId,
        });
        return { commit: false, value: undefined };
      });
      expect(fixture.readEvidence()).toEqual(before);
    });
  });
  for (const kind of ['retained-input', 'latest-facts'] as const) {
    test(adapter + ' owned public move queues with ' + kind, async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed, write, stepId } = await seedMove(fixture);
        const address = { ...write, respaced: [] as { id: string; position: number }[] };
        const pending: {
          value: Promise<Awaited<ReturnType<SubtreeStore['writeMove']>>> | undefined;
        } = { value: undefined };
        await source.uow.run(async ({ stores }) => {
          if (kind === 'latest-facts')
            expect(
              await stores.estimates.set(
                { workItemId: write.parentId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
                seed.stamp,
              ),
            ).toBe('written');
          pending.value = source.stores.subtrees.writeMove(address, seed.stamp);
          address.workItemId = 'move-sibling';
          address.parentId = 'absent';
          address.position = 999;
          address.respaced.push({ id: 'move-existing', position: 777 });
          return { commit: kind === 'latest-facts', value: undefined };
        });
        const queued = pending.value;
        if (queued === undefined) throw Error('actual public move did not queue');
        const written = await queued;
        expect(written).toMatchObject({
          kind: kind === 'latest-facts' ? 'step_nodes_in_use' : 'written',
        });
        expect(await source.stores.workItems.findById('move-existing')).toMatchObject(
          kind === 'latest-facts'
            ? { parentId: null, position: 20 }
            : { parentId: 'move-destination', position: 10 },
        );
        expect(await source.stores.workItems.findById('move-sibling')).toMatchObject({
          parentId: null,
          position: 30,
        });
        if (kind === 'latest-facts')
          expect(written).toMatchObject({
            count: 1,
            pairs: [{ id: 'move-destination', stepId, facts: ['estimate'] }],
          });
      });
    });
  }
  test(adapter + ' owned move rejects a candidate that strands a descendant endpoint', async () => {
    await withinMoveFixture(open, async (fixture) => {
      const { source, stores, seed, write, stepId } = await seedMove(fixture);
      await stores.workItems.insert(
        workItemRow({ id: 'move-old-parent', workPackageId: seed.workPackageId, position: 40 }),
        [],
        seed.stamp,
      );
      await stores.workItems.move('move-existing', 'move-old-parent', 10, [], seed.stamp);
      await stores.typedDependencies.add(
        {
          id: 'move-descendant-edge',
          workPackageId: seed.workPackageId,
          predecessor: {
            workPackageId: seed.workPackageId,
            workItemId: 'move-old-parent',
            scope: 'descendant-step',
            stepId,
          },
          successor: {
            workPackageId: seed.workPackageId,
            workItemId: 'move-sibling',
            scope: 'whole',
          },
          type: 'FS',
        },
        seed.stamp,
      );
      expect(await stores.typedDependencies.listByWorkPackage(seed.workPackageId)).toHaveLength(1);
      const before = fixture.readEvidence();
      await expectMoveError(
        source.stores.subtrees.writeMove(write, seed.stamp),
        'descendant step names a leaf',
      );
      expect(fixture.readEvidence()).toEqual(before);
    });
  });
}

/** Real application graph and real Source stores, under the explicit legacy edit policy; no mounted organization permission certificate is claimed. */
export function registerMoveServiceCases(adapter: string, open: OpenMoveFixture): void {
  for (const kind of ['estimate', 'actual', 'progress', 'measure', 'blockage'] as const) {
    test(
      adapter +
        ' move service refuses protected ' +
        kind +
        ' before clears, journal or announcement',
      async () => {
        await withinMoveFixture(open, async (fixture) => {
          const { source, stores, seed, stepId } = await seedMove(fixture);
          const address = { workItemId: 'move-destination', stepId };
          switch (kind) {
            case 'estimate':
              expect(
                await stores.estimates.set(
                  { ...address, optimistic: 1, realistic: 2, pessimistic: 3 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'actual':
              expect(
                await stores.actuals.set({ ...address, days: 2, recordedAt: 100 }, seed.stamp),
              ).toBe('written');
              break;
            case 'progress':
              expect(
                await stores.progress.set(
                  { ...address, state: 'in_progress', statedAt: 100 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'measure':
              expect(
                await stores.measures.set(
                  { ...address, metric: 'token_actual', value: 3, recordedAt: 100 },
                  seed.stamp,
                ),
              ).toBe('written');
              break;
            case 'blockage':
              expect(await stores.blockages.set({ ...address, blockedAt: 100 }, seed.stamp)).toBe(
                'written',
              );
              break;
          }
          const broadcast = recordingBroadcaster();
          const services = servicesOver(source.stores, {
            admission: LEGACY_EDIT_ADMISSION,
            dependencyContext: createLocalDependencyContext(source.stores),
            clock: testClock,
            broadcast,
            scheduler: fastScheduler,
          });
          const before = fixture.readEvidence();
          expect(
            await services.workItems.move(
              'move-existing',
              seed.stamp.by,
              { parentId: 'move-destination', afterId: null },
              { kind: 'legacy' },
            ),
          ).toEqual({
            ok: false,
            reason: 'step_nodes_in_use',
            count: 1,
            pairs: [
              {
                id: 'move-destination',
                name: 'Destination',
                workPackageId: seed.workPackageId,
                stepId,
                facts: [kind],
              },
            ],
          });
          expect(fixture.readEvidence()).toEqual(before);
          expect(broadcast.published).toEqual([]);
        });
      },
    );
  }
  test(
    adapter +
      ' move service preserves an actual late admitted progress fact without clears or publication',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed, stepId } = await seedMove(fixture);
        const original = source.stores.subtrees;
        let admitted = false;
        const capture: { before: ReturnType<StepCatalogueFixture['readEvidence']> | undefined } = {
          before: undefined,
        };
        const stores = {
          ...source.stores,
          subtrees: {
            ...original,
            async writeMove(
              write: Parameters<SubtreeStore['writeMove']>[0],
              stamp: Parameters<SubtreeStore['writeMove']>[1],
            ) {
              expect(
                await source.stores.progress.set(
                  { workItemId: 'move-destination', stepId, state: 'in_progress', statedAt: 101 },
                  seed.stamp,
                ),
              ).toBe('written');
              admitted = true;
              capture.before = fixture.readEvidence();
              return await original.writeMove(write, stamp);
            },
          },
        };
        const broadcast = recordingBroadcaster();
        const services = servicesOver(stores, {
          admission: LEGACY_EDIT_ADMISSION,
          dependencyContext: createLocalDependencyContext(stores),
          clock: testClock,
          broadcast,
          scheduler: fastScheduler,
        });
        expect(
          await services.workItems.move(
            'move-existing',
            seed.stamp.by,
            { parentId: 'move-destination', afterId: null },
            { kind: 'legacy' },
          ),
        ).toEqual({
          ok: false,
          reason: 'step_nodes_in_use',
          count: 1,
          pairs: [
            {
              id: 'move-destination',
              name: 'Destination',
              workPackageId: seed.workPackageId,
              stepId,
              facts: ['progress'],
            },
          ],
        });
        expect(admitted).toBe(true);
        if (capture.before === undefined) throw Error('actual late writer was not reached');
        expect(fixture.readEvidence()).toEqual(capture.before);
        expect(broadcast.published).toEqual([]);
      });
    },
  );
  test(
    adapter + ' move service journals an atomic move with exact nonpoint undo and redo',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed } = await seedMove(fixture),
          broadcast = recordingBroadcaster();
        const services = servicesOver(source.stores, {
          admission: LEGACY_EDIT_ADMISSION,
          dependencyContext: createLocalDependencyContext(source.stores),
          clock: testClock,
          broadcast,
          scheduler: fastScheduler,
        });
        expect(
          await services.workItems.move(
            'move-existing',
            seed.stamp.by,
            { parentId: 'move-destination', afterId: null },
            { kind: 'legacy' },
          ),
        ).toEqual({ ok: true, value: null });
        expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
          readiness: null,
          hold: null,
        });
        expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([]);
        const entries = await source.stores.journal.entriesFor({
          workPackageId: seed.workPackageId,
          userId: seed.stamp.by,
          personId: null,
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]?.payload).toMatchObject({
          forward: {
            do: 'batch',
            steps: [
              {
                do: 'move',
                workItemId: 'move-existing',
                parentId: 'move-destination',
                afterId: null,
              },
            ],
          },
        });
        expect(await services.workItems.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: true,
        });
        expect(await source.stores.workItems.findById('move-existing')).toMatchObject({
          parentId: null,
          position: 20,
        });
        expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
          readiness: 'ready',
          hold: 'on_hold',
        });
        expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
          { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
        ]);
        expect(await services.workItems.redo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: true,
        });
        expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
          readiness: null,
          hold: null,
        });
        expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([]);
      });
    },
  );
  test(
    adapter +
      ' atomic move replay watches the destination after undo even without a nonpoint inverse',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed } = await seedMove(fixture);
        expect(
          await source.stores.workItems.patch(
            'move-destination',
            { readiness: null, hold: null },
            seed.stamp,
          ),
        ).toMatchObject({ ok: true });
        expect(
          await source.stores.demands.set('move-destination', 'move-resource', null, seed.stamp),
        ).toBe('written');
        const broadcast = recordingBroadcaster();
        const services = servicesOver(source.stores, {
          admission: LEGACY_EDIT_ADMISSION,
          dependencyContext: createLocalDependencyContext(source.stores),
          clock: testClock,
          broadcast,
          scheduler: fastScheduler,
        });
        expect(
          await services.workItems.move(
            'move-existing',
            seed.stamp.by,
            { parentId: 'move-destination', afterId: null },
            { kind: 'legacy' },
          ),
        ).toEqual({ ok: true, value: null });
        expect(await services.workItems.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: true,
        });
        expect(
          await source.stores.subtrees.writeMove(
            {
              workPackageId: seed.workPackageId,
              workItemId: 'move-sibling',
              parentId: 'move-destination',
              position: 30,
              respaced: [],
            },
            seed.stamp,
          ),
        ).toMatchObject({ kind: 'written' });
        const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId),
          published = broadcast.published.length;
        expect(await services.workItems.redo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: false,
          reason: 'stale_undo',
        });
        expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
        expect(broadcast.published).toHaveLength(published);
      });
    },
  );
  test(
    adapter + ' atomic move replay retains the journal and precise pairs for a late protected fact',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed, stepId } = await seedMove(fixture),
          original = source.stores.subtrees;
        let calls = 0;
        const capture: { before: ReturnType<StepCatalogueFixture['readEvidence']> | undefined } = {
          before: undefined,
        };
        const stores = {
          ...source.stores,
          subtrees: {
            ...original,
            async writeMove(
              write: Parameters<SubtreeStore['writeMove']>[0],
              stamp: Parameters<SubtreeStore['writeMove']>[1],
            ) {
              calls++;
              if (calls === 3) {
                expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
                  readiness: 'ready',
                  hold: 'on_hold',
                });
                expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
                  { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
                ]);
                expect(
                  await source.stores.progress.set(
                    { workItemId: 'move-destination', stepId, state: 'in_progress', statedAt: 101 },
                    seed.stamp,
                  ),
                ).toBe('written');
                capture.before = fixture.readEvidence();
              }
              return await original.writeMove(write, stamp);
            },
          },
        };
        const broadcast = recordingBroadcaster();
        const services = servicesOver(stores, {
          admission: LEGACY_EDIT_ADMISSION,
          dependencyContext: createLocalDependencyContext(stores),
          clock: testClock,
          broadcast,
          scheduler: fastScheduler,
        });
        expect(
          await services.workItems.move(
            'move-existing',
            seed.stamp.by,
            { parentId: 'move-destination', afterId: null },
            { kind: 'legacy' },
          ),
        ).toEqual({ ok: true, value: null });
        expect(await services.workItems.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: true,
        });
        const published = broadcast.published.length;
        expect(await services.workItems.redo(seed.workPackageId, seed.stamp.by)).toEqual({
          ok: false,
          reason: 'step_nodes_in_use',
          detail: null,
          count: 1,
          pairs: [
            {
              id: 'move-destination',
              name: 'Destination',
              workPackageId: seed.workPackageId,
              stepId,
              facts: ['progress'],
            },
          ],
        });
        expect(calls).toBe(3);
        if (capture.before === undefined) throw Error('actual replay writer was not reached');
        expect(fixture.readEvidence()).toEqual(capture.before);
        expect(broadcast.published).toHaveLength(published);
      });
    },
  );
  test(
    adapter +
      ' move service restores the actual writer nonpoint before-image after concurrent admission',
    async () => {
      await withinMoveFixture(open, async (fixture) => {
        const { source, seed } = await seedMove(fixture),
          original = source.stores.subtrees;
        let admitted = false;
        const stores = {
          ...source.stores,
          subtrees: {
            ...original,
            async writeMove(
              write: Parameters<SubtreeStore['writeMove']>[0],
              stamp: Parameters<SubtreeStore['writeMove']>[1],
            ) {
              if (!admitted) {
                admitted = true;
                expect(
                  await source.stores.workItems.patch(
                    'move-destination',
                    { readiness: 'draft', hold: 'on_hold' },
                    seed.stamp,
                  ),
                ).toMatchObject({ ok: true });
                expect(
                  await source.stores.demands.set(
                    'move-destination',
                    'move-resource',
                    5,
                    seed.stamp,
                  ),
                ).toBe('written');
              }
              return await original.writeMove(write, stamp);
            },
          },
        };
        const broadcast = recordingBroadcaster();
        const services = servicesOver(stores, {
          admission: LEGACY_EDIT_ADMISSION,
          dependencyContext: createLocalDependencyContext(stores),
          clock: testClock,
          broadcast,
          scheduler: fastScheduler,
        });
        expect(
          await services.workItems.move(
            'move-existing',
            seed.stamp.by,
            { parentId: 'move-destination', afterId: null },
            { kind: 'legacy' },
          ),
        ).toEqual({ ok: true, value: null });
        expect(await services.workItems.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({
          ok: true,
        });
        expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
          readiness: 'draft',
          hold: 'on_hold',
        });
        expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
          { workItemId: 'move-destination', resourceId: 'move-resource', units: 5 },
        ]);
      });
    },
  );
}
