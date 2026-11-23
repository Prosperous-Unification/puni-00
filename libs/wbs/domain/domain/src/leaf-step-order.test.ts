import { expect, test } from 'bun:test';

import { captureLeafStepOrders } from './leaf-step-order';
const rows = [
  { id: 'p', parentId: null },
  { id: 'a', parentId: 'p' },
  { id: 'empty', parentId: null },
];
const resolved = [
  { id: 'p' },
  { id: 'a', steps: [{ stepId: 'qa' }, { stepId: 'dev' }] },
  { id: 'empty', steps: [] },
];
test('captures own identities, excludes parents and detaches ordered arrays', () => {
  const found = captureLeafStepOrders(rows, resolved);
  expect(found).toEqual([
    { workItemId: 'a', stepIds: ['qa', 'dev'] },
    { workItemId: 'empty', stepIds: [] },
  ]);
  resolved[1]?.steps?.reverse();
  expect(found[0]?.stepIds).toEqual(['qa', 'dev']);
});
for (const fault of ['row', 'metadata'] as const)
  test('refuses missing captured leaf ' + fault, () => {
    const incomplete =
      fault === 'row'
        ? resolved.filter((row) => row.id !== 'empty')
        : resolved.map((row) => (row.id === 'empty' ? { id: row.id } : row));
    expect(() => captureLeafStepOrders(rows, incomplete)).toThrow(
      'captured leaf step order is absent for empty',
    );
  });
