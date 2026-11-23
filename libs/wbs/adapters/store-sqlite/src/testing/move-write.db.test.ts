import { registerMoveWriteCases } from '@wbs/conformance';
import { registerMoveServiceCases } from '@wbs/conformance/stores/move-write';
import { expectMoveError } from '@wbs/conformance/stores/move-write';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { readStepBlockageActivation } from '../step-blockage-activation';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

async function openMoveFixture() {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  try {
    // Fixture-native admission on this isolated database; no host activation receipt is claimed.
    await fixture.source.uow.run(() => {
      fixture.source.db.run(sql`UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1`);
      return Promise.resolve({ commit: true, value: undefined });
    });
    expect(readStepBlockageActivation(fixture.source.db)).toBe('ENABLED');
    expect(
      await fixture.source.stores.directory.addResource(
        { id: 'move-resource', name: 'Move resource', kind: 'divisible', unitLabel: 'units' },
        fixture.seed.stamp,
      ),
    ).toMatchObject({ ok: true });
    await fixture.source.stores.directory.mapInOrganization(
      'resources',
      'move-resource',
      fixture.seed.organizationId,
      'Move resource',
      fixture.seed.stamp,
    );
    return fixture;
  } catch (primary: unknown) {
    try {
      await fixture.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'move setup and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}

registerMoveWriteCases('sqlite', openMoveFixture);

test('sqlite owned move late native failure preserves its actual loan while unrelated work commits', async () => {
  const fixture = await openMoveFixture();
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
    source.db.run(
      sql`CREATE TRIGGER owned_move_late_failure BEFORE UPDATE OF parent_id ON work_item WHEN NEW.id='move-existing' BEGIN SELECT RAISE(ABORT,'owned-move-late-failure'); END`,
    );
    await source.uow.run(async ({ stores }) => {
      expect(
        await stores.workItems.patch('move-sibling', { name: 'Unrelated survives' }, seed.stamp),
      ).toMatchObject({ ok: true });
      const before = fixture.readEvidence();
      await expectMoveError(
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
        'Failed query',
      );
      expect(fixture.readEvidence()).toEqual(before);
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
    expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([
      { workItemId: 'move-destination', resourceId: 'move-resource', units: 2 },
    ]);
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

registerMoveServiceCases('sqlite', openMoveFixture);
