import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const RECORDS = '20261012090000_add_enterprise_sso_records';
const TIMES = '20261012090100_add_browser_auth_times';
const WIDENED = '20261012090200_widen_organization_audit';
const BEFORE = '20261011200000_add_shared_people_audit';
/** Stamped after the three, so a rollback to {@link BEFORE} takes it too. */
const ATTEMPTS = '20261012120000_add_step_node_attempts';
const ESTIMATE_UNIT = '20261012130000_add_step_estimate_unit';

/**
 * The three enterprise SSO migrations (`organization-enterprise-sso` task 1.1):
 * the constraints the stores rely on, the append-only audit, the outgoing
 * release's audit writes during a swap, and rollbacks that never discard a row.
 */
describe('the enterprise SSO migrations', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-enterprise-sso-migration-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1), ('sam', 'sam', 'x', 1)",
    );
    run(
      "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
    );
    run(
      `INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at)
       VALUES ('claim-a', 'org-a', 'acme.test', 'verified', '${'a'.repeat(64)}', 1, 1),
              ('claim-b', 'org-b', 'b.test', 'verified', '${'b'.repeat(64)}', 1, 1)`,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runs one statement on its own connection; answers the rows it changed. */
  function run(statement: string): number {
    const db = openDatabase(path);
    try {
      return db.run(statement).changes;
    } finally {
      db.close();
    }
  }

  function all(statement: string): unknown[] {
    const db = openDatabase(path);
    try {
      return db.query(statement).all();
    } finally {
      db.close();
    }
  }

  const connection = (
    id: string,
    organizationId: string,
    claimId: string,
    name: string,
    slug: string,
  ) =>
    run(
      `INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, created_at)
       VALUES ('${id}', '${organizationId}', '${claimId}', '${name}', 'samlp', '${slug}', 1)`,
    );

  const schema = () =>
    all("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");

  it('round-trips a populated previous schema byte for byte', () => {
    run(
      "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('r1', 'org-a', 'ada', 'restricted_project_recovery', 'project', 'p1', '{}', 1)",
    );
    const migrated = schema();
    expect(rollbackTo(path, FOLDER, BEFORE)).toEqual([
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
      ESTIMATE_UNIT,
      ATTEMPTS,
      WIDENED,
      TIMES,
      RECORDS,
    ]);
    const previous = schema();
    expect(previous).not.toContainEqual(
      expect.objectContaining({ name: 'organization_scim_user' }),
    );
    expect(all('SELECT id FROM organization_audit')).toEqual([{ id: 'r1' }]);
    runMigrations(path, FOLDER);
    expect(schema()).toEqual(migrated);
    expect(all('SELECT id FROM organization_audit')).toEqual([{ id: 'r1' }]);
  });

  // Proof: making `organization_sso_connection_proven` a plain index made this
  // commit both proofs (no throw); watched 2026-10-12.
  it('lets exactly one of two organizations prove the same Auth0 connection', () => {
    connection('c-a', 'org-a', 'claim-a', 'acme-saml', 'acme');
    connection('c-b', 'org-b', 'claim-b', 'acme-saml', 'bee');
    const first = openDatabase(path);
    const second = openDatabase(path);
    try {
      first.run(
        "UPDATE organization_sso_connection SET proven_at = 2, proven_by = 'ada' WHERE id = 'c-a'",
      );
      expect(() =>
        second.run(
          "UPDATE organization_sso_connection SET proven_at = 3, proven_by = 'sam' WHERE id = 'c-b'",
        ),
      ).toThrow(/UNIQUE/);
    } finally {
      first.close();
      second.close();
    }
    expect(all('SELECT id FROM organization_sso_connection WHERE proven_at IS NOT NULL')).toEqual([
      { id: 'c-a' },
    ]);
  });

  it('keeps one connection per claim and one record per slug', () => {
    connection('c-a', 'org-a', 'claim-a', 'acme-saml', 'acme');
    expect(() => connection('c-2', 'org-a', 'claim-a', 'other', 'other')).toThrow(/UNIQUE/);
    expect(() => connection('c-3', 'org-b', 'claim-b', 'other', 'acme')).toThrow(/UNIQUE/);
  });

  it('refuses enforcement before proof and a half-recorded proof', () => {
    connection('c-a', 'org-a', 'claim-a', 'acme-saml', 'acme');
    expect(() =>
      run("UPDATE organization_sso_connection SET enforced = 1 WHERE id = 'c-a'"),
    ).toThrow(/CHECK/);
    expect(() =>
      run("UPDATE organization_sso_connection SET proven_at = 2 WHERE id = 'c-a'"),
    ).toThrow(/CHECK/);
    expect(() => connection('c-x', 'org-b', 'claim-b', 'bad name', 'bee')).toThrow(/CHECK/);
    expect(() => connection('c-y', 'org-b', 'claim-b', 'b-saml', 'B')).toThrow(/CHECK/);
  });

  it('keeps token digests unique and well formed', () => {
    const token = (id: string, digest: string) =>
      run(
        `INSERT INTO organization_scim_token (id, organization_id, digest, created_at) VALUES ('${id}', 'org-a', '${digest}', 1)`,
      );
    token('t1', 'c'.repeat(64));
    expect(() => token('t2', 'c'.repeat(64))).toThrow(/UNIQUE/);
    expect(() => token('t3', 'secret')).toThrow(/CHECK/);
  });

  it('keeps a user name unique per organization and lower case', () => {
    const user = (id: string, organizationId: string, name: string) =>
      run(
        `INSERT INTO organization_scim_user (id, organization_id, user_name, active, created_at) VALUES ('${id}', '${organizationId}', '${name}', 1, 1)`,
      );
    user('u1', 'org-a', 'carol@acme.test');
    expect(() => user('u2', 'org-a', 'carol@acme.test')).toThrow(/UNIQUE/);
    user('u3', 'org-b', 'carol@acme.test');
    expect(() => user('u4', 'org-a', 'Dave@acme.test')).toThrow(/CHECK/);
  });

  // Proof: replacing the binding CHECK with `CHECK (1)` made this store a user
  // id without its pair; watched 2026-10-12.
  it("binds a SCIM user's pair all together or not at all", () => {
    expect(() =>
      run(
        "INSERT INTO organization_scim_user (id, organization_id, user_name, active, user_id, created_at) VALUES ('u1', 'org-a', 'carol@acme.test', 1, 'ada', 1)",
      ),
    ).toThrow(/CHECK/);
    run(
      "INSERT INTO organization_scim_user (id, organization_id, user_name, active, user_id, issuer, subject, created_at) VALUES ('u2', 'org-a', 'carol@acme.test', 1, 'ada', 'https://idp.test/', 'samlp|acme-saml|c', 1)",
    );
  });

  it('bounds a session policy', () => {
    const policy = (organizationId: string, max: string, reauth: string) =>
      run(
        `INSERT INTO organization_session_policy (organization_id, max_session_seconds, reauthenticate_after_seconds, created_at) VALUES ('${organizationId}', ${max}, ${reauth}, 1)`,
      );
    expect(() => policy('org-a', '299', 'NULL')).toThrow(/CHECK/);
    expect(() => policy('org-a', '2592001', 'NULL')).toThrow(/CHECK/);
    expect(() => policy('org-a', '3600', '7200')).toThrow(/CHECK/);
    expect(() => policy('org-a', 'NULL', 'NULL')).toThrow(/CHECK/);
    policy('org-a', '28800', '3600');
  });

  it('refuses to roll back over any enterprise SSO record', () => {
    const inserts = [
      () => connection('c-a', 'org-a', 'claim-a', 'acme-saml', 'acme'),
      () =>
        run(
          `INSERT INTO organization_scim_token (id, organization_id, digest, created_at) VALUES ('t1', 'org-a', '${'c'.repeat(64)}', 1)`,
        ),
      () =>
        run(
          "INSERT INTO organization_scim_user (id, organization_id, user_name, active, created_at) VALUES ('u1', 'org-a', 'carol@acme.test', 1, 1)",
        ),
      () =>
        run(
          "INSERT INTO organization_session_policy (organization_id, max_session_seconds, created_at) VALUES ('org-a', 28800, 1)",
        ),
    ];
    const deletes = [
      'DELETE FROM organization_sso_connection',
      'DELETE FROM organization_scim_token',
      'DELETE FROM organization_scim_user',
      'DELETE FROM organization_session_policy',
    ];
    for (const [index, insert] of inserts.entries()) {
      insert();
      expect(() => rollbackTo(path, FOLDER, BEFORE)).toThrow(/enterprise SSO records exist/);
      expect(all("SELECT name FROM __drizzle_migrations WHERE name LIKE '20261012%'")).toHaveLength(
        1,
      );
      run(deletes[index]);
      runMigrations(path, FOLDER);
    }
  });

  it('refuses to roll back over a recorded sign-in time', () => {
    run(
      `INSERT INTO browser_auth_lifecycle (session_digest, user_id, generation, state, current_kind, current_digest, current_expires_at, opened_at)
       VALUES ('${'d'.repeat(64)}', 'ada', 1, 'active', 'oidc', '${'e'.repeat(64)}', 9, 5)`,
    );
    expect(() => rollbackTo(path, FOLDER, RECORDS)).toThrow(/browser sign-in times are recorded/);
    expect(all('SELECT opened_at FROM browser_auth_lifecycle')).toEqual([{ opened_at: 5 }]);
  });

  it('refuses to roll back the audit widening over a new-kind row', () => {
    run(
      "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('a1', 'org-a', 'scim:t1', 'scim_user_provisioned', 'scim_user', 'u1', '{}', 1)",
    );
    expect(() => rollbackTo(path, FOLDER, TIMES)).toThrow(/enterprise SSO audit rows exist/);
    expect(all('SELECT action FROM organization_audit')).toEqual([
      { action: 'scim_user_provisioned' },
    ]);
  });

  it('keeps admitting the outgoing release audit row and refusing an unknown action', () => {
    run(
      "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('r1', 'org-a', 'ada', 'restricted_project_recovery', 'project', 'p1', '{\"fields\":[\"name\"]}', 1)",
    );
    expect(() =>
      run(
        "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('x1', 'org-a', 'ada', 'sso_teleport', 'sso_connection', 'c', '{}', 1)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      run(
        "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('x2', 'org-a', 'ada', 'sso_connection_created', 'galaxy', 'c', '{}', 1)",
      ),
    ).toThrow(/CHECK/);
  });

  // Proof: narrowing `organization_audit_no_update` to `UPDATE OF id` made the
  // detail change; watched 2026-10-12.
  it('refuses to change or delete an audit row', () => {
    run(
      "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('a1', 'org-a', 'ada', 'sso_connection_created', 'sso_connection', 'c', '{}', 1)",
    );
    expect(() => run('UPDATE organization_audit SET detail = \'{"x":1}\'')).toThrow(/append-only/);
    expect(() => run('DELETE FROM organization_audit')).toThrow(/append-only/);
    expect(all('SELECT detail FROM organization_audit')).toEqual([{ detail: '{}' }]);
  });
});
