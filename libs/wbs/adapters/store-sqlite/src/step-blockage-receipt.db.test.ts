import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openConnection } from './db';
import { runMigrations } from './migrate';
import { type AppliedMigration, rollbackTo } from './migrate-down';
import {
  activateStepBlockages,
  inspectStepBlockageReceipt,
  parseStepBlockageReceipt,
  type StepBlockageReceipt,
} from './step-blockage-receipt';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const previous = '20261014140000_add_step_blockage_activation';
const parallelMigration = '20261015110000_add_step_node_parallelism';
/** Every migration newer than the receipt's, each reversed before its refusal. */
const newerMigrations = [
  parallelMigration,
  '20261019120000_add_claim',
  '20261019130000_add_person_account',
  '20261019130100_add_external_identity_person',
  '20261020120000_add_resources',
  '20261020130000_add_claim_occupancy',
  '20261022100000_add_machine_credential',
  '20261022110000_widen_organization_audit_machine_credentials',
  '20261022110100_check_machine_credential_id',
  '20261022120000_scope_trusted_issuer_audience',
  '20261022130000_add_organization_limits',
  '20261022130100_widen_organization_audit_organization_limits',
  '20261022140000_add_resource_provider',
  '20261022140100_widen_organization_audit_compute_providers',
  '20261023100000_add_claim_lease',
];
const receipt: StepBlockageReceipt = {
  protocol: 'step-blockage-activation',
  version: 1,
  activationId: 'attended-2026-10-15',
  candidateImage: `registry/be@sha256:${'a'.repeat(64)}`,
  rollbackImage: `registry/be@sha256:${'b'.repeat(64)}`,
  databaseIdentity: '/srv/wbs/wbs.db:123:456',
  activatedAt: 1792051200000,
};
let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-blockage-receipt-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('inspects DISABLED without a receipt then commits one exact receipt atomically', () => {
  const connection = openConnection(path);
  try {
    expect(inspectStepBlockageReceipt(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
    expect(activateStepBlockages(connection.db, receipt)).toEqual({ state: 'ENABLED', receipt });
    expect(inspectStepBlockageReceipt(connection.db)).toEqual({ state: 'ENABLED', receipt });
    expect(activateStepBlockages(connection.db, receipt)).toEqual({ state: 'ENABLED', receipt });
    expect(() =>
      activateStepBlockages(connection.db, { ...receipt, activationId: 'other' }),
    ).toThrow('conflicting');
    expect(inspectStepBlockageReceipt(connection.db)).toEqual({ state: 'ENABLED', receipt });
  } finally {
    connection.close();
  }
  const reopened = openConnection(path);
  try {
    expect(inspectStepBlockageReceipt(reopened.db)).toEqual({ state: 'ENABLED', receipt });
  } finally {
    reopened.close();
  }
});

it('rolls back ENABLED when receipt insertion fails', () => {
  const connection = openConnection(path);
  try {
    connection.db.run(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON step_blockage_activation_receipt BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
    );
    expect(() => activateStepBlockages(connection.db, receipt)).toThrow(
      'INSERT INTO step_blockage_activation_receipt',
    );
    expect(inspectStepBlockageReceipt(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
  } finally {
    connection.close();
  }
});

for (const fault of [
  'missing-ledger',
  'missing-marker',
  'changed-trigger',
  'missing-receipt-table',
  'missing-receipt-ledger',
  'disabled-with-receipt',
  'enabled-without-receipt',
  'malformed-receipt',
] as const) {
  it(`refuses broken authority: ${fault}`, () => {
    const connection = openConnection(path);
    try {
      if (fault === 'missing-ledger')
        connection.db.run(`DELETE FROM __drizzle_migrations WHERE name='${previous}'`);
      if (fault === 'missing-marker') connection.db.run('DELETE FROM step_blockage_activation');
      if (fault === 'changed-trigger') {
        connection.db.run('DROP TRIGGER step_blockage_admit_insert');
        connection.db.run(
          'CREATE TRIGGER step_blockage_admit_insert BEFORE INSERT ON step_blockage BEGIN SELECT 1; END',
        );
      }
      if (fault === 'missing-receipt-table')
        connection.db.run('DROP TABLE step_blockage_activation_receipt');
      if (fault === 'missing-receipt-ledger')
        connection.db.run(
          "DELETE FROM __drizzle_migrations WHERE name='20261015100000_add_step_blockage_activation_receipt'",
        );
      if (fault === 'disabled-with-receipt')
        connection.db.run(
          `INSERT INTO step_blockage_activation_receipt VALUES (1,'${JSON.stringify(receipt)}')`,
        );
      if (fault === 'enabled-without-receipt' || fault === 'malformed-receipt')
        connection.db.run("UPDATE step_blockage_activation SET state='ENABLED'");
      if (fault === 'malformed-receipt')
        connection.db.run("INSERT INTO step_blockage_activation_receipt VALUES (1,'{}')");
      const before = connection.db.all('SELECT * FROM step_blockage_activation');
      expect(() => inspectStepBlockageReceipt(connection.db)).toThrow();
      expect(() => activateStepBlockages(connection.db, receipt)).toThrow();
      expect(connection.db.all('SELECT * FROM step_blockage_activation')).toEqual(before);
    } finally {
      connection.close();
    }
  });
}

for (const fault of [
  null,
  {},
  { ...receipt, version: 2 },
  { ...receipt, protocol: 'other' },
  { ...receipt, activationId: '' },
  { ...receipt, candidateImage: 'mutable:tag' },
  { ...receipt, rollbackImage: 'mutable:tag' },
  { ...receipt, databaseIdentity: '' },
  { ...receipt, activatedAt: -1 },
  { ...receipt, activatedAt: 1.5 },
  { ...receipt, unexpected: true },
]) {
  it(`refuses invalid receipt ${JSON.stringify(fault)}`, () => {
    expect(() => parseStepBlockageReceipt(fault)).toThrow(
      'invalid step blockage activation receipt',
    );
  });
}

for (const retained of [
  'enabled-empty',
  'enabled-without-receipt',
  'disabled-receipt',
  'missing-marker',
  'duplicate-marker',
] as const) {
  it(`refuses receipt down over ${retained} and preserves its migration boundary on retry`, () => {
    const connection = openConnection(path);
    try {
      if (retained === 'enabled-empty') activateStepBlockages(connection.db, receipt);
      if (retained === 'enabled-without-receipt')
        connection.db.run("UPDATE step_blockage_activation SET state='ENABLED'");
      if (retained === 'disabled-receipt')
        connection.db.run(
          `INSERT INTO step_blockage_activation_receipt VALUES (1,'${JSON.stringify(receipt)}')`,
        );
      if (retained === 'missing-marker') connection.db.run('DELETE FROM step_blockage_activation');
      if (retained === 'duplicate-marker') {
        connection.db.run('DROP TABLE step_blockage_activation');
        connection.db.run('CREATE TABLE step_blockage_activation (id,state)');
        connection.db.run(
          "INSERT INTO step_blockage_activation VALUES (1,'DISABLED'),(1,'DISABLED')",
        );
      }
      const ledger = connection.db.all<AppliedMigration>('SELECT * FROM __drizzle_migrations');
      expect(ledger.some(({ name }) => name === parallelMigration)).toBe(true);
      // Proof: omitting the newer migration's ledger deletion failed the exact post-refusal ledger (2026-10-17).
      const refusedLedger = ledger.filter(
        ({ name }) => name === null || !newerMigrations.includes(name),
      );
      const receiptState = () => ({
        schema: connection.db.all(
          "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name IN ('step_blockage_activation', 'step_blockage_activation_receipt') ORDER BY name",
        ),
        marker: connection.db.all('SELECT * FROM step_blockage_activation'),
        receipts: connection.db.all('SELECT * FROM step_blockage_activation_receipt'),
      });
      const retainedState = receiptState();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(() => rollbackTo(path, migrations, previous)).toThrow(
          'step blockage activation receipt retained or authority invalid',
        );
        expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(refusedLedger);
        expect(receiptState()).toEqual(retainedState);
        // Proof: omitting the newer down's table drop failed this composed refusal case (2026-10-17).
        expect(
          connection.db.all("SELECT name FROM sqlite_master WHERE name='step_parallel'"),
        ).toEqual([]);
      }
    } finally {
      connection.close();
    }
  });
}

it('allows receipt down only while disabled with no receipt', () => {
  rollbackTo(path, migrations, previous);
  const connection = openConnection(path);
  try {
    expect(
      connection.db.all(
        "SELECT name FROM sqlite_master WHERE name='step_blockage_activation_receipt'",
      ),
    ).toEqual([]);
    expect(connection.db.all('SELECT * FROM step_blockage_activation')).toEqual([
      { id: 1, state: 'DISABLED' },
    ]);
  } finally {
    connection.close();
  }
});

for (const fault of ['duplicate', 'wrong-id', 'nonstring'] as const) {
  it(`refuses malformed receipt rows: ${fault}`, () => {
    const connection = openConnection(path);
    try {
      connection.db.run("UPDATE step_blockage_activation SET state='ENABLED'");
      connection.db.run('DROP TABLE step_blockage_activation_receipt');
      connection.db.run('CREATE TABLE step_blockage_activation_receipt (id,receipt)');
      const identity = fault === 'wrong-id' ? 2 : 1;
      connection.db.run(
        `INSERT INTO step_blockage_activation_receipt VALUES (${String(identity)},'${JSON.stringify(receipt)}')`,
      );
      if (fault === 'duplicate')
        connection.db.run(
          `INSERT INTO step_blockage_activation_receipt VALUES (1,'${JSON.stringify(receipt)}')`,
        );
      if (fault === 'nonstring')
        connection.db.run('UPDATE step_blockage_activation_receipt SET receipt=17');
      expect(() => activateStepBlockages(connection.db, receipt)).toThrow(
        'invalid step blockage receipt schema',
      );
    } finally {
      connection.close();
    }
  });
}

it('enforces receipt singleton identity, JSON and duplicate constraints in SQLite', () => {
  const connection = openConnection(path);
  try {
    expect(() =>
      connection.db.run("INSERT INTO step_blockage_activation_receipt VALUES (2,'{}')"),
    ).toThrow();
    expect(() =>
      connection.db.run("INSERT INTO step_blockage_activation_receipt VALUES (1,'invalid')"),
    ).toThrow();
    connection.db.run("INSERT INTO step_blockage_activation_receipt VALUES (1,'{}')");
    expect(() =>
      connection.db.run("INSERT INTO step_blockage_activation_receipt VALUES (1,'{}')"),
    ).toThrow();
  } finally {
    connection.close();
  }
});

it('rolls back when persisted receipt differs from the attempted receipt', () => {
  const connection = openConnection(path);
  try {
    connection.db.run(
      "CREATE TRIGGER change_receipt AFTER INSERT ON step_blockage_activation_receipt BEGIN UPDATE step_blockage_activation_receipt SET receipt=json_set(receipt,'$.activationId','other'); END",
    );
    expect(() => activateStepBlockages(connection.db, receipt)).toThrow(
      'activation receipt readback differs',
    );
    expect(inspectStepBlockageReceipt(connection.db)).toEqual({ state: 'DISABLED', receipt: null });
  } finally {
    connection.close();
  }
});

it('compares receipt identity independently of object property insertion order', () => {
  const connection = openConnection(path);
  try {
    const reordered: StepBlockageReceipt = {
      activatedAt: receipt.activatedAt,
      databaseIdentity: receipt.databaseIdentity,
      rollbackImage: receipt.rollbackImage,
      candidateImage: receipt.candidateImage,
      activationId: receipt.activationId,
      version: receipt.version,
      protocol: receipt.protocol,
    };
    expect(activateStepBlockages(connection.db, reordered)).toEqual({ state: 'ENABLED', receipt });
    expect(activateStepBlockages(connection.db, receipt)).toEqual({ state: 'ENABLED', receipt });
  } finally {
    connection.close();
  }
});

for (const schema of [
  'CREATE TABLE step_blockage_activation_receipt (id, receipt)',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER NOT NULL CHECK (id = 1), receipt TEXT NOT NULL CHECK (json_valid(receipt)))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY CHECK (id = 1), receipt TEXT NOT NULL CHECK (json_valid(receipt)))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL, receipt TEXT NOT NULL CHECK (json_valid(receipt)))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 2), receipt TEXT NOT NULL CHECK (json_valid(receipt)))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT CHECK (json_valid(receipt)))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT NOT NULL)',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT NOT NULL CHECK (1))',
  'CREATE TABLE step_blockage_activation_receipt (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT NOT NULL CHECK (json_valid(receipt)), extra TEXT)',
  "CREATE VIEW step_blockage_activation_receipt AS SELECT 1 AS id, '{}' AS receipt WHERE 0",
]) {
  it(`refuses malformed empty receipt schema: ${schema}`, () => {
    const connection = openConnection(path);
    try {
      connection.db.run('DROP TABLE step_blockage_activation_receipt');
      connection.db.run(schema);
      const markers = connection.db.all('SELECT * FROM step_blockage_activation');
      const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
      expect(() => inspectStepBlockageReceipt(connection.db)).toThrow(
        'invalid step blockage receipt schema',
      );
      expect(() => activateStepBlockages(connection.db, receipt)).toThrow(
        'invalid step blockage receipt schema',
      );
      expect(connection.db.all('SELECT * FROM step_blockage_activation')).toEqual(markers);
      expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
      expect(connection.db.all('SELECT * FROM step_blockage_activation_receipt')).toEqual([]);
    } finally {
      connection.close();
    }
  });
}

it('refuses activation on an unconstrained empty receipt table without changing authority', () => {
  const connection = openConnection(path);
  try {
    connection.db.run('DROP TABLE step_blockage_activation_receipt');
    connection.db.run('CREATE TABLE step_blockage_activation_receipt (id, receipt)');
    const markers = connection.db.all('SELECT * FROM step_blockage_activation');
    const ledger = connection.db.all('SELECT * FROM __drizzle_migrations');
    expect(() => activateStepBlockages(connection.db, receipt)).toThrow(
      'invalid step blockage receipt schema',
    );
    expect(connection.db.all('SELECT * FROM step_blockage_activation')).toEqual(markers);
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
    expect(connection.db.all('SELECT * FROM step_blockage_activation_receipt')).toEqual([]);
  } finally {
    connection.close();
  }
});
