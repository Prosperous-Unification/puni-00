import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { buildConnectedSolverRequest } from './build-connected-solver-request';
import {
  createConnectedQuestionIdentity,
  decodeBoundaryCertificate,
  decodeConnectedStage,
  decodeConnectedSuccess,
  encodeBoundaryCertificate,
  encodeConnectedStage,
  encodeConnectedSuccess,
} from './connected-durable';
import { response, stage } from './connected-durable.fixture';
import type { ConnectedSolverResponse } from './wire-types';
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function packet(fractional = false) {
  const captured = stage(fractional);
  const identity = createConnectedQuestionIdentity(
    captured,
    'time',
    { solverVersion: '0.4.0', budgetMs: 100 },
    hash,
  );
  const prepared = buildConnectedSolverRequest(
    captured,
    identity,
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind === 'failed') throw new Error(prepared.detail);
  return { captured, identity, prepared };
}
function success() {
  const { captured, identity, prepared } = packet();
  return encodeConnectedSuccess(
    captured,
    identity,
    prepared.request,
    response(prepared.request).stdout,
    hash,
  );
}
function certificate() {
  const { captured, identity, prepared } = packet(true);
  if (prepared.kind !== 'boundary-infeasible') throw new Error('fixture needs contradiction');
  return encodeBoundaryCertificate(captured, identity, prepared.request, prepared.evidence, hash);
}
test('stored stage roundtrips explicit maps and complete resolved/authored/placement evidence', () => {
  const captured = stage();
  expect(decodeConnectedStage(JSON.parse(JSON.stringify(encodeConnectedStage(captured))))).toEqual(
    captured,
  );
});
test('connected success retains candidate and canonical movement comparison independently of chosen placement', () => {
  const stored = success();
  const decoded = decodeConnectedSuccess(JSON.parse(JSON.stringify(stored)), hash);
  expect(decoded.outcome.kind).toBe('ok');
  expect(decoded.identity).toEqual(packet().identity);
  expect(stored.dtoVersion).toBe(2);
  expect(stored.scope.kind).toBe('connected-stage');
});
test('boundary certificate preserves real feasible stage with exact 10/9 contradiction', () => {
  const decoded = decodeBoundaryCertificate(JSON.parse(JSON.stringify(certificate())), hash);
  expect(decoded.certificate.evidence).toMatchObject({
    kind: 'contradictory-bounds',
    lower: 10,
    upper: 9,
  });
  expect(decoded.certificate.stage.starts).toEqual(stage(true).starts);
});
test('every required envelope field refuses omission and unknown additions', () => {
  for (const [stored, decode] of [
    [success(), decodeConnectedSuccess],
    [certificate(), decodeBoundaryCertificate],
  ] as const) {
    for (const field of Object.keys(stored)) {
      const forged = structuredClone(stored) as unknown as Record<string, unknown>;
      Reflect.deleteProperty(forged, field);
      expect(() => decode(forged, hash)).toThrow();
    }
    expect(() => decode({ ...stored, unknown: 1 }, hash)).toThrow();
  }
});
test('each question tuple member refuses forgery independently', () => {
  for (const [field, value] of Object.entries({
    projectId: 'A',
    inputHash: 'forged',
    questionHash: 'forged',
    objective: 'pri',
    contractVersion: 'forged',
    budgetMs: 101,
    quantum: 47,
    wireVersion: 4,
  })) {
    const stored = success();
    expect(() =>
      decodeConnectedSuccess({ ...stored, identity: { ...stored.identity, [field]: value } }, hash),
    ).toThrow();
  }
});
test('forged request candidate publication contributors and truncated bytes refuse', () => {
  const stored = success();
  expect(() => decodeConnectedSuccess({ ...stored, publication: 'baseline' }, hash)).toThrow();
  expect(() =>
    decodeConnectedSuccess({ ...stored, response: { ...stored.response, offsets: {} } }, hash),
  ).toThrow();
  expect(() =>
    decodeConnectedSuccess(
      { ...stored, request: { ...stored.request, edges: [], budgetMs: 99 } },
      hash,
    ),
  ).toThrow();
  const boundary = certificate();
  for (const fault of [{ lower: 9 }, { upper: 10 }, { contributors: [] }, { key: 'forged' }]) {
    expect(() =>
      decodeBoundaryCertificate(
        { ...boundary, evidence: { ...boundary.evidence, ...fault } },
        hash,
      ),
    ).toThrow();
  }
  expect(() => decodeConnectedSuccess(JSON.stringify(stored).slice(0, -1), hash)).toThrow();
});
test('ordinary infeasible unknown and feasible responses cannot certify a boundary', () => {
  const { captured, identity, prepared } = packet();
  for (const status of ['infeasible', 'unknown', 'feasible']) {
    expect(() =>
      encodeBoundaryCertificate(
        captured,
        identity,
        prepared.request,
        {
          kind: 'solver-proven-infeasible',
          response: JSON.parse(
            response(prepared.request, status).stdout,
          ) as ConnectedSolverResponse,
        },
        hash,
      ),
    ).toThrow();
  }
  const stored = encodeBoundaryCertificate(
    captured,
    identity,
    prepared.request,
    {
      kind: 'solver-proven-infeasible',
      response: JSON.parse(
        response(prepared.request, 'boundary-infeasible').stdout,
      ) as ConnectedSolverResponse,
    },
    hash,
  );
  expect(decodeBoundaryCertificate(stored, hash).certificate.evidence.kind).toBe(
    'solver-proven-infeasible',
  );
});

function omissions(
  value: unknown,
  path: readonly (string | number)[] = [],
): (readonly (string | number)[])[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((entry, at) => omissions(entry, [...path, at]));
  return Object.entries(value).flatMap(([field, held]) => [
    [...path, field],
    ...omissions(held, [...path, field]),
  ]);
}
function withoutField(value: unknown, path: readonly (string | number)[]) {
  const copy = structuredClone(value) as Record<string | number, unknown>;
  let parent = copy;
  for (const field of path.slice(0, -1)) parent = parent[field] as Record<string | number, unknown>;
  const last = path.at(-1);
  if (last === undefined) throw new Error('empty omission path');
  Reflect.deleteProperty(parent, last);
  return copy;
}
test('all nested stored stage request response and evidence required fields refuse omission', () => {
  for (const [stored, decode] of [
    [success(), decodeConnectedSuccess],
    [certificate(), decodeBoundaryCertificate],
  ] as const) {
    for (const path of omissions(stored)) {
      expect(() => decode(withoutField(stored, path), hash), path.join('.')).toThrow();
    }
  }
});
test('nested stage request response and evidence refuse unknown fields and duplicate map entries', () => {
  const stored = success();
  for (const path of omissions(stored).map((path) => path.slice(0, -1))) {
    const forged = structuredClone(stored) as unknown as Record<string | number, unknown>;
    let parent = forged;
    for (const field of path) parent = parent[field] as Record<string | number, unknown>;
    if (Array.isArray(parent)) continue;
    parent['unknown'] = 1;
    expect(() => decodeConnectedSuccess(forged, hash), path.join('.')).toThrow();
  }
  expect(() =>
    decodeConnectedStage({
      ...stored.stage,
      starts: [...stored.stage.starts, stored.stage.starts[0]],
    }),
  ).toThrow('duplicate map key');
});
test('identity separates every runtime tuple dimension and shares stage input across objectives', () => {
  const captured = stage();
  const installed = { solverVersion: '0.4.0', budgetMs: 100 };
  const time = createConnectedQuestionIdentity(captured, 'time', installed, hash);
  const pri = createConnectedQuestionIdentity(captured, 'pri', installed, hash);
  expect(time.inputHash).toBe(pri.inputHash);
  expect(time.questionHash).not.toBe(pri.questionHash);
  expect(time.questionHash).toBe(
    hash(JSON.stringify(['B', time.inputHash, 'time', '18+0.4.0', 100, 48, 5])),
  );
  for (const changed of [
    { ...installed, budgetMs: 101 },
    { ...installed, solverVersion: '0.4.1' },
  ]) {
    const identity = createConnectedQuestionIdentity(captured, 'time', changed, hash);
    expect(identity.inputHash).toBe(time.inputHash);
    expect(identity.questionHash).not.toBe(time.questionHash);
  }
});

test('coherent forged hash echoes cannot substitute for recomputed full identity', () => {
  const stored = success();
  for (const field of ['inputHash', 'questionHash'] as const) {
    const forged = {
      ...stored,
      identity: { ...stored.identity, [field]: 'forged' },
      request: { ...stored.request, scope: { ...stored.request.scope, [field]: 'forged' } },
      response: { ...stored.response, scope: { ...stored.response.scope, [field]: 'forged' } },
    };
    expect(() => decodeConnectedSuccess(forged, hash)).toThrow('identity');
  }
});

test('quantisation floor retains rejected candidate and fractional quantized movement comparison', () => {
  const initial = stage(true);
  const input = { ...initial.input, graph: { ...initial.input.graph, edges: [] } };
  const captured = {
    ...initial,
    relationships: [],
    input,
    starts: new Map(
      [...initial.starts].map(([key, start]) => [key, key.startsWith('b') ? 0.2 : start]),
    ),
    finishes: new Map(
      [...initial.finishes].map(([key, finish]) => [key, key.startsWith('b') ? 1.2 : finish]),
    ),
  };
  const identity = createConnectedQuestionIdentity(
    captured,
    'time',
    { solverVersion: '0.4.0', budgetMs: 100 },
    hash,
  );
  const prepared = buildConnectedSolverRequest(
    captured,
    identity,
    { solverVersion: '0.4.0', budgetMs: 100 },
    'time',
  );
  if (prepared.kind !== 'request') throw new Error('fixture requires request');
  const asked = prepared.request;
  const raw: ConnectedSolverResponse = {
    wireVersion: 5,
    scope: {
      kind: 'connected-stage',
      projectId: 'B',
      inputHash: identity.inputHash,
      questionHash: identity.questionHash,
    },
    status: 'feasible',
    offsets: { [asked.slices[0].key]: 10 },
    objectiveValues: {
      makespan: { value: 58, stageValue: 58, bound: 58, status: 'optimal' },
      priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
      movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
    },
  };
  const stored = encodeConnectedSuccess(captured, identity, asked, JSON.stringify(raw), hash);
  expect(stored.publication).toBe('baseline');
  const decoded = decodeConnectedSuccess(JSON.parse(JSON.stringify(stored)), hash);
  expect(decoded.outcome.starts.get(asked.slices[0].key)).toBe(10 / 48);
  expect(decoded.outcome.decision.schedule.slices.get(asked.slices[0].key)?.earliestStart).toBe(
    0.2,
  );
  expect(decoded.outcome.decision.baselineValues.movement).toBe(Math.abs(0.2 - 10 / 48));
  expect(decoded.outcome.decision.optimizedValues.movement).toBe(0);
  expect(stored.response).toEqual(raw);
});

test('stored stage replay independently refuses a forged finish before an envelope exists', () => {
  const stored = encodeConnectedStage(stage());
  expect(() =>
    decodeConnectedStage({
      ...stored,
      finishes: stored.finishes.map(([key, finish]) => [key, finish + 0.1]),
    }),
  ).toThrow('baseline replay failed');
});
test('scope project and stored comparison cannot be forged independently', () => {
  const stored = success();
  expect(() =>
    decodeConnectedSuccess({ ...stored, scope: { kind: 'connected-stage', projectId: 'A' } }, hash),
  ).toThrow('scope');
  expect(() =>
    decodeConnectedSuccess(
      {
        ...stored,
        comparison: {
          ...stored.comparison,
          optimizedValues: { ...stored.comparison.optimizedValues, movement: 999 },
        },
      },
      hash,
    ),
  ).toThrow('comparison');
});

test('decoded stage and identity detach caller-owned objects after validation', () => {
  const stored = success();
  const decoded = decodeConnectedSuccess(stored, hash);
  stored.stage.input.rows[0].priority = 999;
  stored.identity.inputHash = 'mutated';
  expect(decoded.stage.input.rows[0].priority).toBeNull();
  expect(decoded.identity.inputHash).not.toBe('mutated');
  const boundary = certificate();
  const terminal = decodeBoundaryCertificate(boundary, hash);
  boundary.identity.inputHash = 'mutated';
  expect(terminal.identity.inputHash).not.toBe('mutated');
});

test('nonfinite forged null request fields are rejected before JSON equality', () => {
  const stored = success();
  for (const forged of [NaN, Infinity, -Infinity]) {
    expect(() =>
      decodeConnectedSuccess(
        {
          ...stored,
          request: {
            ...stored.request,
            slices: stored.request.slices.map((slice) => ({ ...slice, deadlineUnits: forged })),
          },
        },
        hash,
      ),
    ).toThrow();
  }
});

test('standalone stage decode detaches caller-owned rows without an enclosing packet', () => {
  const stored = encodeConnectedStage(stage());
  const decoded = decodeConnectedStage(stored);
  stored.input.rows[0].priority = 999;
  expect(decoded.input.rows[0].priority).toBeNull();
});

test('stored stepped selectors require explicit step evidence and optional empty demands remain equivalent', () => {
  const initial = stage();
  const stepped = {
    ...initial,
    input: {
      ...initial.input,
      slices: initial.input.slices.map((slice) => ({ ...slice, stepId: 'design' })),
      graph: {
        ...initial.input.graph,
        nodes: initial.input.slices.map((slice) => ({
          kind: 'step' as const,
          ref: { workItemId: slice.workItemId, stepId: 'design' },
          at: 0,
        })),
      },
    },
    relationships: initial.relationships.map((relationship) => ({
      ...relationship,
      predecessor: { ...relationship.predecessor, scope: 'node' as const, stepId: 'design' },
    })),
    starts: new Map([...initial.starts].map(([key, start]) => [key + 'design', start])),
    finishes: new Map([...initial.finishes].map(([key, finish]) => [key + 'design', finish])),
  };
  const stored = encodeConnectedStage(stepped);
  expect(decodeConnectedStage(stored)).toEqual(stepped);
  expect(() =>
    decodeConnectedStage(withoutField(stored, ['relationships', 0, 'predecessor', 'stepId'])),
  ).toThrow();
  expect(() =>
    decodeConnectedStage(withoutField(stored, ['input', 'graph', 'nodes', 0, 'ref', 'stepId'])),
  ).toThrow();
  const empty = {
    ...initial,
    input: {
      ...initial.input,
      slices: initial.input.slices.map((slice) => ({ ...slice, demands: [] })),
    },
  };
  expect(
    createConnectedQuestionIdentity(empty, 'time', { solverVersion: '0.4.0', budgetMs: 100 }, hash),
  ).toEqual(
    createConnectedQuestionIdentity(
      initial,
      'time',
      { solverVersion: '0.4.0', budgetMs: 100 },
      hash,
    ),
  );
  expect(decodeConnectedStage(encodeConnectedStage(empty)).input.slices[0].demands).toEqual([]);
});
