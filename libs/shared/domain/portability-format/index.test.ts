import { expect, test } from 'bun:test';

import { formatTurns } from './index';
test('formats remaining allowance', () => {
  expect(formatTurns(4)).toBe('4 turns left');
});
