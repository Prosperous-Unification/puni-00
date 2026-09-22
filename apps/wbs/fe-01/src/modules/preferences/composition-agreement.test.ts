import { afterEach, expect, test } from 'vitest';

import { installApplicationRuntime } from '@/runtime/application-runtime';

import { rememberedPreferences } from './composition';
import { GANTT_DETAIL_KEY } from './preference-keys';

// Needs a browser: both surfaces under test reach this reader's own
// `localStorage`, which is the whole point of the case.

afterEach(() => {
  localStorage.removeItem(GANTT_DETAIL_KEY);
});

/**
 * The staged duplicate is harmless, and this is what says so.
 *
 * Delivery still imports the module-load `rememberedPreferences`; the page's
 * runtime installs the same module for itself. Two instances, and no divided
 * state: every preference lives in the reader's browser, the adapter reaches it
 * **per call**, and neither instance holds a value. The duplicate therefore costs
 * two closures and nothing else — which is what makes moving delivery onto the
 * runtime's services a later packet's job rather than this one's risk.
 */
test('the runtime-owned preferences and the module-load ones read the same bytes', async () => {
  const installed = installApplicationRuntime();

  installed.services.remembered.ganttDetail.write(true);
  expect(rememberedPreferences.ganttDetail.read()).toBe(true);
  rememberedPreferences.ganttDetail.write(false);
  expect(installed.services.remembered.ganttDetail.read()).toBe(false);

  await installed.close({ timeoutMs: 50 });

  // Retiring the runtime revokes only the store it owned: the module-load surface
  // is a different instance over the same browser, and delivery keeps working.
  expect(() => installed.services.remembered.ganttDetail.read()).toThrow(
    'the preferences store was revoked with its runtime',
  );
  expect(rememberedPreferences.ganttDetail.read()).toBe(false);
});
