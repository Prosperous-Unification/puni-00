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
    ['projectId', { ...captured, projectId: 'A' }],
    ['mode', { ...captured, mode: 'shared' }],
    ['origin', { ...captured, originOrdinal: 20001 }],
    [
      'anchor',
      {
        ...captured,
        projects: captured.projects.map((project) => ({ ...project, anchorOrdinal: 20001 })),
      },
    ],
    [
      'rank',
      {
        ...captured,
        projects: captured.projects.map((project) => ({ ...project, rank: project.rank + 1 })),
        input: {
          ...captured.input,
          order: {
            kind: 'connected',
            projectIdByWorkItem: new Map([
              ['a', 'A'],
              ['b', 'B'],
              ['c', 'C'],
            ]),
            rankByProject: new Map([
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
          elsewhere: new Map([['person', [{ start: 0, end: 1, projectId: 'A', workItemId: 'a' }]]]),
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
            edges: captured.input.graph.edges.map((edge) => ({ ...edge, type: 'SS' })),
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
            predecessor: { scope: 'whole', projectId: 'A', workItemId: 'a' },
            successor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
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
      projectIdByWorkItem: new Map([
        ['parent', 'A'],
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rankByProject: new Map([
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
        projectIdByWorkItem: new Map([...input.order.projectIdByWorkItem, ['parent', 'B']]),
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
  const booking = { start: 0, end: 1, projectId: 'A', workItemId: 'a' };
  const withBooking = {
    ...captured,
    input: { ...captured.input, elsewhere: new Map([['person', [booking]]]) },
  };
  for (const changed of [
    { ...booking, start: 0.1 },
    { ...booking, end: 2 },
    { ...booking, projectId: 'other' },
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
    'dcca591ecc22812e49b5961450b496d15d21d7dc8231f2e823fc1355656be117',
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

test('existing canonical stage hash stays byte compatible after helper extraction', () => {
  expect(inputHash(stage())).toBe(
    '08ed55e625529ac610baacfc8fefcc5cb0b7fe2c18262ebfee33b84247f5ab0c',
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
      projectIdByWorkItem: new Map([
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rankByProject: new Map([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]),
    },
  };
  const placement = scheduleResolved(input);
  return {
    kind: 'connected-stage',
    projectId: 'B',
    mode: 'isolated',
    originOrdinal: 20000,
    projects: ['A', 'B', 'C'].map((projectId, rank) => ({ projectId, rank, anchorOrdinal: 20000 })),
    input,
    relationships: [
      {
        id: 'ab',
        type: 'FS',
        predecessor: { scope: 'whole', projectId: 'A', workItemId: 'a' },
        successor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
      },
      {
        id: 'bc',
        type: 'FS',
        predecessor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
        successor: { scope: 'whole', projectId: 'C', workItemId: 'c' },
      },
    ],
    starts: new Map([...placement.slices].map(([slice, placed]) => [slice, placed.earliestStart])),
    finishes: new Map(
      [...placement.slices].map(([slice, placed]) => [slice, placed.earliestFinish]),
    ),
  };
}
