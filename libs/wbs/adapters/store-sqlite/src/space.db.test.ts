import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { spaceStoreConformance, type SpaceStoreFixture } from '@wbs/conformance';
import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { rollbackTo } from './migrate-down';
import { SpaceRepository } from './space';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const SPACES = '20260929100000_add_spaces';
const BEFORE_SPACES = '20260928200000_add_work_item_status_facts';
const wrote: WriteStamp = { at: 1, by: 'ada' };

/**
 * `20260929100000_add_spaces`: a space and its membership, the composite
 * references that make cross-organization membership impossible, and the
 * rollback that refuses while any space exists.
 */
describe('spaces', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-space-'));
    path = await openSpaceDatabase(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function raw<T>(use: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      return use(db);
    } finally {
      db.close();
    }
  }

  const insertSpace = (id: string, organizationId: string, name = id) =>
    raw((db) =>
      db.run(
        "INSERT INTO space (id, organization_id, name, revision, created_at, created_by) VALUES (?, ?, ?, 0, 1, 'ada')",
        [id, organizationId, name],
      ),
    );
  const insertMember = (
    spaceId: string,
    projectId: string,
    organizationId: string,
    position = 10,
  ) =>
    raw((db) =>
      db.run(
        "INSERT INTO space_project (space_id, project_id, organization_id, position, created_at, created_by) VALUES (?, ?, ?, ?, 1, 'ada')",
        [spaceId, projectId, organizationId, position],
      ),
    );
  const members = () =>
    raw((db) =>
      db
        .query('SELECT space_id, project_id FROM space_project ORDER BY space_id, project_id')
        .all(),
    );
  const count = (table: 'space' | 'space_project' | 'project') =>
    raw((db) => db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);

  describe('the tables', () => {
    it('refuses a membership joining a space and a project of different organizations', () => {
      insertSpace('s-a', 'org-a');
      // Proof, observed 2026-09-29: with the project reference dropped from
      // the migration, the insert naming org-a stored `(s-a, b1)`; with the
      // space reference dropped, the insert naming org-b stored it.
      expect(() => insertMember('s-a', 'b1', 'org-a')).toThrow();
      expect(() => insertMember('s-a', 'b1', 'org-b')).toThrow();
      expect(members()).toEqual([]);
      expect(() => insertMember('s-a', 'a1', 'org-a')).not.toThrow();
    });

    it('refuses an empty name, and a name twice in one organization only', () => {
      expect(() => insertSpace('s-0', 'org-a', '')).toThrow();
      insertSpace('s-1', 'org-a', 'Q3');
      expect(() => insertSpace('s-2', 'org-a', 'Q3')).toThrow();
      expect(() => insertSpace('s-3', 'org-b', 'Q3')).not.toThrow();
    });

    it('removes a deleted project from every space, past the ownership freeze', () => {
      insertSpace('s-1', 'org-a');
      insertSpace('s-2', 'org-a');
      insertMember('s-1', 'a1', 'org-a');
      insertMember('s-2', 'a1', 'org-a');
      insertMember('s-2', 'a2', 'org-a');
      // Proof, observed 2026-09-29: with `ON DELETE CASCADE` dropped from the
      // project reference, this delete failed `FOREIGN KEY constraint failed`.
      raw((db) => db.run("DELETE FROM project WHERE id = 'a1'"));
      expect(members()).toEqual([{ space_id: 's-2', project_id: 'a2' }]);
    });

    it('deletes a space with its membership and no project', () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a1', 'org-a');
      raw((db) => db.run("DELETE FROM space WHERE id = 's-1'"));
      expect(members()).toEqual([]);
      expect(count('project')).toBe(5);
    });

    it('orders a tie in position by project id', async () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a3', 'org-a', 10);
      insertMember('s-1', 'a1', 'org-a', 10);
      insertMember('s-1', 'a2', 'org-a', 5);
      const read = () => new SpaceRepository(openDrizzle(path), OPEN).membersOf('org-a', 's-1');
      expect((await read())?.map(({ projectId }) => projectId)).toEqual(['a2', 'a1', 'a3']);
    });
  });

  describe('the rollback', () => {
    it('rolls back while no space exists', () => {
      expect(rollbackTo(path, FOLDER, BEFORE_SPACES)).toEqual([SPACES]);
      expect(
        raw((db) => db.query("SELECT name FROM sqlite_master WHERE name LIKE 'space%'").all()),
      ).toEqual([]);
    });

    it('refuses while a space exists, keeping both tables and the ledger', () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a1', 'org-a');
      // Proof, observed 2026-09-29: with the guard's INSERT removed from
      // `down.sql`, this rollback answered `[SPACES]` and dropped both tables.
      expect(() => rollbackTo(path, FOLDER, BEFORE_SPACES)).toThrow();
      expect(count('space')).toBe(1);
      expect(count('space_project')).toBe(1);
      expect(
        raw((db) =>
          db
            .query<{ name: string }, []>(
              'SELECT name FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
            )
            .get(),
        )?.name,
      ).toBe(SPACES);
    });

    it('names the rollback CLI in the refusal', () => {
      insertSpace('s-1', 'org-a');
      expect(() => rollbackTo(path, FOLDER, BEFORE_SPACES)).toThrow(/space-rollback-cli/);
    });
  });

  describe('SpaceRepository', () => {
    spaceStoreConformance((): SpaceStoreFixture => ({
      store: new SpaceRepository(openDrizzle(path), OPEN),
      organizations: { a: 'org-a', b: 'org-b' },
      projects: { a: ['a1', 'a2', 'a3', 'a4'], b: 'b1' },
      stamp: wrote,
      legacy: null,
    }));

    it('answers the organization marked legacy', async () => {
      raw((db) => db.run("UPDATE organization SET legacy = 1 WHERE id = 'org-b'"));
      expect(await new SpaceRepository(openDrizzle(path), OPEN).legacyOrganizationId()).toBe(
        'org-b',
      );
    });

    it('answers a foreign project the organization does not own as not_found at the store', async () => {
      const store = new SpaceRepository(openDrizzle(path), OPEN);
      await store.create({ id: 's-1', organizationId: 'org-a', name: 'Q3' }, wrote);
      raw((db) => db.run("DELETE FROM project WHERE id = 'a2'"));
      expect(await store.addProject('org-a', 's-1', 'a2', null, wrote)).toEqual({
        ok: false,
        reason: 'not_found',
      });
    });
  });
});
