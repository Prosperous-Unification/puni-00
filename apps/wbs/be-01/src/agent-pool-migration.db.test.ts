import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MachineTokenIssuance } from '@wbs/core';
import { MachineTokenAuditRepository, WriteCoordinator } from '@wbs/store-sqlite';
import { openDatabase, openDrizzle } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const AGENT_POOL = '20261028100000_add_agent_pool';
const AGENT_POOL_AUDIT = '20261028100100_widen_organization_audit_agent_pools';
const MACHINE_TOKENS = '20261026130000_widen_organization_audit_machine_tokens';
/**
 * The later folders, left out of every store here: the directory capacity
 * widening rebuilds `organization_audit` again and recreates the issuance
 * indexes, which would hide this rebuild's own omission of one.
 * Proof: with them kept, `fails task 1.2’s insert when the forward rebuild
 * omits an issuance index` answered "recorded"; watched 2026-11-01.
 */
const LATER = [
  '20261101100000_widen_organization_audit_directory_capacity',
  '20261101100100_add_resource_directory_capacity',
];
/** 2026-10-28T09:00:00Z, a real-epoch instant, as task 1.2's own test uses. */
const MORNING = Date.UTC(2026, 9, 28, 9, 0, 0);
const POOL = '00000000-0000-4000-8000-0000000000a1';
const CREDENTIAL = '00000000-0000-4000-8000-0000000000c1';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A store migrated to the latest from a copy of the real folder, with one
 * organization, one account and one agent person. `edit` rewrites a file of
 * the copy first, for the negatives that break one migration on purpose.
 */
function migratedStore(edit?: { file: string; from: string; to: string }): {
  root: string;
  dbPath: string;
  folder: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'wbs-agent-pool-migration-'));
  roots.push(root);
  const folder = join(root, 'drizzle');
  cpSync(MIGRATIONS, folder, { recursive: true });
  for (const name of LATER) rmSync(join(folder, name), { recursive: true });
  if (edit !== undefined) {
    const target = join(folder, edit.file);
    const text = readFileSync(target, 'utf8');
    if (!text.includes(edit.from)) throw new Error(`${edit.file} holds no ${edit.from}`);
    writeFileSync(target, text.replace(edit.from, edit.to));
  }
  const dbPath = join(root, 'plan.db');
  runMigrations(dbPath, folder);
  run(dbPath, [
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('dany', 'dany', 'x', 1)",
    "INSERT INTO person (id, name, kind, account_id, created_at) VALUES ('claire', 'claire', 'agent', 'dany', 1)",
  ]);
  return { root, dbPath, folder };
}

function run(dbPath: string, statements: string[]): void {
  const sqlite = openDatabase(dbPath);
  try {
    for (const statement of statements) sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}

function count(dbPath: string, sql: string): number {
  const sqlite = openDatabase(dbPath);
  try {
    const row = sqlite.query<{ n: number }, []>(sql).get();
    if (row === null) throw new Error('count answered no row');
    return row.n;
  } finally {
    sqlite.close();
  }
}

function auditRow(id: string, action: string, subjectKind: string): string {
  return `INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('${id}', 'org-a', 'dany', '${action}', '${subjectKind}', 's', '{}', 1)`;
}

const poolRow = `INSERT INTO agent_pool (id, organization_id, name, size, created_at, created_by) VALUES ('${POOL}', 'org-a', 'swarm-a', 1, 1, 'dany')`;

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

/** Task 1.2's issuance write, the targeted `ON CONFLICT` insert, over `dbPath`. */
async function recordIssuance(dbPath: string, runId: string) {
  const issuance: MachineTokenIssuance = {
    credentialId: CREDENTIAL,
    organizationId: 'org-a',
    accountId: 'dany',
    personId: 'claire',
    source: 'api_key',
    runId,
  };
  let ids = 0;
  const audit = new MachineTokenAuditRepository(openDrizzle(dbPath), new WriteCoordinator());
  return audit.record(
    issuance,
    () => MORNING,
    () => `issued-${runId}-${String((ids += 1))}`,
  );
}

/** Agent pools' two migrations (`wbs-mcp-agent-surface` task 6.1, design M7). */
describe(AGENT_POOL, () => {
  it('adds the pool and the credential column; a credential issued alone names no pool', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      poolRow,
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at, agent_pool_id) VALUES ('${CREDENTIAL}', 'org-a', 'claire', 'dany', 'api_key', 'swarm-a-1', 1, '${POOL}')`,
      // The outgoing release's insert names no pool.
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at) VALUES ('00000000-0000-4000-8000-0000000000c2', 'org-a', 'claire', 'dany', 'api_key', 'alone', 1)`,
    ]);
    expect(
      count(dbPath, 'SELECT COUNT(*) AS n FROM machine_credential WHERE agent_pool_id IS NULL'),
    ).toBe(1);
    // One live pool per name, and sizes in 1..100.
    expect(() => {
      run(dbPath, [
        "INSERT INTO agent_pool (id, organization_id, name, size, created_at) VALUES ('00000000-0000-4000-8000-0000000000a2', 'org-a', 'swarm-a', 1, 1)",
      ]);
    }).toThrow(/UNIQUE/);
    expect(() => {
      run(dbPath, [
        "INSERT INTO agent_pool (id, organization_id, name, size, created_at) VALUES ('00000000-0000-4000-8000-0000000000a3', 'org-a', 'swarm-b', 101, 1)",
      ]);
    }).toThrow(/CHECK/);
  });

  // Proof: with the guard's count replaced by `0 = 0`, this failed on exit
  // code 0: the rollback dropped the pool row; watched 2026-10-28.
  it('refuses rollback while a pool exists, keeping it', async () => {
    const { root, dbPath } = migratedStore();
    run(dbPath, [poolRow]);
    // The audit widening above it goes first; the pool's own guard then refuses.
    const down = await rollBack(root, dbPath, MACHINE_TOKENS);
    expect(down.exitCode).not.toBe(0);
    expect(down.stderr).toContain('agent pools exist');
    expect(count(dbPath, 'SELECT COUNT(*) AS n FROM agent_pool')).toBe(1);
  }, 60_000);

  it('rolls back with no pool, taking the column, and comes forward again', async () => {
    const { root, dbPath, folder } = migratedStore();
    const down = await rollBack(root, dbPath, MACHINE_TOKENS);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${AGENT_POOL_AUDIT}, ${AGENT_POOL}\n`);
    expect(
      count(
        dbPath,
        "SELECT COUNT(*) AS n FROM pragma_table_info('machine_credential') WHERE name = 'agent_pool_id'",
      ),
    ).toBe(0);
    runMigrations(dbPath, folder);
    run(dbPath, [poolRow]);
  }, 60_000);
});

describe(AGENT_POOL_AUDIT, () => {
  it('admits the three pool actions about an agent pool, and still refuses an unknown one', () => {
    const { dbPath } = migratedStore();
    run(dbPath, [
      auditRow('a1', 'agent_pool_created', 'agent_pool'),
      auditRow('a2', 'agent_pool_revoked', 'agent_pool'),
      auditRow('a3', 'agent_pool_rekeyed', 'agent_pool'),
      auditRow('a4', 'compute_provider_registered', 'compute_provider'),
    ]);
    expect(() => {
      run(dbPath, [auditRow('x1', 'agent_pool_grown', 'agent_pool')]);
    }).toThrow(/CHECK/);
    expect(() => {
      run(dbPath, ['DELETE FROM organization_audit']);
    }).toThrow(/append-only/);
  });

  // Proof (forward): with the `_run` index left out of this migration's
  // rebuild, this failed preparing task 1.2's insert ("ON CONFLICT clause
  // does not match any PRIMARY KEY or UNIQUE constraint"); watched 2026-10-28.
  it('keeps task 1.2’s issuance insert preparing after the rebuild', async () => {
    const { dbPath } = migratedStore();
    expect(await recordIssuance(dbPath, 'run-a')).toBe('recorded');
    expect(await recordIssuance(dbPath, 'run-a')).toBe('seen');
  });

  it('fails task 1.2’s insert when the forward rebuild omits an issuance index', async () => {
    const { dbPath } = migratedStore({
      file: `${AGENT_POOL_AUDIT}/migration.sql`,
      from: "coalesce(json_extract(`detail`, '$.runId'), '')\n) WHERE `action` = 'machine_token_issued';",
      to: "coalesce(json_extract(`detail`, '$.runId'), '')\n) WHERE `action` = 'machine_token_issued_never';",
    });
    expect(await recordIssuance(dbPath, 'run-a').then(() => 'recorded', String)).toContain(
      'ON CONFLICT',
    );
  });

  it('fails task 1.2’s insert after a rollback whose rebuild omits an issuance index', async () => {
    const { root, dbPath } = migratedStore({
      file: `${AGENT_POOL_AUDIT}/down.sql`,
      from: "coalesce(json_extract(`detail`, '$.runId'), '')\n) WHERE `action` = 'machine_token_issued';",
      to: "coalesce(json_extract(`detail`, '$.runId'), '')\n) WHERE `action` = 'machine_token_issued_never';",
    });
    expect((await rollBack(root, dbPath, AGENT_POOL)).exitCode).toBe(0);
    expect(await recordIssuance(dbPath, 'run-a').then(() => 'recorded', String)).toContain(
      'ON CONFLICT',
    );
  }, 60_000);

  // Proof (rollback): with the `_run` index left out of `down.sql`'s rebuild,
  // this failed, and so did the byte-for-byte schema case below; watched
  // 2026-10-28.
  it('keeps task 1.2’s issuance insert preparing after rolling the rebuild back', async () => {
    const { root, dbPath } = migratedStore();
    const down = await rollBack(root, dbPath, AGENT_POOL);
    expect(down.stderr).toBe('');
    expect(down.exitCode).toBe(0);
    expect(down.stdout).toContain(`rolled back: ${AGENT_POOL_AUDIT}\n`);
    expect(await recordIssuance(dbPath, 'run-a')).toBe('recorded');
    expect(() => {
      run(dbPath, [auditRow('x1', 'agent_pool_created', 'agent_pool')]);
    }).toThrow(/CHECK/);
  }, 60_000);

  it('restores the schema it left, byte for byte', async () => {
    const { root, dbPath } = migratedStore();
    const schemaOf = () => {
      const sqlite = openDatabase(dbPath);
      try {
        return sqlite
          .query<{ sql: string }, []>(
            "SELECT sql FROM sqlite_master WHERE tbl_name = 'organization_audit' AND sql IS NOT NULL ORDER BY name",
          )
          .all()
          .map((row) => row.sql);
      } finally {
        sqlite.close();
      }
    };
    const scratch = mkdtempSync(join(tmpdir(), 'wbs-agent-pool-baseline-'));
    roots.push(scratch);
    const baselineFolder = join(scratch, 'drizzle');
    cpSync(MIGRATIONS, baselineFolder, { recursive: true });
    for (const name of LATER) rmSync(join(baselineFolder, name), { recursive: true });
    rmSync(join(baselineFolder, AGENT_POOL_AUDIT), { recursive: true });
    rmSync(join(baselineFolder, AGENT_POOL), { recursive: true });
    const baselinePath = join(scratch, 'plan.db');
    runMigrations(baselinePath, baselineFolder);
    const baselineSqlite = openDatabase(baselinePath);
    const baseline = baselineSqlite
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE tbl_name = 'organization_audit' AND sql IS NOT NULL ORDER BY name",
      )
      .all()
      .map((row) => row.sql);
    baselineSqlite.close();
    expect((await rollBack(root, dbPath, AGENT_POOL)).exitCode).toBe(0);
    expect(schemaOf()).toEqual(baseline);
  }, 60_000);

  // Proof: with the guard's filter replaced by `WHERE 0`, this failed on the
  // narrow table's CHECK instead of the named guard; watched 2026-10-28.
  it('refuses rollback over one pool audit row of each action, keeping it', async () => {
    for (const action of ['agent_pool_created', 'agent_pool_revoked', 'agent_pool_rekeyed']) {
      const { root, dbPath } = migratedStore();
      run(dbPath, [auditRow('a1', action, 'agent_pool')]);
      const down = await rollBack(root, dbPath, AGENT_POOL);
      expect(down.exitCode).not.toBe(0);
      expect(down.stderr).toContain('agent pool audit rows exist');
      expect(count(dbPath, 'SELECT COUNT(*) AS n FROM organization_audit')).toBe(1);
    }
  }, 120_000);
});
