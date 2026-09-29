import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import {
  removeSavedSharedPeople,
  restoreSharedPeople,
  saveSharedPeople,
} from './shared-people-rollback';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const BEFORE_SHARED = '20260929180000_add_project_rank';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-shared-people-'));
  // Organizations `org-a` (projects a1–a4) and `org-b` (b1), authored by ada.
  path = await openSpaceDatabase(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function sql(statement: string): void {
  const db = openDatabase(path);
  try {
    db.run(statement);
  } finally {
    db.close();
  }
}

function modes(): unknown[] {
  const db = openDatabase(path);
  try {
    return db.query('SELECT id, shared_people FROM organization ORDER BY id').all();
  } finally {
    db.close();
  }
}

const projects = () => new ProjectRepository(openDrizzle(path), OPEN);

describe('a project reads its organization mode', () => {
  it('reads isolated until the organization is shared, then the rank order', async () => {
    expect(await projects().sharingOf('a2')).toEqual({ mode: 'isolated' });
    sql("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    await new ProjectRankRepository(openDrizzle(path), OPEN).moveAfter('org-a', 'a3', null, {
      at: 5,
      by: 'ada',
    });
    expect(await projects().sharingOf('a2')).toEqual({
      mode: 'shared',
      organizationId: 'org-a',
      order: ['a3', 'a1', 'a2', 'a4'],
    });
    expect(await projects().sharingOf('b1')).toEqual({ mode: 'isolated' });
  });

  it('reads isolated for a project no organization owns, and for an absent one', async () => {
    sql("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    sql(
      "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p0','Unowned','ada',0,'pert',0,1)",
    );
    expect(await projects().sharingOf('p0')).toEqual({ mode: 'isolated' });
    expect(await projects().sharingOf('nowhere')).toEqual({ mode: 'isolated' });
  });

  it('refuses a mode other than 0 or 1', () => {
    expect(() => {
      sql("UPDATE organization SET shared_people = 2 WHERE id = 'org-a'");
    }).toThrow(/CHECK constraint failed/);
  });
});

describe('rolling back past shared people', () => {
  beforeEach(() => {
    sql("UPDATE organization SET shared_people = 1 WHERE id IN ('org-a', 'org-b')");
  });

  it('refuses while an organization is shared, keeping the column and the ledger', () => {
    expect(() => rollbackTo(path, FOLDER, BEFORE_SHARED)).toThrow(/organizations share people/);
    expect(modes()).toEqual([
      { id: 'org-a', shared_people: 1 },
      { id: 'org-b', shared_people: 1 },
    ]);
  });

  it('saves, resets, rolls back, migrates and restores every mode', () => {
    const saved = saveSharedPeople(openDrizzle(path));
    expect(saved).toEqual({
      format: 'shared-people-save',
      version: 1,
      organizations: ['org-a', 'org-b'],
    });
    expect(removeSavedSharedPeople(openDrizzle(path), JSON.parse(JSON.stringify(saved)), 6)).toBe(
      2,
    );
    expect(rollbackTo(path, FOLDER, BEFORE_SHARED)).toEqual([
      '20260929210000_add_shared_people_audit',
      '20260929200000_add_shared_people',
    ]);
    runMigrations(path, FOLDER);
    expect(restoreSharedPeople(openDrizzle(path), JSON.parse(JSON.stringify(saved)), 7)).toBe(2);
    expect(modes()).toEqual([
      { id: 'org-a', shared_people: 1 },
      { id: 'org-b', shared_people: 1 },
    ]);
  });

  it('refuses to reset a save that no longer matches, changing nothing', () => {
    const saved = saveSharedPeople(openDrizzle(path));
    sql("UPDATE organization SET shared_people = 0 WHERE id = 'org-b'");
    sql(
      "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-c', 'C', 1, 1)",
    );
    expect(() => removeSavedSharedPeople(openDrizzle(path), saved, 6)).toThrow(/does not match/);
    expect(modes()).toEqual([
      { id: 'org-a', shared_people: 1 },
      { id: 'org-b', shared_people: 0 },
      { id: 'org-c', shared_people: 1 },
    ]);
  });

  it('refuses the whole restore when a saved organization is gone', () => {
    const saved = saveSharedPeople(openDrizzle(path));
    removeSavedSharedPeople(openDrizzle(path), saved, 6);
    const ghostly = { ...saved, organizations: ['ghost', ...saved.organizations] };
    expect(() => restoreSharedPeople(openDrizzle(path), ghostly, 7)).toThrow(
      /organization ghost no longer exists/,
    );
    expect(modes()).toEqual([
      { id: 'org-a', shared_people: 0 },
      { id: 'org-b', shared_people: 0 },
    ]);
  });

  it('refuses a malformed save before any transaction', () => {
    for (const malformed of [
      null,
      [],
      { format: 'shared-people-save', version: 2, organizations: [] },
      { format: 'shared-people-save', version: 1, organizations: [''] },
      { format: 'shared-people-save', version: 1, organizations: [], extra: 1 },
    ]) {
      expect(() => restoreSharedPeople(openDrizzle(path), malformed, 7)).toThrow(
        'invalid shared people save',
      );
    }
  });
});
