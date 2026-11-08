import { expect, test } from 'bun:test';

import { requireRegistryBackupNamespace } from './registry-backup-namespace';
test('fixed worker requires its own distinct native UTS identity', () => {
  expect(() => {
    requireRegistryBackupNamespace('uts:[4026532000]', 'uts:[4026531838]');
  }).not.toThrow();
});
for (const [self, parent] of [
  ['uts:[4026531838]', 'uts:[4026531838]'],
  ['', 'uts:[4026531838]'],
  ['uts:[4026532000]', ''],
  ['pid:[4026532000]', 'uts:[4026531838]'],
]) {
  test(`fixed worker refuses missing/shared/wrong-kind UTS ${self}/${parent}`, () => {
    expect(() => {
      requireRegistryBackupNamespace(self, parent);
    }).toThrow();
  });
}
