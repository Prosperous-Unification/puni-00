import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const MACHINE_TOKENS = '20261026130000_widen_organization_audit_machine_tokens';
const JOURNAL_PERSON = '20261026120000_add_command_journal_person';
/** 2026-10-26T09:00:00Z, a real-epoch instant: a small fake clock would hide a day bug. */
const MORNING = Date.UTC(2026, 9, 26, 9, 0, 0);
const DAY_MS = 86_400_000;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A store migrated to the latest, with one organization. */
function migratedStore(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'wbs-machine-token-audit-'));
  roots.push(root);
  cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(root, 'drizzle'));
  run(dbPath, ["INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"]);
  return { root, dbPath };
}

function run(dbPath: string, statements: string[]): void {
  const sqlite = openDatabase(dbPath);
  try {
    for (const statement of statements) sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}

function auditActions(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ action: string }, []>('SELECT action FROM organization_audit ORDER BY id')
      .all()
      .map((row) => row.action);
  } finally {
    sqlite.close();
  }
}

/** One issuance row of `credentialId`, with `runId` when given, at `at`. */
function issued(id: string, at: number, credentialId: string, runId?: string): string {
  const detail = JSON.stringify({ credentialId, ...(runId === undefined ? {} : { runId }) });
  return `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', 'machine_token_issued', 'machine_credential', '${credentialId}', '${detail}', ${String(at)})`;
}

function overflow(id: string, at: number, credentialId: string): string {
  return `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', 'machine_token_issued_overflow', 'machine_credential', '${credentialId}', '${JSON.stringify({ credentialId })}', ${String(at)})`;
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

/**
 * The audit vocabulary widening for machine grant issuance
 * (`wbs-mcp-agent-surface` task 1.2, design M3), over the real migration folder.
 */
describe(MACHINE_TOKENS, () => {
  it('admits both machine-token actions, and the outgoing release keeps writing', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      issued('a1', MORNING, 'cred-1', 'run-a'),
      overflow('a2', MORNING, 'cred-1'),
      `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('a3', 'org-a', 'dany', 'compute_provider_registered', 'compute_provider', 'p', '{}', 1)`,
    ]);
    expect(auditActions(dbPath)).toEqual([
      'machine_token_issued',
      'machine_token_issued_overflow',
      'compute_provider_registered',
    ]);
  });

  it('keys an issuance by credential, UTC day and run, a missing run being one run', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      issued('a1', MORNING, 'cred-1', 'run-a'),
      issued('a2', MORNING, 'cred-1', 'run-b'),
      issued('a3', MORNING, 'cred-2', 'run-a'),
      issued('a4', MORNING, 'cred-1'),
      // The next UTC day starts a new key.
      issued('a5', MORNING + DAY_MS, 'cred-1', 'run-a'),
    ]);
    expect(() => {
      run(dbPath, [issued('x1', MORNING + 60_000, 'cred-1', 'run-a')]);
    }).toThrow(/UNIQUE/);
    // Two issuances without a run: the coalesce keeps them one key.
    expect(() => {
      run(dbPath, [issued('x2', MORNING + 60_000, 'cred-1')]);
    }).toThrow(/UNIQUE/);
    // Same day at its last millisecond, by integer division of milliseconds.
    expect(() => {
      run(dbPath, [
        issued('x3', Math.floor(MORNING / DAY_MS) * DAY_MS + DAY_MS - 1, 'cred-2', 'run-a'),
      ]);
    }).toThrow(/UNIQUE/);
    expect(auditActions(dbPath)).toHaveLength(5);
  });

  it('keeps one overflow row per credential and UTC day', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      overflow('a1', MORNING, 'cred-1'),
      overflow('a2', MORNING, 'cred-2'),
      overflow('a3', MORNING + DAY_MS, 'cred-1'),
    ]);
    expect(() => {
      run(dbPath, [overflow('x1', MORNING + 1, 'cred-1')]);
    }).toThrow(/UNIQUE/);
  });

  it('still refuses an unknown action, and stays append-only', () => {
    const { dbPath } = migratedStore();
    expect(() => {
      run(dbPath, [
        `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('x', 'org-a', 'dany', 'machine_token_minted', 'machine_credential', 'c', '{}', 1)`,
      ]);
    }).toThrow(/CHECK/);
    run(dbPath, [issued('a1', MORNING, 'cred-1')]);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  it('rolls back over outgoing-release rows and comes forward again', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [
      `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('a1', 'org-a', 'dany', 'compute_provider_registered', 'compute_provider', 'p', '{}', 1)`,
    ]);
    const down = await rollBack(root, dbPath, JOURNAL_PERSON);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(
      `rolled back: 20261101120000_add_host_job_projection, 20261028100100_widen_organization_audit_agent_pools, 20261028100000_add_agent_pool, ${MACHINE_TOKENS}\n`,
    );
    expect(auditActions(dbPath)).toEqual(['compute_provider_registered']);
    expect(() => {
      run(dbPath, [issued('x1', MORNING, 'cred-1')]);
    }).toThrow(/CHECK/);
    runMigrations(dbPath, join(root, 'drizzle'));
    run(dbPath, [issued('a2', MORNING, 'cred-1')]);
    expect(auditActions(dbPath)).toHaveLength(2);
  }, 60_000);

  // Proof: with the machine-token filter in `down.sql` replaced by `WHERE 0`,
  // this failed on the narrow table's CHECK instead of the named guard;
  // watched 2026-10-26.
  it('refuses rollback over one machine-token audit row of either action, keeping it', async () => {
    for (const row of [issued('a1', MORNING, 'cred-1'), overflow('a1', MORNING, 'cred-1')]) {
      const { root, dbPath } = migratedStore();
      run(dbPath, [row]);
      const down = await rollBack(root, dbPath, JOURNAL_PERSON);
      expect(down.exitCode).not.toBe(0);
      expect(down.stderr).toContain('machine token audit rows exist');
      expect(auditActions(dbPath)).toHaveLength(1);
    }
  }, 60_000);
});
