import type { Source, TransactionalStores, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, it } from 'bun:test';

/** Sparse overrides must have identical observable transaction semantics in both sources. */
export function stepParallelConformance(
  open: () => { source: Source<TransactionalStores>; stamp: WriteStamp },
): void {
  it('stores explicit equal-default facts, replaces one pair and removes only that pair', async () => {
    const { source, stamp } = open();
    const store = source.stores.stepParallels;
    expect(store).toBeDefined();
    expect(await store.listByProject('p')).toEqual([]);
    await store.set({ workItemId: 'a', stepId: 'dev', maxParallel: 1 }, stamp);
    await store.set({ workItemId: 'a', stepId: 'qa', maxParallel: 1000 }, stamp);
    await store.set({ workItemId: 'a', stepId: 'dev', maxParallel: 3 }, stamp);
    expect(await store.listByWorkItems('p', ['a'])).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 3 },
      { workItemId: 'a', stepId: 'qa', maxParallel: 1000 },
    ]);
    expect(await store.listByWorkItems('p', [])).toEqual([]);
    await store.remove('a', 'dev', stamp);
    expect(await store.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'qa', maxParallel: 1000 },
    ]);
    expect(await store.listByProject('foreign')).toEqual([]);
  });
  it('orders mixed-case owner IDs identically to SQLite binary order', async () => {
    const { source, stamp } = open();
    for (const id of ['work-a', 'work-A']) {
      await source.stores.workItems.insert(workItemRow({ id, projectId: 'p' }), [], stamp);
      await source.stores.stepParallels.set(
        { workItemId: id, stepId: 'dev', maxParallel: 2 },
        stamp,
      );
    }
    expect(
      (await source.stores.stepParallels.listByProject('p')).map(({ workItemId }) => workItemId),
    ).toEqual(['work-A', 'work-a']);
  });
  it('rejects each invalid value without storing a fact', async () => {
    const { source, stamp } = open();
    for (const maxParallel of [0, 1001, 1.5, NaN, Infinity])
      await assertStepParallelRefusal(
        source.stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel }, stamp),
        'integer from 1 to 1000',
      );
    expect(await source.stores.stepParallels.listByProject('p')).toEqual([]);
  });
  it('rejects parent ownership, foreign steps, absent steps and absent owners independently', async () => {
    const { source, stamp } = open();
    for (const [workItemId, stepId] of [
      ['parent', 'dev'],
      ['a', 'foreign'],
      ['a', 'absent'],
      ['absent', 'dev'],
    ])
      await assertStepParallelRefusal(
        source.stores.stepParallels.set({ workItemId, stepId, maxParallel: 2 }, stamp),
      );
    expect(await source.stores.stepParallels.listByProject('p')).toEqual([]);
  });
  it('commits sparse facts and rolls back replacements and removals with the surrounding batch', async () => {
    const { source, stamp } = open();
    await source.uow.run(async ({ stores }) => {
      await stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel: 2 }, stamp);
      return { commit: true, value: undefined };
    });
    const before = await source.stores.stepParallels.listByProject('p');
    expect(before).toEqual([{ workItemId: 'a', stepId: 'dev', maxParallel: 2 }]);
    await source.uow.run(async ({ stores }) => {
      await stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel: 9 }, stamp);
      await stores.stepParallels.set({ workItemId: 'a', stepId: 'qa', maxParallel: 4 }, stamp);
      await stores.stepParallels.remove('a', 'dev', stamp);
      return { commit: false, value: undefined };
    });
    expect(await source.stores.stepParallels.listByProject('p')).toEqual(before);
    await assertStepParallelRefusal(
      source.uow.run(async ({ stores }) => {
        await stores.stepParallels.remove('a', 'dev', stamp);
        await stores.stepParallels.set({ workItemId: 'a', stepId: 'qa', maxParallel: 4 }, stamp);
        throw new Error('injected late failure');
      }),
      'injected late failure',
    );
    expect(await source.stores.stepParallels.listByProject('p')).toEqual(before);
  });
}

/** Awaits the production operation itself before later state assertions run. */
export async function assertStepParallelRefusal(
  operation: Promise<unknown>,
  message?: string | RegExp,
): Promise<void> {
  await operation.then(
    () => {
      throw new Error('step parallelism operation unexpectedly resolved');
    },
    (cause: unknown) => {
      expect(() => {
        throw cause;
      }).toThrow(message);
    },
  );
}
