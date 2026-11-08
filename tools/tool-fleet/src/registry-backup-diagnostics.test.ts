import { expect, test } from 'bun:test';

import { findRegistryBackupStage, observeRegistryBackupStage } from './registry-backup-diagnostics';

test('stage observation preserves successful value and exact thrown failure without exposing content', async () => {
  const successful = { receipt: 'owned' };
  expect(await observeRegistryBackupStage('raw-census', () => successful)).toBe(successful);
  const failure = new Error('synthetic secret which must never become diagnostic output');
  const before = Object.getOwnPropertyDescriptors(failure);
  await observeRegistryBackupStage('origin-exclusion', () => Promise.reject(failure)).then(
    () => {
      throw new Error('Stage unexpectedly succeeded');
    },
    (cause: unknown) => {
      expect(cause).toBe(failure);
    },
  );
  expect(findRegistryBackupStage(failure)).toBe('origin-exclusion');
  expect(Object.getOwnPropertyDescriptors(failure)).toEqual(before);
  expect(JSON.stringify({ stage: findRegistryBackupStage(failure) })).not.toContain(
    'synthetic secret',
  );
});

test('outer diagnostic context preserves the innermost actual boundary and unclassified failures remain null', async () => {
  const failure = new Error('fixture');
  await observeRegistryBackupStage('repository-verification', () =>
    observeRegistryBackupStage('ciphertext-inspection', () => {
      throw failure;
    }),
  ).then(
    () => {
      throw new Error('Nested stage unexpectedly succeeded');
    },
    (cause: unknown) => {
      expect(cause).toBe(failure);
    },
  );
  expect(findRegistryBackupStage(failure)).toBe('ciphertext-inspection');
  expect(findRegistryBackupStage(new Error('unknown'))).toBeNull();
  expect(findRegistryBackupStage('arbitrary input')).toBeNull();
});
