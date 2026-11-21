import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { beforeEach, expect, it } from 'bun:test';

import { inMemoryWorkItems } from './memory-work-item-fixture';
import { inMemoryStepBlockages, memoryStepBlockageTable } from './step-blockage-fixture';
import { inMemorySteps, stepRow } from './step-fixture';

const stamp = { at: 1, by: 'u' };
let workItems: ReturnType<typeof inMemoryWorkItems>;
let steps: ReturnType<typeof inMemorySteps>;
let table: ReturnType<typeof memoryStepBlockageTable>;
let blockages: ReturnType<typeof inMemoryStepBlockages>;
beforeEach(async () => {
  workItems = inMemoryWorkItems();
  steps = inMemorySteps([
    stepRow({ id: 'dev', workPackageId: 'p', position: 1 }),
    stepRow({ id: 'qa', workPackageId: 'p', position: 2 }),
  ]);
  await workItems.insert(workItemRow({ id: 'a', workPackageId: 'p' }), [], stamp);
  await workItems.insert(workItemRow({ id: 'b', workPackageId: 'p' }), [], stamp);
  table = memoryStepBlockageTable();
  blockages = inMemoryStepBlockages(workItems, steps, table);
});
it('keeps pair-keyed sparse facts ordered and preserves original timestamps on moves', async () => {
  await blockages.set({ workItemId: 'a', stepId: 'qa', blockedAt: 2 }, stamp);
  await blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1 }, stamp);
  expect((await blockages.listByWorkPackage('p')).map((row) => row.stepId)).toEqual(['dev', 'qa']);
  await blockages.set({ workItemId: 'b', stepId: 'dev', blockedAt: 3 }, stamp);
  await blockages.remove('a', 'dev', stamp);
  await blockages.moveAll('a', 'b', stamp);
  expect(await blockages.listByWorkItems('p', ['b'])).toEqual([
    { workItemId: 'b', stepId: 'dev', blockedAt: 3 },
    { workItemId: 'b', stepId: 'qa', blockedAt: 2 },
  ]);
  expect(await blockages.listByWorkItems('p', ['a'])).toEqual([]);
});
it('refuses missing steps, malformed timestamps and parent owners', async () => {
  expect(await blockages.set({ workItemId: 'a', stepId: 'gone', blockedAt: 1 }, stamp)).toBe(
    'unknown_step',
  );
  expect(blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1.5 }, stamp)).rejects.toThrow(
    /invalid blocked time/,
  );
  await workItems.insert(
    workItemRow({ id: 'child', workPackageId: 'p', parentId: 'a' }),
    [],
    stamp,
  );
  expect(blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1 }, stamp)).rejects.toThrow(
    /not a leaf/,
  );
  table.rows.push({ workItemId: 'gone', stepId: 'dev', blockedAt: 1 });
  expect(blockages.listByWorkPackage('p')).rejects.toThrow(/invalid work-item reference/);
});

it('refuses cross-work-package steps, corrupted read facts and invalid transfer destinations', async () => {
  steps.rows.push(stepRow({ id: 'foreign', workPackageId: 'foreign' }));
  expect(
    blockages.set({ workItemId: 'a', stepId: 'foreign', blockedAt: 1 }, stamp),
  ).rejects.toThrow(/invalid step reference/);
  expect(blockages.set({ workItemId: 'gone', stepId: 'dev', blockedAt: 1 }, stamp)).rejects.toThrow(
    /invalid work-item reference/,
  );
  table.rows.push({ workItemId: 'a', stepId: 'gone', blockedAt: 1 });
  expect(blockages.listByWorkPackage('p')).rejects.toThrow(/invalid step reference/);
  expect(blockages.moveAll('a', 'b', stamp)).rejects.toThrow(/invalid step reference/);
  table.rows.splice(0);
  await blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1 }, stamp);
  expect(blockages.moveAll('a', 'gone', stamp)).rejects.toThrow(/invalid work-item reference/);
});
it('refuses duplicate transfers atomically and reads parent-owned corruption loudly', async () => {
  await blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1 }, stamp);
  await blockages.set({ workItemId: 'b', stepId: 'dev', blockedAt: 2 }, stamp);
  const before = await blockages.listByWorkPackage('p');
  expect(blockages.moveAll('a', 'b', stamp)).rejects.toThrow(/duplicate step blockage/);
  expect(await blockages.listByWorkPackage('p')).toEqual(before);
  await workItems.insert(
    workItemRow({ id: 'child', workPackageId: 'p', parentId: 'a' }),
    [],
    stamp,
  );
  expect(blockages.listByWorkPackage('p')).rejects.toThrow(/not a leaf/);
});
