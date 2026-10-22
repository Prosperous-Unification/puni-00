import { type ConnectedOptimizationStage, sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { buildConnectedSolverRequestPair } from './build-connected-solver-request';
import { buildConnectedSolverBoundaries } from './connected-boundaries';
import { parseConnectedSolverResponse } from './parse-solver-response';
import { revalidateConnectedSolverResult } from './revalidate-solver-result';
import { validateConnectedSolverRequest } from './validate-connected-solver-request';

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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
    {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    },
  );
  expect(pair.pri.kind).toBe('boundary-infeasible');
  if (pair.pri.kind !== 'boundary-infeasible') return;
  expect(pair.pri.evidence).toMatchObject({ key: b, lower: 10, upper: 9 });
  expect(pair.pri.stage).toBeDefined();
  expect(pair.pri.request.scope.questionHash).toBe('question-pri');
  expect(pair.pri.request.objective).toBe('pri');
  expect(pair.time.kind).toBe('boundary-infeasible');
  if (pair.time.kind === 'boundary-infeasible') {
    expect(pair.time.request.objective).toBe('time');
    expect(pair.time.evidence).toEqual(pair.pri.evidence);
  }
});

test('objective-specific full identities refuse crossed responses and survive terminal preparation', () => {
  const identity = { inputHash: 'input', questionHashes: { pri: 'pri-hash', time: 'time-hash' } };
  const terminal = buildConnectedSolverRequestPair(stage(), identity, {
    solverVersion: '0.4.0',
    budgetMs: 1000,
  });
  if (terminal.pri.kind !== 'boundary-infeasible' || terminal.time.kind !== 'boundary-infeasible')
    throw new Error('expected two terminal requests');
  expect(terminal.pri.request.scope.questionHash).toBe('pri-hash');
  expect(terminal.time.request.scope.questionHash).toBe('time-hash');
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(candidate, identity, {
    solverVersion: '0.4.0',
    budgetMs: 1000,
  });
  if (pair.pri.kind !== 'request' || pair.time.kind !== 'request')
    throw new Error('expected two solver requests');
  for (const [source, target] of [
    [pair.pri.request, pair.time.request],
    [pair.time.request, pair.pri.request],
  ]) {
    const response = {
      wireVersion: 5,
      status: 'unknown',
      scope: {
        kind: 'connected-stage',
        projectId: source.scope.projectId,
        inputHash: source.scope.inputHash,
        questionHash: source.scope.questionHash,
      },
    };
    expect(parseConnectedSolverResponse(JSON.stringify(response), target).ok).toBe(false);
  }
  expect(() =>
    buildConnectedSolverRequestPair(
      candidate,
      {
        inputHash: 'input',
        questionHashes: { pri: 'same', time: 'same' },
      },
      { solverVersion: '0.4.0', budgetMs: 1000 },
    ),
  ).toThrow();
});

test('malformed complete requests never become prepared boundary findings', () => {
  const identity = { inputHash: 'input', questionHashes: { pri: 'pri-hash', time: 'time-hash' } };
  // Proof: removing complete wire validation makes both malformed requests
  // return boundary-infeasible; each assertion then fails on the real builder.
  expect(() =>
    buildConnectedSolverRequestPair(stage(), identity, {
      solverVersion: '0.4.0',
      budgetMs: 0,
    }),
  ).toThrow(/budgetMs/);
  expect(() =>
    buildConnectedSolverRequestPair({ ...stage(), originOrdinal: 0.5 }, identity, {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    }),
  ).toThrow(/originOrdinal/);
});

test('complete connected request validation rejects cross-field corruption before a terminal', () => {
  const pair = buildConnectedSolverRequestPair(
    stage(),
    {
      inputHash: 'input',
      questionHashes: { pri: 'pri-hash', time: 'time-hash' },
    },
    { solverVersion: '0.4.0', budgetMs: 1000 },
  );
  if (pair.pri.kind !== 'boundary-infeasible') throw new Error('expected terminal request');
  const valid = pair.pri.request;
  expect(() => {
    validateConnectedSolverRequest(valid);
  }).not.toThrow();
  const corruptions: readonly [(request: typeof valid) => void, RegExp][] = [
    [
      (request) => {
        Object.assign(request, { slices: [...request.slices, request.slices[0]] });
      },
      /slice keys repeat/,
    ],
    [
      (request) => {
        Object.assign(request, { movementReferenceOffsets: {} });
      },
      /key on all local/,
    ],
    [
      (request) => {
        Object.assign(request, { movementReferenceOffsets: { [b]: request.horizonUnits + 1 } });
      },
      /out-of-horizon/,
    ],
    [
      (request) => {
        Object.assign(request, { movementReferenceOffsets: { absent: 10 } });
      },
      /missing or out-of-horizon/,
    ],
    [
      (request) => {
        Object.assign(request, {
          edges: [{ predecessorKey: 'absent', successorKey: b, type: 'FS' }],
        });
      },
      /edge does not name/,
    ],
    [
      (request) => {
        Object.assign(request, {
          edges: [{ predecessorKey: b, successorKey: 'absent', type: 'FS' }],
        });
      },
      /edge does not name/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          projects: [...request.scope.projects, request.scope.projects[0]],
        });
      },
      /projects are inconsistent/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          projects: request.scope.projects.filter((project) => project.projectId !== 'B'),
        });
      },
      /projects are inconsistent/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [request.scope.fixed[0], request.scope.fixed[0], request.scope.fixed[1]],
        });
      },
      /fixed keys repeat/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [{ ...request.scope.fixed[0], projectId: 'B' }, request.scope.fixed[1]],
        });
      },
      /fixed slice has invalid ownership/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [{ ...request.scope.fixed[0], projectId: 'absent' }, request.scope.fixed[1]],
        });
      },
      /fixed slice has invalid ownership/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [{ ...request.scope.fixed[0], key: b }, request.scope.fixed[1]],
        });
      },
      /fixed slice has invalid ownership/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [{ ...request.scope.fixed[0], start: 0.3 }, request.scope.fixed[1]],
        });
      },
      /fixed slice has reversed placement/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          boundaries: [
            { ...request.scope.boundaries[0], foreignProjectId: 'C' },
            request.scope.boundaries[1],
          ],
        });
      },
      /boundary has invalid endpoints/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          boundaries: [
            { ...request.scope.boundaries[0], localKey: 'absent' },
            request.scope.boundaries[1],
          ],
        });
      },
      /boundary has invalid endpoints/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          boundaries: [
            { ...request.scope.boundaries[0], foreignKey: 'absent' },
            request.scope.boundaries[1],
          ],
        });
      },
      /boundary has invalid endpoints/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          occupancy: [{ personId: 'ana', projectId: 'A', key: a, start: 0, finish: 0.3 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          occupancy: [{ personId: 'ana', projectId: 'A', key: 'absent', start: 0, finish: 0.2 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          occupancy: [{ personId: 'ana', projectId: 'C', key: a, start: 0, finish: 0.2 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          occupancy: [{ personId: 'ana', projectId: 'A', key: a, start: 0.1, finish: 0.2 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          occupancy: [{ personId: 'ana', projectId: 'A', key: a, start: 0.2, finish: 0.2 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request.scope, {
          fixed: [{ ...request.scope.fixed[0], start: 0.2 }, request.scope.fixed[1]],
          occupancy: [{ personId: 'ana', projectId: 'A', key: a, start: 0.2, finish: 0.2 }],
        });
      },
      /occupancy does not match/,
    ],
    [
      (request) => {
        Object.assign(request, { elsewhere: { ana: [[1, 1]] } });
      },
      /elsewhere person set differs/,
    ],
  ];
  const missed: string[] = [];
  // Proof: bypassing the cross-field validation let duplicate keys, missing
  // offsets, a foreign-owner mismatch and missing bookings pass the schema.
  for (const [corrupt, message] of corruptions) {
    const request = structuredClone(valid);
    corrupt(request);
    try {
      validateConnectedSolverRequest(request);
      missed.push(`${message.source}: accepted`);
    } catch (cause) {
      if (!message.test(String(cause))) missed.push(`${message.source}: ${String(cause)}`);
    }
  }
  expect(missed).toEqual([]);
});

test('finite unrepresentable incoming, reference and outgoing evidence yields typed horizon failure', () => {
  const identity = { inputHash: 'input', questionHashes: { pri: 'pri-hash', time: 'time-hash' } };
  const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
  const incoming = stage();
  (incoming.starts as Map<string, number>).set(a, 1e15);
  (incoming.finishes as Map<string, number>).set(a, 1e15 + 1);
  expect(buildConnectedSolverRequestPair(incoming, identity, installed).pri).toMatchObject({
    kind: 'failed',
    failure: 'horizon-overflow',
  });
  const reference = stage();
  (reference.starts as Map<string, number>).set(b, 1e15);
  (reference.finishes as Map<string, number>).set(b, 1e15 + 1);
  expect(buildConnectedSolverRequestPair(reference, identity, installed).pri).toMatchObject({
    kind: 'failed',
    failure: 'horizon-overflow',
  });
  const outgoing = stage();
  (outgoing.starts as Map<string, number>).set(c, 1e15);
  (outgoing.finishes as Map<string, number>).set(c, 1e15 + 1);
  expect(buildConnectedSolverRequestPair(outgoing, identity, installed).pri).toMatchObject({
    kind: 'failed',
    failure: 'horizon-overflow',
  });
});

test('foreign-only retained occupancy overflows before the 10/9 terminal is classified', () => {
  const candidate = stage();
  (candidate as { mode: 'shared' | 'isolated' }).mode = 'shared';
  (candidate.input.slices[2] as { days: number; personId: string | null }).days = 1e15;
  (candidate.input.slices[2] as { days: number; personId: string | null }).personId =
    'foreign-only-person';
  (candidate.finishes as Map<string, number>).set(c, 1.2 + 1e15);
  const identity = {
    inputHash: 'input',
    questionHashes: { pri: 'question-pri', time: 'question-time' },
  };
  const pair = buildConnectedSolverRequestPair(candidate, identity, {
    solverVersion: '0.4.0',
    budgetMs: 1000,
  });
  expect(pair.pri).toMatchObject({ kind: 'failed', failure: 'horizon-overflow' });
  expect(pair.time).toMatchObject({ kind: 'failed', failure: 'horizon-overflow' });
  const nonfinite = stage();
  (nonfinite.finishes as Map<string, number>).set(c, Number.NaN);
  expect(() =>
    buildConnectedSolverRequestPair(nonfinite, identity, {
      solverVersion: '0.4.0',
      budgetMs: 1000,
    }),
  ).toThrow();
  const safeForeignOnly = stage();
  (safeForeignOnly as { mode: 'shared' | 'isolated' }).mode = 'shared';
  (safeForeignOnly.input.slices[2] as { personId: string | null }).personId = 'foreign-only-person';
  const safe = buildConnectedSolverRequestPair(safeForeignOnly, identity, {
    solverVersion: '0.4.0',
    budgetMs: 1000,
  });
  expect(safe.pri.kind).toBe('boundary-infeasible');
  if (safe.pri.kind !== 'boundary-infeasible') throw new Error('expected safe foreign holder');
  expect(safe.pri.request.scope.occupancy).toHaveLength(1);
  expect(safe.pri.request.elsewhere).toEqual({});
  const ordinary = buildConnectedSolverRequestPair(stage(), identity, {
    solverVersion: '0.4.0',
    budgetMs: 1000,
  });
  expect(ordinary.pri.kind).toBe('boundary-infeasible');
  if (ordinary.pri.kind !== 'boundary-infeasible') throw new Error('expected terminal');
  expect(ordinary.pri.evidence).toMatchObject({ lower: 10, upper: 9 });
  const invalidRetained = structuredClone(ordinary.pri.request);
  Object.assign(invalidRetained.scope, {
    fixed: [
      invalidRetained.scope.fixed[0],
      {
        ...invalidRetained.scope.fixed[1],
        finish: 1.2 + 1e15,
      },
    ],
    occupancy: [
      {
        personId: 'foreign-only-person',
        projectId: 'C',
        key: c,
        start: 1.2,
        finish: 1.2 + 1e15,
      },
    ],
  });
  expect(() => {
    validateConnectedSolverRequest(invalidRetained);
  }).toThrow(/safe quantization/);
});

test('production preparation sends local decisions, fixed holders and an untrusted seed separately', () => {
  const candidate = stage();
  (candidate.input.graph.edges as unknown[]).pop();
  const pair = buildConnectedSolverRequestPair(
    candidate,
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
      questionHash: 'question-pri',
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
  const missingBooking = structuredClone(pair.pri.request);
  Object.assign(missingBooking, { elsewhere: {} });
  expect(() => {
    validateConnectedSolverRequest(missingBooking);
  }).toThrow(/elsewhere person set/);
  const wrongBooking = structuredClone(pair.pri.request);
  Object.assign(wrongBooking, { elsewhere: { ana: [[0, 9]] } });
  expect(() => {
    validateConnectedSolverRequest(wrongBooking);
  }).toThrow(/elsewhere intervals/);
  const joinedBooking = structuredClone(pair.pri.request);
  Object.assign(joinedBooking.scope, {
    fixed: [
      joinedBooking.scope.fixed[0],
      {
        ...joinedBooking.scope.fixed[1],
        start: 0.1,
        finish: 0.3,
      },
    ],
    occupancy: [
      joinedBooking.scope.occupancy[0],
      {
        personId: 'ana',
        projectId: 'C',
        key: c,
        start: 0.1,
        finish: 0.3,
      },
    ],
  });
  Object.assign(joinedBooking, { elsewhere: { ana: [[0, 15]] } });
  expect(() => {
    validateConnectedSolverRequest(joinedBooking);
  }).not.toThrow();
  const foreignOnly = structuredClone(pair.pri.request);
  Object.assign(foreignOnly.scope, {
    occupancy: [
      foreignOnly.scope.occupancy[0],
      {
        personId: 'foreign-only-person',
        projectId: 'C',
        key: c,
        start: 1.2,
        finish: 2.2,
      },
    ],
  });
  expect(() => {
    validateConnectedSolverRequest(foreignOnly);
  }).not.toThrow();
  const bookingBeyondHorizon = structuredClone(pair.pri.request);
  Object.assign(bookingBeyondHorizon, {
    horizonUnits: 9,
    movementReferenceOffsets: { [b]: 9 },
    seedOffsets: { [b]: 9 },
  });
  expect(() => {
    validateConnectedSolverRequest(bookingBeyondHorizon);
  }).toThrow(/booking/);
});

test('old installed solver cannot prepare a connected wire-5 question', () => {
  const pair = buildConnectedSolverRequestPair(
    stage(),
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
    { inputHash: 'input', questionHashes: { pri: 'question-pri', time: 'question-time' } },
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
          questionHash: 'question-pri',
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
          questionHash: 'question-pri',
        },
        status: 'boundary-infeasible',
      }),
      { ...request, elsewhere: {} },
    ),
  ).toMatchObject({ ok: false, failure: 'schema-violation' });
});
