import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { seedPackageParent } from './testing/legacy-package-parent';
import { copyRecoveryPrefix } from './testing/recovery-state';
import { UserRepository } from './user';
import { WorkPackageRepository } from './work-package';

const custody = { hasUnknownOwner: false };
const FREEZE = '20260927200000_freeze_organization_ownership';
const wrote: WriteStamp = { at: 1, by: 'ada' };
const creationAudit = {
  actor_id: 'ada',
  detail:
    '{"roleId":"package-manager","scopeKind":"work_package","scopeId":"p1","subjectKind":"user","subjectId":"ada","origin":"creation"}',
};

/**
 * `20260927220000_add_organization_audit` and the audited recovery write
 * (task 3.7): the table's own constraints, its rollback refusal, and the
 * recheck and audit record inside `recoverInOrganization`'s transaction.
 */
describe('the organization audit', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-organization-audit-'));
    path = join(dir, 'test.db');
    custody.hasUnknownOwner = false;
    migrateEmptyCatalogueFixture({ path, directory: dir, reportedAt: 1 }, custody);
    raw((sqlite) =>
      sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"),
    );
    seedPackageParent(path, 'org-a', 'parent-a');
    const db = openDrizzle(path);
    for (const id of ['ada', 'sam']) {
      await new UserRepository(db, OPEN).create(
        { id, username: id, passwordHash: 'x', createdAt: 1 },
        wrote,
      );
    }
    raw((sqlite) =>
      sqlite.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
      ),
    );
    await new WorkPackageRepository(db, OPEN).createInOrganization(
      workPackageRow({ id: 'p1', name: 'Plan', projectId: 'parent-a', restricted: true }),
      [],
      wrote,
      'org-a',
      { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
    );
  });

  afterEach(() => {
    if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
  });

  function raw<T>(use: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      return use(db);
    } finally {
      db.close();
    }
  }

  const insert = (action: string, kind: string, organizationId = 'org-a') =>
    raw((db) =>
      db.run(
        'INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), organizationId, 'sam', action, kind, 'p1', '{}'],
      ),
    );

  it('does not expose the retired role-authorized work package admission API', () => {
    expect(Reflect.get(WorkPackageRepository.prototype, 'admitEditInOrganization')).toBeUndefined();
  });

  it('refuses an unknown action or subject kind', () => {
    expect(() => insert('something_else', 'work_package')).toThrow();
    expect(() => insert('restricted_work_package_recovery', 'person')).toThrow();
    expect(() => insert('restricted_work_package_recovery', 'work_package')).not.toThrow();
  });

  it('refuses a record of no organization', () => {
    raw((db) => db.run('PRAGMA foreign_keys = ON'));
    expect(() =>
      insert('restricted_work_package_recovery', 'work_package', 'org-nowhere'),
    ).toThrow();
  });

  function migrateHistoricalAudit(through: string) {
    const directory = mkdtempSync(join(dir, 'history-'));
    const historicalPath = join(directory, 'audit.db');
    const migrations = copyRecoveryPrefix(directory, through);
    runMigrations(historicalPath, migrations);
    return { historicalPath, migrations };
  }

  it('refuses to roll back over a recorded act', () => {
    const { historicalPath, migrations } = migrateHistoricalAudit(
      '20260927220000_add_organization_audit',
    );
    const sqlite = openDatabase(historicalPath);
    try {
      sqlite.run("INSERT INTO users(id,username,created_at) VALUES ('sam','Sam',1)");
      sqlite.run("INSERT INTO organization(id,name,created_at) VALUES ('org-a','A',1)");
      sqlite.run(
        `INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at)
         VALUES ('audit','org-a','sam','restricted_project_recovery','project','p1','{}',1)`,
      );
      const acts = sqlite.query('SELECT * FROM organization_audit').all();
      const ledger = sqlite
        .query('SELECT name,hash,created_at FROM __drizzle_migrations ORDER BY name')
        .all();
      expect(() => rollbackTo(historicalPath, migrations, FREEZE)).toThrow(
        'organization_audit_must_be_empty',
      );
      expect(acts).toHaveLength(1);
      expect(sqlite.query('SELECT * FROM organization_audit').all()).toEqual(acts);
      expect(
        sqlite.query('SELECT name,hash,created_at FROM __drizzle_migrations ORDER BY name').all(),
      ).toEqual(ledger);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back while nothing is recorded', () => {
    const { historicalPath, migrations } = migrateHistoricalAudit(
      '20261103110000_add_initial_access_offers',
    );
    expect(rollbackTo(historicalPath, migrations, FREEZE)).toEqual([
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
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
      '20260928010000_add_project_solution',
      '20260927220000_add_organization_audit',
      '20260927213000_add_typed_dependency',
    ]);
  });

  const member = (userId: string, role: string) =>
    raw((db) =>
      db.run(
        'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
        ['org-a', userId, role],
      ),
    );
  const edit = (actorId: string, name: string) =>
    new WorkPackageRepository(openDrizzle(path), OPEN).editInOrganization(
      'p1',
      { name },
      { at: 2, by: actorId },
      'org-a',
      { principal: { id: actorId }, actorId, auditId: crypto.randomUUID() },
    );
  const grant = (userId: string, roleId: string, scopeKind: string, scopeId: string) =>
    raw((db) =>
      db.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,'org-a',?,?,'user',?,?,'route',1)",
        [crypto.randomUUID(), scopeKind, scopeId, userId, roleId],
      ),
    );
  const clearRestriction = (actorId: string) =>
    new WorkPackageRepository(openDrizzle(path), OPEN).editInOrganization(
      'p1',
      { restricted: false },
      { at: 2, by: actorId },
      'org-a',
      { principal: { id: actorId }, actorId, auditId: crypto.randomUUID() },
    );
  const state = () =>
    raw((db) => ({
      workPackage: db.query('SELECT name, revision, restricted FROM work_package').get(),
      audits: db.query('SELECT actor_id, detail FROM organization_audit').all(),
    }));

  it('refuses an actor who is no longer a writing member', async () => {
    member('sam', 'viewer');
    grant('sam', 'package-viewer', 'work_package', 'p1');
    const before = state();
    expect(await edit('sam', 'Taken')).toBe('forbidden');
    expect(await edit('nobody', 'Taken')).toBeNull();
    expect(state()).toEqual(before);
  });

  it('refuses a non-creator admin of a restricted work package', async () => {
    member('sam', 'admin');
    grant('sam', 'org-admin', 'organization', 'org-a');
    const before = state();
    expect(await edit('sam', 'Taken')).toBe('forbidden');
    expect(state()).toEqual(before);
  });

  it('audits a recovery the work package became after the request read it', async () => {
    member('sam', 'super_admin');
    grant('sam', 'org-super-admin', 'organization', 'org-a');
    expect(await clearRestriction('sam')).toMatchObject({
      restricted: false,
      projectId: 'parent-a',
    });
    expect(state().audits).toEqual([
      creationAudit,
      { actor_id: 'sam', detail: '{"fields":["restricted"]}' },
    ]);
  });

  it("writes the creator's own edit and an unrestricted work package's edit without a record", async () => {
    member('sam', 'super_admin');
    grant('sam', 'org-super-admin', 'organization', 'org-a');
    expect(await edit('ada', 'Mine')).toMatchObject({ name: 'Mine' });
    raw((db) => db.run('UPDATE work_package SET restricted = 0'));
    expect(await edit('sam', 'Open')).toMatchObject({ name: 'Open' });
    expect(state().audits).toEqual([creationAudit]);
  });

  it('rolls the edit back when its audit record cannot be written', async () => {
    member('sam', 'super_admin');
    grant('sam', 'org-super-admin', 'organization', 'org-a');
    raw((db) =>
      db.run(
        "CREATE TRIGGER audit_refused BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit refused'); END",
      ),
    );
    const before = state();
    let failure: unknown;
    try {
      await clearRestriction('sam');
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain('Failed query: insert into "organization_audit"');
    expect(state()).toEqual(before);
  });

  it('answers a work package of another organization as absent, before any permission', async () => {
    raw((db) => {
      db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
    });
    member('sam', 'viewer');
    const answer = await new WorkPackageRepository(openDrizzle(path), OPEN).editInOrganization(
      'p1',
      { name: 'Taken' },
      { at: 2, by: 'sam' },
      'org-b',
      { principal: { id: 'sam' }, actorId: 'sam', auditId: 'a1' },
    );
    expect(answer).toBeNull();
  });
});
