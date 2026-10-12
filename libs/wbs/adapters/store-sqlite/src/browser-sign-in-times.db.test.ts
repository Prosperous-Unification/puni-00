import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { SqliteBrowserAuthLifecycle } from './browser-auth-lifecycle';
import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const credential = (digest: string) =>
  ({ kind: 'oidc', userId: 'mia', digest: digest.repeat(64), expiresAt: 9_000_000 }) as const;

/**
 * A browser lifecycle's sign-in times (`organization-session-policy`): written
 * once when it opens, kept by every refresh.
 */
describe('browser sign-in times', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-sign-in-times-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const times = () => {
    const db = openDatabase(path);
    try {
      return db.query('SELECT opened_at, reauthenticated_at FROM browser_auth_lifecycle').all();
    } finally {
      db.close();
    }
  };

  // Proof: setting `opened_at` to the revocation time in `replace` made this
  // read 2000 after the refresh; watched 2026-10-12.
  it('keeps both times across a refresh', async () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    await lifecycle.open('session-1', credential('a'), { openedAt: 1000, reauthenticatedAt: 1500 });
    await lifecycle.replace('session-1', 1, credential('a'), credential('b'), 2000);
    expect(times()).toEqual([{ opened_at: 1000, reauthenticated_at: 1500 }]);
  });

  it('refuses malformed times before writing', () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    expect(() =>
      lifecycle.open('session-1', credential('a'), { openedAt: -1, reauthenticatedAt: null }),
    ).toThrow(/malformed/);
    expect(() =>
      lifecycle.open('session-1', credential('a'), { openedAt: 1, reauthenticatedAt: 0.5 }),
    ).toThrow(/malformed/);
    expect(times()).toEqual([]);
  });
});
