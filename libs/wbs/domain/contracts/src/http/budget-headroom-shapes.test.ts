import { expect, test } from 'bun:test';

import { readBudgetHeadroom } from './budget-headroom-shapes';
import { validateSchema } from './schema-shape';

const budget = {
  cap: 1000,
  policy: 'strict' as const,
  source: 'stated' as const,
  spent: 400,
  holdPerAttempt: 150,
  held: 300,
  remaining: 300,
  exceeded: false,
  workItemId: 'P',
};

const derived = {
  cap: 300,
  policy: 'advisory' as const,
  source: 'derived' as const,
  spent: 500,
  remaining: -200,
  exceeded: true,
  workItemId: 'A',
};

test('reads a strict and an advisory budget apart, a blocked key, and a step with none', async () => {
  const answer = {
    steps: [
      {
        workItemId: 'A',
        stepId: 'dev',
        state: 'startable' as const,
        budgets: {
          tokens: { strict: budget, advisory: derived },
          cost: {
            blocked: {
              strict: {
                workItemId: 'P',
                bases: [null, { currency: 'USD', rateCardDigest: 'x' }],
                source: 'stated',
              },
              advisory: {
                workItemId: 'A',
                bases: [null, { currency: 'USD', rateCardDigest: 'x' }],
                source: 'derived',
              },
            },
          },
        },
      },
      { workItemId: 'A', stepId: 'qa', state: 'claimed' as const, budgets: {} },
    ],
  };
  const schema = readBudgetHeadroom.responses[0].schema;
  const validated: unknown = await validateSchema(schema, answer);
  expect(validated).toEqual({ value: answer });
});

// Proof: with `spent` and `workItemId` made optional on the bounding budget,
// the two truncated answers below were accepted; watched 2026-10-23.
test('refuses a budget that names no bounding work item or no spend', async () => {
  const schema = readBudgetHeadroom.responses[0].schema;
  for (const field of ['workItemId', 'spent'] as const) {
    const { [field]: _dropped, ...truncated } = budget;
    const answer = {
      steps: [
        {
          workItemId: 'A',
          stepId: 'dev',
          state: 'startable',
          budgets: { tokens: { strict: truncated } },
        },
      ],
    };
    expect(await validateSchema(schema, answer)).not.toEqual({ value: answer });
  }
});
