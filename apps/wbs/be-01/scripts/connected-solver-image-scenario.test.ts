import { sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import {
  connectedImageScenario,
  verifyConnectedImageResponse,
} from './connected-solver-image-scenario';

function answer(scenario: ReturnType<typeof connectedImageScenario>, status = 'feasible') {
  const request = scenario.request;
  return {
    wireVersion: 5,
    scope: {
      kind: 'connected-stage',
      projectId: request.scope.projectId,
      inputHash: request.scope.inputHash,
      questionHash: request.scope.questionHash,
    },
    status,
    ...(status === 'feasible'
      ? {
          offsets: { [request.slices[0]?.key ?? 'absent']: 48 },
          objectiveValues: {
            makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
            priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
          },
        }
      : {}),
  };
}

test('feasible image question pins A and C and accepts only exact B placement', () => {
  const scenario = connectedImageScenario('connected-feasible');
  expect(scenario.request.scope.fixed.map(({ start, finish }) => [start, finish])).toEqual([
    [0, 1],
    [2, 3],
  ]);
  expect(scenario.request.scope.boundaries).toHaveLength(2);
  expect(() => {
    verifyConnectedImageResponse(scenario, JSON.stringify(answer(scenario)));
  }).not.toThrow();
  const overlap = answer(scenario);
  overlap.offsets = { [sliceKey(scenario.stage.input.rows[1]?.id ?? 'absent', null)]: 0 };
  expect(() => {
    verifyConnectedImageResponse(scenario, JSON.stringify(overlap));
  }).toThrow();
});

test('fractional image question sends the validated 10/9 contradiction and requires child proof', () => {
  const scenario = connectedImageScenario('connected-fractional');
  expect(scenario.request.quantum).toBe(48);
  expect(scenario.request.scope.fixed.map(({ start, finish }) => [start, finish])).toEqual([
    [0, 0.2],
    [1.2, 2.2],
  ]);
  expect(scenario.request.scope.boundaries).toMatchObject([
    { direction: 'incoming', minimumStartUnits: 10 },
    { direction: 'outgoing', maximumStartUnits: 9 },
  ]);
  expect(() => {
    verifyConnectedImageResponse(scenario, JSON.stringify(answer(scenario, 'boundary-infeasible')));
  }).not.toThrow();
  for (const status of ['unknown', 'infeasible', 'feasible']) {
    expect(() => {
      verifyConnectedImageResponse(scenario, JSON.stringify(answer(scenario, status)));
    }).toThrow();
  }
});

test.each(['connected-feasible', 'connected-fractional'] as const)(
  '%s refuses foreign or malformed child evidence',
  (kind) => {
    const scenario = connectedImageScenario(kind);
    const status = kind === 'connected-feasible' ? 'feasible' : 'boundary-infeasible';
    const valid = answer(scenario, status);
    for (const scope of [
      { kind: 'local' },
      { ...valid.scope, projectId: '99999999-9999-4999-8999-999999999999' },
      { ...valid.scope, inputHash: 'stale' },
      { ...valid.scope, questionHash: 'stale' },
    ]) {
      expect(() => {
        verifyConnectedImageResponse(scenario, JSON.stringify({ ...valid, scope }));
      }).toThrow();
    }
    expect(() => {
      verifyConnectedImageResponse(scenario, '{');
    }).toThrow();
    expect(() => {
      verifyConnectedImageResponse(scenario, JSON.stringify(answer(scenario, 'unknown')));
    }).toThrow();
  },
);

test('image acceptance refuses a forged external boundary even with matching child echo', () => {
  const scenario = connectedImageScenario('connected-fractional');
  const forged = {
    ...scenario,
    request: {
      ...scenario.request,
      scope: {
        ...scenario.request.scope,
        fixed: scenario.request.scope.fixed.map((fixed) => ({ ...fixed, start: fixed.start + 1 })),
      },
    },
  };
  expect(() => {
    verifyConnectedImageResponse(forged, JSON.stringify(answer(forged, 'boundary-infeasible')));
  }).toThrow();
});
