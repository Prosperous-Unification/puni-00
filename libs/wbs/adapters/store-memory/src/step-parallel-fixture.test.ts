import { assertStepParallelRefusal } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import { inMemoryStores } from './in-memory-source';
import { inMemoryStepParallels, memoryStepParallelTable } from './step-parallel-fixture';

let stores: ReturnType<typeof inMemoryStores>;
let table: ReturnType<typeof memoryStepParallelTable>;
let parallel: ReturnType<typeof inMemoryStepParallels>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  stores = inMemoryStores();
  table = memoryStepParallelTable();
  parallel = inMemoryStepParallels(stores.workItems, stores.steps, table);
  await stores.steps.add(
    { id: 'dev', projectId: 'p', name: 'Dev', allowancePercent: 0, estimateUnit: 'workdays' },
    stamp,
  );
  await stores.steps.add(
    {
      id: 'foreign',
      projectId: 'foreign',
      name: 'Foreign',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await stores.workItems.insert(workItemRow({ id: 'a', projectId: 'p' }), [], stamp);
  await stores.workItems.insert(workItemRow({ id: 'parent', projectId: 'p' }), [], stamp);
  await stores.workItems.insert(
    workItemRow({ id: 'child', projectId: 'p', parentId: 'parent' }),
    [],
    stamp,
  );
});
describe('memory parallelism corruption boundary', () => {
  for (const [name, workItemId, stepId, maxParallel] of [
    ['owner', 'absent', 'dev', 2],
    ['step', 'a', 'absent', 2],
    ['project', 'a', 'foreign', 2],
    ['leaf', 'parent', 'dev', 2],
    ['range', 'a', 'dev', 1001],
  ] as const)
    it(`read refuses corrupt ${name}`, async () => {
      table.rows.push({ workItemId, stepId, maxParallel });
      const messages = {
        owner: 'invalid work-item reference',
        step: 'invalid step reference',
        project: 'project mismatch',
        leaf: 'not a leaf',
        range: 'integer from 1 to 1000',
      };
      await assertStepParallelRefusal(parallel.listByProject('p'), messages[name]);
      await assertStepParallelRefusal(parallel.listByWorkItems('p', [workItemId]), messages[name]);
    });
  it('write refuses a missing owner with a trusted-reference error', async () => {
    await assertStepParallelRefusal(
      parallel.set({ workItemId: 'absent', stepId: 'dev', maxParallel: 2 }, stamp),
      'invalid work-item reference',
    );
  });
  it('read refuses duplicate pairs rather than choosing one', async () => {
    table.rows.push(
      { workItemId: 'a', stepId: 'dev', maxParallel: 2 },
      { workItemId: 'a', stepId: 'dev', maxParallel: 3 },
    );
    await assertStepParallelRefusal(parallel.listByProject('p'), /duplicate/);
  });
  it('reads and writes detached values', async () => {
    const authored = { workItemId: 'a', stepId: 'dev', maxParallel: 2 };
    await parallel.set(authored, stamp);
    authored.maxParallel = 4;
    const read = await parallel.listByProject('p');
    expect(read).toEqual([{ workItemId: 'a', stepId: 'dev', maxParallel: 2 }]);
    read[0].maxParallel = 9;
    expect(await parallel.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 2 },
    ]);
  });
});
