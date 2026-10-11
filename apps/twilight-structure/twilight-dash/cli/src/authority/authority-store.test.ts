import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import {
  type AuthorityStoreOptions,
  MemoryAuthorityStore,
  openAuthorityStore,
} from './authority-store';

const scratch: string[] = [];

afterAll(() => {
  for (const path of scratch) rmSync(path, { force: true, recursive: true });
});

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dash-authority-clock-'));
  scratch.push(root);
  const init = Bun.spawnSync(['git', 'init', '--quiet', root], { stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString('utf8'));
  return root;
}

test('refuses construction without a clock', () => {
  // A JavaScript caller can omit what TypeScript requires; these casts model exactly that caller.
  const missingClock = undefined as unknown as { read(): number };
  expect(() => new MemoryAuthorityStore(undefined, missingClock)).toThrow(
    'authority clock is required',
  );
  const root = repository();
  const withoutClock = { maxBusyAttempts: 1 } as unknown as AuthorityStoreOptions;
  expect(() => openAuthorityStore(root, withoutClock)).toThrow('authority clock is required');
  expect(existsSync(join(root, '.git', 'module-wiki', 'authority.sqlite'))).toBe(false);
});
