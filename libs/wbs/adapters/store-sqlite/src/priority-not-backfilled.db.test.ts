import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { applyHistoricalCatalogueFixture } from './testing/historical-catalogue';
import { copyRecoveryPrefix } from './testing/recovery-state';

/**
 * **The check that a thing was _not_ done.**
 *
 * `priority-default-medium` gives every *newly created* work item the work package's
 * middle rung and deliberately ships **no migration and no backfill**: a plan
 * written before it keeps its blank priorities, because moving every row on
 * screen for a default nobody typed is the one thing the change refused
 * (proposal.md, Non-Goals). Null still draws as nothing on all four faces.
 *
 * A claim about an absence cannot be asserted by reading the code that is not
 * there, so it is asserted against the **migrator**: a plan holding null
 * priorities is put into the schema of the previous release, every migration
 * since is run forward over it, and the nulls have to still be nulls. Any
 * backfill anybody adds later is a migration this run applies.
 *
 * Proof: a scratch migration `20260830000000_backfill_priority` added to
 * `apps/wbs/be-01/drizzle/` — `UPDATE work_item SET priority = 50 WHERE priority IS
 * NULL;` with a no-op `down.sql` — and this failed on
 * `expected [ 50, 50 ] to equal [ null, null ]`. The folder was then deleted.
 * Watched 2026-08-29.
 */
const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

const PRIORITY_ADDITION = '20260811100000_add_priority';
const BEFORE_RENAME = '20261103110000_add_initial_access_offers';

describe('the priorities of a plan written before the default', () => {
  it('an existing plan is unchanged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-priority-backfill-'));
    const path = join(directory, 'test.db');
    const custody = { hasUnknownOwner: false };
    try {
      runMigrations(path, copyRecoveryPrefix(directory, PRIORITY_ADDITION));

      const before = openDatabase(path);
      try {
        before.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'hash', 1)",
        );
        before.run(
          "INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at) VALUES ('p', 'Rewire the shed', 'ada', 0, 'pert', NULL, 0, 1)",
        );
        // Two rows nobody prioritised — the state every plan in the database is
        // in on the day this change ships.
        before.run(
          "INSERT INTO work_item (id, project_id, position, name) VALUES ('strip', 'p', 10, 'Strip')",
        );
        before.run(
          "INSERT INTO work_item (id, project_id, position, name) VALUES ('sand', 'p', 20, 'Sand')",
        );
        expect(
          before
            .query<{ priority: number | null }, []>('SELECT priority FROM work_item ORDER BY id')
            .all()
            .map((row) => row.priority),
        ).toEqual([null, null]);
      } finally {
        before.close();
      }

      try {
        const beforeRename = join(directory, 'before-rename');
        mkdirSync(beforeRename);
        runMigrations(path, copyRecoveryPrefix(beforeRename, BEFORE_RENAME));
        const legacy = openDatabase(path);
        try {
          legacy.run(
            "INSERT INTO organization (id, name, legacy, created_at) VALUES ('priority-org', 'Priorities', 1, 1)",
          );
          legacy.run(
            "INSERT INTO project_organization (resource_id, organization_id) VALUES ('p', 'priority-org')",
          );
        } finally {
          legacy.close();
        }
        applyHistoricalCatalogueFixture(path, directory, {});
        runMigrations(path, FOLDER);
      } catch (cause: unknown) {
        custody.hasUnknownOwner = true;
        throw new Error('priority fixture migration failed; retained ' + directory, { cause });
      }

      const after = openDatabase(path);
      try {
        expect(
          after
            .query<{ id: string; priority: number | null }, []>(
              'SELECT id, priority FROM work_item ORDER BY id',
            )
            .all(),
        ).toEqual([
          { id: 'sand', priority: null },
          { id: 'strip', priority: null },
        ]);
      } finally {
        after.close();
      }
    } finally {
      if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true, force: true });
    }
  });
});
