import { expect, test } from 'vitest';

import { browserPreferences, rememberedPreferences } from './composition';

/**
 * The production instances must be importable where there is no browser store
 * at all, because that is this tier and because the shared setup installs its
 * stand-in after the module graph is built. Building a store for a key must
 * touch nothing either: only reading and writing may.
 */
test('the production preferences can be built with no browser store present', () => {
  expect(typeof browserPreferences.json).toBe('function');
  expect(typeof browserPreferences.text).toBe('function');
  expect(typeof browserPreferences.unchecked).toBe('function');
  expect(() => browserPreferences.unchecked('wbs.demo.id')).not.toThrow();
  expect(typeof rememberedPreferences.lastOpenedProject.read).toBe('function');
});
