import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const PREVIOUS = '20260928010000_add_project_solution';

/** The additive verification column starts false and cannot discard evidence. */
describe('email verification migration', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-email-verification-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function withDatabase<T>(read: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      return read(db);
    } finally {
      db.close();
    }
  }

  it('starts old accounts unverified and checks the boolean and email', () => {
    withDatabase((db) => {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      expect(db.query("SELECT email_verified FROM users WHERE id = 'u'").get()).toEqual({
        email_verified: 0,
      });
      expect(() => db.run("UPDATE users SET email_verified = 1 WHERE id = 'u'")).toThrow();
      expect(() => db.run("UPDATE users SET email_verified = 2 WHERE id = 'u'")).toThrow();
      db.run("UPDATE users SET email = 'u@example.org', email_verified = 1 WHERE id = 'u'");
      expect(() => db.run("UPDATE users SET email_verified = 2 WHERE id = 'u'")).toThrow();
      expect(() => db.run("UPDATE users SET email = NULL WHERE id = 'u'")).toThrow();
    });
  });

  it('rolls down before activation without evidence', () => {
    expect(rollbackTo(path, FOLDER, PREVIOUS)).toEqual([
      '20261023110000_key_step_measure',
      '20261023100000_add_measure',
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
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
    ]);
    withDatabase((db) => {
      expect(db.query('PRAGMA table_info(users)').all()).not.toContainEqual(
        expect.objectContaining({ name: 'email_verified' }),
      );
    });
  });

  it('refuses rollback with retained evidence', () => {
    withDatabase((db) =>
      db.run(
        "INSERT INTO users (id, username, email, email_verified, created_at) VALUES ('u', 'u', 'u@example.org', 1, 1)",
      ),
    );
    expect(() => rollbackTo(path, FOLDER, PREVIOUS)).toThrow();
    withDatabase((db) => {
      expect(db.query('SELECT email_verified FROM users').get()).toEqual({ email_verified: 1 });
    });
  });

  it('refuses rollback after activation even without verified rows', () => {
    withDatabase((db) =>
      db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    expect(() => rollbackTo(path, FOLDER, PREVIOUS)).toThrow();
  });
});
