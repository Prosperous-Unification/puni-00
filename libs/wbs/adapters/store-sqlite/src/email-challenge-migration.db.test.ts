import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import { copyRecoveryPrefix, readRecoveryState } from './testing/recovery-state';

const challenge = '20260928040000_add_email_challenge';
const release = '20261103110000_add_initial_access_offers';
const prior = '20260928030000_add_delegation_use';

function readLedger(path: string) {
  const db = openDatabase(path);
  try {
    return db.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all();
  } finally {
    db.close();
  }
}

function expectRefusal(path: string, folder: string) {
  const before = readRecoveryState(path);
  expect(() => rollbackTo(path, folder, prior)).toThrow(
    'rolling back ' + challenge + ' failed: CHECK constraint failed: reversible',
  );
  expect(readRecoveryState(path)).toEqual(before);
}

test('challenge migration rolls back empty before activation and refuses retained rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-migration-'));
  try {
    const path = join(directory, 'test.db');
    const folder = copyRecoveryPrefix(directory, release);
    const ledger = readMigrationFolders(folder).map(({ name, hash }) => ({ name, hash }));
    runMigrations(path, folder);
    expect(readLedger(path)).toEqual(ledger);
    expect(rollbackTo(path, folder, prior)).toEqual([
      '20261103110000_add_initial_access_offers',
      '20261102130000_widen_organization_audit_access',
      '20261102120000_add_access_grants',
      '20261101120000_add_host_job_projection',
      '20261101100100_add_resource_directory_capacity',
      '20261101100000_widen_organization_audit_directory_capacity',
      '20261028100100_widen_organization_audit_agent_pools',
      '20261028100000_add_agent_pool',
      '20261026130000_widen_organization_audit_machine_tokens',
      '20261026120000_add_command_journal_person',
      '20261025130000_add_resource_runtime',
      '20261025120000_add_resource_use',
      '20261023170000_add_work_item_budget',
      '20261023160000_add_measure_estimate',
      '20261023150000_key_step_measure',
      '20261023140000_add_measure',
      '20261023100000_add_claim_lease',
      '20261022213000_add_optimization_boundary_certificates',
      '20261022212000_add_cross_project_dependency_activation',
      '20261022211000_add_external_dependencies',
      '20261022210000_add_project_abbreviations',
      '20261022140100_widen_organization_audit_compute_providers',
      '20261022140000_add_resource_provider',
      '20261022130100_widen_organization_audit_organization_limits',
      '20261022130000_add_organization_limits',
      '20261022121000_add_runtime_commands',
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
      '20261012130000_add_step_estimate_unit',
      '20261012120000_add_step_node_attempts',
      '20261012090200_widen_organization_audit',
      '20261012090100_add_browser_auth_times',
      '20261012090000_add_enterprise_sso_records',
      '20261011200000_add_shared_people_audit',
      '20261011120000_add_browser_auth_lifecycle',
      '20261005110000_add_shared_people',
      '20261001010000_add_browser_credential_revocations',
      '20260929180000_add_project_rank',
      '20260929100000_add_spaces',
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
    ]);
    const predecessor = ledger.filter(({ name }) => name <= prior);
    expect(readLedger(path)).toEqual(predecessor);
    const challengeDirectory = join(directory, 'challenge');
    mkdirSync(challengeDirectory);
    const challengeFolder = copyRecoveryPrefix(challengeDirectory, challenge);
    runMigrations(path, challengeFolder);
    expect(readLedger(path)).toEqual(ledger.filter(({ name }) => name <= challenge));
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      db.run(
        "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('c', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
      );
    } finally {
      db.close();
    }
    // Proof: 2026-09-28, dropping the retained-row predicate made this rollback test stop throwing.
    expectRefusal(path, challengeFolder);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('challenge rollback refuses activation without retained challenge rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-activated-'));
  try {
    const path = join(directory, 'test.db');
    const folder = copyRecoveryPrefix(directory, challenge);
    runMigrations(path, folder);
    const db = openDatabase(path);
    try {
      expect(db.query('SELECT id FROM email_challenge').all()).toEqual([]);
      expect(
        db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1").changes,
      ).toBe(1);
    } finally {
      db.close();
    }
    // Proof: 2026-09-28, dropping the activation predicate made this rollback test stop throwing.
    expectRefusal(path, folder);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('challenge schema rejects duplicate digests and unknown delivery states', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-constraints-'));
  try {
    const path = join(directory, 'test.db');
    const folder = copyRecoveryPrefix(directory, challenge);
    runMigrations(path, folder);
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      db.run(
        "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('a', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
      );
      expect(() =>
        db.run(
          "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('b', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
        ),
      ).toThrow('UNIQUE constraint failed: email_challenge.token_digest');
      expect(() =>
        db.run(
          "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('c', 'u', 'u@example.org', 'other', 10, 'unknown', 1)",
        ),
      ).toThrow('CHECK constraint failed: delivery_state');
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
