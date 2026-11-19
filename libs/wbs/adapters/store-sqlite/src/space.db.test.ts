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
    raw((sqlite) => {
      for (const id of ['a1', 'a2', 'a3', 'a4', 'b1']) {
        const organizationId = id === 'b1' ? 'org-b' : 'org-a';
        sqlite.run(
          "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,1,'ada')",
          [id, organizationId, id],
        );
        sqlite.run('UPDATE work_package SET project_id=? WHERE id=?', [id, id]);
      }
    });
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
  const insertMember = (spaceId: string, projectId: string, position = 10) =>
    raw((sqlite) =>
      sqlite.run('UPDATE project SET space_id=?,space_position=? WHERE id=?', [
        spaceId,
        position,
        projectId,
      ]),
    );
  const members = () =>
    raw((sqlite) =>
      sqlite
        .query(
          'SELECT space_id,id AS project_id FROM project WHERE space_id IS NOT NULL ORDER BY space_id,id',
        )
        .all(),
    );
  const count = (table: 'space' | 'project' | 'work_package') =>
    raw((sqlite) => sqlite.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);

  describe('the tables', () => {
    it('refuses a membership joining a space and a work package of different organizations', () => {
      insertSpace('s-a', 'org-a');
      // Historical package-pair evidence; current assertions address the actual project/space guard.
      // Proof, observed 2026-09-29: with the work package reference dropped from
      // the migration, the insert naming org-a stored `(s-a, b1)`; with the
      // space reference dropped, the insert naming org-b stored it.
      expect(() => insertMember('s-a', 'b1')).toThrow();
      insertSpace('s-b', 'org-b');
      expect(() => insertMember('s-b', 'a1')).toThrow();
      expect(members()).toEqual([]);
      expect(() => insertMember('s-a', 'a1')).not.toThrow();
    });

    it('refuses an empty name, and a name twice in one organization only', () => {
      expect(() => insertSpace('s-0', 'org-a', '')).toThrow();
      insertSpace('s-1', 'org-a', 'Q3');
      expect(() => insertSpace('s-2', 'org-a', 'Q3')).toThrow();
      expect(() => insertSpace('s-3', 'org-b', 'Q3')).not.toThrow();
    });

    it('keeps project membership when a package is deleted', () => {
      insertSpace('s-1', 'org-a');
      insertSpace('s-2', 'org-a');
      insertMember('s-1', 'a1');
      insertMember('s-2', 'a2');
      // Historical package-pair cascade below is superseded: current membership belongs to the retained project.
      // Proof, observed 2026-09-29: with `ON DELETE CASCADE` dropped from the
      // work package reference, this delete failed `FOREIGN KEY constraint failed`.
      raw((db) => db.run("DELETE FROM work_package WHERE id = 'a1'"));
      expect(members()).toEqual([
        { space_id: 's-1', project_id: 'a1' },
        { space_id: 's-2', project_id: 'a2' },
      ]);
    });

    it('deletes a space with its membership and no work package', () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a1');
      raw((db) => db.run("DELETE FROM space WHERE id = 's-1'"));
      expect(members()).toEqual([]);
      expect(count('work_package')).toBe(5);
    });

    it('orders a tie in position by work package id', async () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a3', 10);
      insertMember('s-1', 'a1', 10);
      insertMember('s-1', 'a2', 5);
      const read = () => new SpaceRepository(openDrizzle(path), OPEN).membersOf('org-a', 's-1');
      expect((await read())?.map(({ projectId }) => projectId)).toEqual(['a2', 'a1', 'a3']);
    });
  });

  describe('the guarded current rollback', () => {
    it('refuses the project-space transition without changing schema or assignments when empty', () => {
      const before = raw((sqlite) => ({
        schema: sqlite
          .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
          .all(),
        ledger: sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY created_at').all(),
      }));
      expect(() => rollbackTo(path, FOLDER, BEFORE_SPACES)).toThrow();
      expect(
        raw((sqlite) => ({
          schema: sqlite
            .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
            .all(),
          ledger: sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY created_at').all(),
        })),
      ).toEqual(before);
    });
    it('refuses while a space exists and retains its current project assignment', () => {
      insertSpace('s-1', 'org-a');
      insertMember('s-1', 'a1');
      const before = members();
      // Historical package-pair down proof, preserved without current transition credit.
      // Proof, observed 2026-09-29: with the guard's INSERT removed from
      // `down.sql`, this rollback answered `[SPACES]` and dropped both tables.
      expect(() => rollbackTo(path, FOLDER, BEFORE_SPACES)).toThrow();
      expect(count('space')).toBe(1);
      expect(members()).toEqual(before);
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

    it('answers a foreign work package the organization does not own as not_found at the store', async () => {
      const store = new SpaceRepository(openDrizzle(path), OPEN);
      await store.create({ id: 's-1', organizationId: 'org-a', name: 'Q3' }, wrote);
      raw((db) => {
        db.run("DELETE FROM work_package WHERE id = 'a2'");
        db.run("DELETE FROM access_grant WHERE scope_kind='project' AND scope_id='a2'");
        db.run("DELETE FROM project WHERE id = 'a2'");
      });
      expect(await store.addProject('org-a', 's-1', 'a2', null, wrote)).toEqual({
        ok: false,
        reason: 'not_found',
      });
    });
  });
});
