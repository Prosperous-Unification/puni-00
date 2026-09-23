import { beforeEach, expect, test } from 'vitest';

import { browserStorage, revocableStorage } from './browser-storage.repository';
import { isPreferenceStoreLifecycleError, PreferenceStoreLifecycleError } from './contract';
import { fakeBrowserStorage } from './fake-browser-storage';

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

/**
 * The revoked refusal is **classified**, not only worded — the same reason
 * `preferences.resource.test.ts` asserts the withdrawn one's own `kind`: a
 * delivery consumer narrows on the class, never on message text. `module.test.ts`
 * already covers the wording of this same refusal and would keep passing for a
 * plain `Error`, which is why this asserts the type and the `kind` and nothing
 * about the message.
 */
test('a revoked store refuses with a lifecycle refusal of kind revoked', () => {
  const store = revocableStorage(fakeBrowserStorage({ 'wbs.demo': 'held' }));
  store.revoke();

  let caught: unknown = null;
  try {
    store.read('wbs.demo');
  } catch (refusal) {
    caught = refusal;
  }

  expect(isPreferenceStoreLifecycleError(caught)).toBe(true);
  expect(caught).toBeInstanceOf(PreferenceStoreLifecycleError);
  expect(caught instanceof PreferenceStoreLifecycleError ? caught.kind : null).toBe('revoked');
});
