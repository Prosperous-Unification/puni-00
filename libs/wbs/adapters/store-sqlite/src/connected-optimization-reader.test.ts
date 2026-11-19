import { createHash } from 'node:crypto';

import {
  type PreparedConnectedOptimization,
  selectConnectedOptimizations,
} from '@wbs/core/service/connected-optimization';
import {
  canonicalConnectedStageInput,
  contractVersionOf,
  resolveScheduleInput,
  scheduleResolved,
  sliceKey,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import { connectedOptimizationReaderOf } from './connected-optimization-reader';

function component(): PreparedConnectedOptimization {
  const resolved = resolveScheduleInput({
    rows: ['a', 'b'].map((id, position) => ({
      id,
      position,
      parentId: null,
      priority: null,
      frozenNumber: null,
    })),
    slices: ['a', 'b'].map((workItemId) => ({
      workItemId,
      stepId: null,
      days: 1,
      width: 1,
      personId: null,
      poolIds: [],
    })),
    edges: [],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
  });
  return {
    mode: 'isolated',
    originOrdinal: 20000,
    relationships: [],
    workPackages: ['A', 'B'].map((workPackageId, rank) => ({
      workPackageId,
      rank,
      anchorOrdinal: 20000,
      enabled: true,
      engine: rank === 0 ? 'optimized' : 'fast',
      objective: 'time',
    })),
    input: {
      ...resolved,
      order: {
        kind: 'connected',
        workPackageIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
        ]),
        rankByWorkPackage: new Map([
          ['A', 0],
          ['B', 1],
        ]),
      },
    },
  };
}
const key = (id: string) => sliceKey(id, null);

test('real captured adapter prepares fixed foreign requests then materializes the selected response', () => {
  const prepared = component();
  const baseline = scheduleResolved(
    prepared.input,
    new Map([
      [key('a'), 3],
      [key('b'), 4],
    ]),
  );
  const seen: string[] = [];
  const adapter = connectedOptimizationReaderOf({
    solverVersion: '0.4.0',
    budgetMs: 100,
    readPair: ({ stage, questions, requests }) => {
      seen.push(stage.workPackageId);
      expect(questions.time.inputHash).toBe(
        createHash('sha256').update(canonicalConnectedStageInput(stage)).digest('hex'),
      );
      expect(questions.time.contractVersion).toBe(contractVersionOf('0.4.0'));
      expect(questions.time.questionHash).not.toBe(questions.pri.questionHash);
      expect(questions.time.questionHash).toBe(
        createHash('sha256')
          .update(
            JSON.stringify([
              stage.workPackageId,
              questions.time.inputHash,
              'time',
              contractVersionOf('0.4.0'),
              100,
              48,
              5,
            ]),
          )
          .digest('hex'),
      );
      const built = requests.time;
      if (built.kind !== 'request') throw new Error('expected request');
      expect(built.request.scope.fixed).toEqual([
        {
          projectId: stage.workPackageId === 'A' ? 'B' : 'A',
          key: key(stage.workPackageId === 'A' ? 'b' : 'a'),
          start: stage.workPackageId === 'A' ? 4 : 0,
          finish: stage.workPackageId === 'A' ? 5 : 1,
        },
      ]);
      const local = key(stage.workPackageId.toLowerCase());
      return {
        generation: 1,
        variants: {
          pri: { kind: 'idle' },
          time: {
            kind: 'response',
            stdout: JSON.stringify({
              wireVersion: 5,
              scope: {
                kind: 'connected-stage',
                projectId: stage.workPackageId,
                inputHash: questions.time.inputHash,
                questionHash: questions.time.questionHash,
              },
              status: 'feasible',
              offsets: { [local]: 0 },
              objectiveValues: {
                makespan: { value: 48, stageValue: 48, bound: 48, status: 'optimal' },
                priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                movement: {
                  value: stage.workPackageId === 'A' ? 144 : 192,
                  stageValue: stage.workPackageId === 'A' ? 144 : 192,
                  bound: 0,
                  status: 'optimal',
                },
              },
            }),
          },
        },
      };
    },
  });
  const selected = selectConnectedOptimizations(prepared, baseline, adapter);
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected composite');
  expect(seen).toEqual(['A', 'B']);
  expect(selected.placement.slices.get(key('a'))?.earliestStart).toBe(0);
  expect(selected.placement.slices.get(key('b'))?.earliestStart).toBe(4);
  expect(selected.stages[0]?.optimization?.variants.time).toEqual({
    state: 'ready',
    proof: 'proven',
  });
  expect(selected.stages[1]?.stage.starts.get(key('a'))).toBe(0);
});

test('captured misses remain visible and repeated stage identities are stable', () => {
  const prepared = component();
  const baseline = scheduleResolved(prepared.input);
  const identities: string[] = [];
  const adapter = connectedOptimizationReaderOf({
    solverVersion: '0.4.0',
    budgetMs: 100,
    readPair: ({ questions }) => {
      identities.push(questions.time.questionHash);
      return {
        generation: null,
        variants: { pri: { kind: 'pending' }, time: { kind: 'failed', reason: 'timeout' } },
      };
    },
  });
  const first = selectConnectedOptimizations(prepared, baseline, adapter);
  const second = selectConnectedOptimizations(prepared, baseline, adapter);
  expect(first).toEqual(second);
  expect(identities.slice(0, 2)).toEqual(identities.slice(2));
  if (first.kind !== 'selected') throw new Error('expected component');
  expect(first.placement).toBe(baseline);
  expect(first.stages[0]?.optimization?.variants).toEqual({
    pri: { state: 'pending' },
    time: { state: 'failed', reason: 'timeout' },
  });
  expect(selectConnectedOptimizations(prepared, baseline, null).kind).toBe('engine_unavailable');
});

test('disabled captured identity does not access the source', () => {
  const prepared = component();
  const baseline = scheduleResolved(prepared.input);
  let reads = 0;
  const adapter = connectedOptimizationReaderOf({
    solverVersion: '0.4.0',
    budgetMs: 100,
    readPair: () => {
      reads++;
      throw new Error('identity reads must not access a source');
    },
  });
  const selected = selectConnectedOptimizations(
    {
      ...prepared,
      workPackages: prepared.workPackages.map((workPackage) => ({
        ...workPackage,
        enabled: false,
      })),
    },
    baseline,
    adapter,
  );
  expect(reads).toBe(0);
  expect(selected.kind).toBe('selected');
});

test('the captured reader obeys the source borrowed lifetime on every read', () => {
  const prepared = component();
  const baseline = scheduleResolved(prepared.input);
  let isOpen = true;
  const adapter = connectedOptimizationReaderOf({
    solverVersion: '0.4.0',
    budgetMs: 100,
    readPair: () => {
      if (!isOpen) throw new Error('snapshot is closed');
      return { generation: null, variants: { pri: { kind: 'idle' }, time: { kind: 'idle' } } };
    },
  });
  selectConnectedOptimizations(prepared, baseline, adapter);
  isOpen = false;
  expect(() => selectConnectedOptimizations(prepared, baseline, adapter)).toThrow(
    'snapshot is closed',
  );
});

test('prepared fractional boundary infeasibility survives the adapter and selection without a candidate', () => {
  const initial = component();
  const rows = ['a', 'b', 'c'].map((id, position) => ({
    id,
    position,
    parentId: null,
    priority: null,
    frozenNumber: null,
  }));
  const slices = rows.map(({ id }) => ({
    workItemId: id,
    stepId: null,
    days: id === 'a' ? 0.2 : 1,
    width: 1,
    personId: null,
    poolIds: [],
  }));
  const prepared: PreparedConnectedOptimization = {
    ...initial,
    workPackages: ['A', 'B', 'C'].map((workPackageId, rank) => ({
      workPackageId,
      rank,
      anchorOrdinal: 20000,
      engine: workPackageId === 'B' ? 'optimized' : 'fast',
      objective: 'time',
      enabled: workPackageId === 'B',
    })),
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
    input: {
      ...initial.input,
      rows,
      slices,
      graph: {
        nodes: rows.map(({ id }) => ({ kind: 'boundary', workItemId: id, at: 0 })),
        edges: [
          {
            predecessor: { leafId: 'a', at: 0 },
            successor: { leafId: 'b', at: 0 },
            provenance: 'authored',
            relationshipId: 'ab',
            type: 'FS',
          },
          {
            predecessor: { leafId: 'b', at: 0 },
            successor: { leafId: 'c', at: 0 },
            provenance: 'authored',
            relationshipId: 'bc',
            type: 'FS',
          },
        ],
      },
      order: {
        kind: 'connected',
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
    },
  };
  const baseline = scheduleResolved(prepared.input);
  let reads = 0;
  const adapter = connectedOptimizationReaderOf({
    solverVersion: '0.4.0',
    budgetMs: 100,
    readPair: ({ questions, requests }) => {
      reads++;
      expect(requests.time.kind).toBe('boundary-infeasible');
      expect(questions.time.quantum).toBe(48);
      expect(questions.time.wireVersion).toBe(5);
      return { generation: null, variants: { pri: { kind: 'idle' }, time: { kind: 'idle' } } };
    },
  });
  const selected = selectConnectedOptimizations(prepared, baseline, adapter);
  if (selected.kind !== 'selected') throw new Error('expected component');
  expect(reads).toBe(1);
  expect(selected.placement).toBe(baseline);
  const observation = selected.stages.find(
    ({ stage }) => stage.workPackageId === 'B',
  )?.optimization;
  expect(observation?.variants.time.state).toBe('boundary-infeasible');
  expect(observation?.candidates.time).toBeNull();
  if (observation?.variants.time.state !== 'boundary-infeasible')
    throw new Error('expected terminal');
  expect(observation.variants.time.certificate.evidence).toBe('contradictory-bounds');
  expect(observation.variants.time.certificate.question.inputHash).toBe(observation.inputHash);
});
