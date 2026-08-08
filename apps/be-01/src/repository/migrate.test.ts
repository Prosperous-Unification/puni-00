import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const USERS = '20260804194845_add_users';
const WBS = '20260805154500_add_wbs_domain';
const DEPS = '20260806084828_add_dependencies';
const ACCESS = '20260806160000_add_project_access';
const METHOD = '20260806170000_add_estimate_method';
const CAL = '20260806180000_add_calendar_dates';
const TEAMS = '20260806190000_add_teams_and_assignees';
// Columns on `project` and `work_item` rather than tables of its own, so it
// appears in the order and in nothing else this file checks.
const REVISIONS = '20260807090000_add_revisions';
// One table of its own, referencing `project` and `users`, so it reverses first.
const JOURNAL = '20260807180000_add_command_journal';
// A column on `role`, so like the revisions it appears in the order and nowhere else here.
const ROLE_POSITION = '20260809090000_add_role_position';

const WBS_TABLES = ['project', 'work_item', 'role', 'estimate'] as const;
// Its own migration, reversed with the domain because it references `work_item`.
const DEPENDENCY_TABLES = ['dependency'] as const;
// Also its own, and also reversed with the domain: it references `project`.
const ACCESS_TABLES = ['project_access'] as const;
// Also its own, and reversed with the domain: they reference `work_item`.
const DIRECTORY_TABLES = ['service_team', 'person', 'person_team', 'assignment'] as const;

function tempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-migrate-'));
  return {
    path: join(dir, 'test.db'),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function tables(dbPath: string): string[] {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
  } finally {
    db.close();
  }
}

describe('the WBS domain migration', () => {
  it('creates the four domain tables', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      for (const t of [...WBS_TABLES, ...DEPENDENCY_TABLES, ...ACCESS_TABLES, ...DIRECTORY_TABLES])
        expect(tables(db.path)).toContain(t);
    } finally {
      db.cleanup();
    }
  });

  it('reverses to the accounts schema without touching it', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);

      const reversed = rollbackTo(db.path, FOLDER, USERS);

      expect(reversed).toEqual([
        ROLE_POSITION,
        JOURNAL,
        REVISIONS,
        TEAMS,
        CAL,
        METHOD,
        ACCESS,
        DEPS,
        WBS,
      ]);
      for (const t of [...WBS_TABLES, ...DEPENDENCY_TABLES, ...ACCESS_TABLES, ...DIRECTORY_TABLES])
        expect(tables(db.path)).not.toContain(t);
      // Reversing the domain must not take the accounts with it: the two
      // migrations are separately deployable and a failed domain release
      // leaves everyone still able to log in.
      expect(tables(db.path)).toContain('users');
      expect(tables(db.path)).toContain('examples');
    } finally {
      db.cleanup();
    }
  });
});

describe('the role position migration', () => {
  it('gives roles already in the database the order they were written in', () => {
    // The backfill, against rows that existed before the column did — which is
    // every project on the live server and the only situation that `UPDATE` is
    // for. Reached by rolling back to the migration before it, writing roles
    // the way the previous release wrote them, and migrating forward again.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      rollbackTo(db.path, FOLDER, JOURNAL);
      const before = openDatabase(db.path);
      try {
        before.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        before.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );
        // Written in the order the seed writes them and deliberately not in the
        // order their names sort: a backfill reading the index rather than the
        // rowid would hand these back the other way round.
        before.run("INSERT INTO role (id, project_id, name) VALUES ('r1', 'p', 'Zebra')");
        before.run("INSERT INTO role (id, project_id, name) VALUES ('r2', 'p', 'Alpha')");
      } finally {
        before.close();
      }

      runMigrations(db.path, FOLDER);

      const after = openDatabase(db.path);
      try {
        const rows = after
          .query<
            { id: string; position: number },
            []
          >('SELECT id, position FROM role ORDER BY position')
          .all();
        expect(rows.map((row) => row.id)).toEqual(['r1', 'r2']);
        expect(rows[0]?.position).toBeLessThan(rows[1]?.position ?? 0);
      } finally {
        after.close();
      }
    } finally {
      db.cleanup();
    }
  });
});
