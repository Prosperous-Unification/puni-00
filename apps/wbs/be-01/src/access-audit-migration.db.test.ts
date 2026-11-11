import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MOST_AUDITED_RUNS_PER_DAY,
  ORGANIZATION_AUDIT_ACTIONS,
  ORGANIZATION_AUDIT_SUBJECT_KINDS,
} from '@wbs/core';
import { openConnection, openDatabase } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { MachineTokenAuditRepository } from '@wbs/store-sqlite/machine-token-audit';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { duplicateMigrationStamps, rollbackTo } from '@wbs/store-sqlite/migrate-down';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const BASELINE = '20261102120000_add_access_grants';
const MIGRATION = '20261102130000_widen_organization_audit_access';
const NEW_ACTIONS = [
  'access_granted',
  'access_revoked',
  'access_group_created',
  'access_group_renamed',
  'access_group_deleted',
  'access_group_member_added',
  'access_group_member_removed',
  'organization_member_removed',
] as const;
const NEW_KINDS = ['access_grant', 'access_group', 'organization_member'] as const;
/** The outgoing release's vocabulary is fixed independently of the widening's catalogue. */
const OLD_ACTIONS = [
  'restricted_project_recovery',
  'sso_connection_created',
  'sso_connection_updated',
  'sso_connection_deleted',
  'sso_connection_proven',
  'sso_enforcement_changed',
  'provisioning_token_issued',
  'provisioning_token_rotated',
  'provisioning_token_revoked',
  'scim_user_provisioned',
  'scim_user_updated',
  'scim_user_deprovisioned',
  'pending_membership_activated',
  'session_policy_changed',
  'machine_credential_created',
  'machine_credential_rotated',
  'machine_credential_revoked',
  'trusted_issuer_registered',
  'trusted_issuer_removed',
  'organization_limits_changed',
  'compute_provider_registered',
  'compute_provider_updated',
  'compute_provider_removed',
  'machine_token_issued',
  'machine_token_issued_overflow',
  'agent_pool_created',
  'agent_pool_revoked',
  'agent_pool_rekeyed',
  'directory_capacity_changed',
] as const;
const OLD_KINDS = [
  'project',
  'sso_connection',
  'provisioning_token',
  'scim_user',
  'session_policy',
  'machine_credential',
  'trusted_issuer',
  'organization_limits',
  'compute_provider',
  'agent_pool',
  'resource',
] as const;
let directory: string;
let path: string;
let migrationFolder: string;

function readStore<T>(work: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return work(sqlite);
  } finally {
    sqlite.close();
  }
}
function appendAudit(id: string, action: string, kind: string): void {
  readStore((sqlite) => {
    sqlite.run(
      'INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, 'org-a', 'actor', action, kind, 'subject', '{}', 1],
    );
  });
}
function readAuditRows() {
  return readStore((sqlite) => sqlite.query('SELECT * FROM organization_audit ORDER BY id').all());
}
function readAuditSchema() {
  return readStore((sqlite) =>
    sqlite
      .query<{ type: string; name: string; sql: string | null }, []>(
        "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='organization_audit' ORDER BY type,name",
      )
      .all(),
  );
}
function readLedger() {
  return readStore((sqlite) =>
    sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-access-audit-'));
  path = join(directory, 'plan.db');
  migrationFolder = join(directory, 'candidate');
  cpSync(FOLDER, migrationFolder, { recursive: true });
  for (const name of readdirSync(migrationFolder))
    if (name > MIGRATION) rmSync(join(migrationFolder, name), { recursive: true, force: true });
  const baseline = join(directory, 'drizzle');
  cpSync(FOLDER, baseline, { recursive: true });
  rmSync(join(baseline, MIGRATION), { recursive: true, force: true });
  rmSync(join(baseline, '20261103110000_add_initial_access_offers'), {
    recursive: true,
    force: true,
  });
  runMigrations(path, baseline);
  readStore((sqlite) => {
    sqlite.run("INSERT INTO users(id,username,created_at) VALUES ('actor','actor',1)");
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES ('org-a','A',1)");
  });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('places the access audit widening immediately after access grants without stamp collisions', () => {
  const names = readdirSync(FOLDER).sort();
  expect(duplicateMigrationStamps(names)).toEqual([]);
  expect(names.slice(names.indexOf(BASELINE), names.indexOf(BASELINE) + 2)).toEqual([
    BASELINE,
    MIGRATION,
  ]);
});

it('publishes the full current-vocabulary access audit catalogue', () => {
  expect([...ORGANIZATION_AUDIT_ACTIONS]).toEqual([...OLD_ACTIONS, ...NEW_ACTIONS]);
  expect([...ORGANIZATION_AUDIT_SUBJECT_KINDS]).toEqual([...OLD_KINDS, ...NEW_KINDS]);
});

for (const action of NEW_ACTIONS) {
  it('admits the access audit action ' + action, () => {
    runMigrations(path, migrationFolder);
    appendAudit('new', action, 'access_grant');
    expect(readAuditRows()).toMatchObject([{ id: 'new', action, subject_kind: 'access_grant' }]);
  });
}
for (const kind of NEW_KINDS) {
  it('admits the access audit subject ' + kind, () => {
    runMigrations(path, migrationFolder);
    appendAudit('new', 'restricted_project_recovery', kind);
    expect(readAuditRows()).toMatchObject([{ id: 'new', subject_kind: kind }]);
  });
}

it('preserves all outgoing audit rows, actions, subjects, indexes and append-only triggers', () => {
  for (const [index, action] of OLD_ACTIONS.entries())
    appendAudit('a' + String(index), action, 'project');
  for (const [index, kind] of OLD_KINDS.entries())
    appendAudit('k' + String(index), 'restricted_project_recovery', kind);
  const rows = readAuditRows();
  const structures = readAuditSchema().filter(({ type }) => type !== 'table');
  expect(structures.filter(({ type, sql }) => type === 'index' && sql !== null)).toHaveLength(3);
  expect(structures.filter(({ type }) => type === 'trigger')).toHaveLength(2);
  runMigrations(path, migrationFolder);
  expect(readAuditRows()).toEqual(rows);
  expect(readAuditSchema().filter(({ type }) => type !== 'table')).toEqual(structures);
  for (const [index, action] of OLD_ACTIONS.entries())
    appendAudit('out-a' + String(index), action, 'project');
  for (const [index, kind] of OLD_KINDS.entries())
    appendAudit('out-k' + String(index), 'restricted_project_recovery', kind);
  expect(readAuditRows()).toHaveLength(2 * (OLD_ACTIONS.length + OLD_KINDS.length));
  expect(() =>
    readStore((sqlite) => sqlite.run("UPDATE organization_audit SET detail='changed'")),
  ).toThrow(/append-only/);
  expect(() => readStore((sqlite) => sqlite.run('DELETE FROM organization_audit'))).toThrow(
    /append-only/,
  );
});

it('restores the complete outgoing audit schema byte for byte on a clean rollback', () => {
  appendAudit('old', 'restricted_project_recovery', 'project');
  const schema = readAuditSchema();
  const rows = readAuditRows();
  const before = readLedger();
  runMigrations(path, migrationFolder);
  expect(readAuditSchema()).not.toEqual(schema);
  expect(rollbackTo(path, migrationFolder, BASELINE)).toEqual([MIGRATION]);
  expect(readAuditSchema()).toEqual(schema);
  expect(readAuditRows()).toEqual(rows);
  expect(readLedger()).toEqual(before);
});

for (const [action, kind, label] of [
  ...NEW_ACTIONS.map((action) => [action, 'project', action]),
  ...NEW_KINDS.map((kind) => ['restricted_project_recovery', kind, kind]),
]) {
  it('refuses rollback before changing any evidence for ' + label, () => {
    runMigrations(path, migrationFolder);
    appendAudit('new', action, kind);
    const rows = readAuditRows();
    const schema = readAuditSchema();
    const before = readLedger();
    expect(() => rollbackTo(path, migrationFolder, BASELINE)).toThrow('access audit rows exist');
    expect(readAuditRows()).toEqual(rows);
    expect(readAuditSchema()).toEqual(schema);
    expect(readLedger()).toEqual(before);
  });
}

it('refuses unknown audit actions and subjects after widening', () => {
  runMigrations(path, migrationFolder);
  expect(() => {
    appendAudit('unknown-action', 'access_guessed', 'project');
  }).toThrow(/CHECK/);
  expect(() => {
    appendAudit('unknown-kind', 'restricted_project_recovery', 'access_guess');
  }).toThrow(/CHECK/);
  expect(readAuditRows()).toEqual([]);
});

it('retains both machine-token targeted insert indexes through the access audit rebuild', async () => {
  runMigrations(path, migrationFolder);
  const connection = openConnection(path);
  const repository = new MachineTokenAuditRepository(connection.db, OPEN);
  let sequence = 0;
  const issuance = {
    organizationId: 'org-a',
    accountId: 'actor',
    personId: 'agent',
    credentialId: 'credential',
    source: 'api_key' as const,
  };
  const newId = () => 'issuance-' + String(sequence++);
  try {
    for (let run = 0; run < MOST_AUDITED_RUNS_PER_DAY; run += 1)
      expect(
        await repository.record({ ...issuance, runId: 'run-' + String(run) }, () => 1, newId),
      ).toBe('recorded');
    expect(await repository.record({ ...issuance, runId: 'overflow' }, () => 1, newId)).toBe(
      'overflow_recorded',
    );
    expect(await repository.record({ ...issuance, runId: 'after-overflow' }, () => 1, newId)).toBe(
      'seen',
    );
  } finally {
    connection.close();
  }
  expect(readAuditRows()).toHaveLength(MOST_AUDITED_RUNS_PER_DAY + 1);
});

it('refuses an audit rebuild that would commit broken organization references', () => {
  readStore((sqlite) => {
    sqlite.run('PRAGMA foreign_keys = OFF');
    sqlite.run(
      "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES ('broken','missing','actor','restricted_project_recovery','project','subject','{}',1)",
    );
    sqlite.run('PRAGMA foreign_keys = ON');
  });
  const schema = readAuditSchema();
  const rows = readAuditRows();
  const before = readLedger();
  expect(() => {
    runMigrations(path, migrationFolder);
  }).toThrow();
  expect(readAuditSchema()).toEqual(schema);
  expect(readAuditRows()).toEqual(rows);
  expect(readLedger()).toEqual(before);
});

for (const operation of ['UPDATE', 'DELETE']) {
  it('retains the access audit append-only guard on actual ' + operation, () => {
    runMigrations(path, migrationFolder);
    appendAudit('immutable', 'access_granted', 'access_grant');
    const before = readAuditRows();
    expect(() =>
      readStore((sqlite) =>
        sqlite.run(
          operation === 'UPDATE'
            ? "UPDATE organization_audit SET detail='changed'"
            : 'DELETE FROM organization_audit',
        ),
      ),
    ).toThrow(/append-only/);
    expect(readAuditRows()).toEqual(before);
  });
}
