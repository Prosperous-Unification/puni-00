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
/** The newer migration a rollback to the baseline reverses first. */
const MACHINE_TOKENS = '20261026130000_widen_organization_audit_machine_tokens';
const AGENT_POOL = '20261028100000_add_agent_pool';
const AGENT_POOL_AUDIT = '20261028100100_widen_organization_audit_agent_pools';
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

/** One account's rows by the pair alone, as the outgoing release reads its stack. */
function stackOf(dbPath: string, userId: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM command_journal WHERE project_id = 'p' AND user_id = ? ORDER BY seq",
      )
      .all(userId)
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
    expect(down.stdout).toContain(
      `rolled back: ${AGENT_POOL_AUDIT}, ${AGENT_POOL}, ${MACHINE_TOKENS}, ${JOURNAL_PERSON}`,
    );
    expect(columnsOf(dbPath)).not.toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human']);
    expect(newestApplied(dbPath)).toBe(baseline());

    runMigrations(dbPath, join(root, 'drizzle'));
    expect(columnsOf(dbPath)).toContain('person_id');
    expect(entryIds(dbPath)).toEqual(['human']);
  }, 60_000);

  // Proof: with the DELETE removed from `add_command_journal_person/down.sql`,
  // this found `agent` among the human's rows after the rollback (watched
  // 2026-10-26): the outgoing release reads by (project, account), so its undo
  // would have reverted the agent's edit.
  it('discards only the agents’ entries on rollback, leaving every human stack whole', async () => {
    const { root, dbPath } = migratedStore();
    run(
      dbPath,
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('kat', 'kat', 'x', 1)",
    );
    journal(dbPath, 'human', 1, null);
    journal(dbPath, 'agent', 2, 'codex');
    journal(dbPath, 'human-again', 3, null);
    run(
      dbPath,
      `INSERT INTO command_journal (id, project_id, user_id, seq, kind, payload, inverse, preconditions, undone, created_at)
       VALUES ('kat-own', 'p', 'kat', 1, 'rename', '{}', '{}', '{}', 0, 1)`,
    );

    const down = await rollBack(root, dbPath, baseline());
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: ${AGENT_POOL_AUDIT}, ${AGENT_POOL}, ${MACHINE_TOKENS}, ${JOURNAL_PERSON}`,
    );
    expect(columnsOf(dbPath)).not.toContain('person_id');
    expect(newestApplied(dbPath)).toBe(baseline());
    // The outgoing release's own stack read: by the pair alone.
    expect(stackOf(dbPath, 'dany')).toEqual(['human', 'human-again']);
    expect(stackOf(dbPath, 'kat')).toEqual(['kat-own']);
  }, 60_000);

  // Proof: without `command_journal_person` the cascade's lookup read `SCAN
  // command_journal USING COVERING INDEX command_journal_person_stack` here
  // (2 pass, 1 fail; watched 2026-10-26).
  it('serves each stack query and the person cascade from an index', () => {
    const { dbPath } = migratedStore();
    const sqlite = openDatabase(dbPath);
    try {
      const plan = (sql: string): string =>
        sqlite
          .query<{ detail: string }, []>(`EXPLAIN QUERY PLAN ${sql}`)
          .all()
          .map(({ detail }) => detail)
          .join(' | ');
      const stack = "project_id = 'p' AND user_id = 'dany' AND person_id IS 'codex'";
      expect(plan(`SELECT * FROM command_journal WHERE ${stack} ORDER BY seq`)).toBe(
        'SEARCH command_journal USING INDEX command_journal_person_stack (project_id=? AND user_id=? AND person_id=?)',
      );
      expect(
        plan(`SELECT id FROM command_journal WHERE ${stack} AND undone = 1 LIMIT 1`),
      ).toContain(
        'USING INDEX command_journal_person_stack (project_id=? AND user_id=? AND person_id=?)',
      );
      expect(
        plan(`SELECT seq FROM command_journal WHERE ${stack} ORDER BY seq DESC LIMIT 1 OFFSET 49`),
      ).toContain('USING COVERING INDEX command_journal_person_stack');
      expect(plan("SELECT 1 FROM command_journal WHERE person_id = 'codex'")).toContain(
        'USING COVERING INDEX command_journal_person (person_id=?)',
      );
    } finally {
      sqlite.close();
    }
  });
});
