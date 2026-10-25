import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const JOURNAL_PERSON = '20261026120000_add_command_journal_person';
/** The statement the refusal pins as the manual completion. */
const DISCARD_AGENT_ENTRIES = 'DELETE FROM command_journal WHERE person_id IS NOT NULL';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The migration this one rolls back to: the one immediately before it. */
function baseline(): string {
  const names = readdirSync(MIGRATIONS).sort();
  const at = names.indexOf(JOURNAL_PERSON);
  const before = at < 1 ? undefined : names.at(at - 1);
  if (before === undefined) throw new Error(`${JOURNAL_PERSON} has no predecessor on disk`);
  return before;
}

/** A store migrated through the column, with an account, a project and an agent person. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-journal-person-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(
    dbPath,
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
  );
  run(dbPath, "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p', 'P', 'dany', 1)");
  run(dbPath, "INSERT INTO person (id, name, kind) VALUES ('codex', 'Codex', 'agent')");
  return { root, dbPath };
}

function journal(dbPath: string, id: string, seq: number, personId: string | null): void {
  const sqlite = openDatabase(dbPath);
  try {
    sqlite.run(
      `INSERT INTO command_journal (id, project_id, user_id, person_id, seq, kind, payload, inverse, preconditions, undone, created_at)
       VALUES (?, 'p', 'dany', ?, ?, 'rename', '{}', '{}', '{}', 0, 1)`,
      [id, personId, seq],
    );
  } finally {
    sqlite.close();
  }
}

function run(dbPath: string, sql: string): void {
  const sqlite = openDatabase(dbPath);
  try {
    sqlite.run(sql);
  } finally {
    sqlite.close();
  }
}

function columnsOf(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ name: string }, []>("SELECT name FROM pragma_table_info('command_journal')")
      .all()
      .map(({ name }) => name);
  } finally {
    sqlite.close();
  }
}

function entryIds(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq')
      .all()
      .map(({ id }) => id);
  } finally {
    sqlite.close();
  }
}

function newestApplied(dbPath: string): string | undefined {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
      .all()
      .map(({ name }) => name)
      .at(-1);
  } finally {
    sqlite.close();
  }
}

async function rollBack(root: string, dbPath: string, to: string) {
  const child = Bun.spawn(
    [process.execPath, 'run', join(APP_ROOT, 'src', 'migrate-down-cli.ts'), `--to=${to}`],
    { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe('the command journal person migration', () => {
  it('adds a nullable person column forward and removes it over the account’s own entries', async () => {
    const { root, dbPath } = migratedStore();
    expect(columnsOf(dbPath)).toContain('person_id');
    journal(dbPath, 'human', 1, null);
    journal(dbPath, 'agent', 2, 'codex');
    expect(() => {
      journal(dbPath, 'ghost', 3, 'nobody');
    }).toThrow(/FOREIGN KEY/);
    run(dbPath, "DELETE FROM person WHERE id = 'codex'");
    expect(entryIds(dbPath)).toEqual(['human']);

    const down = await rollBack(root, dbPath, baseline());
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${JOURNAL_PERSON}`);
    expect(columnsOf(dbPath)).not.toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human']);
    expect(newestApplied(dbPath)).toBe(baseline());

    runMigrations(dbPath, join(root, 'drizzle'));
    expect(columnsOf(dbPath)).toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human']);
  }, 60_000);

  // Proof: the guard's INSERT in `add_command_journal_person/down.sql` replaced
  // with `SELECT 0` made this fail on `Expected: not 0` for the exit code
  // (1 pass, 1 fail; watched 2026-10-26).
  it('refuses rollback while an agent’s entry is journalled, naming the count and the discard', async () => {
    const { root, dbPath } = migratedStore();
    journal(dbPath, 'human', 1, null);
    journal(dbPath, 'agent', 2, 'codex');

    const down = await rollBack(root, dbPath, baseline());
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain(`rolling back ${JOURNAL_PERSON} failed`);
    expect(down.stderr).toContain(
      `1 undo journal entries belong to agent persons; discard them with ${DISCARD_AGENT_ENTRIES}, then rerun migrate-down-cli.ts`,
    );
    expect(columnsOf(dbPath)).toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human', 'agent']);
    expect(newestApplied(dbPath)).toBe(JOURNAL_PERSON);

    run(dbPath, DISCARD_AGENT_ENTRIES);
    const completed = await rollBack(root, dbPath, baseline());
    expect(completed.stderr).toBe('');
    expect(completed.exitCode).toBe(0);
    expect(columnsOf(dbPath)).not.toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human']);
  }, 60_000);
});
