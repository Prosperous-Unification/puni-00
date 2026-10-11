import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { ProjectRankRepository } from './project-rank';
import {
  removeSavedProjectRanks,
  restoreProjectRanks,
  saveProjectRanks,
} from './project-rank-rollback';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const BEFORE_RANK = '20260929100000_add_spaces';
const wrote: WriteStamp = { at: 5, by: 'ada' };

let dir: string;
let path: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-project-rank-'));
  // Organizations `org-a` (projects a1–a4) and `org-b` (b1), authored by ada.
  path = await openSpaceDatabase(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const store = () => new ProjectRankRepository(openDrizzle(path), OPEN);
const ids = (order: readonly { projectId: string }[]) => order.map((each) => each.projectId);

function sql(statement: string): void {
  const db = openDatabase(path);
  try {
    db.run(statement);
  } finally {
    db.close();
  }
}

function ranks(): unknown[] {
  const db = openDatabase(path);
  try {
    return db.query('SELECT * FROM project_rank ORDER BY project_id').all();
  } finally {
    db.close();
  }
}

describe('the project rank', () => {
  it('orders unranked projects by creation, then id', async () => {
    sql("UPDATE project SET created_at = 0 WHERE id = 'a4'");
    expect(ids(await store().orderIn('org-a'))).toEqual(['a4', 'a1', 'a2', 'a3']);
    expect(await store().orderIn('org-b')).toEqual([{ projectId: 'b1', rank: 1, ranked: false }]);
  });

  it('moves a project and ranks every project of the organization, in that order', async () => {
    const moved = await store().moveAfter('org-a', 'a3', null, wrote);
    expect(moved).toEqual({
      ok: true,
      order: [
        { projectId: 'a3', rank: 1, ranked: true },
        { projectId: 'a1', rank: 2, ranked: true },
        { projectId: 'a2', rank: 3, ranked: true },
        { projectId: 'a4', rank: 4, ranked: true },
      ],
    });
    const again = await store().moveAfter('org-a', 'a1', 'a4', wrote);
    expect(again.ok && ids(again.order)).toEqual(['a3', 'a2', 'a4', 'a1']);
    expect(ids(await store().orderIn('org-a'))).toEqual(['a3', 'a2', 'a4', 'a1']);
  });

  it('treats a project placed after itself as a no-op, writing nothing', async () => {
    expect(await store().moveAfter('org-a', 'a2', 'a2', wrote)).toEqual({
      ok: true,
      order: ids(await store().orderIn('org-a')).map((projectId, index) => ({
        projectId,
        rank: index + 1,
        ranked: false,
      })),
    });
    expect(ranks()).toEqual([]);
  });

  it('puts a project created after the first move at the end, unranked', async () => {
    await store().moveAfter('org-a', 'a4', null, wrote);
    sql("DELETE FROM project_rank WHERE project_id = 'a2'");
    const order = await store().orderIn('org-a');
    expect(order.at(-1)).toEqual({ projectId: 'a2', rank: 4, ranked: false });
  });

  it('refuses a move naming another organization’s project, writing nothing', async () => {
    expect(await store().moveAfter('org-a', 'b1', null, wrote)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await store().moveAfter('org-a', 'a1', 'b1', wrote)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(ranks()).toEqual([]);
  });

  it('refuses a rank naming another organization’s project', () => {
    expect(() => {
      sql(
        "INSERT INTO project_rank (project_id, organization_id, position, created_at, updated_at, created_by) VALUES ('b1', 'org-a', 10, 1, 1, 'ada')",
      );
    }).toThrow('FOREIGN KEY constraint failed');
  });

  it('orders equal positions by project id on every read', async () => {
    // a3 created first, so creation order alone would read a3 before a1.
    sql("UPDATE project SET created_at = 0 WHERE id = 'a3'");
    for (const id of ['a3', 'a1']) {
      sql(
        `INSERT INTO project_rank (project_id, organization_id, position, created_at, updated_at, created_by) VALUES ('${id}', 'org-a', 10, 1, 1, 'ada')`,
      );
    }
    for (let read = 0; read < 2; read++) {
      expect(ids(await store().orderIn('org-a')).slice(0, 2)).toEqual(['a1', 'a3']);
    }
  });

  it('removes a deleted project’s rank', async () => {
    await store().moveAfter('org-a', 'a1', null, wrote);
    sql("DELETE FROM project WHERE id = 'a1'");
    expect(ids(await store().orderIn('org-a'))).toEqual(['a2', 'a3', 'a4']);
  });
});

describe('rolling back the project rank', () => {
  beforeEach(async () => {
    await store().moveAfter('org-a', 'a2', null, wrote);
    await store().moveAfter('org-b', 'b1', null, wrote);
  });

  it('refuses while a rank exists, keeping the table and the ledger', () => {
    expect(() => rollbackTo(path, FOLDER, BEFORE_RANK)).toThrow(/project ranks exist/);
    expect(ranks()).toHaveLength(5);
  });

  it('saves, removes, rolls back, migrates and restores every rank', () => {
    const before = ranks();
    const saved = saveProjectRanks(openDrizzle(path));
    expect(removeSavedProjectRanks(openDrizzle(path), JSON.parse(JSON.stringify(saved)))).toBe(5);
    expect(rollbackTo(path, FOLDER, BEFORE_RANK)).toEqual([
      '20261011120000_add_browser_auth_lifecycle',
      '20261005110000_add_shared_people',
      '20261001010000_add_browser_credential_revocations',
      '20260929180000_add_project_rank',
    ]);
    runMigrations(path, FOLDER);
    expect(restoreProjectRanks(openDrizzle(path), JSON.parse(JSON.stringify(saved)))).toBe(5);
    expect(ranks()).toEqual(before);
  });

  it('refuses to remove a save that no longer matches, deleting nothing', async () => {
    const saved = saveProjectRanks(openDrizzle(path));
    await store().moveAfter('org-a', 'a4', null, { at: 6, by: 'ada' });
    const moved = ranks();
    expect(() => removeSavedProjectRanks(openDrizzle(path), saved)).toThrow(/does not match/);
    expect(ranks()).toEqual(moved);
  });

  it('refuses the whole restore when a saved project is gone', () => {
    const saved = saveProjectRanks(openDrizzle(path));
    removeSavedProjectRanks(openDrizzle(path), saved);
    sql("DELETE FROM project WHERE id = 'a3'");
    expect(() => restoreProjectRanks(openDrizzle(path), saved)).toThrow(
      /project a3: organization org-a no longer owns it/,
    );
    expect(ranks()).toEqual([]);
  });

  it('refuses the whole restore when an author is no longer a user', () => {
    const saved = saveProjectRanks(openDrizzle(path));
    removeSavedProjectRanks(openDrizzle(path), saved);
    const ghostly = {
      ...saved,
      ranks: saved.ranks.map((rank) =>
        rank.projectId === 'b1' ? { ...rank, createdBy: 'ghost' } : rank,
      ),
    };
    expect(() => restoreProjectRanks(openDrizzle(path), ghostly)).toThrow(
      /project b1 was written by ghost, who is no longer a user/,
    );
    expect(ranks()).toEqual([]);
  });

  it('refuses a malformed save before touching the database', () => {
    const saved = saveProjectRanks(openDrizzle(path));
    for (const malformed of [
      null,
      { ...saved, version: 2 },
      { ...saved, format: 'space-save' },
      { ...saved, ranks: [{ projectId: 'a1' }] },
      { ...saved, extra: true },
    ]) {
      expect(() => removeSavedProjectRanks(openDrizzle(path), malformed)).toThrow(
        /invalid project rank save/,
      );
      expect(() => restoreProjectRanks(openDrizzle(path), malformed)).toThrow(
        /invalid project rank save/,
      );
    }
    expect(ranks()).toHaveLength(5);
  });
});
