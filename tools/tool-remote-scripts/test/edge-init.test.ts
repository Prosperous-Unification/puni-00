import { expect, test } from 'bun:test';

import { parseNativeContainer } from '../src/lib/edge-init';
import { verifyFixtureOwnership } from './edge-init';
import { syntheticContainer } from './edge-init-fixture';

test('native fixture ownership rejects foreign names and invocation labels before any effect', () => {
  const raw = syntheticContainer();
  raw.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'synthetic' });
  expect(verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toBe(raw.Id);
  raw.Name = '/wbs-registry-1';
  expect(() => verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toThrow();
  raw.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'foreign' });
  expect(() => verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toThrow();
});
