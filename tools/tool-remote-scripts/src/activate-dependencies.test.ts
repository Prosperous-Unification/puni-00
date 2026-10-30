import { expect, test } from 'bun:test';

import { activateDependencies } from './activate-dependencies';

for (const args of [
  [],
  ['--activate'],
  ['--fence-managed'],
  ['--fence-managed', 'a'.repeat(40), 'unknown'],
]) {
  test(`dedicated CLI refuses incomplete or unsupported mutation ${args.join(' ')}`, async () => {
    let refused = false;
    try {
      await activateDependencies(args);
    } catch (cause) {
      refused = true;
      expect(String(cause)).toContain('managed exclusion only; activation blocked');
    }
    expect(refused).toBe(true);
  });
}
