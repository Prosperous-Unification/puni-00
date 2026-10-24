import { describe, expect, it } from 'bun:test';

import type { BudgetReads, StoredBudget } from './budget';
import { findExhaustedBudget } from './budget-admission';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
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
];

const budget = (fields: Partial<StoredBudget> = {}): StoredBudget => ({
  workItemId: 'P',
  key: 'tokens',
  cap: 500,
  policy: 'strict',
  holdPerAttempt: 300,
  ...fields,
});

const tokens = (workItemId: string, value: number, recordedAt = 1): StoredMeasure => ({
  workItemId,
  stepId: 'dev',
  metric: 'token_actual',
  value,
  recordedAt,
});

const attempt = (workItemId: string, startedAt = 10): NodeAttempt => ({
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

const ended = (workItemId: string, startedAt: number, endedAt: number): NodeAttempt => ({
  ...attempt(workItemId, startedAt),
  endedAt,
  outcome: 'succeeded',
});

const reads = (fields: Partial<BudgetReads>): BudgetReads => ({
  rows: ROWS,
  definitions: SEEDED,
  budgets: [],
  facts: [],
  estimates: [],
  attempts: [],
  factor: 1,
  mixedFacts: new Map(),
  mixedEstimates: new Map(),
  ...fields,
});

const PAIR = [null, { currency: 'USD', rateCardDigest: 'b' }] as [
  null,
  { currency: string; rateCardDigest: string },
];

describe('findExhaustedBudget', () => {
  it('admits while the hold fits and refuses the attempt it would not', () => {
    const budgets = [budget()];
    // 500 remaining, 300 held by this attempt: admitted, 200 left.
    expect(findExhaustedBudget(reads({ budgets }), attempt('A'))).toBeNull();
    // A running on A holds 300: 200 remain and B's 300 would take it below zero.
    expect(findExhaustedBudget(reads({ budgets, attempts: [attempt('A')] }), attempt('B'))).toEqual(
      { workItemId: 'P', measure: 'tokens', remaining: 200, hold: 300, blocked: false },
    );
    // A's attempt ended with no fact: it holds nothing, and B fits again.
    expect(
      findExhaustedBudget(reads({ budgets, attempts: [ended('A', 10, 20)] }), attempt('B', 30)),
    ).toBeNull();
  });

  it('refuses at a strict budget spent to its cap, hold or none', () => {
    for (const holdPerAttempt of [null, 300]) {
      const spent = reads({ budgets: [budget({ holdPerAttempt })], facts: [tokens('A', 500)] });
      expect(findExhaustedBudget(spent, attempt('B'))).toEqual({
        workItemId: 'P',
        measure: 'tokens',
        remaining: 0,
        hold: holdPerAttempt ?? 0,
        blocked: false,
      });
    }
    // Without a hold, anything left admits.
    expect(
      findExhaustedBudget(
        reads({ budgets: [budget({ holdPerAttempt: null })], facts: [tokens('A', 499)] }),
        attempt('B'),
      ),
    ).toBeNull();
  });

  it('never refuses on an advisory or derived budget, readable or blocked', () => {
    const advisory = [budget({ policy: 'advisory' })];
    expect(
      findExhaustedBudget(reads({ budgets: advisory, facts: [tokens('A', 900)] }), attempt('B')),
    ).toBeNull();
    expect(
      findExhaustedBudget(
        reads({
          // A roomy strict tokens budget beside it, so the chain is read.
          budgets: [budget({ key: 'cost', policy: 'advisory' }), budget({ cap: 10_000 })],
          mixedFacts: new Map([['P', new Map([['cost', PAIR]])]]),
        }),
        attempt('A'),
      ),
    ).toBeNull();
    // A derived budget spent past its cap: advisory, so the start is admitted.
    const derived = reads({
      estimates: [
        {
          workItemId: 'A',
          stepId: 'dev',
          key: 'tokens',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
          singlePoint: false,
        },
      ],
      facts: [tokens('A', 50)],
    });
    expect(findExhaustedBudget(derived, attempt('A'))).toBeNull();
  });

  it('refuses at a blocked strict budget, its remainder unknown', () => {
    const blocked = reads({
      budgets: [budget({ key: 'cost', holdPerAttempt: null })],
      mixedFacts: new Map([['P', new Map([['cost', PAIR]])]]),
    });
    expect(findExhaustedBudget(blocked, attempt('A'))).toEqual({
      workItemId: 'P',
      measure: 'cost',
      remaining: null,
      hold: 0,
      blocked: true,
    });
  });

  it('names the nearest refusing budget, a leaf before its parent', () => {
    const budgets = [budget({ cap: 100 }), budget({ workItemId: 'A', cap: 100 })];
    expect(findExhaustedBudget(reads({ budgets }), attempt('A'))).toEqual({
      workItemId: 'A',
      measure: 'tokens',
      remaining: 100,
      hold: 300,
      blocked: false,
    });
    // B's chain holds only the parent's.
    expect(findExhaustedBudget(reads({ budgets }), attempt('B'))).toMatchObject({
      workItemId: 'P',
    });
  });

  it('holds nothing for an attempt whose usage a later fact already records', () => {
    // A fact at 20 on A's node, an attempt backdated to 10: its usage reads as
    // known (design D39's accepted limit), so it adds no hold.
    expect(
      findExhaustedBudget(
        reads({ budgets: [budget({ cap: 400 })], facts: [tokens('A', 200, 20)] }),
        attempt('A', 10),
      ),
    ).toBeNull();
  });
});
