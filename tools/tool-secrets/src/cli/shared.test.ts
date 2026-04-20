import { describe, expect, it } from 'bun:test';

import { assertRealCiphertext, DEFAULT_SOPS_FILE, requireConfiguredSops } from './shared';

describe('tool-secrets/cli/shared', () => {
  it('requireConfiguredSops succeeds for the scaffolded placeholder file', () => {
    requireConfiguredSops(DEFAULT_SOPS_FILE);
  });

  it('assertRealCiphertext throws because the file is a placeholder', async () => {
    let caught: unknown;
    try {
      await assertRealCiphertext(DEFAULT_SOPS_FILE);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toMatch(/placeholder/);
  });
});
