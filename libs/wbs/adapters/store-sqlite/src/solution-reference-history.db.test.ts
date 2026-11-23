import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import type { AppliedMigration } from './migrate-down';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASE = '20260824010000_add_oidc_identity';
const SOLUTION = '20260824020000_add_solution_ref';

it('rolls the original solution reference back and forward without losing the historical project row or baseline ledger', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-solution-history-'));
  const path = join(directory, 'store.db');
  const profile = join(directory, 'migrations');
  mkdirSync(profile);
  const folders = readMigrationFolders(FOLDER);
  const solution = folders.find(({ name }) => name === SOLUTION);
  if (solution === undefined) throw new Error('original solution migration is missing');
  const prefix = folders.filter(({ name }) => name <= BASE);
  expect(prefix.at(-1)?.name).toBe(BASE);
  for (const { name } of prefix) {
    cpSync(join(FOLDER, name), join(profile, name), { recursive: true });
  }
  function readState() {
    const sqlite = openDatabase(path);
    try {
      return {
        columns: sqlite
          .query<{ name: string }, []>('PRAGMA table_info(project)')
          .all()
          .map(({ name }) => name),
        projects: sqlite
          .query<Record<string, unknown>, []>('SELECT * FROM project ORDER BY id')
          .all(),
        ledger: sqlite
          .query<AppliedMigration, []>(
            'SELECT id,hash,created_at,name FROM __drizzle_migrations ORDER BY id',
          )
          .all(),
      };
    } finally {
      sqlite.close();
    }
  }
  try {
    runMigrations(path, profile);
    const sqlite = openDatabase(path);
    try {
      sqlite.run(
        "INSERT INTO users(id,username,password_hash,created_at) VALUES('author','Author','x',1)",
      );
      sqlite.run(
        "INSERT INTO project(id,name,owner_id,created_at) VALUES('shed','Rewire the shed','author',100)",
      );
    } finally {
      sqlite.close();
    }
    const baseline = readState();
    expect(baseline.columns).not.toContain('solution_slug');
    expect(baseline.columns).not.toContain('solution_url');
    expect(baseline.projects).toHaveLength(1);
    expect(baseline.projects[0]).toMatchObject({
      id: 'shed',
      name: 'Rewire the shed',
      owner_id: 'author',
      created_at: 100,
    });
    cpSync(join(FOLDER, SOLUTION), join(profile, SOLUTION), { recursive: true });
    runMigrations(path, profile);
    const forward = readState();
    expect(forward.columns).toContain('solution_slug');
    expect(forward.columns).toContain('solution_url');
    expect(forward.projects).toEqual(
      baseline.projects.map((project) => ({ ...project, solution_slug: null, solution_url: null })),
    );
    expect(forward.ledger.slice(0, -1)).toEqual(baseline.ledger);
    expect(forward.ledger.at(-1)).toMatchObject({
      name: SOLUTION,
      hash: solution.hash,
      created_at: Date.UTC(2026, 7, 24, 2),
    });
    expect(rollbackTo(path, profile, BASE)).toEqual([SOLUTION]);
    expect(readState()).toEqual(baseline);
    runMigrations(path, profile);
    const reapplied = readState();
    expect(reapplied.columns).toEqual(forward.columns);
    expect(reapplied.projects).toEqual(forward.projects);
    expect(reapplied.ledger.slice(0, -1)).toEqual(baseline.ledger);
    expect(
      reapplied.ledger.map(({ name, hash, created_at }) => ({ name, hash, created_at })),
    ).toEqual(forward.ledger.map(({ name, hash, created_at }) => ({ name, hash, created_at })));
    expect(readMigrationFolders(profile)).toEqual(folders.filter(({ name }) => name <= SOLUTION));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
