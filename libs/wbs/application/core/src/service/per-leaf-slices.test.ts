import { buildSolverRequest } from '@wbs/contracts/solver/build-request';
import { quantisedFastBaseline } from '@wbs/contracts/solver/quantised-baseline';
import {
  DEFAULT_ESTIMATE_RULE,
  schedule,
  sliceKey,
  SOLVER_QUANTUM,
  type StoredEstimate,
  type TypedDependency,
  withoutHeldSubtrees,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { labelledRow } from '../testing/work-item-fixture';
import { slicesOf } from './schedule-slices';

const rows = [
  labelledRow({ id: 'P', parentId: null }),
  ...['story', 'spike', 'zero'].map((id, position) => labelledRow({ id, parentId: 'P', position })),
  labelledRow({ id: 'qa-first', parentId: null, position: 10 }),
];
const policies = ['research', 'qa', 'dev'].map((id) => ({
  id,
  allowancePercent: 0,
  estimateUnit: 'workdays' as const,
}));
const orders = new Map([
  ['story', ['dev', 'qa']],
  ['spike', ['research']],
  ['zero', []],
  ['qa-first', ['qa', 'dev']],
]);
const estimateRows = [
  ['story', 'dev', 2],
  ['story', 'qa', 1],
  ['spike', 'research', 3],
  ['qa-first', 'qa', 2],
  ['qa-first', 'dev', 1],
] as const;
const estimates: StoredEstimate[] = estimateRows.map(([workItemId, stepId, days]) => ({
  workItemId,
  stepId,
  optimistic: days,
  realistic: days,
  pessimistic: days,
}));

const prepare = (byLeaf: ReadonlyMap<string, readonly string[]> = orders, stated = estimates) =>
  slicesOf(
    rows,
    stated,
    new Set(['P']),
    policies,
    DEFAULT_ESTIMATE_RULE,
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    { kind: 'leaf', byLeaf },
  );

test('current slices follow each leaf order and keep a zero-step boundary', () => {
  expect(prepare().map(({ workItemId, stepId, days }) => [workItemId, stepId, days])).toEqual([
    ['story', 'dev', 2],
    ['story', 'qa', 1],
    ['spike', 'research', 3],
    ['zero', null, null],
    ['qa-first', 'qa', 2],
    ['qa-first', 'dev', 1],
  ]);
});

test('current slicing refuses a missing required leaf inventory', () => {
  const missing = new Map(orders);
  missing.delete('zero');
  expect(() => prepare(missing)).toThrow('slice step order is absent for zero');
});

test('current slicing refuses unestimated step identities outside package policies', () => {
  expect(() => prepare(new Map([...orders, ['story', ['missing']]]), [])).toThrow(
    'slice step missing is outside package policies',
  );
});

test('current slicing refuses repeated identities within a leaf', () => {
  expect(() => prepare(new Map([...orders, ['story', ['dev', 'dev']]]), [])).toThrow(
    'slice step dev is repeated for story',
  );
});

test('current slicing refuses a package-owned estimate outside its leaf resolution', () => {
  expect(() =>
    prepare(orders, [
      ...estimates,
      { workItemId: 'story', stepId: 'research', optimistic: 9, realistic: 9, pessimistic: 9 },
    ]),
  ).toThrow('estimate step research is not resolved for story');
});

test('explicit uniform slicing retains the legacy package inventory for every leaf', () => {
  const uniform = slicesOf(
    rows,
    [],
    new Set(['P']),
    policies,
    DEFAULT_ESTIMATE_RULE,
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    { kind: 'uniform' },
  );
  expect(uniform.map(({ workItemId, stepId }) => [workItemId, stepId])).toEqual([
    ['story', 'research'],
    ['story', 'qa'],
    ['story', 'dev'],
    ['spike', 'research'],
    ['spike', 'qa'],
    ['spike', 'dev'],
    ['zero', 'research'],
    ['zero', 'qa'],
    ['zero', 'dev'],
    ['qa-first', 'research'],
    ['qa-first', 'qa'],
    ['qa-first', 'dev'],
  ]);
});

test('current resources apply only to resolved slices and retain leaf boundary demands', () => {
  const slices = slicesOf(
    rows,
    estimates,
    new Set(['P']),
    policies,
    DEFAULT_ESTIMATE_RULE,
    new Map([['story', { dev: 'ada' }]]),
    new Map([['story', { teamIds: ['team'] }]]),
    new Map([['team', 2]]),
    new Map([
      ['story', [{ resourceId: 'machine', units: 1 }]],
      ['zero', [{ resourceId: 'machine', units: 1 }]],
    ]),
    { kind: 'leaf', byLeaf: orders },
  );
  expect(
    slices
      .filter((slice) => slice.workItemId === 'story')
      .map(({ stepId, personId, width, poolIds, demands }) => ({
        stepId,
        personId,
        width,
        poolIds,
        demands,
      })),
  ).toEqual([
    {
      stepId: 'dev',
      personId: 'ada',
      width: 1,
      poolIds: ['team'],
      demands: [{ resourceId: 'machine', units: 1 }],
    },
    {
      stepId: 'qa',
      personId: 'ada',
      width: 1,
      poolIds: ['team'],
      demands: [{ resourceId: 'machine', units: 1 }],
    },
  ]);
  expect(slices.find((slice) => slice.workItemId === 'zero')).toMatchObject({
    stepId: null,
    days: null,
    demands: [{ resourceId: 'machine', units: 1 }],
  });
});

test('Fast and solver request share mixed descendant edges and zero-step boundaries', () => {
  const slices = prepare();
  const typed: TypedDependency[] = [
    {
      id: 'qa-after-story',
      type: 'FS',
      predecessor: { scope: 'descendant-step', workItemId: 'P', stepId: 'qa' },
      successor: { scope: 'node', workItemId: 'qa-first', stepId: 'qa' },
    },
    {
      id: 'story-to-boundary',
      type: 'FS',
      predecessor: { scope: 'whole', workItemId: 'story' },
      successor: { scope: 'whole', workItemId: 'zero' },
    },
    {
      id: 'boundary-to-target',
      type: 'FS',
      predecessor: { scope: 'whole', workItemId: 'zero' },
      successor: { scope: 'whole', workItemId: 'qa-first' },
    },
  ];
  const fast = schedule(rows, [], slices, new Map(), new Map(), 'whole-item', new Map(), typed);
  expect(
    ['story', 'spike', 'zero', 'qa-first'].map((id) => [
      id,
      fast.workItems.get(id)?.earliestStart,
      fast.workItems.get(id)?.earliestFinish,
    ]),
  ).toEqual([
    ['story', 0, 3],
    ['spike', 0, 3],
    ['zero', 3, 3],
    ['qa-first', 3, 6],
  ]);
  const baselineOffsets = quantisedFastBaseline(
    rows,
    [],
    slices,
    new Map(),
    new Map(),
    'whole-item',
    typed,
  );
  const built = buildSolverRequest(
    {
      rows,
      edges: [],
      slices,
      notBefore: new Map(),
      poolSizes: new Map(),
      reach: 'whole-item',
      deadlines: new Map(),
      typed,
    },
    'pri',
    { baselineOffsets, solverVersion: '0.4.0', budgetMs: 1000 },
  );
  if (!built.ok) throw new Error('Mixed solver request refused: ' + built.failure);
  expect(built.request.edges).toEqual([
    { predecessorKey: sliceKey('story', 'dev'), successorKey: sliceKey('story', 'qa'), type: 'FS' },
    {
      predecessorKey: sliceKey('qa-first', 'qa'),
      successorKey: sliceKey('qa-first', 'dev'),
      type: 'FS',
    },
    {
      predecessorKey: sliceKey('story', 'qa'),
      successorKey: sliceKey('qa-first', 'qa'),
      type: 'FS',
    },
    { predecessorKey: sliceKey('story', 'qa'), successorKey: sliceKey('zero', null), type: 'FS' },
    {
      predecessorKey: sliceKey('zero', null),
      successorKey: sliceKey('qa-first', 'qa'),
      type: 'FS',
    },
  ]);
  expect(built.request.baselineOffsets[sliceKey('qa-first', 'qa')]).toBe(3 * SOLVER_QUANTUM);
  expect(
    built.request.slices.find((slice) => slice.key === sliceKey('zero', null))?.durationUnits,
  ).toBe(0);
  expect(built.request.baselineOffsets[sliceKey('zero', null)]).toBe(3 * SOLVER_QUANTUM);
});

const selector: TypedDependency = {
  id: 'held-qa',
  type: 'FS',
  predecessor: { scope: 'descendant-step', workItemId: 'P', stepId: 'qa' },
  successor: { scope: 'node', workItemId: 'qa-first', stepId: 'qa' },
};
const heldInput = (typed: readonly TypedDependency[] = [selector]) => ({
  rows,
  slices: prepare(),
  edges: [],
  typed,
  notBefore: new Map<string, number>(),
  deadlines: new Map<string, number>(),
  poolSizes: new Map<string, number>(),
  reach: 'whole-item' as const,
});

test('holding every matching descendant suppresses that constraint without hiding its authored input', () => {
  const original = heldInput();
  const reduced = withoutHeldSubtrees(original, new Set(['story']));
  expect(original.typed).toEqual([selector]);
  expect(reduced.typed).toEqual([]);
  expect(reduced.rows.map((row) => row.id)).toEqual(['P', 'spike', 'zero', 'qa-first']);
  const fast = schedule(
    reduced.rows,
    reduced.edges,
    reduced.slices,
    reduced.notBefore,
    reduced.poolSizes,
    reduced.reach,
    reduced.deadlines,
    reduced.typed,
  );
  expect(fast.workItems.get('qa-first')?.earliestStart).toBe(0);
});

test('held reduction does not hide a selector with no original matching descendants', () => {
  const invalid: TypedDependency = {
    ...selector,
    predecessor: { scope: 'descendant-step', workItemId: 'P', stepId: 'missing' },
  };
  expect(() => withoutHeldSubtrees(heldInput([invalid]), new Set(['story']))).toThrow(
    'no_descendant_resolves_step',
  );
});

test('held reduction refuses a missing descendant owner instead of dropping an invalid constraint', () => {
  const invalid: TypedDependency = {
    ...selector,
    predecessor: { scope: 'descendant-step', workItemId: 'missing', stepId: 'qa' },
  };
  expect(() => withoutHeldSubtrees(heldInput([invalid]), new Set(['story']))).toThrow(
    'held descendant endpoint owner missing is absent',
  );
});

test('held reduction keeps remaining matching descendants as constraints', () => {
  const original = {
    ...heldInput([
      { ...selector, successor: { scope: 'node', workItemId: 'spike', stepId: 'research' } },
    ]),
    rows: rows.map((row) => (row.id === 'qa-first' ? { ...row, parentId: 'P' } : row)),
  };
  const reduced = withoutHeldSubtrees(original, new Set(['story']));
  expect(reduced.typed).toEqual(original.typed);
  const fast = schedule(
    reduced.rows,
    reduced.edges,
    reduced.slices,
    reduced.notBefore,
    reduced.poolSizes,
    reduced.reach,
    reduced.deadlines,
    reduced.typed,
  );
  expect(fast.workItems.get('spike')?.earliestStart).toBe(2);
});

test('held reduction refuses absent descendant slices even when another descendant matches', () => {
  const original = heldInput();
  const missing = {
    ...original,
    slices: original.slices.filter((slice) => slice.workItemId !== 'zero'),
  };
  expect(() => withoutHeldSubtrees(missing, new Set(['story']))).toThrow(
    'held descendant slices for zero are absent',
  );
});
