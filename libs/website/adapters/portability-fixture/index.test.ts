import { expect, test } from 'bun:test';

import { describeAllowance } from './index';
test('formats a remaining or exhausted allowance through its local dependency', () => {
  expect(describeAllowance(12, 3)).toBe('9 turns left');
  expect(describeAllowance(12, 20)).toBe('0 turns left');
});
