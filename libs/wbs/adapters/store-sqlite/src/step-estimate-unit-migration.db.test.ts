import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-unit-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function seed() {
  const sqlite = openDatabase(path);
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
  );
  sqlite.run("INSERT INTO project (id,name,owner_id,created_at) VALUES ('p','Project','u',1)");
  sqlite.run("INSERT INTO step (id,project_id,name,position) VALUES ('s','p','Dev',10)");
  return sqlite;
}
describe('step estimate unit migration', () => {
  it('applies and an old-writer insert reads workdays', () => {
    const sqlite = seed();
    try {
      expect(sqlite.query("SELECT estimate_unit FROM step WHERE id='s'").get()).toEqual({
        estimate_unit: 'workdays',
      });
    } finally {
      sqlite.close();
    }
  });
  it('refuses hours through its CHECK', () => {
    const sqlite = seed();
    try {
      expect(() => sqlite.run("UPDATE step SET estimate_unit='hours'")).toThrow('CHECK');
    } finally {
      sqlite.close();
    }
  });
  it('refuses rollback over a minutes step naming the recovery CLI', () => {
    const sqlite = seed();
    try {
      sqlite.run("UPDATE step SET estimate_unit='minutes'");
      expect(() => rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts')).toThrow(
        'estimate-unit-rollback-cli.ts',
      );
      expect(sqlite.query('SELECT estimate_unit FROM step').get()).toEqual({
        estimate_unit: 'minutes',
      });
    } finally {
      sqlite.close();
    }
  });
  it('rolls back and reapplies over workday steps', () => {
    const sqlite = seed();
    sqlite.close();
    rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts');
    const older = openDatabase(path);
    try {
      expect(
        older
          .query<{ name: string }, []>('PRAGMA table_info(step)')
          .all()
          .map((column) => column.name),
      ).not.toContain('estimate_unit');
    } finally {
      older.close();
    }
    runMigrations(path, FOLDER);
    const newer = openDatabase(path);
    try {
      expect(newer.query('SELECT estimate_unit FROM step').get()).toEqual({
        estimate_unit: 'workdays',
      });
    } finally {
      newer.close();
    }
  });
});

it('refuses rollback over minute-bound undo and redo history after clearing and changing the live unit', () => {
  const sqlite = seed();
  try {
    for (const undone of [0, 1]) {
      sqlite.run('DELETE FROM command_journal');
      sqlite.run(
        `INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at) VALUES ('j','p','u',1,'batch','{"forward":{"do":"batch","steps":[{"do":"clear_estimate","workItemId":"w","stepId":"s"}]}}','{"do":"batch","steps":[{"do":"set_estimate","workItemId":"w","stepId":"s","days":{"optimistic":240,"realistic":240,"pessimistic":240}}]}','{"expected":{},"from":{},"estimateUnits":{"s":"minutes"}}',?,1)`,
        [undone],
      );
      expect(() => rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts')).toThrow(
        'minute journal',
      );
      expect(sqlite.query('SELECT estimate_unit FROM step').get()).toEqual({
        estimate_unit: 'workdays',
      });
      expect(sqlite.query('SELECT count(*) AS count FROM command_journal').get()).toEqual({
        count: 1,
      });
    }
    sqlite.run('DELETE FROM step');
    expect(() => rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts')).toThrow(
      'minute journal',
    );
  } finally {
    sqlite.close();
  }
});

it.each([
  'null',
  '[]',
  '123',
  'true',
  '"scalar"',
  '{broken',
  '{"estimateUnits":null}',
  '{"estimateUnits":[]}',
])(
  'refuses direct down over damaged journal preconditions %s without changing stored state',
  (preconditions) => {
    // Scope the snapshot to this migration: newer downs commit independently before its refusal.
    // Proof: removing the damaged-journal CASE guard failed all eight cases on a missing throw;
    // persisting optimistic=241 after rollback failed all eight exact-state comparisons (2026-10-14).
    expect(rollbackTo(path, FOLDER, '20261012130000_add_step_estimate_unit')).toEqual([
      '20261022213000_add_optimization_boundary_certificates',
      '20261022212000_add_cross_project_dependency_activation',
      '20261022211000_add_external_dependencies',
      '20261022210000_add_project_abbreviations',
      '20261022140100_widen_organization_audit_compute_providers',
      '20261022140000_add_resource_provider',
      '20261022130100_widen_organization_audit_organization_limits',
      '20261022130000_add_organization_limits',
      '20261022120000_scope_trusted_issuer_audience',
      '20261022110100_check_machine_credential_id',
      '20261022110000_widen_organization_audit_machine_credentials',
      '20261022100000_add_machine_credential',
      '20261020130000_add_claim_occupancy',
      '20261020120000_add_resources',
      '20261019130100_add_external_identity_person',
      '20261019130000_add_person_account',
      '20261019120000_add_claim',
      '20261015110000_add_step_node_parallelism',
      '20261015100000_add_step_blockage_activation_receipt',
      '20261014140000_add_step_blockage_activation',
      '20261014130000_add_shared_people_restore_receipts',
      '20261014120000_add_shared_people_restore_approvals',
      '20261013140000_add_step_node_blockages',
    ]);
    const sqlite = seed();
    try {
      sqlite.run("INSERT INTO work_item (id,project_id,position,name) VALUES ('w','p',1,'Work')");
      sqlite.run(
        "INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('w','s',240,240,240)",
      );
      sqlite.run(
        "INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at) VALUES ('j','p','u',1,'clear_estimate','{}','{}',?,0,1)",
        [preconditions],
      );
      const read = () => ({
        columns: sqlite.query('PRAGMA table_info(step)').all(),
        steps: sqlite.query('SELECT * FROM step').all(),
        estimates: sqlite.query('SELECT * FROM estimate').all(),
        journal: sqlite.query('SELECT * FROM command_journal').all(),
        migrations: sqlite.query('SELECT * FROM __drizzle_migrations').all(),
      });
      const before = read();
      // Proof: removing the SQL root-object guard made the null-preconditions
      // case stop throwing at this pinned unit boundary (2026-10-14).
      expect(() => rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts')).toThrow();
      expect(read()).toEqual(before);
    } finally {
      sqlite.close();
    }
  },
);

it('allows a legacy object journal without a unit map through direct down', () => {
  const sqlite = seed();
  try {
    sqlite.run(
      `INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at) VALUES ('j','p','u',1,'rename','{}','{}','{"expected":{},"from":{}}',0,1)`,
    );
    const history = sqlite.query('SELECT * FROM command_journal').all();
    rollbackTo(path, FOLDER, '20261012120000_add_step_node_attempts');
    expect(
      sqlite
        .query<{ name: string }, []>('PRAGMA table_info(step)')
        .all()
        .map((column) => column.name),
    ).not.toContain('estimate_unit');
    expect(sqlite.query('SELECT * FROM command_journal').all()).toEqual(history);
  } finally {
    sqlite.close();
  }
});
