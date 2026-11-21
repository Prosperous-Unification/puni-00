import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Drizzle, openExistingConnection } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { SpaceRepository } from './space';
import { removeSavedSpaces, restoreSpaces, saveSpaces } from './space-rollback';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const BEFORE_SPACES = '20260928200000_add_work_item_status_facts';
const SPACE_WINDOW = '20261110120100_space_holds_projects_people_teams';
const FIRST_PROJECT = 'fixture-parent-org-a';
const SECOND_PROJECT = 'rollback-second-org-a';
const OTHER_PROJECT = 'fixture-parent-org-b';
const wrote: WriteStamp = { at: 1, by: 'ada' };

describe('space rollback save, remove and restore', () => {
  let dir: string | undefined;
  let path: string | undefined;
  const uncertain: unknown[] = [];

  function acquireConnection() {
    if (path === undefined) throw new Error('space rollback database is absent');
    try {
      return openExistingConnection(path);
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) uncertain.push(cause);
      throw cause;
    }
  }

  function withinStore<T>(use: (db: Drizzle) => T): T {
    const connection = acquireConnection();
    let value: T;
    try {
      value = use(connection.db);
    } catch (primary: unknown) {
      try {
        connection.close();
      } catch (cleanup: unknown) {
        uncertain.push(cleanup);
        throw new AggregateError([primary, cleanup], 'space rollback operation and close failed', {
          cause: cleanup,
        });
      }
      throw primary;
    }
    try {
      connection.close();
    } catch (cause: unknown) {
      uncertain.push(cause);
      throw cause;
    }
    return value;
  }

  async function withSpaceStore<T>(use: (store: SpaceRepository) => Promise<T>): Promise<T> {
    const connection = acquireConnection();
    let value: T;
    try {
      value = await use(new SpaceRepository(connection.db, OPEN));
    } catch (primary: unknown) {
      try {
        connection.close();
      } catch (cleanup: unknown) {
        uncertain.push(cleanup);
        throw new AggregateError([primary, cleanup], 'space rollback repository and close failed', {
          cause: cleanup,
        });
      }
      throw primary;
    }
    try {
      connection.close();
    } catch (cause: unknown) {
      uncertain.push(cause);
      throw cause;
    }
    return value;
  }

  /** Keeps the public operator path; an unexpected wrapper failure retains the fixture. */
  function rollBackSpaces(): void {
    if (path === undefined) throw new Error('space rollback database is absent');
    try {
      rollbackTo(path, FOLDER, BEFORE_SPACES);
    } catch (cause: unknown) {
      const expected =
        'rolling back ' +
        SPACE_WINDOW +
        ' failed: space project rollback requires restoring the verified window snapshot';
      if (!(cause instanceof Error) || cause.message !== expected) uncertain.push(cause);
      throw cause;
    }
  }

  beforeEach(async () => {
    if (dir !== undefined || uncertain.length !== 0)
      throw new Error('previous space rollback fixture is unsettled');
    dir = mkdtempSync(join(tmpdir(), 'wbs-space-rollback-'));
    try {
      path = await openSpaceDatabase(dir);
      withinStore((db) => {
        db.run(
          "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('rollback-second-org-a','org-a','Rollback second',1,'ada')",
        );
        db.run("UPDATE work_package SET project_id='rollback-second-org-a' WHERE id='a2'");
        expect(
          db.all("SELECT id,project_id FROM work_package WHERE id IN ('a1','a2','b1') ORDER BY id"),
        ).toEqual([
          { id: 'a1', project_id: FIRST_PROJECT },
          { id: 'a2', project_id: SECOND_PROJECT },
          { id: 'b1', project_id: OTHER_PROJECT },
        ]);
        expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      });
      await withSpaceStore(async (store) => {
        expect(
          (await store.create({ id: 's-1', organizationId: 'org-a', name: 'Q3' }, wrote)).ok,
        ).toBe(true);
        expect(
          (await store.create({ id: 's-2', organizationId: 'org-b', name: 'Launch' }, wrote)).ok,
        ).toBe(true);
        expect(await store.addProject('org-a', 's-1', SECOND_PROJECT, null, wrote)).toEqual({
          ok: true,
          position: 10,
        });
        expect(
          await store.addProject('org-a', 's-1', FIRST_PROJECT, null, { at: 2, by: 'ada' }),
        ).toEqual({ ok: true, position: 5 });
        expect(await store.addProject('org-b', 's-2', OTHER_PROJECT, null, wrote)).toEqual({
          ok: true,
          position: 10,
        });
      });
    } catch (cause: unknown) {
      // A setup failure may precede a returned fixture owner; retain its directory for reconciliation.
      uncertain.push(cause);
      throw cause;
    }
  });

  afterEach(() => {
    if (dir === undefined) return;
    if (uncertain.length !== 0)
      throw new AggregateError(
        [...uncertain],
        'unsettled space rollback fixture retained at ' + dir,
        { cause: uncertain[0] },
      );
    rmSync(dir, { recursive: true });
    dir = undefined;
    path = undefined;
  });

  const snapshot = () =>
    withinStore((db) => ({
      spaces: db.all('SELECT * FROM space ORDER BY id'),
      assignments: db.all(
        'SELECT id AS project_id,organization_id,space_id,space_position FROM project WHERE space_id IS NOT NULL ORDER BY space_id,space_position,id',
      ),
    }));
  const fullSnapshot = () =>
    withinStore((db) => ({
      schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      tables: db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map(({ name }) => ({
          name,
          rows: db.all('SELECT * FROM "' + name.replaceAll('"', '""') + '"').sort((left, right) => {
            const a = JSON.stringify(left),
              b = JSON.stringify(right);
            return a < b ? -1 : a > b ? 1 : 0;
          }),
        })),
    }));
  const ledger = () =>
    withinStore((db) =>
      db.all<{ name: string | null; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY created_at,name',
      ),
    );
  /** Independent filesystem names/raw SHA256s, without the rollback selector or saved ledger as its oracle. */
  const expectedLedger = () =>
    readdirSync(FOLDER, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && existsSync(join(FOLDER, entry.name, 'migration.sql')),
      )
      .map((entry) => entry.name)
      .sort()
      .map((name) => ({
        name,
        hash: createHash('sha256')
          .update(readFileSync(join(FOLDER, name, 'migration.sql')))
          .digest('hex'),
      }));

  it('roundtrips current-format spaces and exact project assignments without reversing a guarded window', () => {
    const before = snapshot();
    const projects = withinStore((db) => db.all('SELECT * FROM project ORDER BY id'));
    expect(withinStore((db) => db.all('SELECT * FROM space_person'))).toEqual([]);
    expect(withinStore((db) => db.all('SELECT * FROM space_team'))).toEqual([]);
    const saved = withinStore(saveSpaces);
    expect(saved).toMatchObject({ format: 'space-save', version: 2 });
    expect(saved.spaces.map(({ id, members }) => ({ id, members }))).toEqual([
      {
        id: 's-1',
        members: [
          { projectId: FIRST_PROJECT, position: 5 },
          { projectId: SECOND_PROJECT, position: 10 },
        ],
      },
      { id: 's-2', members: [{ projectId: OTHER_PROJECT, position: 10 }] },
    ]);
    expect(ledger()).toEqual(expectedLedger());
    const beforeLedger = ledger();
    expect(withinStore((db) => removeSavedSpaces(db, JSON.parse(JSON.stringify(saved))))).toBe(2);
    expect(snapshot()).toEqual({ spaces: [], assignments: [] });
    if (path === undefined) throw new Error('space rollback database is absent');
    try {
      runMigrations(path, FOLDER);
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) uncertain.push(cause);
      throw cause;
    }
    expect(ledger()).toEqual(beforeLedger);
    expect(withinStore((db) => restoreSpaces(db, JSON.parse(JSON.stringify(saved))))).toBe(2);
    expect(snapshot()).toEqual(before);
    expect(withinStore((db) => db.all('SELECT * FROM project ORDER BY id'))).toEqual(projects);
    expect(ledger()).toEqual(beforeLedger);
  });

  it('refuses the full old rollback with authored projects and engagements, retaining every schema row and full ledger', async () => {
    withinStore((db) => {
      db.run("INSERT INTO person(id,name) VALUES('rollback-person','Rollback Person')");
      db.run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('rollback-person','org-a','Rollback Person')",
      );
      db.run("INSERT INTO service_team(id,name) VALUES('rollback-team','Rollback Team')");
      db.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('rollback-team','org-a','Rollback Team')",
      );
    });
    await withSpaceStore(async (store) => {
      expect(await store.addPerson('org-a', 's-1', 'rollback-person', wrote)).toBe(true);
      expect(await store.addTeam('org-a', 's-1', 'rollback-team', wrote)).toBe(true);
    });
    expect(ledger()).toEqual(expectedLedger());
    expect(ledger().at(-1)?.name).toBe(SPACE_WINDOW);
    const before = fullSnapshot();
    expect(rollBackSpaces).toThrow(
      'rolling back ' +
        SPACE_WINDOW +
        ' failed: space project rollback requires restoring the verified window snapshot',
    );
    expect(fullSnapshot()).toEqual(before);
    expect(ledger()).toEqual(expectedLedger());
  });

  it('refuses to remove a save that no longer matches, deleting nothing', async () => {
    const saved = withinStore(saveSpaces);
    expect(
      await withSpaceStore((store) =>
        store.moveProject('org-a', 's-1', SECOND_PROJECT, null, { at: 3, by: 'ada' }),
      ),
    ).toEqual({ ok: true, position: 2 });
    const moved = snapshot();
    // Historical version1 comparison evidence; this control now mutates an actual project assignment.
    // Proof, observed 2026-09-29: with the comparison reduced to the count of
    // spaces, this remove deleted both spaces instead of throwing.
    expect(() => withinStore((db) => removeSavedSpaces(db, saved))).toThrow(/does not match/);
    expect(snapshot()).toEqual(moved);

    await withSpaceStore((store) =>
      store.create({ id: 's-3', organizationId: 'org-a', name: 'Later' }, wrote),
    );
    expect(() => withinStore((db) => removeSavedSpaces(db, saveSpaces(db)))).not.toThrow();
    expect(snapshot()).toEqual({ spaces: [], assignments: [] });
  });

  it('refuses the whole restore when a saved project is gone', () => {
    const saved = withinStore(saveSpaces);
    withinStore((db) => removeSavedSpaces(db, saved));
    withinStore((db) => {
      db.run("DELETE FROM work_package WHERE id='a2'");
      db.run("DELETE FROM project WHERE id='rollback-second-org-a'");
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    const before = fullSnapshot();
    // Historical version1 package-owner proof; this current control addresses the saved project.
    // Proof, observed 2026-09-29: with the ownership check skipped, this
    // restore threw drizzle's `Failed query: insert into "space_work_package" …`
    // instead; the check is what makes the refusal name the work package and owner.
    // Either way nothing was written, which the snapshot below holds.
    expect(() => withinStore((db) => restoreSpaces(db, saved))).toThrow(
      /project rollback-second-org-a, which organization org-a no longer owns/,
    );
    expect(fullSnapshot()).toEqual(before);
    expect(snapshot()).toEqual({ spaces: [], assignments: [] });
  });

  it('refuses the whole restore when a saved project has changed organization', () => {
    const saved = withinStore(saveSpaces);
    withinStore((db) => removeSavedSpaces(db, saved));
    withinStore((db) => {
      db.run("DELETE FROM work_package WHERE id='a2'");
      db.run("UPDATE project SET organization_id='org-b' WHERE id='rollback-second-org-a'");
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    const before = fullSnapshot();
    expect(() => withinStore((db) => restoreSpaces(db, saved))).toThrow(
      /project rollback-second-org-a, which organization org-a no longer owns/,
    );
    expect(fullSnapshot()).toEqual(before);
    expect(snapshot()).toEqual({ spaces: [], assignments: [] });
  });

  it('refuses the whole restore, naming it, over a name now taken', async () => {
    const saved = withinStore(saveSpaces);
    withinStore((db) => removeSavedSpaces(db, saved));
    await withSpaceStore((store) =>
      store.create({ id: 's-9', organizationId: 'org-a', name: 'Q3' }, wrote),
    );
    const before = fullSnapshot();
    expect(() => withinStore((db) => restoreSpaces(db, saved))).toThrow(
      /saved space s-1 is named Q3, which organization org-a already holds/,
    );
    expect(fullSnapshot()).toEqual(before);
    expect(snapshot().spaces).toHaveLength(1);
  });

  it('refuses the whole restore, naming it, when an author is no longer a user', () => {
    const saved = withinStore(saveSpaces);
    withinStore((db) => removeSavedSpaces(db, saved));
    const ghostly = {
      ...saved,
      spaces: saved.spaces.map((each) =>
        each.id === 's-2' ? { ...each, createdBy: 'ghost' } : each,
      ),
    };
    const before = fullSnapshot();
    expect(() => withinStore((db) => restoreSpaces(db, ghostly))).toThrow(
      /saved space s-2 was created by ghost, who is no longer a user/,
    );
    expect(fullSnapshot()).toEqual(before);
    expect(snapshot()).toEqual({ spaces: [], assignments: [] });
  });

  it('refuses to remove a save whose one field differs, deleting nothing', () => {
    const saved = withinStore(saveSpaces);
    const edited = {
      ...saved,
      spaces: saved.spaces.map((each) =>
        each.id === 's-1'
          ? { ...each, members: each.members.map((member) => ({ ...member, position: 99 })) }
          : each,
      ),
    };
    const before = fullSnapshot();
    expect(() => withinStore((db) => removeSavedSpaces(db, edited))).toThrow(/does not match/);
    expect(fullSnapshot()).toEqual(before);
    expect(snapshot().spaces).toHaveLength(2);
  });

  it('refuses version1 member-author history and malformed current saves before touching the database', () => {
    const saved = withinStore(saveSpaces);
    const legacy = {
      format: 'space-save',
      version: 1,
      spaces: [
        {
          id: 's-2',
          organizationId: 'org-b',
          name: 'Launch',
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
          createdBy: 'ada',
          members: [
            {
              workPackageId: 'b1',
              position: 10,
              createdAt: 1,
              updatedAt: null,
              createdBy: 'ghost',
            },
          ],
        },
      ],
    };
    const before = fullSnapshot();
    for (const malformed of [
      null,
      legacy,
      { ...saved, format: 'typed-dependency-save' },
      { ...saved, spaces: [{ id: 's-1' }] },
      { ...saved, extra: true },
      {
        ...saved,
        spaces: saved.spaces.map((each) => ({
          ...each,
          members: each.members.map((member) => ({ ...member, createdBy: 'ghost' })),
        })),
      },
    ]) {
      expect(() => withinStore((db) => removeSavedSpaces(db, malformed))).toThrow(
        /invalid space save/,
      );
      expect(() => withinStore((db) => restoreSpaces(db, malformed))).toThrow(/invalid space save/);
      expect(fullSnapshot()).toEqual(before);
    }
    expect(snapshot().spaces).toHaveLength(2);
  });
});
