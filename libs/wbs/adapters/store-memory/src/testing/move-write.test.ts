import { registerMoveWriteCases, stepCatalogueFixtureFromSource } from '@wbs/conformance';
import { registerMoveServiceCases } from '@wbs/conformance/stores/move-write';
import { observeMoveFailure } from '@wbs/conformance/stores/move-write';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import type { MemoryLateWriteSeam } from '../late-write-seam';
import { openMemorySourceWithLateWriteSeam } from '../source';
import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

async function openMoveFixture(lateWrite?: MemoryLateWriteSeam) {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture(
    undefined,
    lateWrite === undefined ? undefined : openMemorySourceWithLateWriteSeam(lateWrite),
  );
  try {
    expect(
      await fixture.source.stores.directory.addResource(
        { id: 'move-resource', name: 'Move resource', kind: 'divisible', unitLabel: 'units' },
        seed.stamp,
      ),
    ).toMatchObject({ ok: true });
    fixture.ownResourceInOrganization('move-resource', seed.organizationId);
    return await stepCatalogueFixtureFromSource(
      'memory:owned-move',
      fixture.source,
      seed,
      () => fixture.source.close(),
      () => fixture.stepCatalogueEvidence(),
      (corruption) => fixture.corruptStepFact(corruption),
    );
  } catch (primary: unknown) {
    try {
      await fixture.source.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'move setup and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}

registerMoveWriteCases('memory', openMoveFixture);

test('memory owned move late failure preserves its actual loan while unrelated work commits', async () => {
  let reached = 0;
  const fault = new Error('owned-move-late-failure');
  const fixture = await openMoveFixture({
    reach(phase) {
      if (phase === 'move-final-row') {
        reached++;
        throw fault;
      }
    },
  });
  const execution = await (async () => {
    const { source, seed } = fixture;
    for (const row of [
      workItemRow({
        id: 'move-destination',
        workPackageId: seed.workPackageId,
        readiness: 'ready',
        hold: 'on_hold',
      }),
      workItemRow({ id: 'move-existing', workPackageId: seed.workPackageId, position: 20 }),
      workItemRow({ id: 'move-sibling', workPackageId: seed.workPackageId, position: 30 }),
    ])
      await source.stores.workItems.insert(row, [], seed.stamp);
    expect(
      await source.stores.demands.set('move-destination', 'move-resource', 2, seed.stamp),
    ).toBe('written');
    await source.uow.run(async ({ stores }) => {
      expect(
        await stores.workItems.patch('move-sibling', { name: 'Unrelated survives' }, seed.stamp),
      ).toMatchObject({ ok: true });
      const before = await stores.workItems.listByWorkPackage(seed.workPackageId);
      expect(
        await observeMoveFailure(
          stores.subtrees.writeMove(
            {
              workPackageId: seed.workPackageId,
              workItemId: 'move-existing',
              parentId: 'move-destination',
              position: 10,
              respaced: [],
            },
            seed.stamp,
          ),
        ),
      ).toBe(fault);
      expect(reached).toBe(1);
      expect(await stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
      expect(await stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
        { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
      ]);
      return { commit: true, value: undefined };
    });
    expect(await source.stores.workItems.findById('move-sibling')).toMatchObject({
      name: 'Unrelated survives',
    });
    expect(await source.stores.workItems.findById('move-existing')).toMatchObject({
      parentId: null,
      position: 20,
    });
    expect(await source.stores.workItems.findById('move-destination')).toMatchObject({
      readiness: 'ready',
      hold: 'on_hold',
    });
  })().then(
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
      'move fault assertion and close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
});

registerMoveServiceCases('memory', openMoveFixture);
