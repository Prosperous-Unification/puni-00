import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import { copyRecoveryPrefix, readRecoveryState } from './testing/recovery-state';
import { openSpaceDatabase } from './testing/space-database';
import { WorkPackageRankRepository } from './work-package-rank';
import {
  removeSavedWorkPackageRanks,
  restoreWorkPackageRanks,
  saveWorkPackageRanks,
} from './work-package-rank-rollback';

const BEFORE_RANK = '20260929100000_add_spaces';
const RANK_WINDOW = '20261110100000_rename_project_to_work_package';
const wrote: WriteStamp = { at: 5, by: 'ada' };

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-work-package-rank-'));
});

async function openCurrent() {
  path = await openSpaceDatabase(dir);
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const store = () => new WorkPackageRankRepository(openDrizzle(path), OPEN);
const ids = (order: readonly { workPackageId: string }[]) =>
  order.map((each) => each.workPackageId);

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
    return db.query('SELECT * FROM work_package_rank ORDER BY work_package_id').all();
  } finally {
    db.close();
  }
}

describe('the work package rank', () => {
  beforeEach(openCurrent);

  it('orders unranked work packages by creation, then id', async () => {
    sql("UPDATE work_package SET created_at = 0 WHERE id = 'a4'");
    expect(ids(await store().orderIn('org-a'))).toEqual(['a4', 'a1', 'a2', 'a3']);
    expect(await store().orderIn('org-b')).toEqual([
      { workPackageId: 'b1', rank: 1, ranked: false },
    ]);
  });

  it('moves a work package and ranks every work package of the organization, in that order', async () => {
    const moved = await store().moveAfter('org-a', 'a3', null, wrote);
    expect(moved).toEqual({
      ok: true,
      order: [
        { workPackageId: 'a3', rank: 1, ranked: true },
        { workPackageId: 'a1', rank: 2, ranked: true },
        { workPackageId: 'a2', rank: 3, ranked: true },
        { workPackageId: 'a4', rank: 4, ranked: true },
      ],
    });
    const again = await store().moveAfter('org-a', 'a1', 'a4', wrote);
    expect(again.ok && ids(again.order)).toEqual(['a3', 'a2', 'a4', 'a1']);
    expect(ids(await store().orderIn('org-a'))).toEqual(['a3', 'a2', 'a4', 'a1']);
  });

  it('treats a work package placed after itself as a no-op, writing nothing', async () => {
    expect(await store().moveAfter('org-a', 'a2', 'a2', wrote)).toEqual({
      ok: true,
      order: ids(await store().orderIn('org-a')).map((workPackageId, index) => ({
        workPackageId,
        rank: index + 1,
        ranked: false,
      })),
    });
    expect(ranks()).toEqual([]);
  });

  it('puts a work package created after the first move at the end, unranked', async () => {
    await store().moveAfter('org-a', 'a4', null, wrote);
    sql("DELETE FROM work_package_rank WHERE work_package_id = 'a2'");
    const order = await store().orderIn('org-a');
    expect(order.at(-1)).toEqual({ workPackageId: 'a2', rank: 4, ranked: false });
  });

  it('refuses a move naming another organization’s work package, writing nothing', async () => {
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

  it('refuses a rank naming another organization’s work package', () => {
    expect(() => {
      sql(
        "INSERT INTO work_package_rank (work_package_id, organization_id, position, created_at, updated_at, created_by) VALUES ('b1', 'org-a', 10, 1, 1, 'ada')",
      );
    }).toThrow('FOREIGN KEY constraint failed');
  });

  it('orders equal positions by work package id on every read', async () => {
    // a3 created first, so creation order alone would read a3 before a1.
    sql("UPDATE work_package SET created_at = 0 WHERE id = 'a3'");
    for (const id of ['a3', 'a1']) {
      sql(
        `INSERT INTO work_package_rank (work_package_id, organization_id, position, created_at, updated_at, created_by) VALUES ('${id}', 'org-a', 10, 1, 1, 'ada')`,
      );
    }
    for (let read = 0; read < 2; read++) {
      expect(ids(await store().orderIn('org-a')).slice(0, 2)).toEqual(['a1', 'a3']);
    }
  });

  it('removes a deleted work package’s rank', async () => {
    await store().moveAfter('org-a', 'a1', null, wrote);
    sql("DELETE FROM work_package WHERE id = 'a1'");
    expect(ids(await store().orderIn('org-a'))).toEqual(['a2', 'a3', 'a4']);
  });
});

async function seedRanks() {
  await store().moveAfter('org-a', 'a2', null, wrote);
  await store().moveAfter('org-b', 'b1', null, wrote);
}

describe('the work package rename window', () => {
  let folder: string;

  beforeEach(async () => {
    path = join(dir, 'store.db');
    folder = copyRecoveryPrefix(dir, RANK_WINDOW);
    runMigrations(path, folder);
    const sqlite = openDatabase(path);
    try {
      expect(
        sqlite.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
      ).toEqual(readMigrationFolders(folder).map(({ name, hash }) => ({ name, hash })));
      sqlite.run("INSERT INTO users(id,username,created_at) VALUES('ada','ada',1)");
      sqlite.run(
        "INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)",
      );
      for (const id of ['a1', 'a2', 'a3', 'a4', 'b1']) {
        sqlite.run(
          "INSERT INTO work_package(id,name,owner_id,created_at,created_by) VALUES(?,?,'ada',1,'ada')",
          [id, id],
        );
        sqlite.run(
          'INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,?)',
          [id, id === 'b1' ? 'org-b' : 'org-a'],
        );
      }
    } finally {
      sqlite.close();
    }
    await seedRanks();
  });

  function expectWindowRefusal() {
    expect(() => rollbackTo(path, folder, BEFORE_RANK)).toThrow(
      'rolling back ' +
        RANK_WINDOW +
        ' failed: work-package rename rollback requires restoring the verified window snapshot',
    );
  }

  it('current111 refuses rollback before rank effects while preserving the whole store', () => {
    const before = readRecoveryState(path);
    expectWindowRefusal();
    expect(readRecoveryState(path)).toEqual(before);
    expect(ranks()).toHaveLength(5);
  });

  it('saves removes and restores every current rank while current111 rollback stays closed', () => {
    const before = ranks(),
      saved = saveWorkPackageRanks(openDrizzle(path));
    expect(saved.version).toBe(2);
    expect(removeSavedWorkPackageRanks(openDrizzle(path), JSON.parse(JSON.stringify(saved)))).toBe(
      5,
    );
    const empty = readRecoveryState(path);
    expectWindowRefusal();
    expect(readRecoveryState(path)).toEqual(empty);
    expect(restoreWorkPackageRanks(openDrizzle(path), saved)).toBe(5);
    expect(ranks()).toEqual(before);
  });
});

describe('rolling back the work package rank', () => {
  beforeEach(async () => {
    await openCurrent();
    await seedRanks();
  });

  it('refuses to remove a save that no longer matches, deleting nothing', async () => {
    const saved = saveWorkPackageRanks(openDrizzle(path));
    await store().moveAfter('org-a', 'a4', null, { at: 6, by: 'ada' });
    const moved = ranks();
    expect(() => removeSavedWorkPackageRanks(openDrizzle(path), saved)).toThrow(/does not match/);
    expect(ranks()).toEqual(moved);
  });

  it('refuses the whole restore when a saved work package is gone', () => {
    const saved = saveWorkPackageRanks(openDrizzle(path));
    removeSavedWorkPackageRanks(openDrizzle(path), saved);
    sql("DELETE FROM work_package WHERE id = 'a3'");
    expect(() => restoreWorkPackageRanks(openDrizzle(path), saved)).toThrow(
      /work package a3: organization org-a no longer owns it/,
    );
    expect(ranks()).toEqual([]);
  });

  it('refuses the whole restore when an author is no longer a user', () => {
    const saved = saveWorkPackageRanks(openDrizzle(path));
    removeSavedWorkPackageRanks(openDrizzle(path), saved);
    const ghostly = {
      ...saved,
      ranks: saved.ranks.map((rank) =>
        rank.workPackageId === 'b1' ? { ...rank, createdBy: 'ghost' } : rank,
      ),
    };
    expect(() => restoreWorkPackageRanks(openDrizzle(path), ghostly)).toThrow(
      /work package b1 was written by ghost, who is no longer a user/,
    );
    expect(ranks()).toEqual([]);
  });

  it('refuses a malformed save before touching the database', () => {
    const saved = saveWorkPackageRanks(openDrizzle(path));
    for (const malformed of [
      null,
      { ...saved, version: 3 },
      { ...saved, format: 'space-save' },
      { ...saved, ranks: [{ workPackageId: 'a1' }] },
      { ...saved, extra: true },
    ]) {
      expect(() => removeSavedWorkPackageRanks(openDrizzle(path), malformed)).toThrow(
        /invalid work package rank save/,
      );
      expect(() => restoreWorkPackageRanks(openDrizzle(path), malformed)).toThrow(
        /invalid work package rank save/,
      );
    }
    expect(ranks()).toHaveLength(5);
  });
});

it('new standalone rank saves emit only work-package-rank-save2 with current owner fields', async () => {
  await openCurrent();
  await store().moveAfter('org-a', 'a1', null, wrote);
  const { openConnection } = await import('./db');
  const connection = openConnection(path);
  try {
    const saved = saveWorkPackageRanks(connection.db);
    expect(saved.format).toBe('work-package-rank-save');
    expect(saved.version).toBe(2);
    expect(saved.ranks).toHaveLength(4);
    expect(saved.ranks[0]).toHaveProperty('workPackageId', 'a1');
    expect(saved.ranks[0]).not.toHaveProperty('projectId');
  } finally {
    connection.close();
  }
});

it('removes and restores historical project-rank-save1 through explicit current-row projection', async () => {
  await openCurrent();
  await store().moveAfter('org-a', 'a1', null, wrote);
  const { openConnection } = await import('./db'),
    connection = openConnection(path);
  try {
    const current = saveWorkPackageRanks(connection.db),
      before = ranks();
    const legacy = {
      format: 'project-rank-save',
      version: 1,
      ranks: current.ranks.map(({ workPackageId, ...facts }) => ({
        projectId: workPackageId,
        ...facts,
      })),
    };
    expect(removeSavedWorkPackageRanks(connection.db, legacy)).toBe(4);
    expect(ranks()).toEqual([]);
    expect(restoreWorkPackageRanks(connection.db, legacy)).toBe(4);
    expect(ranks()).toEqual(before);
    expect(legacy.ranks[0]).toHaveProperty('projectId', 'a1');
    expect(legacy.ranks[0]).not.toHaveProperty('workPackageId');
  } finally {
    connection.close();
  }
});
