import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

/** {@link MachineCredentialRepository.touchLastUsed} over a migrated, empty store. */
describe('recording a machine credential’s last use', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-machine-touch-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Proof: with the absent-credential throw removed, the read-first path fell
  // through to an update matching no row and this resolved; watched 2026-10-23.
  it('throws for a credential that does not exist', () => {
    const credentials = new MachineCredentialRepository(openDrizzle(path), OPEN);
    expect(credentials.touchLastUsed('00000000-0000-4000-8000-000000000000', 1)).rejects.toThrow(
      'no machine credential 00000000-0000-4000-8000-000000000000 to record a use of',
    );
  });
});
