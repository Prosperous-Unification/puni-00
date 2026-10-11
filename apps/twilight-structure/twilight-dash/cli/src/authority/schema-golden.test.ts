import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import {
  AUTHORITY_SCHEMA_VERSION,
  AuthorityOpenError,
  type AuthorityState,
  bootstrapAuthority,
  openAuthority,
  resolveAuthorityDatabasePath,
} from './authority-store';
import { acquireClaims } from './claims';

const FIXTURES = join(import.meta.dir, '..', '..', 'fixtures', 'authority');
const FIXED_CLOCK = { read: () => 1_000_000 };
const scratch: string[] = [];

afterAll(() => {
  for (const path of scratch) rmSync(path, { force: true, recursive: true });
});

function repository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dash-authority-golden-')));
  scratch.push(root);
  const init = Bun.spawnSync(['git', 'init', '--quiet', root], { stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString('utf8'));
  return root;
}

/** Statements with whitespace runs collapsed, so only a token change can differ. */
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/\s+/g, ' ').replace(/;$/, '').trim())
    .filter((statement) => statement.length > 0);
}

/** Loads a `sqlite3 .dump` into the repository's canonical authority path. */
function loadDump(root: string, dump: string): void {
  const databasePath = resolveAuthorityDatabasePath(root);
  mkdirSync(join(databasePath, '..'));
  const database = new Database(databasePath, { create: true, strict: true });
  try {
    database.run(dump);
  } finally {
    database.close();
  }
}

test('the relocated schema equals the v5 golden text', () => {
  const root = repository();
  bootstrapAuthority(root, { clock: FIXED_CLOCK }).close();
  const database = new Database(resolveAuthorityDatabasePath(root), { readonly: true });
  const tables = database
    .query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_schema WHERE substr(name, 1, 7) <> 'sqlite_' ORDER BY rowid",
    )
    .all()
    .map(({ sql }) => sql);
  const meta = database
    .query<{ row: string }, []>(
      "SELECT 'INSERT INTO authority_meta VALUES(' || singleton || ',''' || schema_version || ''',' || next_generation || ')' AS row FROM authority_meta",
    )
    .all()
    .map(({ row }) => row);
  database.close();
  // Proof: weakening `CHECK (generation >= 1)` to `>= 0` in the relocated SCHEMA constant failed
  // this equality on the authority_generation statement, and made `a Burokrat-written v5 dump
  // opens and continues` refuse the dump as `authority database schema is incompatible`
  // (2026-10-11). Renaming a column instead breaks the store's own queries before this
  // comparison runs, so it is not the isolating fault.
  expect(statements([...tables, ...meta].join(';\n'))).toEqual(
    statements(readFileSync(join(FIXTURES, 'module-wiki-authority.v5.sql'), 'utf8')),
  );
  expect(AUTHORITY_SCHEMA_VERSION).toBe('module-wiki-authority.v5');
});

test('a Burokrat-written v5 dump opens and continues', () => {
  const dump = readFileSync(join(FIXTURES, 'burokrat-written-v5.sql'), 'utf8');
  // The fixture is `inspect()` output written by the pre-relocation code; the equality below
  // checks every field, so the cast only names the expected shape.
  const recorded = JSON.parse(
    readFileSync(join(FIXTURES, 'burokrat-written-v5.state.json'), 'utf8'),
  ) as AuthorityState;
  const root = repository();
  loadDump(root, dump);
  const store = openAuthority(root, { clock: FIXED_CLOCK });
  expect(store.inspect()).toEqual(recorded);
  expect(store.inspect().nextGeneration).toBe(4);
  expect(
    acquireClaims(store, {
      conflictGroups: [],
      owner: { sessionId: 'session-dash', worktreePath: root },
      paths: [{ access: 'write', path: 'src/five.ts' }],
    }),
  ).toEqual({ generation: 4, sessionId: 'session-dash' });
  expect(() =>
    acquireClaims(store, {
      conflictGroups: [],
      owner: { sessionId: 'session-overlap', worktreePath: root },
      paths: [{ access: 'write', path: 'src/three.ts' }],
    }),
  ).toThrow('path claim overlaps session three');
  store.close();

  // The comparison is live: the same dump with one column renamed is refused as incompatible.
  const drifted = repository();
  loadDump(drifted, dump.replace('worktree_path TEXT NOT NULL', 'worktree_location TEXT NOT NULL'));
  let refusal: unknown;
  try {
    openAuthority(drifted, { clock: FIXED_CLOCK }).close();
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(AuthorityOpenError);
  expect(refusal instanceof AuthorityOpenError ? refusal.failure : undefined).toBe('incompatible');
});
