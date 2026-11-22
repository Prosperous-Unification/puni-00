import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import {
  type CatalogueFixtureCustody,
  migrateEmptyCatalogueFixture,
} from './testing/catalogue-database';

/** {@link MachineCredentialRepository.touchLastUsed} over a migrated, empty store. */
describe('recording a machine credential’s last use', () => {
  let dir: string;
  let custody: CatalogueFixtureCustody;
  let path: string;

  beforeEach(() => {
    custody = { hasUnknownOwner: false };
    dir = mkdtempSync(join(tmpdir(), 'wbs-machine-touch-'));
    path = join(dir, 'test.db');
    migrateEmptyCatalogueFixture({ path, directory: dir, reportedAt: 1 }, custody);
  });

  afterEach(() => {
    // Proof: sqlite-cohort1-v233-machine-credential-touch injected a throw after
    // real close returned. Omission deleted this directory; restoration retained
    // it. This did not inject a leaked native handle.
    if (custody.hasUnknownOwner)
      throw new Error('SQLite fixture has unknown native custody; retained ' + dir);
    rmSync(dir, { recursive: true, force: true });
  });

  // Proof: with `lastUseOf` answering `'due'` for no row, the update matched
  // nothing and this answered `'recorded'`; watched 2026-10-23.
  it('answers absent for a credential that does not exist', async () => {
    const credentials = new MachineCredentialRepository(openDrizzle(path), OPEN);
    expect(await credentials.touchLastUsed('00000000-0000-4000-8000-000000000000', 1)).toBe(
      'absent',
    );
  });
});
