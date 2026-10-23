import {
  type ConnectedOptimizationStage,
  resolveScheduleInput,
  scheduleResolved,
  sliceKey,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { buildConnectedSolverRequest } from './build-connected-solver-request';
import {
  evaluateConnectedSolverOutcome,
  prepareConnectedBoundaryOutcome,
} from './connected-solver-outcome';
import type { ConnectedSolverRequest } from './wire-types';

const key = (id: string) => sliceKey(id, null);
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
function request(captured: ConnectedOptimizationStage): ConnectedSolverRequest {
  const prepared = buildConnectedSolverRequest(
    captured,
    { inputHash: 'input', questionHash: 'question' },
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind !== 'request') throw new Error('fixture requires request');
  return prepared.request;
}
function response(asked: ConnectedSolverRequest, status = 'feasible') {
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

test('connected exit materializes the complete component with exact fixed foreign placement', () => {
  const captured = stage();
  const asked = request(captured);
  const outcome = evaluateConnectedSolverOutcome(captured, asked, response(asked));
  expect(outcome.kind).toBe('ok');
  if (outcome.kind !== 'ok') throw new Error('expected ready connected placement');
  expect(outcome.starts).toEqual(new Map([[key('b'), 1]]));
  expect(outcome.decision.schedule.slices.get(key('a'))?.earliestStart).toBe(0);
  expect(outcome.decision.schedule.slices.get(key('c'))?.earliestStart).toBe(2);
  expect(outcome.decision.scope).toEqual({ kind: 'connected-stage', projectId: 'B' });
});

test('boundary infeasible exit remains distinct with no candidate and full request evidence', () => {
  const captured = stage();
  const asked = request(captured);
  const outcome = evaluateConnectedSolverOutcome(
    captured,
    asked,
    response(asked, 'boundary-infeasible'),
  );
  expect(outcome.kind).toBe('boundary-infeasible');
  if (outcome.kind !== 'boundary-infeasible') throw new Error('expected boundary evidence');
  expect(outcome.certificate.request).toEqual(asked);
  expect(outcome.certificate.stage).toEqual(captured);
  expect(outcome.certificate.evidence.kind).toBe('solver-proven-infeasible');
  expect('starts' in outcome).toBe(false);
});

test('unknown, malformed echo and forged foreign request never become terminal certificates', () => {
  const captured = stage();
  const asked = request(captured);
  expect(evaluateConnectedSolverOutcome(captured, asked, response(asked, 'unknown'))).toEqual({
    kind: 'failed',
    reason: 'no-solution',
  });
  expect(
    evaluateConnectedSolverOutcome(
      captured,
      asked,
      response(
        { ...asked, scope: { ...asked.scope, questionHash: 'stale' } },
        'boundary-infeasible',
      ),
    ),
  ).toEqual({ kind: 'failed', reason: 'invalid-output' });
  const forged = {
    ...asked,
    scope: {
      ...asked.scope,
      fixed: asked.scope.fixed.map((fixed) => ({ ...fixed, start: fixed.start + 1 })),
    },
  };
  expect(
    evaluateConnectedSolverOutcome(captured, forged, response(forged, 'boundary-infeasible')),
  ).toEqual({ kind: 'failed', reason: 'internal-error' });
});

test('fractional contradiction survives preparation as boundary evidence without child output', () => {
  const captured = stage(true);
  const prepared = buildConnectedSolverRequest(
    captured,
    { inputHash: 'fractional', questionHash: 'fractional-time' },
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind !== 'boundary-infeasible') throw new Error('expected quantized contradiction');
  const outcome = prepareConnectedBoundaryOutcome(prepared);
  expect(outcome.kind).toBe('boundary-infeasible');
  expect(outcome.certificate.evidence).toMatchObject({
    kind: 'contradictory-bounds',
    lower: 10,
    upper: 9,
  });
  expect(outcome.certificate.request.scope.fixed).toEqual(prepared.request.scope.fixed);
});

test('plain infeasible is refused for an effective boundary instead of being materialized', () => {
  const initial = stage();
  const captured = { ...initial, input: { ...initial.input, deadlines: new Map([['b', 10]]) } };
  const asked = request(captured);
  expect(evaluateConnectedSolverOutcome(captured, asked, response(asked, 'infeasible'))).toEqual({
    kind: 'failed',
    reason: 'invalid-output',
  });
});

test('a stage without incident boundaries preserves ordinary deadline infeasibility', () => {
  const initial = stage();
  const captured = {
    ...initial,
    relationships: [],
    input: {
      ...initial.input,
      graph: { ...initial.input.graph, edges: [] },
      deadlines: new Map([['b', 0]]),
    },
  };
  const asked = request(captured);
  const outcome = evaluateConnectedSolverOutcome(captured, asked, response(asked, 'infeasible'));
  expect(outcome.kind).toBe('plan-infeasible');
  if (outcome.kind !== 'plan-infeasible') throw new Error('expected local deadline evidence');
  expect(outcome.certificate.items).toHaveLength(1);
});

test('trusted broken stage evidence throws before classifying child outcomes', () => {
  const captured = stage();
  const asked = request(captured);
  const forged = { ...captured, finishes: new Map([...captured.finishes, [key('c'), 999]]) };
  expect(() => evaluateConnectedSolverOutcome(forged, asked, response(asked, 'unknown'))).toThrow(
    'baseline replay failed',
  );
});

test('boundary evidence detaches the original mutable maps and request', () => {
  const captured = stage(true);
  const prepared = buildConnectedSolverRequest(
    captured,
    { inputHash: 'fractional', questionHash: 'fractional-time' },
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind !== 'boundary-infeasible') throw new Error('expected contradiction');
  const outcome = prepareConnectedBoundaryOutcome(prepared);
  const starts = captured.starts;
  if (!(starts instanceof Map)) throw new Error('fixture requires map');
  starts.set(key('c'), 999);
  expect(outcome.certificate.stage.starts.get(key('c'))).toBe(1.2);
});

test('ordinary infeasibility without a local deadline cannot fabricate a certificate', () => {
  const initial = stage();
  const captured = {
    ...initial,
    relationships: [],
    input: { ...initial.input, graph: { ...initial.input.graph, edges: [] } },
  };
  const asked = request(captured);
  expect(evaluateConnectedSolverOutcome(captured, asked, response(asked, 'infeasible'))).toEqual({
    kind: 'failed',
    reason: 'invalid-output',
  });
});

test('integer-valid response that reconciles a fixed foreign start is invalid output', () => {
  const initial = stage(true);
  const pins = new Map([...initial.starts, [key('c'), 1.208333334]]);
  const replay = scheduleResolved(initial.input, pins);
  const captured = {
    ...initial,
    starts: pins,
    finishes: new Map([...replay.slices].map(([slice, placed]) => [slice, placed.earliestFinish])),
  };
  const asked = request(captured);
  const stdout = JSON.stringify({
    wireVersion: 5,
    scope: {
      kind: 'connected-stage',
      projectId: 'B',
      inputHash: 'input',
      questionHash: 'question',
    },
    status: 'feasible',
    offsets: { [key('b')]: 10 },
    objectiveValues: {
      makespan: { value: 58, stageValue: 58, bound: 58, status: 'optimal' },
      priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
      movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
    },
  });
  expect(evaluateConnectedSolverOutcome(captured, asked, { kind: 'response', stdout })).toEqual({
    kind: 'failed',
    reason: 'invalid-output',
  });
});

test('fractional contradictory request accepts an actual child boundary proof after canonical revalidation', () => {
  const captured = stage(true);
  const prepared = buildConnectedSolverRequest(
    captured,
    { inputHash: 'fractional', questionHash: 'fractional-time' },
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind !== 'boundary-infeasible') throw new Error('expected contradiction');
  const outcome = evaluateConnectedSolverOutcome(
    captured,
    prepared.request,
    response(prepared.request, 'boundary-infeasible'),
  );
  expect(outcome.kind).toBe('boundary-infeasible');
  if (outcome.kind !== 'boundary-infeasible') throw new Error('expected child boundary proof');
  expect(outcome.certificate.evidence.kind).toBe('solver-proven-infeasible');
  const forged = {
    ...prepared.request,
    scope: {
      ...prepared.request.scope,
      fixed: prepared.request.scope.fixed.map((fixed) => ({ ...fixed, start: fixed.start + 1 })),
    },
  };
  expect(
    evaluateConnectedSolverOutcome(captured, forged, response(forged, 'boundary-infeasible')),
  ).toEqual({ kind: 'failed', reason: 'internal-error' });
});
