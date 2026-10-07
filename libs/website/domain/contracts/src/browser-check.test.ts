import { expect, test } from 'bun:test';

import { browserCheckDifficulty, hashBrowserCheck, solveBrowserCheck } from './browser-check';

test('the solver finds the number behind a challenge', () => {
  const salt = '0123456789abcdef.2026-10-07.1791370800000.200000.a1b2c3d4';
  const challenge = hashBrowserCheck(salt, 12_345);
  expect(solveBrowserCheck(salt, challenge, browserCheckDifficulty.normal)).toBe(12_345);
  expect(solveBrowserCheck(salt, challenge, 0)).toBeNull();
  expect(solveBrowserCheck(`${salt}x`, challenge, 20_000)).toBeNull();
  expect(() => solveBrowserCheck(salt, 'not-hex', 10)).toThrow('SHA-256 hex');
  expect(() => solveBrowserCheck(salt, challenge, -1)).toThrow('maxnumber');
});

test('the hash is SHA-256 of the salt and the decimal number', () => {
  expect(hashBrowserCheck('ab', 0).length).toBe(64);
  expect(hashBrowserCheck('ab', 0)).not.toBe(hashBrowserCheck('ab', 1));
  expect(hashBrowserCheck('', 0)).toBe(
    '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
  );
});
