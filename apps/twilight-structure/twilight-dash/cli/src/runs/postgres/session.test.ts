import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { openPostgresSession, type PostgresBudgets } from './session';

const budgets: PostgresBudgets = {
  openMilliseconds: 1000,
  operationMilliseconds: 1000,
  closeMilliseconds: 1000,
  statementMilliseconds: 500,
  lockMilliseconds: 500,
  pollMilliseconds: 5,
};

test('rejects every malformed budget before creating any resource', async () => {
  let created = 0;
  for (const key of Object.keys(budgets)) {
    for (const value of [undefined, null, 0, -1, 0.5, NaN, Infinity, 2147483648, '100']) {
      await rejects(
        openPostgresSession(
          () => {
            created++;
            throw new Error('resource creation');
          },
          { ...budgets, [key]: value },
        ),
        /invalid PostgreSQL budget/,
      );
    }
  }
  expect(created).toBe(0);
});
