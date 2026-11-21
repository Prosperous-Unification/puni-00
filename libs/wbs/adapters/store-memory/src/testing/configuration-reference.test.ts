import type { StepCatalogueSeed } from '@wbs/core/testing/step-catalogue-seed';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { MemorySourceFixture } from '../source';
import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

/** Real current Source setup, including distinct actual projects and packages; no fabricated reference answers. */
async function withConfigurationSource(
  use: (source: MemorySourceFixture['source'], seed: StepCatalogueSeed) => Promise<void>,
): Promise<void> {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  const source = fixture.source;
  let outcome: { ok: true } | { ok: false; cause: unknown };
  try {
    await source.stores.directory.addTeam(
      { id: 'configuration-team', name: 'Configuration team' },
      seed.stamp,
    );
    await use(source, seed);
    outcome = { ok: true };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  try {
    await source.close();
  } catch (cleanup: unknown) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, cleanup],
        'Configuration assertion and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (!outcome.ok) throw outcome.cause;
}

for (const mode of ['public', 'borrowed'] as const) {
  test(`memory ${mode} capacity refuses absent package/team on set and clear, including an actual project address`, async () => {
    await withConfigurationSource(async (source, seed) => {
      const assertReferences = async (capacity: typeof source.stores.capacity) => {
        for (const size of [3, null]) {
          expect(
            await capacity.set('absent-package', 'configuration-team', size, seed.stamp),
          ).toEqual({ ok: false, reason: 'not_found' });
          expect(
            await capacity.set(seed.projectId, 'configuration-team', size, seed.stamp),
          ).toEqual({ ok: false, reason: 'not_found' });
          expect(await capacity.set(seed.workPackageId, 'absent-team', size, seed.stamp)).toEqual({
            ok: false,
            reason: 'not_found',
          });
        }
        expect(await capacity.listFor('absent-package')).toEqual([]);
        expect(await capacity.listFor(seed.projectId)).toEqual([]);
        expect(await capacity.listFor(seed.workPackageId)).toEqual([]);
        expect(await capacity.set(seed.workPackageId, 'configuration-team', 2, seed.stamp)).toEqual(
          { ok: true },
        );
        expect(await capacity.listFor(seed.workPackageId)).toEqual([
          { serviceTeamId: 'configuration-team', size: 2 },
        ]);
      };
      if (mode === 'public') await assertReferences(source.stores.capacity);
      else
        await source.uow.run(async ({ stores }) => {
          await assertReferences(stores.capacity);
          return { commit: true, value: undefined };
        });
      expect(await source.stores.capacity.listFor(seed.workPackageId)).toEqual([
        { serviceTeamId: 'configuration-team', size: 2 },
      ]);
    });
  });

  test(`memory ${mode} priority bands refuse an absent package and actual project without changing stored ladders`, async () => {
    await withConfigurationSource(async (source, seed) => {
      const replacement = DEFAULT_PRIORITY_BANDS.map((band, index) => ({
        ...band,
        label: 'Custom ' + String(index),
      }));
      const assertReferences = async (priorityBands: typeof source.stores.priorityBands) => {
        for (const address of ['absent-package', seed.projectId]) {
          expect(await priorityBands.replace(address, replacement, seed.stamp)).toEqual({
            ok: false,
            reason: 'not_found',
          });
          expect(await priorityBands.listFor(address)).toEqual([...DEFAULT_PRIORITY_BANDS]);
        }
        expect(await priorityBands.listFor(seed.workPackageId)).toEqual([
          ...DEFAULT_PRIORITY_BANDS,
        ]);
        expect(await priorityBands.replace(seed.workPackageId, replacement, seed.stamp)).toEqual({
          ok: true,
        });
        expect(await priorityBands.listFor(seed.workPackageId)).toEqual(replacement);
        expect(await priorityBands.listFor(seed.siblingWorkPackageId)).toEqual([
          ...DEFAULT_PRIORITY_BANDS,
        ]);
      };
      if (mode === 'public') await assertReferences(source.stores.priorityBands);
      else
        await source.uow.run(async ({ stores }) => {
          await assertReferences(stores.priorityBands);
          return { commit: true, value: undefined };
        });
      expect(await source.stores.priorityBands.listFor(seed.workPackageId)).toEqual(replacement);
    });
  });
}

test('memory queued capacity checks the actual team after the holding writer commits its removal', async () => {
  await withConfigurationSource(async (source, seed) => {
    let pending: ReturnType<typeof source.stores.capacity.set> | undefined;
    const holding = await Promise.allSettled([
      source.uow.run(async ({ stores }) => {
        pending = source.stores.capacity.set(
          seed.workPackageId,
          'configuration-team',
          2,
          seed.stamp,
        );
        expect(
          await stores.directory.removeTeam('configuration-team', false, seed.stamp),
        ).toMatchObject({ ok: true });
        return { commit: true, value: undefined };
      }),
    ]);
    if (pending === undefined) throw new Error('Capacity request was not queued');
    const written = await Promise.allSettled([pending]);
    expect(holding).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(written).toEqual([{ status: 'fulfilled', value: { ok: false, reason: 'not_found' } }]);
    expect(await source.stores.capacity.listFor(seed.workPackageId)).toEqual([]);
  });
});
