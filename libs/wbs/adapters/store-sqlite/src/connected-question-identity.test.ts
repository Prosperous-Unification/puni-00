import {
  type ConnectedOptimizationStage,
  resolveScheduleInput,
  scheduleResolved,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { captureConnectedQuestion } from './connected-question-identity';
const installed = { solverVersion: '0.4.0', budgetMs: 100 };
const inputHash = (captured: ConnectedOptimizationStage) =>
  captureConnectedQuestion(captured, 'time', installed).inputHash;
test('every retained placement constraint family changes the canonical stage identity', () => {
  const captured = stage();
  const original = inputHash(captured);
  const variants: readonly [string, ConnectedOptimizationStage][] = [
    ['workPackageId', { ...captured, workPackageId: 'A' }],
    ['mode', { ...captured, mode: 'shared' }],
    ['origin', { ...captured, originOrdinal: 20001 }],
    [
      'anchor',
      {
        ...captured,
        workPackages: captured.workPackages.map((workPackage) => ({
          ...workPackage,
          anchorOrdinal: 20001,
        })),
      },
    ],
    [
      'rank',
      {
        ...captured,
        workPackages: captured.workPackages.map((workPackage) => ({
          ...workPackage,
          rank: workPackage.rank + 1,
        })),
        input: {
          ...captured.input,
          order: {
            kind: 'connected',
            workPackageIdByWorkItem: new Map([
              ['a', 'A'],
              ['b', 'B'],
              ['c', 'C'],
            ]),
            rankByWorkPackage: new Map([
              ['A', 1],
              ['B', 2],
              ['C', 3],
            ]),
          },
        },
      },
    ],
    [
      'position',
      {
        ...captured,
        input: {
          ...captured.input,
          rows: captured.input.rows.map((row) => ({ ...row, position: row.position + 1 })),
        },
      },
    ],
    [
      'priority',
      {
        ...captured,
        input: {
          ...captured.input,
          rows: captured.input.rows.map((row) => ({ ...row, priority: 1 })),
        },
      },
    ],
    [
      'effort',
      {
        ...captured,
        input: {
          ...captured.input,
          slices: captured.input.slices.map((slice) => ({ ...slice, days: 2 })),
        },
      },
    ],
    [
      'width',
      {
        ...captured,
        input: {
          ...captured.input,
          slices: captured.input.slices.map((slice) => ({ ...slice, width: 2 })),
        },
      },
    ],
    [
      'person',
      {
        ...captured,
        input: {
          ...captured.input,
          slices: captured.input.slices.map((slice) => ({ ...slice, personId: 'person' })),
        },
      },
    ],
    [
      'pools',
      {
        ...captured,
        input: {
          ...captured.input,
          slices: captured.input.slices.map((slice) => ({ ...slice, poolIds: ['pool'] })),
        },
      },
    ],
    [
      'demands',
      {
        ...captured,
        input: {
          ...captured.input,
          slices: captured.input.slices.map((slice) => ({
            ...slice,
            demands: [{ resourceId: 'resource', units: 1 }],
          })),
        },
      },
    ],
    ['floor', { ...captured, input: { ...captured.input, notBefore: new Map([['b', 0.1]]) } }],
    ['deadline', { ...captured, input: { ...captured.input, deadlines: new Map([['b', 3]]) } }],
    [
      'pool capacity',
      { ...captured, input: { ...captured.input, poolSizes: new Map([['pool', 2]]) } },
    ],
    [
      'resource capacity',
      { ...captured, input: { ...captured.input, resourceCapacities: new Map([['resource', 2]]) } },
    ],
    [
      'elsewhere',
      {
        ...captured,
        input: {
          ...captured.input,
          elsewhere: new Map([
            ['person', [{ start: 0, end: 1, workPackageId: 'A', workItemId: 'a' }]],
          ]),
        },
      },
    ],
    [
      'local start',
      {
        ...captured,
        starts: new Map(
          [...captured.starts].map(([key, start]) => [
            key,
            key.startsWith('b') ? start + 0.1 : start,
          ]),
        ),
      },
    ],
    [
      'foreign start',
      {
        ...captured,
        starts: new Map(
          [...captured.starts].map(([key, start]) => [
            key,
            key.startsWith('a') ? start + 0.1 : start,
          ]),
        ),
      },
    ],
    [
      'local finish',
      {
        ...captured,
        finishes: new Map(
          [...captured.finishes].map(([key, finish]) => [
            key,
            key.startsWith('b') ? finish + 0.1 : finish,
          ]),
        ),
      },
    ],
    [
      'foreign finish',
      {
        ...captured,
        finishes: new Map(
          [...captured.finishes].map(([key, finish]) => [
            key,
            key.startsWith('a') ? finish + 0.1 : finish,
          ]),
        ),
      },
    ],
    [
      'edge type',
      {
        ...captured,
        relationships: captured.relationships.map((relationship) => ({
          ...relationship,
          type: 'SS',
        })),
        input: {
          ...captured.input,
          graph: {
            ...captured.input.graph,
            edges: captured.input.graph.edges.map((edge) =>
              edge.provenance === 'authored' ? { ...edge, type: 'SS' as const } : edge,
            ),
          },
        },
      },
    ],
    [
      'authored relationship identity',
      {
        ...captured,
        relationships: [
          ...captured.relationships,
          {
            id: 'extra',
            type: 'SS',
            predecessor: { scope: 'whole', workPackageId: 'A', workItemId: 'a' },
            successor: { scope: 'whole', workPackageId: 'B', workItemId: 'b' },
          },
        ],
      },
    ],
    [
      'authored selector scope',
      {
        ...captured,
        relationships: captured.relationships.map((relationship) => ({
          ...relationship,
          predecessor: { ...relationship.predecessor, scope: 'node', stepId: 'design' },
        })),
      },
    ],
    [
      'authored selector identity',
      {
        ...captured,
        relationships: captured.relationships.map((relationship) => ({
          ...relationship,
          predecessor: { ...relationship.predecessor, workItemId: 'a-parent' },
        })),
      },
    ],
  ];
  for (const [field, changed] of variants) expect(inputHash(changed), field).not.toBe(original);
});

test('ownership of a retained parent contributes independently of relationship endpoints', () => {
  const captured = stage();
  const input = {
    ...captured.input,
    rows: [
      ...captured.input.rows.map((row) => (row.id === 'a' ? { ...row, parentId: 'parent' } : row)),
      { id: 'parent', position: 3, parentId: null, priority: null, frozenNumber: null },
    ],
    order: {
      kind: 'connected' as const,
      workPackageIdByWorkItem: new Map([
        ['parent', 'A'],
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rankByWorkPackage: new Map([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]),
    },
  };
  const before = { ...captured, input };
  const after = {
    ...captured,
    input: {
      ...input,
      order: {
        ...input.order,
        workPackageIdByWorkItem: new Map([...input.order.workPackageIdByWorkItem, ['parent', 'B']]),
      },
    },
  };
  expect(inputHash(before)).not.toBe(inputHash(after));
});
test('nested demand and booking facts contribute independently of collection presence', () => {
  const captured = stage();
  const withDemands = {
    ...captured,
    input: {
      ...captured.input,
      slices: captured.input.slices.map((slice) => ({
        ...slice,
        demands: [{ resourceId: 'resource', units: 1 }],
      })),
    },
  };
  for (const demand of [
    { resourceId: 'other', units: 1 },
    { resourceId: 'resource', units: 2 },
  ]) {
    const changed = {
      ...withDemands,
      input: {
        ...withDemands.input,
        slices: withDemands.input.slices.map((slice) => ({ ...slice, demands: [demand] })),
      },
    };
    expect(inputHash(changed)).not.toBe(inputHash(withDemands));
  }
  const booking = { start: 0, end: 1, workPackageId: 'A', workItemId: 'a' };
  const withBooking = {
    ...captured,
    input: { ...captured.input, elsewhere: new Map([['person', [booking]]]) },
  };
  for (const changed of [
    { ...booking, start: 0.1 },
    { ...booking, end: 2 },
    { ...booking, workPackageId: 'other' },
    { ...booking, workItemId: 'other' },
  ]) {
    expect(
      inputHash({
        ...withBooking,
        input: { ...withBooking.input, elsewhere: new Map([['person', [changed]]]) },
      }),
    ).not.toBe(inputHash(withBooking));
  }
  expect(
    inputHash({
      ...withBooking,
      input: { ...withBooking.input, elsewhere: new Map([['other', [booking]]]) },
    }),
  ).not.toBe(inputHash(withBooking));
});
test('resolved step identities and authored selector step identities both contribute', () => {
  const captured = stage();
  const stepStage = (stepId: string): ConnectedOptimizationStage => ({
    ...captured,
    input: {
      ...captured.input,
      slices: captured.input.slices.map((slice) => ({ ...slice, stepId })),
      graph: {
        ...captured.input.graph,
        nodes: captured.input.slices.map((slice) => ({
          kind: 'step',
          ref: { workItemId: slice.workItemId, stepId },
          at: 0,
        })),
      },
    },
  });
  // Placement keys belong to the stage, not the input. Use exact keyed copies for each step spelling.
  const captureSteps = (stepId: string): ConnectedOptimizationStage => {
    const stepped = stepStage(stepId);
    return {
      ...stepped,
      starts: new Map([...captured.starts].map(([key, start]) => [key + stepId, start])),
      finishes: new Map([...captured.finishes].map(([key, finish]) => [key + stepId, finish])),
    };
  };
  expect(inputHash(captureSteps('design'))).not.toBe(inputHash(captureSteps('build')));
  expect(inputHash(captureSteps('design'))).toBe(
    '3865e8dc689a8f4feedba1c461bb3167e77ebd2eea22f4aa8a68702c850e0128',
  );
  const selected = {
    ...captured,
    relationships: captured.relationships.map((relationship) => ({
      ...relationship,
      predecessor: { ...relationship.predecessor, scope: 'node' as const, stepId: 'design' },
    })),
  };
  expect(
    inputHash({
      ...selected,
      relationships: selected.relationships.map((relationship) => ({
        ...relationship,
        predecessor: { ...relationship.predecessor, stepId: 'build' },
      })),
    }),
  ).not.toBe(inputHash(selected));
});

test('keeps the connected-stage-v2 canonical digest stable', () => {
  expect(inputHash(stage())).toBe(
    'affab67e7f928ef5c0be2cadd81c1d1c8084d8e7fb87ce933e8f89fe6d82550b',
  );
});

function stage(fractional = false): ConnectedOptimizationStage {
  const resolved = resolveScheduleInput({
    rows: ['a', 'b', 'c'].map((id, position) => ({
      id,
      position,
      parentId: null,
      priority: null,
      frozenNumber: null,
    })),
    slices: ['a', 'b', 'c'].map((workItemId) => ({
      workItemId,
      stepId: null,
      days: fractional && workItemId === 'a' ? 0.2 : 1,
      width: 1,
      personId: null,
      poolIds: [],
    })),
    edges: [
      { predecessorId: 'a', successorId: 'b' },
      { predecessorId: 'b', successorId: 'c' },
    ],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
  });
  const input = {
    ...resolved,
    graph: {
      ...resolved.graph,
      edges: resolved.graph.edges.map((edge, index) => ({
        ...edge,
        provenance: 'authored' as const,
        relationshipId: ['ab', 'bc'][index],
      })),
    },
    order: {
      kind: 'connected' as const,
      workPackageIdByWorkItem: new Map([
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rankByWorkPackage: new Map([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]),
    },
  };
  const placement = scheduleResolved(input);
  return {
    kind: 'connected-stage',
    workPackageId: 'B',
    mode: 'isolated',
    originOrdinal: 20000,
    workPackages: ['A', 'B', 'C'].map((workPackageId, rank) => ({
      workPackageId,
      rank,
      anchorOrdinal: 20000,
    })),
    input,
    relationships: [
      {
        id: 'ab',
        type: 'FS',
        predecessor: { scope: 'whole', workPackageId: 'A', workItemId: 'a' },
        successor: { scope: 'whole', workPackageId: 'B', workItemId: 'b' },
      },
      {
        id: 'bc',
        type: 'FS',
        predecessor: { scope: 'whole', workPackageId: 'B', workItemId: 'b' },
        successor: { scope: 'whole', workPackageId: 'C', workItemId: 'c' },
      },
    ],
    starts: new Map([...placement.slices].map(([slice, placed]) => [slice, placed.earliestStart])),
    finishes: new Map(
      [...placement.slices].map(([slice, placed]) => [slice, placed.earliestFinish]),
    ),
  };
}
