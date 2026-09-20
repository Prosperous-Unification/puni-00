import { beforeEach, expect, test } from 'vitest';

import { browserStorage } from './browser-storage.repository';

beforeEach(() => {
  localStorage.clear();
});

test('a written value is readable', () => {
  const storage = browserStorage();

  storage.write('wbs.demo', 'held');

  expect(storage.read('wbs.demo')).toBe('held');
});

test('forget removes a key', () => {
  const storage = browserStorage();
  storage.write('wbs.demo', 'held');

  storage.forget('wbs.demo');

  expect(storage.read('wbs.demo')).toBeNull();
});

test('an absent key reads null', () => {
  expect(browserStorage().read('wbs.absent')).toBeNull();
});
