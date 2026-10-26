import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { rollbackTo } from './migrate-down';
import { ProjectRankRepository } from './project-rank';
import { removeSharedPeople, saveSharedPeople } from './shared-people-rollback';
import { MIGRATIONS_FOLDER, openSpaceDatabase } from './testing/space-database';

/**
 * `20261011200000_add_shared_people_audit` and the audited capacity-mode
 * setter (`share-people-across-projects` 8.1), over the organizations of
 * {@link openSpaceDatabase}.
 */
let directory: string;
let path: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-shared-audit-'));
  path = await openSpaceDatabase(directory);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function execute(statement: string) {
  const db = openDatabase(path);
  try {
    return db.query(statement).all();
  } finally {
    db.close();
  }
}

const stamp = (at: number) => ({ by: 'ada', at });

describe('shared people audit', () => {
  it('records each switch, and nothing for the mode it already has', async () => {
    const modes = new ProjectRankRepository(openDrizzle(path), OPEN);
    expect(await modes.setCapacityMode('org-a', 'isolated', stamp(10), 'audit-0')).toEqual({
      changed: false,
    });
    expect(await modes.setCapacityMode('org-a', 'shared', stamp(11), 'audit-1')).toEqual({
      changed: true,
    });
    expect(await modes.capacityModeIn('org-a')).toBe('shared');
    expect(await modes.setCapacityMode('org-a', 'shared', stamp(12), 'audit-2')).toEqual({
      changed: false,
    });
    expect(await modes.setCapacityMode('org-a', 'isolated', stamp(13), 'audit-3')).toEqual({
      changed: true,
    });
    expect(
      execute(
        'SELECT id, organization_id, actor_id, shared_people, created_at FROM shared_people_audit ORDER BY created_at',
      ),
    ).toEqual([
      {
        id: 'audit-1',
        organization_id: 'org-a',
        actor_id: 'ada',
        shared_people: 1,
        created_at: 11,
      },
      {
        id: 'audit-3',
        organization_id: 'org-a',
        actor_id: 'ada',
        shared_people: 0,
        created_at: 13,
      },
    ]);
    expect(execute("SELECT shared_people FROM organization WHERE id = 'org-b'")).toEqual([
      { shared_people: 0 },
    ]);
  });

  it('refuses a record of a third mode or of no organization', () => {
    expect(() =>
      execute(
        "INSERT INTO shared_people_audit (id, organization_id, actor_id, shared_people, created_at) VALUES ('x', 'org-a', 'ada', 2, 1)",
      ),
    ).toThrow();
    expect(() =>
      execute(
        "INSERT INTO shared_people_audit (id, organization_id, actor_id, shared_people, created_at) VALUES ('y', 'org-z', 'ada', 1, 1)",
      ),
    ).toThrow();
  });

  it('refuses to roll back over a recorded switch, keeping schema and ledger', async () => {
    await new ProjectRankRepository(openDrizzle(path), OPEN).setCapacityMode(
      'org-a',
      'shared',
      stamp(11),
      'audit-1',
    );
    // The newer, empty enterprise SSO migrations roll back first and are not
    // what this refusal is about.
    rollbackTo(path, MIGRATIONS_FOLDER, '20261011200000_add_shared_people_audit');
    const ledger = execute('SELECT * FROM __drizzle_migrations');
    expect(() =>
      rollbackTo(path, MIGRATIONS_FOLDER, '20261011120000_add_browser_auth_lifecycle'),
    ).toThrow('shared people switches are recorded');
    // The newer attempts migration, holding no attempt, reverses first and
    // commits its own step; the refused one keeps its row.
    expect(execute('SELECT * FROM __drizzle_migrations')).toEqual(
      ledger.filter(
        (row) => (row as { name: string }).name !== '20261012120000_add_step_node_attempts',
      ),
    );
    expect(execute('SELECT id FROM shared_people_audit')).toEqual([{ id: 'audit-1' }]);
  });

  it('refuses the shared-people remove once a switch is recorded, changing nothing', async () => {
    const modes = new ProjectRankRepository(openDrizzle(path), OPEN);
    await modes.setCapacityMode('org-a', 'shared', stamp(11), 'audit-1');
    await modes.setCapacityMode('org-a', 'isolated', stamp(12), 'audit-2');
    const saved = saveSharedPeople(path);
    const before = execute('SELECT id, shared_people, updated_at FROM organization ORDER BY id');
    expect(() => removeSharedPeople(openDrizzle(path), saved, 99)).toThrow(
      'shared people switches are recorded',
    );
    expect(execute('SELECT id, shared_people, updated_at FROM organization ORDER BY id')).toEqual(
      before,
    );
  });

  it('rolls back the empty audit table', () => {
    expect(
      rollbackTo(path, MIGRATIONS_FOLDER, '20261011120000_add_browser_auth_lifecycle'),
    ).toEqual([
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
    ]);
    expect(
      execute("SELECT name FROM sqlite_master WHERE name LIKE 'shared_people_audit%'"),
    ).toEqual([]);
  });
});
