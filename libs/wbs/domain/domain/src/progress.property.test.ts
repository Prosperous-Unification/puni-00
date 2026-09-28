import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { foldStatuses, WORK_ITEM_STATUSES, type WorkItemStatus } from './progress';

type StatusTree = WorkItemStatus | readonly StatusTree[];

const { tree } = fc.letrec<{ tree: StatusTree }>((recur) => ({
  tree: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constantFrom(...WORK_ITEM_STATUSES),
    fc.array(recur('tree'), { minLength: 1, maxLength: 4 }),
  ),
}));

const leavesOf = (node: StatusTree): WorkItemStatus[] =>
  typeof node === 'string' ? [node] : node.flatMap(leavesOf);

const foldTree = (node: StatusTree): WorkItemStatus =>
  typeof node === 'string' ? node : foldStatuses(node.map(foldTree));

describe('foldStatuses over any tree', () => {
  it('folds a parent from its children exactly as from every leaf beneath it', () => {
    // be-01 folds the tree level by level and fe-01 folds whatever subset of
    // rows a filter leaves; both must say the same thing about one branch.
    fc.assert(
      fc.property(tree, (node) => {
        expect(foldTree(node)).toBe(foldStatuses(leavesOf(node)));
      }),
      { numRuns: 2_000 },
    );
  });
});
