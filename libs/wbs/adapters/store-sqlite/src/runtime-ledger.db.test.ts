import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import {
  RUNTIME_CLAIM,
  RUNTIME_SCOPE,
  runtimeAcceptanceFixture,
} from '@wbs/conformance/runtime-command-conformance';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openDatabase, openExistingConnection } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { captureAppliedMigrationSet } from './migration-set';
import { openSqliteSource, type SqliteSource } from './source';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const runtimeMigration = '20261022121000_add_runtime_commands';
const previousMigration = '20261020130000_add_claim_occupancy';
let directory: string;
let dbPath: string;
let source: SqliteSource;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'runtime-ledger-'));
  dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, migrations);
  source = openSqliteSource({ dbPath });
});
afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

async function audit() {
  return source.stores.runtimeCommands.inspectLedger();
}
function applied() {
  return source.db.all(
    sql`SELECT name,hash FROM __drizzle_migrations WHERE name=${runtimeMigration}`,
  );
}

describe('runtime ledger lifecycle', () => {
  it('refuses retained old-branch migration identity during capture without changing ledger or runtime history', () => {
    const oldRuntimeMigration = '20261022120000_add_runtime_commands';
    const branchMigrations = join(directory, 'old-branch-migrations');
    const branchPath = join(directory, 'old-branch.db');
    const mainAdditions = new Set([
      '20261022100000_add_machine_credential',
      '20261022110000_widen_organization_audit_machine_credentials',
      '20261022110100_check_machine_credential_id',
      '20261022120000_scope_trusted_issuer_audience',
      '20261022130000_add_organization_limits',
      '20261022130100_widen_organization_audit_organization_limits',
      // Alters `machine_credential`, which this old branch never had.
      '20261028100000_add_agent_pool',
    ]);
    for (const name of readdirSync(migrations)) {
      if (mainAdditions.has(name)) continue;
      cpSync(
        join(migrations, name),
        join(branchMigrations, name === runtimeMigration ? oldRuntimeMigration : name),
        { recursive: true },
      );
    }
    runMigrations(branchPath, branchMigrations);
    const branch = openDatabase(branchPath);
    try {
      const ledger = branch
        .query<{ ledger_id: string }, []>('SELECT ledger_id FROM runtime_ledger WHERE id=1')
        .get();
      if (ledger === null) throw new Error('old branch ledger missing');
      // Raw retained-history fixture, not a claim of application admission.
      const retained = runtimeAcceptanceFixture(ledger.ledger_id);
      branch.run("INSERT INTO runtime_authority VALUES ('org','project','person','owner',1)");
      branch.run(
        "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt',?)",
        [JSON.stringify(RUNTIME_CLAIM)],
      );
      branch.run(
        "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command',?)",
        [JSON.stringify(retained)],
      );
      branch.run(
        'UPDATE runtime_ledger SET authority_count=1,binding_count=1,receipt_count=1 WHERE id=1',
      );
      const readRetained = () => ({
        schema: branch
          .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
          .all(),
        migrations: branch.query('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
        ledger: branch.query('SELECT * FROM runtime_ledger ORDER BY id').all(),
        authority: branch.query('SELECT * FROM runtime_authority ORDER BY rowid').all(),
        bindings: branch.query('SELECT * FROM runtime_claim_binding ORDER BY rowid').all(),
        receipts: branch.query('SELECT * FROM runtime_command_receipt ORDER BY rowid').all(),
      });
      const before = readRetained();
      const beforeBytes = branch.serialize();
      expect(
        branch
          .query<{ name: string }, [string]>('SELECT name FROM __drizzle_migrations WHERE name=?')
          .all(oldRuntimeMigration),
      ).toEqual([{ name: oldRuntimeMigration }]);
      expect(before.authority).toHaveLength(1);
      expect(before.bindings).toHaveLength(1);
      expect(before.receipts).toHaveLength(1);
      expect(() =>
        captureAppliedMigrationSet(branchPath, migrations, {
          target: 'integration',
          attempt: 'old-branch',
          candidate: 'unique-runtime',
        }),
      ).toThrow(`applied migration ${oldRuntimeMigration} is absent or changed in candidate`);
      expect(readRetained()).toEqual(before);
      expect(branch.serialize()).toEqual(beforeBytes);
    } finally {
      branch.close();
    }
  });

  it('reopens committed permanent history without changing installation identity', async () => {
    const initial = await audit();
    await source.uow.run(async ({ stores }) => {
      await stores.runtimeCommands.compareAuthority(RUNTIME_SCOPE, null, 'owner');
      await stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      await stores.runtimeCommands.insertAcceptance(runtimeAcceptanceFixture(initial.ledgerId));
      return { commit: true, value: undefined };
    });
    await source.close();
    source = openSqliteSource({ dbPath, openConnection: openExistingConnection });
    expect(await audit()).toEqual({
      ...initial,
      authorityCount: 1,
      bindingCount: 1,
      receiptCount: 1,
    });
    expect(await source.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'command')).toEqual(
      runtimeAcceptanceFixture(initial.ledgerId),
    );
  });
  it('allows unused rollback/reinstallation with a new ledger ID', async () => {
    const initial = await audit();
    await source.close();
    expect(rollbackTo(dbPath, migrations, previousMigration)).toContain(runtimeMigration);
    runMigrations(dbPath, migrations);
    source = openSqliteSource({ dbPath });
    expect((await audit()).ledgerId).not.toBe(initial.ledgerId);
  });
  for (const history of ['authority', 'binding', 'receipt'] as const) {
    it(`refuses rollback permanently with retained ${history} and preserves migration name/hash`, async () => {
      const initial = await audit();
      if (history === 'authority')
        await source.stores.runtimeCommands.compareAuthority(RUNTIME_SCOPE, null, 'owner');
      if (history === 'binding')
        await source.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      if (history === 'receipt')
        await source.stores.runtimeCommands.insertAcceptance(
          runtimeAcceptanceFixture(initial.ledgerId),
        );
      const before = applied();
      expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
      expect(applied()).toEqual(before);
      expect((await audit()).ledgerId).toBe(initial.ledgerId);
    });
  }
  it('does not create a missing database during existing-file recovery', () => {
    const absent = join(directory, 'missing.db');
    expect(() => openExistingConnection(absent)).toThrow();
    expect(existsSync(absent)).toBe(false);
  });
  it('constructs the generic source before explicit migration but never heals runtime schema', async () => {
    const empty = join(directory, 'empty.db');
    const generic = openSqliteSource({ dbPath: empty });
    try {
      await assertRuntimeRejection(generic.stores.runtimeCommands.inspectLedger());
      expect(generic.db.all("SELECT name FROM sqlite_master WHERE name='runtime_ledger'")).toEqual(
        [],
      );
      runMigrations(empty, migrations);
      expect(await generic.stores.runtimeCommands.inspectLedger()).toMatchObject({
        authorityCount: 0,
      });
    } finally {
      await generic.close();
    }
  });
});

describe('runtime installation integrity', () => {
  for (const table of [
    'runtime_ledger',
    'runtime_authority',
    'runtime_claim_binding',
    'runtime_command_receipt',
  ]) {
    it(`throws after required ${table} disappears even after an earlier inspection`, async () => {
      await audit();
      source.db.run(sql.raw(`DROP TABLE ${table}`));
      await assertRuntimeRejection(source.stores.runtimeCommands.readAuthority(RUNTIME_SCOPE));
      await assertRuntimeRejection(
        source.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'absent'),
      );
    });
  }
  it('refuses an absent or changed migration identity without synthesizing absence', async () => {
    source.db.run(sql`DELETE FROM __drizzle_migrations WHERE name=${runtimeMigration}`);
    await assertRuntimeRejection(audit(), 'runtime migration');
    const bytes = readFileSync(join(migrations, runtimeMigration, 'migration.sql'), 'utf8');
    source.db.run(
      sql`INSERT INTO __drizzle_migrations(name,hash,created_at) VALUES (${runtimeMigration},${'0'.repeat(64)},${Date.now()})`,
    );
    expect(bytes.length).toBeGreaterThan(0);
    await assertRuntimeRejection(audit(), 'runtime migration');
  });
  it('refuses a marker that is absent, malformed, duplicated or version-changed', async () => {
    source.db.run('DROP TABLE runtime_ledger');
    source.db.run(
      'CREATE TABLE runtime_ledger(id,schema_version,ledger_id,authority_count,binding_count,receipt_count)',
    );
    for (const values of [
      [],
      ["(1,1,'id',0,0,0)"],
      ["(1,1,'id',0,0,0)", "(2,1,'id',0,0,0)"],
      ["(1,2,'id',0,0,0)"],
    ]) {
      source.db.run('DELETE FROM runtime_ledger');
      if (values.length > 0)
        source.db.run(sql.raw(`INSERT INTO runtime_ledger VALUES ${values.join(',')}`));
      await assertRuntimeRejection(audit());
    }
  });
  it('audits retained counts before authoritative absence without any schema change', async () => {
    await audit();
    source.db.run('UPDATE runtime_ledger SET receipt_count=1 WHERE id=1');
    await assertRuntimeRejection(
      source.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'absent'),
      'runtime retained history',
    );
    await assertRuntimeRejection(
      source.stores.runtimeCommands.readAuthority(RUNTIME_SCOPE),
      'runtime retained history',
    );
    await assertRuntimeRejection(
      source.stores.runtimeCommands.assertAbsentHistory(),
      'runtime retained history',
    );
  });
  for (const [table, create] of [
    [
      'runtime_authority',
      async () => {
        await source.stores.runtimeCommands.compareAuthority(RUNTIME_SCOPE, null, 'owner');
      },
    ],
    [
      'runtime_claim_binding',
      async () => {
        await source.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      },
    ],
    [
      'runtime_command_receipt',
      async () => {
        await source.stores.runtimeCommands.insertAcceptance(
          runtimeAcceptanceFixture((await audit()).ledgerId),
        );
      },
    ],
  ] as const) {
    it(`refuses exact-schema empty recreation of retained ${table}`, async () => {
      await create();
      const definitions = source.db.all<{ sql: string | null }>(
        sql`SELECT sql FROM sqlite_master WHERE tbl_name=${table} AND sql IS NOT NULL ORDER BY type='table' DESC`,
      );
      source.db.run(sql.raw(`DROP TABLE ${table}`));
      for (const definition of definitions) {
        if (definition.sql === null) throw new Error('schema definition absent');
        source.db.run(sql.raw(definition.sql));
      }
      await assertRuntimeRejection(audit(), 'runtime retained history');
    });
  }
  it('refuses a weakened required schema even when rows and counts are empty', async () => {
    source.db.run('DROP TABLE runtime_claim_binding');
    source.db.run(
      'CREATE TABLE runtime_claim_binding(organization_id TEXT,project_id TEXT,person_id TEXT,claim_id TEXT,store_id TEXT,attempt_id TEXT,binding TEXT)',
    );
    await assertRuntimeRejection(audit(), 'runtime schema');
  });
  it('throws for unreadable storage rather than returning an empty scope', async () => {
    await source.close();
    await assertRuntimeRejection(source.stores.runtimeCommands.readAuthority(RUNTIME_SCOPE));
  });
});

/** Injects persisted corruption, then restores the exact trigger so schema checks cannot mask row checks. */
function corruptStored(table: string, statement: string): void {
  const name = `${table}_no_update`;
  const trigger = source.db.get<{ sql: string } | undefined>(
    sql`SELECT sql FROM sqlite_master WHERE name=${name}`,
  );
  if (trigger === undefined) throw new Error('corruption fixture trigger missing');
  source.db.run(sql.raw(`DROP TRIGGER ${name}`));
  try {
    source.db.run(sql.raw(statement));
  } finally {
    source.db.run(sql.raw(trigger.sql));
  }
}

describe('runtime persisted record boundaries', () => {
  it('rejects a structurally malformed but valid-JSON retained binding', async () => {
    await source.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
    corruptStored('runtime_claim_binding', "UPDATE runtime_claim_binding SET binding='{}'");
    await assertRuntimeRejection(audit());
  });
  for (const field of ['claimId', 'storeId', 'attemptId'] as const) {
    it(`rejects retained binding ${field} disagreement with its lookup columns`, async () => {
      await source.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      const path = field === 'claimId' ? '$.claimId' : `$.execution.${field}`;
      corruptStored(
        'runtime_claim_binding',
        `UPDATE runtime_claim_binding SET binding=json_set(binding,'${path}','other')`,
      );
      await assertRuntimeRejection(audit(), 'runtime binding identity');
    });
  }
  for (const path of [
    '$.commandId',
    '$.scope.organizationId',
    '$.scope.projectId',
    '$.scope.personId',
    '$.receipt.ledgerId',
  ] as const) {
    it(`rejects retained acceptance disagreement at ${path}`, async () => {
      await source.stores.runtimeCommands.insertAcceptance(
        runtimeAcceptanceFixture((await audit()).ledgerId),
      );
      const pair =
        path === '$.receipt.ledgerId' ? '' : `,'${path.replace('$.', '$.receipt.')}','other'`;
      corruptStored(
        'runtime_command_receipt',
        `UPDATE runtime_command_receipt SET accepted=json_set(accepted,'${path}','other'${pair})`,
      );
      await assertRuntimeRejection(audit(), 'runtime stored acceptance identity');
    });
  }
  it('rejects unsafe persisted generation with otherwise valid schema and counts', async () => {
    source.db.run('PRAGMA ignore_check_constraints=ON');
    source.db.run(
      "INSERT INTO runtime_authority VALUES ('org','project','person','owner',9007199254740992)",
    );
    source.db.run('UPDATE runtime_ledger SET authority_count=1');
    source.db.run('PRAGMA ignore_check_constraints=OFF');
    await assertRuntimeRejection(audit());
  });
  it('detects marker corruption with an otherwise exact constrained schema', async () => {
    const trigger = source.db.get<{ sql: string } | undefined>(
      "SELECT sql FROM sqlite_master WHERE name='runtime_ledger_monotonic'",
    );
    if (trigger === undefined) throw new Error('marker corruption fixture trigger missing');
    source.db.run('DROP TRIGGER runtime_ledger_monotonic');
    source.db.run('PRAGMA ignore_check_constraints=ON');
    source.db.run('UPDATE runtime_ledger SET schema_version=2');
    source.db.run('PRAGMA ignore_check_constraints=OFF');
    source.db.run(sql.raw(trigger.sql));
    await assertRuntimeRejection(audit());
  });
  it('rolls back a standalone binding when its retained counter write fails', async () => {
    source.db.run(
      "CREATE TRIGGER fail_runtime_count BEFORE UPDATE OF binding_count ON runtime_ledger BEGIN SELECT RAISE(ABORT,'injected runtime counter failure'); END",
    );
    await assertRuntimeRejection(
      source.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM),
    );
    expect(source.db.all('SELECT * FROM runtime_claim_binding')).toEqual([]);
    expect(await audit()).toMatchObject({ bindingCount: 0 });
  });
  it('preserves retained records after ordinary claim release and project/person deletion', async () => {
    source.db.run(
      "INSERT INTO users(id,username,password_hash,created_at) VALUES ('actor','actor','x',1)",
    );
    source.db.run(
      "INSERT INTO project(id,name,owner_id,revision,created_at) VALUES ('project','Plan','actor',0,1)",
    );
    source.db.run(
      "INSERT INTO step(id,project_id,name,position) VALUES ('step','project','Step',1)",
    );
    source.db.run(
      "INSERT INTO work_item(id,project_id,name,position,revision) VALUES ('work','project','Work',1,0)",
    );
    source.db.run("INSERT INTO person(id,name) VALUES ('person','Person')");
    source.db.run(
      "INSERT INTO claim(id,work_item_id,step_id,person_id,run_id,created_by) VALUES ('claim','work','step','person','session','actor')",
    );
    const store = source.stores.runtimeCommands;
    const { ledgerId } = await audit();
    await store.compareAuthority(RUNTIME_SCOPE, null, 'owner');
    await store.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
    await store.insertAcceptance(runtimeAcceptanceFixture(ledgerId));
    source.db.run("DELETE FROM claim WHERE id='claim'");
    source.db.run("DELETE FROM person WHERE id='person'");
    source.db.run("DELETE FROM work_item WHERE id='work'");
    source.db.run("DELETE FROM step WHERE id='step'");
    source.db.run("DELETE FROM project WHERE id='project'");
    expect(await store.readBinding(RUNTIME_SCOPE, 'claim')).toEqual(RUNTIME_CLAIM);
    expect(await store.readAcceptance(RUNTIME_SCOPE, 'command')).toEqual(
      runtimeAcceptanceFixture(ledgerId),
    );
    expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
  });
});

describe('runtime SQL safety constraints', () => {
  it('enforces positive safe authority generations and nonempty scope/owner IDs', () => {
    for (const generation of ['0', '-1', '1.5', '9007199254740992', "'bad'"])
      expect(() =>
        source.db.run(
          sql.raw(
            `INSERT INTO runtime_authority VALUES ('org','project','person','owner',${generation})`,
          ),
        ),
      ).toThrow();
    for (const column of ['organization_id', 'project_id', 'person_id', 'owner_id']) {
      const values = {
        organization_id: 'org',
        project_id: 'project',
        person_id: 'person',
        owner_id: 'owner',
      };
      Reflect.set(values, column, '');
      expect(() =>
        source.db.run(
          sql`INSERT INTO runtime_authority VALUES (${values.organization_id},${values.project_id},${values.person_id},${values.owner_id},1)`,
        ),
      ).toThrow();
    }
  });
  it('enforces binding claim and runtime attempt uniqueness directly in SQLite', () => {
    source.db.run(
      "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt','{}')",
    );
    expect(() =>
      source.db.run(
        "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','different','{}')",
      ),
    ).toThrow();
    expect(() =>
      source.db.run(
        "INSERT INTO runtime_claim_binding VALUES ('org','project','person','different','store','attempt','{}')",
      ),
    ).toThrow();
  });
  it('enforces scoped command identity directly in SQLite', () => {
    source.db.run(
      "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command','{}')",
    );
    expect(() =>
      source.db.run(
        "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command','{}')",
      ),
    ).toThrow();
  });
  it('enforces singleton identity, version and safe nonnegative retained counters', () => {
    expect(() => source.db.run("INSERT INTO runtime_ledger VALUES (1,1,'other',0,0,0)")).toThrow();
    expect(() => source.db.run("INSERT INTO runtime_ledger VALUES (2,1,'other',0,0,0)")).toThrow();
    for (const column of ['authority_count', 'binding_count', 'receipt_count'])
      for (const invalid of ['-1', '0.5', '9007199254740992', "'bad'"])
        expect(() =>
          source.db.run(sql.raw(`UPDATE runtime_ledger SET ${column}=${invalid}`)),
        ).toThrow();
  });
  it('rejects malformed JSON and empty binding/receipt lookup fields', () => {
    for (const column of [
      'organization_id',
      'project_id',
      'person_id',
      'claim_id',
      'store_id',
      'attempt_id',
      'binding',
    ]) {
      const values = {
        organization_id: 'org',
        project_id: 'project',
        person_id: 'person',
        claim_id: 'claim',
        store_id: 'store',
        attempt_id: 'attempt',
        binding: '{}',
      };
      Reflect.set(values, column, '');
      expect(() =>
        source.db.run(
          sql`INSERT INTO runtime_claim_binding VALUES (${values.organization_id},${values.project_id},${values.person_id},${values.claim_id},${values.store_id},${values.attempt_id},${values.binding})`,
        ),
      ).toThrow();
    }
    for (const column of ['organization_id', 'project_id', 'person_id', 'command_id', 'accepted']) {
      const values = {
        organization_id: 'org',
        project_id: 'project',
        person_id: 'person',
        command_id: 'command',
        accepted: '{}',
      };
      Reflect.set(values, column, '');
      expect(() =>
        source.db.run(
          sql`INSERT INTO runtime_command_receipt VALUES (${values.organization_id},${values.project_id},${values.person_id},${values.command_id},${values.accepted})`,
        ),
      ).toThrow();
    }
  });
  for (const table of ['runtime_authority', 'runtime_claim_binding', 'runtime_command_receipt']) {
    it(`blocks direct deletion of permanent ${table} history`, () => {
      source.db.run("INSERT INTO runtime_authority VALUES ('org','project','person','owner',1)");
      source.db.run(
        "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt','{}')",
      );
      source.db.run(
        "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command','{}')",
      );
      expect(() => source.db.run(sql.raw(`DELETE FROM ${table}`))).toThrow('');
    });
  }
  it('blocks mutation of bindings and receipts while allowing exact generation advancement', () => {
    source.db.run("INSERT INTO runtime_authority VALUES ('org','project','person','owner',1)");
    source.db.run(
      "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt','{}')",
    );
    source.db.run(
      "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command','{}')",
    );
    expect(() => source.db.run("UPDATE runtime_claim_binding SET binding='{}'")).toThrow();
    expect(() => source.db.run("UPDATE runtime_command_receipt SET accepted='{}'")).toThrow();
    expect(() => source.db.run('UPDATE runtime_authority SET generation=3')).toThrow();
    expect(() =>
      source.db.run("UPDATE runtime_authority SET organization_id='other',generation=2"),
    ).toThrow();
    source.db.run("UPDATE runtime_authority SET generation=2,owner_id='other'");
    expect(
      source.db.get<{ generation: number }>('SELECT generation FROM runtime_authority'),
    ).toEqual({ generation: 2 });
  });
  it('prevents ledger deletion, identity replacement and decreasing retained counts', () => {
    expect(() => source.db.run('DELETE FROM runtime_ledger')).toThrow();
    for (const change of ["ledger_id='other'", 'id=2', 'schema_version=2'])
      expect(() => source.db.run(sql.raw(`UPDATE runtime_ledger SET ${change}`))).toThrow();
    source.db.run('UPDATE runtime_ledger SET authority_count=1,binding_count=1,receipt_count=1');
    for (const column of ['authority_count', 'binding_count', 'receipt_count'])
      expect(() => source.db.run(sql.raw(`UPDATE runtime_ledger SET ${column}=0`))).toThrow();
  });
});

describe('runtime row scope and rollback guard isolation', () => {
  it('rejects a malformed retained authority scope even when its grant and counts are valid', async () => {
    source.db.run("INSERT INTO runtime_authority VALUES (x'0102','project','person','owner',1)");
    source.db.run('UPDATE runtime_ledger SET authority_count=1');
    await assertRuntimeRejection(audit());
  });
  for (const table of ['runtime_authority', 'runtime_claim_binding', 'runtime_command_receipt']) {
    it(`refuses down for actual ${table} rows even when trusted counters were incorrectly zeroed`, () => {
      if (table === 'runtime_authority')
        source.db.run("INSERT INTO runtime_authority VALUES ('org','project','person','owner',1)");
      if (table === 'runtime_claim_binding')
        source.db.run(
          "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt','{}')",
        );
      if (table === 'runtime_command_receipt')
        source.db.run(
          "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command','{}')",
        );
      const before = applied();
      expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
      expect(applied()).toEqual(before);
    });
  }
  for (const column of ['authority_count', 'binding_count', 'receipt_count']) {
    it(`refuses down for retained ${column} even when all record tables were emptied`, () => {
      source.db.run(sql.raw(`UPDATE runtime_ledger SET ${column}=1`));
      const before = applied();
      expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
      expect(applied()).toEqual(before);
    });
  }
});

describe('runtime singleton and literal integrity', () => {
  it('rejects duplicate markers even when an administrator bypassed CHECK constraints', async () => {
    source.db.run('PRAGMA ignore_check_constraints=ON');
    source.db.run("INSERT INTO runtime_ledger VALUES (2,1,'duplicate',0,0,0)");
    source.db.run('PRAGMA ignore_check_constraints=OFF');
    await assertRuntimeRejection(audit(), 'runtime ledger singleton');
  });
  it('rejects an absent marker with its constrained schema restored', async () => {
    const trigger = source.db.get<{ sql: string } | undefined>(
      "SELECT sql FROM sqlite_master WHERE name='runtime_ledger_no_delete'",
    );
    if (trigger === undefined) throw new Error('marker fixture trigger missing');
    source.db.run('DROP TRIGGER runtime_ledger_no_delete');
    source.db.run('DELETE FROM runtime_ledger');
    source.db.run(sql.raw(trigger.sql));
    await assertRuntimeRejection(audit(), 'runtime ledger singleton');
  });
  it('preserves SQL literal whitespace during owned schema inspection', async () => {
    source.db.run('DROP TRIGGER runtime_ledger_no_delete');
    source.db.run(
      "CREATE TRIGGER runtime_ledger_no_delete BEFORE DELETE ON runtime_ledger BEGIN SELECT RAISE(ABORT, 'runtime  history is immutable'); END",
    );
    await assertRuntimeRejection(audit(), 'runtime schema');
  });
});

describe('runtime down marker guard isolation', () => {
  for (const invalid of ['id=2', 'schema_version=2', "ledger_id=''", "ledger_id=x'0102'"]) {
    it(`refuses down with malformed marker ${invalid} before dropping schema`, () => {
      const trigger = source.db.get<{ sql: string } | undefined>(
        "SELECT sql FROM sqlite_master WHERE name='runtime_ledger_monotonic'",
      );
      if (trigger === undefined) throw new Error('down marker fixture trigger missing');
      source.db.run('DROP TRIGGER runtime_ledger_monotonic');
      source.db.run('PRAGMA ignore_check_constraints=ON');
      source.db.run(sql.raw(`UPDATE runtime_ledger SET ${invalid}`));
      source.db.run('PRAGMA ignore_check_constraints=OFF');
      source.db.run(sql.raw(trigger.sql));
      const before = applied();
      expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
      expect(applied()).toEqual(before);
    });
  }
  it('refuses down with no marker or duplicate markers', () => {
    const trigger = source.db.get<{ sql: string } | undefined>(
      "SELECT sql FROM sqlite_master WHERE name='runtime_ledger_no_delete'",
    );
    if (trigger === undefined) throw new Error('down singleton fixture trigger missing');
    source.db.run('DROP TRIGGER runtime_ledger_no_delete');
    source.db.run('DELETE FROM runtime_ledger');
    source.db.run(sql.raw(trigger.sql));
    expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
    source.db.run('PRAGMA ignore_check_constraints=ON');
    source.db.run("INSERT INTO runtime_ledger VALUES (1,1,'one',0,0,0),(2,1,'two',0,0,0)");
    source.db.run('PRAGMA ignore_check_constraints=OFF');
    expect(() => rollbackTo(dbPath, migrations, previousMigration)).toThrow('runtime history');
  });
});

describe('runtime storage bytes and independent trigger clauses', () => {
  it('names non-text retained binding bytes rather than parsing them as a record', async () => {
    source.db.run(
      "INSERT INTO runtime_claim_binding VALUES ('org','project','person','claim','store','attempt',CAST('{}' AS BLOB))",
    );
    source.db.run('UPDATE runtime_ledger SET binding_count=1');
    await assertRuntimeRejection(audit(), 'invalid runtime binding bytes');
  });
  it('names non-text retained acceptance bytes rather than parsing them as a record', async () => {
    source.db.run(
      "INSERT INTO runtime_command_receipt VALUES ('org','project','person','command',CAST('{}' AS BLOB))",
    );
    source.db.run('UPDATE runtime_ledger SET receipt_count=1');
    await assertRuntimeRejection(audit(), 'invalid runtime acceptance bytes');
  });
  it('blocks every authority scope move independently of valid generation advancement', () => {
    source.db.run("INSERT INTO runtime_authority VALUES ('org','project','person','owner',1)");
    for (const column of ['organization_id', 'project_id', 'person_id'])
      expect(() =>
        source.db.run(sql.raw(`UPDATE runtime_authority SET ${column}='other',generation=2`)),
      ).toThrow();
  });
  it('blocks marker id/version changes even if CHECK constraints are externally bypassed', () => {
    source.db.run('PRAGMA ignore_check_constraints=ON');
    expect(() => source.db.run('UPDATE runtime_ledger SET id=2')).toThrow();
    expect(() => source.db.run('UPDATE runtime_ledger SET schema_version=2')).toThrow();
    source.db.run('PRAGMA ignore_check_constraints=OFF');
  });
});
