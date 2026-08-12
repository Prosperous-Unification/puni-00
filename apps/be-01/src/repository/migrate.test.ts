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
// A column on `work_item`, the same shape again: it appears in the order, and
// in the two cases of its own at the bottom of this file.
const PRIORITY = '20260811100000_add_priority';
// The two capacity columns, in application order. Both are columns on existing
// tables, so like the revisions they appear in the order and in their own
// cases at the bottom of this file.
const TEAM_SLOTS = '20260812100000_add_team_slots';
const MAX_PARALLEL = '20260812100001_add_max_parallel';

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

      // Newest first. The two capacity columns reverse in the opposite order
      // to the one they were applied in, which is the whole of the rollback
      // ordering claim: `max_parallel` down, then `size` down.
      expect(reversed).toEqual([
        MAX_PARALLEL,
        TEAM_SLOTS,
        PRIORITY,
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

  it('lets the outgoing release keep inserting roles against the migrated schema', () => {
    // The half of a swap nothing else covers. be-01 blue and green share one
    // SQLite file, green migrates while blue is still serving, and blue's
    // `INSERT` names the three columns it was compiled against. Without the
    // column's default that statement fails, and adding a role on the old
    // colour answers 500 for the length of the swap.
    //
    // The statement is written out here rather than built through drizzle
    // precisely because drizzle is the *new* release: the point is what the old
    // one sends over the wire.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const sqlite = openDatabase(db.path);
      try {
        sqlite.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        sqlite.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );

        sqlite.run("INSERT INTO role (id, project_id, name) VALUES ('r1', 'p', 'Design')");

        const written = sqlite
          .query<{ position: number }, []>("SELECT position FROM role WHERE id = 'r1'")
          .get();
        // First rather than last, which is the one thing the default costs: a
        // colour-swap window's worth of wrong order, against a row that would
        // otherwise not exist at all.
        expect(written?.position).toBe(0);
      } finally {
        sqlite.close();
      }
    } finally {
      db.cleanup();
    }
  });
});

describe('the priority migration', () => {
  it('lets the outgoing release keep inserting work items against the migrated schema', () => {
    // The blue/green half, the same shape the role position migration has:
    // green migrates while blue is still serving and blue's `INSERT` names the
    // columns it was compiled against. Written out rather than built through
    // drizzle, because drizzle is the new release and the point is what the old
    // one sends.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const sqlite = openDatabase(db.path);
      try {
        sqlite.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        sqlite.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );

        sqlite.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name, notes, revision)' +
            " VALUES ('w1', 'p', NULL, 10, 'Strip', '', 0)",
        );

        const written = sqlite
          .query<{ priority: number | null }, []>("SELECT priority FROM work_item WHERE id = 'w1'")
          .get();
        expect(written?.priority).toBeNull();
      } finally {
        sqlite.close();
      }
    } finally {
      db.cleanup();
    }
  });

  it('leaves work items that existed before the column with no priority', () => {
    // The other half of "nullable, no default", and the half a `DEFAULT 1`
    // would break silently: every plan on the live server was written before
    // this column existed, and a work item with no priority is placed *after*
    // every work item that has one. A default would make every row of every plan
    // the most important work in it and reorder the queues of every plan that
    // has people on it.
    //
    // Reached the way the role backfill case is: roll back to the migration
    // before this one, write a work item the way the previous release wrote
    // one, and migrate forward again.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      rollbackTo(db.path, FOLDER, ROLE_POSITION);
      const before = openDatabase(db.path);
      try {
        before.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        before.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );
        before.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name, notes, revision)' +
            " VALUES ('w1', 'p', NULL, 10, 'Strip', '', 0)",
        );
      } finally {
        before.close();
      }

      runMigrations(db.path, FOLDER);

      const after = openDatabase(db.path);
      try {
        const row = after
          .query<{ priority: number | null }, []>('SELECT priority FROM work_item')
          .get();
        expect(row?.priority).toBeNull();
      } finally {
        after.close();
      }
    } finally {
      db.cleanup();
    }
  });
});

describe('the capacity migrations', () => {
  it('lets the outgoing release keep inserting work items and teams against both', () => {
    // The blue/green half, the same shape the priority and role-position
    // migrations have: green migrates while blue is still serving, and blue's
    // `INSERT` names the columns it was compiled against. Written out rather
    // than built through drizzle, because drizzle is the new release and the
    // point is what the old one sends.
    //
    // Proof: `DEFAULT 1` removed from `max_parallel` and this failed on that
    // exact statement with `NOT NULL constraint failed: work_item.max_parallel`;
    // watched 2026-08-12.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const sqlite = openDatabase(db.path);
      try {
        sqlite.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        sqlite.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );
        sqlite.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name, notes, revision)' +
            " VALUES ('w1', 'p', NULL, 10, 'Strip', '', 0)",
        );
        sqlite.run("INSERT INTO service_team (id, name) VALUES ('t1', 'Platform')");

        const item = sqlite
          .query<{ max_parallel: number }, []>("SELECT max_parallel FROM work_item WHERE id = 'w1'")
          .get();
        // One at a time, which is what the column's default says and what
        // every work item written before it did.
        expect(item?.max_parallel).toBe(1);
        const team = sqlite
          .query<{ size: number | null }, []>("SELECT size FROM service_team WHERE id = 't1'")
          .get();
        expect(team?.size).toBeNull();
      } finally {
        sqlite.close();
      }
    } finally {
      db.cleanup();
    }
  });

  it('leaves teams that existed before the column unsized', () => {
    // The other half of "nullable, no default", and the half a `DEFAULT 1`
    // would break silently: every team on the live server was written before
    // this column existed, and an unsized team constrains nothing. A default
    // of 1 would serialize every team's work on every plan that names one, on
    // the day the migration ran and with nobody having edited anything.
    //
    // Reached the way the priority backfill case is: roll back to the
    // migration before this one, write a team the way the previous release
    // wrote one, and migrate forward again.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      rollbackTo(db.path, FOLDER, PRIORITY);
      const before = openDatabase(db.path);
      try {
        before.run("INSERT INTO service_team (id, name) VALUES ('t1', 'Platform')");
      } finally {
        before.close();
      }

      runMigrations(db.path, FOLDER);

      const after = openDatabase(db.path);
      try {
        const row = after.query<{ size: number | null }, []>('SELECT size FROM service_team').get();
        expect(row?.size).toBeNull();
      } finally {
        after.close();
      }
    } finally {
      db.cleanup();
    }
  });

  it('walks back to the prior applied set and lets the outgoing release read the result', () => {
    // The rollback, asserted by **reading the result** rather than by trusting
    // an exit code: `AGENTS.md` — "an exit code is evidence only if the tool's
    // contract guarantees the effect". Two migrations, reversed newest first,
    // and then the release that comes back must be able to write and read a
    // work item and a team without either column.
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);

      const reversed = rollbackTo(db.path, FOLDER, PRIORITY);

      expect(reversed).toEqual([MAX_PARALLEL, TEAM_SLOTS]);
      const back = openDatabase(db.path);
      try {
        back.run(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
        );
        back.run(
          'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
            " VALUES ('p', 'Rewire the shed', 'u', 0, 'pert', NULL, 0, 1)",
        );
        back.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name, notes, priority, revision)' +
            " VALUES ('w1', 'p', NULL, 10, 'Strip', '', 2, 0)",
        );
        back.run("INSERT INTO service_team (id, name) VALUES ('t1', 'Platform')");
        // The columns are gone, and the release that comes back reads what it
        // knows about.
        const row = back
          .query<{ priority: number | null }, []>("SELECT priority FROM work_item WHERE id = 'w1'")
          .get();
        expect(row?.priority).toBe(2);
        expect(() => back.query('SELECT max_parallel FROM work_item').get()).toThrow();
        expect(() => back.query('SELECT size FROM service_team').get()).toThrow();
      } finally {
        back.close();
      }
    } finally {
      db.cleanup();
    }
  });
});
