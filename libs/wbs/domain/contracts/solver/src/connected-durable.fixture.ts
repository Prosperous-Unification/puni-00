import {
  type ConnectedOptimizationStage,
  resolveScheduleInput,
  scheduleResolved,
  sliceKey,
} from '@wbs/domain';

import type { ConnectedSolverRequest } from './wire-types';
const key = (id: string) => sliceKey(id, null);
export function stage(fractional = false): ConnectedOptimizationStage {
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
export function response(asked: ConnectedSolverRequest, status = 'feasible') {
  return {
    kind: 'response' as const,
    stdout: JSON.stringify({
      wireVersion: 5,
      scope: {
        kind: 'connected-stage',
        projectId: asked.scope.projectId,
        inputHash: asked.scope.inputHash,
        questionHash: asked.scope.questionHash,
      },
      status,
      ...(status === 'feasible'
        ? {
            offsets: { [key('b')]: 48 },
            objectiveValues: {
              makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
              priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            },
          }
        : {}),
    }),
  };
}
