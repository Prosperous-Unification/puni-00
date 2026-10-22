import { type ConnectedOptimizationStage, sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { buildConnectedSolverRequestPair } from './build-connected-solver-request';
import { buildConnectedSolverBoundaries } from './connected-boundaries';
import { parseConnectedSolverResponse } from './parse-solver-response';
import { revalidateConnectedSolverResult } from './revalidate-solver-result';

const a = sliceKey('a', null);
const b = sliceKey('b', null);
const c = sliceKey('c', null);

function stage(type: 'FS' | 'SS' | 'FF' = 'FS'): ConnectedOptimizationStage {
  return {
    kind: 'connected-stage',
    projectId: 'B',
    mode: 'isolated',
    originOrdinal: 0,
    projects: [
      { projectId: 'A', rank: 0, anchorOrdinal: 0 },
      { projectId: 'B', rank: 1, anchorOrdinal: 0 },
      { projectId: 'C', rank: 2, anchorOrdinal: 0 },
    ],
    input: {
      rows: ['a', 'b', 'c'].map((id, position) => ({
        id,
        parentId: null,
        position,
        priority: 0,
        frozenNumber: null,
      })),
      slices: [
        { workItemId: 'a', stepId: null, days: 0.2, width: 1, personId: null, poolIds: [] },
        { workItemId: 'b', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
        { workItemId: 'c', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
      ],
      graph: {
        nodes: ['a', 'b', 'c'].map((workItemId) => ({
          kind: 'boundary' as const,
          workItemId,
          at: 0,
        })),
        edges: [
          {
            predecessor: { leafId: 'a', at: 0 },
            successor: { leafId: 'b', at: 0 },
            provenance: 'authored',
            relationshipId: 'ab',
            type,
          },
          {
            predecessor: { leafId: 'b', at: 0 },
            successor: { leafId: 'c', at: 0 },
            provenance: 'authored',
            relationshipId: 'bc',
            type,
          },
        ],
      },
      notBefore: new Map(),
      deadlines: new Map(),
      poolSizes: new Map(),
      resourceCapacities: new Map(),
      elsewhere: new Map(),
      order: {
        kind: 'connected',
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
    },
    relationships: [
      {
        id: 'ab',
        type,
        predecessor: { scope: 'whole', projectId: 'A', workItemId: 'a' },
        successor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
      },
      {
        id: 'bc',
        type,
        predecessor: { scope: 'whole', projectId: 'B', workItemId: 'b' },
        successor: { scope: 'whole', projectId: 'C', workItemId: 'c' },
      },
    ],
    starts: new Map([
      [a, 0],
      [b, 0.2],
      [c, 1.2],
    ]),
    finishes: new Map([
      [a, 0.2],
      [b, 1.2],
      [c, 2.2],
    ]),
  };
}

test('the real 0.2/1/1.2 FS window becomes signed lower 10 and upper 9', () => {
  expect(buildConnectedSolverBoundaries(stage(), [{ key: b, durationUnits: 48 }])).toEqual([
    {
      localKey: b,
      foreignProjectId: 'A',
      foreignKey: a,
      relationshipId: 'ab',
      type: 'FS',
      direction: 'incoming',
      minimumStartUnits: 10,
    },
    {
      localKey: b,
      foreignProjectId: 'C',
      foreignKey: c,
      relationshipId: 'bc',
      type: 'FS',
      direction: 'outgoing',
      maximumStartUnits: 9,
    },
  ]);
});

test('SS and FF keep their own conservative start inequalities', () => {
  expect(
    buildConnectedSolverBoundaries(stage('SS'), [{ key: b, durationUnits: 48 }]).map((boundary) =>
      boundary.direction === 'incoming' ? boundary.minimumStartUnits : boundary.maximumStartUnits,
    ),
  ).toEqual([0, 57]);
  expect(
    buildConnectedSolverBoundaries(stage('FF'), [{ key: b, durationUnits: 48 }]).map((boundary) =>
      boundary.direction === 'incoming' ? boundary.minimumStartUnits : boundary.maximumStartUnits,
    ),
  ).toEqual([-38, 57]);
});

test('production preparation certifies the contradictory fixed FS window without a feasible baseline', () => {
  const pair = buildConnectedSolverRequestPair(
    stage(),
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  expect(pair.pri.kind).toBe('boundary-infeasible');
  if (pair.pri.kind !== 'boundary-infeasible') return;
  expect(pair.pri.evidence).toMatchObject({ key: b, lower: 10, upper: 9 });
  expect(pair.pri.stage).toBeDefined();
  expect(pair.pri.request.scope.questionHash).toBe('question');
  expect(pair.pri.request.objective).toBe('pri');
  expect(pair.time.kind).toBe('boundary-infeasible');
  if (pair.time.kind === 'boundary-infeasible') {
    expect(pair.time.request.objective).toBe('time');
    expect(pair.time.evidence).toEqual(pair.pri.evidence);
  }
});

test('production preparation sends local decisions, fixed holders and an untrusted seed separately', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  expect(pair.pri.kind).toBe('request');
  if (pair.pri.kind !== 'request') return;
  expect(pair.pri.request.scope.boundaries).toHaveLength(1);
  expect(pair.pri.request.scope.fixed.map(({ key }) => key)).toEqual([a, c]);
  expect(pair.pri.request.movementReferenceOffsets).toEqual({ [b]: 10 });
  expect(pair.pri.request.feasibleBaselineOffsets).toBeNull();
  expect(pair.pri.request.seedOffsets).toEqual({ [b]: 10 });
  expect(pair.time.kind).toBe('request');
  if (pair.time.kind === 'request') {
    expect(pair.time.request.movementReferenceOffsets).toEqual(
      pair.pri.request.movementReferenceOffsets,
    );
  }
});

test('connected response parser requires the exact captured question identity', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error('expected prepared request');
  const response = {
    wireVersion: 5,
    scope: {
      kind: 'connected-stage',
      projectId: 'B',
      inputHash: 'input',
      questionHash: 'question',
    },
    status: 'unknown',
  };
  expect(parseConnectedSolverResponse(JSON.stringify(response), pair.pri.request).ok).toBe(true);
  expect(
    parseConnectedSolverResponse(
      JSON.stringify({
        ...response,
        scope: { ...response.scope, questionHash: 'wrong' },
      }),
      pair.pri.request,
    ),
  ).toMatchObject({ ok: false, failure: 'schema-violation' });
  expect(
    parseConnectedSolverResponse(
      JSON.stringify({
        ...response,
        scope: { kind: 'local' },
      }),
      pair.pri.request,
    ),
  ).toMatchObject({ ok: false, failure: 'schema-violation' });
});

test('connected revalidation refuses a feasible solver placement before an incoming bound', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error('expected prepared request');
  const request = pair.pri.request;
  const entry = { stageValue: null, bound: null, status: 'unknown' as const };
  const duration = request.slices[0]?.durationUnits ?? 0;
  const priority = request.slices[0]?.priorityWeight ?? 0;
  expect(
    revalidateConnectedSolverResult(candidate, request, {
      wireVersion: 5,
      scope: request.scope,
      status: 'feasible',
      offsets: { [b]: 0 },
      objectiveValues: {
        makespan: { ...entry, value: duration },
        priority: { ...entry, value: priority * duration },
        movement: { ...entry, value: 10 },
      },
    }),
  ).toMatchObject({ ok: false, failure: 'boundary-violated' });
});

test('connected revalidation refuses a feasible solver placement after an outgoing bound', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).shift();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error('expected prepared request');
  const request = pair.pri.request;
  const entry = { stageValue: null, bound: null, status: 'unknown' as const };
  const duration = request.slices[0]?.durationUnits ?? 0;
  const priority = request.slices[0]?.priorityWeight ?? 0;
  expect(
    revalidateConnectedSolverResult(candidate, request, {
      wireVersion: 5,
      scope: request.scope,
      status: 'feasible',
      offsets: { [b]: 10 },
      objectiveValues: {
        makespan: { ...entry, value: duration + 10 },
        priority: { ...entry, value: priority * (duration + 10) },
        movement: { ...entry, value: 0 },
      },
    }),
  ).toMatchObject({ ok: false, failure: 'boundary-violated' });
});

test('boundary projection retains every resolved pair of a multi-step authored relationship', () => {
  const candidate = stage();
  const aSecond = sliceKey('a', 'second');
  const bSecond = sliceKey('b', 'second');
  (candidate.input.slices as unknown[]).splice(1, 0, {
    workItemId: 'a',
    stepId: 'second',
    days: 0.3,
    width: 1,
    personId: null,
    poolIds: [],
  });
  (candidate.input.slices as unknown[]).splice(3, 0, {
    workItemId: 'b',
    stepId: 'second',
    days: 0.5,
    width: 1,
    personId: null,
    poolIds: [],
  });
  (candidate.starts as Map<string, number>).set(aSecond, 0.2);
  (candidate.finishes as Map<string, number>).set(aSecond, 0.5);
  (candidate.starts as Map<string, number>).set(bSecond, 0.2);
  (candidate.finishes as Map<string, number>).set(bSecond, 0.7);
  (candidate.input.graph.edges as unknown[]).splice(
    0,
    2,
    ...[0, 1].flatMap((predecessorAt) =>
      [0, 1].map((successorAt) => ({
        predecessor: { leafId: 'a', at: predecessorAt },
        successor: { leafId: 'b', at: successorAt },
        provenance: 'authored',
        relationshipId: 'ab',
        type: 'SS',
      })),
    ),
  );
  const local = [
    { key: b, durationUnits: 48 },
    { key: bSecond, durationUnits: 24 },
  ];
  const projected = buildConnectedSolverBoundaries(candidate, local);
  expect(projected).toHaveLength(4);
  expect(projected.map(({ localKey, foreignKey }) => [localKey, foreignKey])).toEqual([
    [b, a],
    [bSecond, a],
    [b, aSecond],
    [bSecond, aSecond],
  ]);
});

test('connected revalidation refuses a missing boundary or altered foreign holder even on unknown', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error('expected prepared request');
  const request = pair.pri.request;
  const response = { wireVersion: 5 as const, scope: request.scope, status: 'unknown' as const };
  expect(
    revalidateConnectedSolverResult(
      candidate,
      { ...request, scope: { ...request.scope, boundaries: [] } },
      response,
    ),
  ).toMatchObject({ ok: false, failure: 'malformed-request' });
  expect(
    revalidateConnectedSolverResult(
      candidate,
      { ...request, scope: { ...request.scope, fixed: [] } },
      response,
    ),
  ).toMatchObject({ ok: false, failure: 'malformed-request' });
  expect(revalidateConnectedSolverResult(candidate, request, response)).toMatchObject({
    ok: true,
    published: false,
  });
});

test('fractional starts and rounded duration make each active FS SS FF rounding term observable', () => {
  const ss = stage('SS');
  (ss.starts as Map<string, number>).set(a, 0.2);
  (ss.finishes as Map<string, number>).set(a, 0.4);
  expect(
    buildConnectedSolverBoundaries(ss, [{ key: b, durationUnits: 48 }]).map((boundary) =>
      boundary.direction === 'incoming' ? boundary.minimumStartUnits : boundary.maximumStartUnits,
    ),
  ).toEqual([10, 57]);
  const fs = stage('FS');
  (fs.input.slices[1] as { days: number }).days = 1.01;
  expect(
    buildConnectedSolverBoundaries(fs, [{ key: b, durationUnits: 49 }]).map((boundary) =>
      boundary.direction === 'incoming' ? boundary.minimumStartUnits : boundary.maximumStartUnits,
    ),
  ).toEqual([10, 8]);
  const ff = stage('FF');
  (ff.input.slices[1] as { days: number }).days = 1.01;
  expect(
    buildConnectedSolverBoundaries(ff, [{ key: b, durationUnits: 49 }]).map((boundary) =>
      boundary.direction === 'incoming' ? boundary.minimumStartUnits : boundary.maximumStartUnits,
    ),
  ).toEqual([-38, 56]);
});

test('connected preflight includes a remote movement reference in its safe horizon', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  (candidate.starts as Map<string, number>).set(b, 1000);
  (candidate.finishes as Map<string, number>).set(b, 1001);
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error(`unexpected ${pair.pri.kind}`);
  expect(pair.pri.request.movementReferenceOffsets[b]).toBe(48000);
  expect(pair.pri.request.horizonUnits).toBeGreaterThanOrEqual(48048);
});

test('connected request names the exact foreign person holder and booking', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  (candidate as { mode: 'shared' | 'isolated' }).mode = 'shared';
  (candidate.input.slices[0] as { personId: string | null }).personId = 'ana';
  (candidate.input.slices[1] as { personId: string | null }).personId = 'ana';
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error(`unexpected ${pair.pri.kind}`);
  expect(pair.pri.request.scope.occupancy).toEqual([
    { personId: 'ana', projectId: 'A', key: a, start: 0, finish: 0.2 },
  ]);
  expect(pair.pri.request.elsewhere).toEqual({ ana: [[0, 10]] });
});

test('old installed solver cannot prepare a connected wire-5 question', () => {
  const pair = buildConnectedSolverRequestPair(
    stage(),
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.3.0',
      budgetMs: 1000,
    },
  );
  expect(pair.pri).toMatchObject({ kind: 'failed', failure: 'incompatible-solver' });
  expect(pair.time).toMatchObject({ kind: 'failed', failure: 'incompatible-solver' });
});

test('connected parser accepts occupancy-proven boundary infeasibility without a dependency bound', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHash: 'question' },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  if (pair.pri.kind !== 'request') throw new Error(`unexpected ${pair.pri.kind}`);
  const request = {
    ...pair.pri.request,
    scope: { ...pair.pri.request.scope, boundaries: [] },
    elsewhere: { ana: [[0, 10]] as const },
  };
  expect(
    parseConnectedSolverResponse(
      JSON.stringify({
        wireVersion: 5,
        scope: {
          kind: 'connected-stage',
          projectId: 'B',
          inputHash: 'input',
          questionHash: 'question',
        },
        status: 'boundary-infeasible',
      }),
      request,
    ).ok,
  ).toBe(true);
  expect(
    parseConnectedSolverResponse(
      JSON.stringify({
        wireVersion: 5,
        scope: {
          kind: 'connected-stage',
          projectId: 'B',
          inputHash: 'input',
          questionHash: 'question',
        },
        status: 'boundary-infeasible',
      }),
      { ...request, elsewhere: {} },
    ),
  ).toMatchObject({ ok: false, failure: 'schema-violation' });
});
