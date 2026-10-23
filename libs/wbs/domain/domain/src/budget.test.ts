import { describe, expect, it } from 'bun:test';

import { decideBudget, readBudgets, type StoredBudget } from './budget';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
import type { StoredMeasureEstimate } from './measure-estimate';
import type { NodeAttempt } from './measure-fact';
import type { StoredMeasure } from './step-values';

const SEEDED: readonly MeasureDefinition[] = SEEDED_MEASURE_DEFINITIONS.map((fields) => ({
  id: `m-${fields.key}`,
  ...fields,
}));

const ROWS = [
  { id: 'P', parentId: null },
  { id: 'A', parentId: 'P' },
  { id: 'B', parentId: 'P' },
  { id: 'C', parentId: 'P' },
];

const tokens = (workItemId: string, value: number, recordedAt = 1): StoredMeasure => ({
  workItemId,
  stepId: 'dev',
  metric: 'token_actual',
  value,
  recordedAt,
});

const budget = (fields: Partial<StoredBudget> = {}): StoredBudget => ({
  workItemId: 'P',
  key: 'tokens',
  cap: 1000,
  policy: 'strict',
  holdPerAttempt: null,
  ...fields,
});

const reads = {
  rows: ROWS,
  definitions: SEEDED,
  budgets: [] as StoredBudget[],
  facts: [] as StoredMeasure[],
  estimates: [] as StoredMeasureEstimate[],
  attempts: [] as NodeAttempt[],
  factor: 1,
  mixed: new Map(),
};

const running = (workItemId: string, startedAt: number): NodeAttempt => ({
  workItemId,
  stepId: 'dev',
  attemptNumber: 1,
  startedAt,
  executorPersonId: null,
  reference: null,
  note: null,
  endedAt: null,
  outcome: null,
});

describe('decideBudget', () => {
  it('accepts a cap in tokens, cost and the derived agent minutes', () => {
    const cap = { cap: 10, holdPerAttempt: null };
    expect(decideBudget(SEEDED, 'tokens', cap)).toMatchObject({ ok: true });
    expect(decideBudget(SEEDED, 'cost', cap)).toMatchObject({ ok: true });
    expect(decideBudget(SEEDED, 'agent_minutes', cap)).toMatchObject({ ok: true });
    expect(decideBudget(SEEDED, 'hours', { cap: 1.5, holdPerAttempt: 0.25 })).toMatchObject({
      ok: true,
    });
  });

  it('refuses a key the organization does not define, legacy names included', () => {
    for (const key of ['story_points', 'token_actual', 'token_estimate'])
      expect(decideBudget(SEEDED, key, null)).toEqual({ ok: false, reason: 'unknown_measure' });
  });

  it('refuses a budget, and a clear, in the scheduling measure', () => {
    expect(decideBudget(SEEDED, 'time', { cap: 5, holdPerAttempt: null })).toEqual({
      ok: false,
      reason: 'scheduling_measure_budget',
    });
    expect(decideBudget(SEEDED, 'time', null)).toEqual({
      ok: false,
      reason: 'scheduling_measure_budget',
    });
  });

  it('refuses a negative or non-finite cap or hold', () => {
    for (const figures of [
      { cap: -1, holdPerAttempt: null },
      { cap: Number.POSITIVE_INFINITY, holdPerAttempt: null },
      { cap: 10, holdPerAttempt: -2 },
    ])
      expect(decideBudget(SEEDED, 'tokens', figures)).toEqual({
        ok: false,
        reason: 'invalid_budget',
      });
  });

  it('refuses a fraction on an integer measure', () => {
    expect(decideBudget(SEEDED, 'tokens', { cap: 1.5, holdPerAttempt: null })).toEqual({
      ok: false,
      reason: 'scale_mismatch',
    });
    expect(decideBudget(SEEDED, 'tokens', { cap: 2, holdPerAttempt: 0.5 })).toEqual({
      ok: false,
      reason: 'scale_mismatch',
    });
  });

  it('answers an unowned project against the seeded four', () => {
    expect(decideBudget(null, 'tokens', { cap: 1, holdPerAttempt: null })).toMatchObject({
      ok: true,
    });
    expect(decideBudget(null, 'cost', null)).toEqual({ ok: false, reason: 'unknown_measure' });
  });
});

describe('readBudgets', () => {
  it("reads a parent's budget against its three leaves' facts", () => {
    // The spec scenario "A subtree budget".
    const read = readBudgets({
      ...reads,
      budgets: [budget()],
      facts: [tokens('A', 400), tokens('B', 400), tokens('C', 400)],
    });
    expect(read.get('P')?.get('tokens')).toEqual({
      cap: 1000,
      policy: 'strict',
      source: 'stated',
      remaining: -200,
      exceeded: true,
    });
    // No leaf states or derives one.
    expect(read.has('A')).toBe(false);
  });

  it('reports exceeded only once the facts cross the cap', () => {
    const read = readBudgets({ ...reads, budgets: [budget()], facts: [tokens('A', 1000)] });
    expect(read.get('P')?.get('tokens')).toMatchObject({ remaining: 0, exceeded: false });
  });

  it('sums a leaf’s facts over every step', () => {
    const read = readBudgets({
      ...reads,
      budgets: [budget({ workItemId: 'A', cap: 100 })],
      facts: [tokens('A', 30), { ...tokens('A', 50), stepId: 'qa' }],
    });
    expect(read.get('A')?.get('tokens')).toMatchObject({ remaining: 20 });
    expect(read.has('P')).toBe(false);
  });

  it('holds the allowance of each running attempt of unknown usage, and releases it on its end', () => {
    // The spec scenario "Unknown spend holds".
    const stated = budget({ workItemId: 'A', cap: 500, holdPerAttempt: 300 });
    const held = readBudgets({ ...reads, budgets: [stated], attempts: [running('A', 10)] });
    expect(held.get('A')?.get('tokens')).toEqual({
      cap: 500,
      policy: 'strict',
      source: 'stated',
      remaining: 200,
      exceeded: false,
      held: 300,
    });
    const ended = readBudgets({
      ...reads,
      budgets: [stated],
      attempts: [{ ...running('A', 10), endedAt: 20, outcome: 'succeeded' }],
    });
    expect(ended.get('A')?.get('tokens')).toMatchObject({ remaining: 500, held: 0 });
  });

  it('holds nothing for an attempt whose usage was recorded since it started', () => {
    const stated = budget({ cap: 500, holdPerAttempt: 300 });
    const read = readBudgets({
      ...reads,
      budgets: [stated],
      // A's fact predates its attempt; B's was recorded after B's started.
      facts: [tokens('A', 50, 5), tokens('B', 50, 15)],
      attempts: [running('A', 10), running('B', 10)],
    });
    // Proof: with the recordedAt test dropped (any fact counts), this read held
    // nothing for A; watched 2026-10-23.
    expect(read.get('P')?.get('tokens')).toMatchObject({ held: 300, remaining: 100 });
  });

  it('derives a budget from the pessimistic points times the project factor, and lets a stated one override it', () => {
    const trio = (workItemId: string, pessimistic: number): StoredMeasureEstimate => ({
      workItemId,
      stepId: 'dev',
      key: 'tokens',
      optimistic: 1,
      realistic: 2,
      pessimistic,
      singlePoint: false,
    });
    const read = readBudgets({
      ...reads,
      estimates: [trio('A', 300), trio('B', 401)],
      facts: [tokens('A', 100)],
      factor: 1.5,
    });
    // Proof: with the factor left out, this read capped A at 300; watched 2026-10-23.
    expect(read.get('A')?.get('tokens')).toEqual({
      cap: 450,
      policy: 'advisory',
      source: 'derived',
      remaining: 350,
      exceeded: false,
    });
    // 401 × 1.5 = 601.5, half up on an integer measure.
    expect(read.get('B')?.get('tokens')?.cap).toBe(602);
    // The parent's derived cap is its summed pessimistic points, once rounded.
    expect(read.get('P')?.get('tokens')?.cap).toBe(1052);
    const overridden = readBudgets({
      ...reads,
      estimates: [trio('A', 300)],
      budgets: [budget({ workItemId: 'A', cap: 10, policy: 'advisory' })],
    });
    expect(overridden.get('A')?.get('tokens')).toMatchObject({ cap: 10, source: 'stated' });
  });

  it('reads no budget where the bases mix, and none in the scheduling measure', () => {
    const read = readBudgets({
      ...reads,
      budgets: [budget({ key: 'cost' })],
      mixed: new Map([['P', new Map([['cost', ['a', 'b'] as const]])]]),
    });
    expect(read.has('P')).toBe(false);
  });

  it('throws on a budget in a key no definition holds', () => {
    expect(() => readBudgets({ ...reads, budgets: [budget({ key: 'story_points' })] })).toThrow(
      'no definition of its project holds',
    );
  });
});
