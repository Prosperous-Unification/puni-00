import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequestPair } from './solver-request-pair';

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: 2 }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 'dev',
      days: 2,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  typed: [],
  deadlines: new Map(),
};

describe('buildSolverRequestPair', () => {
  it('builds both objectives over one quantised Fast baseline', () => {
    const pair = buildSolverRequestPair(INPUT, '0.2.0', 60_000);
    if (!pair.pri.ok || !pair.time.ok) throw new Error('expected two solver requests');

    expect(pair.pri.request.objective).toBe('pri');
    expect(pair.time.request.objective).toBe('time');
    expect(pair.pri.request.baselineOffsets).toBe(pair.time.request.baselineOffsets);
    expect(pair.pri.request.fastHint).toBe(pair.time.request.fastHint);
    expect({ ...pair.pri.request, objective: 'time' }).toEqual(pair.time.request);
  });

  it('returns both preflight refusals without manufacturing a request', () => {
    const tooLate: ScheduleInput = {
      ...INPUT,
      notBefore: new Map([['w-1', 50_000_000]]),
    };

    const pair = buildSolverRequestPair(tooLate, '0.2.0', 60_000);
    expect(pair.pri).toMatchObject({ ok: false, failure: 'horizon-overflow' });
    expect(pair.time).toMatchObject({ ok: false, failure: 'horizon-overflow' });
  });
});

it('keeps both movement references and hints clear of fractional bookings', () => {
  const input: ScheduleInput = {
    ...INPUT,
    slices: INPUT.slices.map((slice) => ({ ...slice, personId: 'ana' })),
    elsewhere: new Map([
      ['ana', [{ start: -1, end: 1.01, projectId: 'higher', workItemId: 'held' }]],
    ]),
  };
  const pair = buildSolverRequestPair(input, '0.2.0', 1000);
  if (!pair.pri.ok || !pair.time.ok) throw new Error('expected two requests');
  expect(pair.pri.request.baselineOffsets['w-1\u0000dev']).toBe(49);
  expect(pair.time.request.fastHint['w-1\u0000dev']).toBe(49);
});

it('returns arithmetic and compatibility refusals before baseline arithmetic can throw', () => {
  const impossible: ScheduleInput = {
    ...INPUT,
    slices: INPUT.slices.map((slice) => ({ ...slice, days: 2 ** 52 })),
  };
  for (const solverVersion of ['0.1.4', '0.2.0']) {
    const pair = buildSolverRequestPair(impossible, solverVersion, 1000);
    const failure = solverVersion === '0.1.4' ? 'incompatible-solver' : 'horizon-overflow';
    expect(pair.pri).toMatchObject({ ok: false, failure });
    expect(pair.time).toMatchObject({ ok: false, failure });
  }
});
