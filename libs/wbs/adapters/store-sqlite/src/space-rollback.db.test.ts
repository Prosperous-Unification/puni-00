import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { SpaceRepository } from './space';
import { removeSavedSpaces, restoreSpaces, saveSpaces } from './space-rollback';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const BEFORE_SPACES = '20260928040000_add_email_challenge';
const wrote: WriteStamp = { at: 1, by: 'ada' };

describe('space rollback save, remove and restore', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-space-rollback-'));
    path = await openSpaceDatabase(dir);
    const store = new SpaceRepository(openDrizzle(path), OPEN);
    await store.create({ id: 's-1', organizationId: 'org-a', name: 'Q3' }, wrote);
    await store.create({ id: 's-2', organizationId: 'org-b', name: 'Launch' }, wrote);
    await store.addProject('org-a', 's-1', 'a2', null, wrote);
    await store.addProject('org-a', 's-1', 'a1', null, { at: 2, by: 'ada' });
    await store.addProject('org-b', 's-2', 'b1', null, wrote);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const snapshot = () => {
    const db = openDatabase(path);
    try {
      return {
        spaces: db.query('SELECT * FROM space ORDER BY id').all(),
        members: db.query('SELECT * FROM space_project ORDER BY space_id, project_id').all(),
      };
    } finally {
      db.close();
    }
  };
  const store = () => new SpaceRepository(openDrizzle(path), OPEN);

  it('saves, removes, rolls back, migrates and restores every space and member', () => {
    const before = snapshot();
    const saved = saveSpaces(openDrizzle(path));
    expect(saved).toMatchObject({ format: 'space-save', version: 1 });
    expect(removeSavedSpaces(openDrizzle(path), JSON.parse(JSON.stringify(saved)))).toBe(2);
    expect(snapshot()).toEqual({ spaces: [], members: [] });

    expect(rollbackTo(path, FOLDER, BEFORE_SPACES)).toEqual(['20260929100000_add_spaces']);
    runMigrations(path, FOLDER);
    expect(restoreSpaces(openDrizzle(path), JSON.parse(JSON.stringify(saved)))).toBe(2);
    expect(snapshot()).toEqual(before);
  });

  it('refuses to remove a save that no longer matches, deleting nothing', async () => {
    const saved = saveSpaces(openDrizzle(path));
    await store().moveProject('org-a', 's-1', 'a2', null, { at: 3, by: 'ada' });
    const moved = snapshot();
    // Proof, observed 2026-09-29: with the comparison reduced to the count of
    // spaces, this remove deleted both spaces instead of throwing.
    expect(() => removeSavedSpaces(openDrizzle(path), saved)).toThrow(/does not match/);
    expect(snapshot()).toEqual(moved);

    await store().create({ id: 's-3', organizationId: 'org-a', name: 'Later' }, wrote);
    expect(() => removeSavedSpaces(openDrizzle(path), saveSpaces(openDrizzle(path)))).not.toThrow();
    expect(snapshot()).toEqual({ spaces: [], members: [] });
  });

  it('refuses the whole restore when a saved project is gone or changed owner', () => {
    const saved = saveSpaces(openDrizzle(path));
    removeSavedSpaces(openDrizzle(path), saved);
    const db = openDatabase(path);
    try {
      db.run('PRAGMA foreign_keys = ON');
      db.run("DELETE FROM project WHERE id = 'a2'");
    } finally {
      db.close();
    }
    // Proof, observed 2026-09-29: with the ownership check skipped, this
    // restore threw drizzle's `Failed query: insert into "space_project" …`
    // instead; the check is what makes the refusal name the project and owner.
    // Either way nothing was written, which the snapshot below holds.
    expect(() => restoreSpaces(openDrizzle(path), saved)).toThrow(
      /project a2, which organization org-a no longer owns/,
    );
    expect(snapshot()).toEqual({ spaces: [], members: [] });
  });

  it('refuses a malformed save before touching the database', () => {
    const saved = saveSpaces(openDrizzle(path));
    for (const malformed of [
      null,
      { ...saved, version: 2 },
      { ...saved, format: 'typed-dependency-save' },
      { ...saved, spaces: [{ id: 's-1' }] },
      { ...saved, extra: true },
    ]) {
      expect(() => removeSavedSpaces(openDrizzle(path), malformed)).toThrow(/invalid space save/);
      expect(() => restoreSpaces(openDrizzle(path), malformed)).toThrow(/invalid space save/);
    }
    expect(snapshot().spaces).toHaveLength(2);
  });
});
