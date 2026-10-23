import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openReadOnlyConnection } from './db';
import { SqliteDelegationUse } from './delegation-use';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-delegation-use-'));
  path = join(folder, 'test.db');
  runMigrations(path, FOLDER);
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

it('commits an admitted use after a concurrent command rolls back', async () => {
  const connection = openConnection(path);
  const gate = new WriteCoordinator();
  let releaseCommand: (() => void) | undefined;
  let commandStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    commandStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseCommand = resolve;
  });
  try {
    const command = gate.enter(async () => {
      connection.db.run(sql`BEGIN`);
      commandStarted?.();
      await release;
      connection.db.run(sql`ROLLBACK`);
    });
    await started;
    const uses = new SqliteDelegationUse(connection.db, gate);
    let admitted = false;
    const consumption = Promise.resolve(uses.consume('wbs', 'held', 200, 100)).then((accepted) => {
      admitted = true;
      return accepted;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    releaseCommand?.();
    await command;
    expect(await consumption).toBe(true);
    expect(await Promise.resolve(uses.consume('wbs', 'held', 200, 100))).toBe(false);
  } finally {
    releaseCommand?.();
    connection.close();
  }
});

it('admits exactly one use across two connections', async () => {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const state = new Int32Array(barrier);
  const first = new Worker(new URL('./delegation-use-race.worker.ts', import.meta.url));
  const second = new Worker(new URL('./delegation-use-race.worker.ts', import.meta.url));
  try {
    const admission = (worker: Worker) =>
      new Promise<boolean>((resolve, reject) => {
        worker.onmessage = (message: MessageEvent<boolean>) => {
          resolve(message.data);
        };
        worker.onerror = reject;
      });
    const admissions = Promise.all([admission(first), admission(second)]);
    const deadline = Date.now() + 5_000;
    first.postMessage({ path, barrier });
    while (Atomics.load(state, 0) < 1 && Date.now() < deadline) {
      await Bun.sleep(5);
    }
    expect(Atomics.load(state, 0)).toBe(1);
    second.postMessage({ path, barrier });
    while (Atomics.load(state, 0) < 2 && Date.now() < deadline) {
      await Bun.sleep(5);
    }
    expect(Atomics.load(state, 0)).toBe(2);
    Atomics.store(state, 1, 1);
    Atomics.notify(state, 1, 2);
    // Proof: bypassing the conflict refusal admitted both independent writers
    // after the barrier released them together (2026-09-28).
    expect((await admissions).sort()).toEqual([false, true]);
  } finally {
    Atomics.store(state, 1, 1);
    Atomics.notify(state, 1, 2);
    first.terminate();
    second.terminate();
  }
});

it('prunes expired uses without removing live uses', async () => {
  const connection = openConnection(path);
  try {
    const uses = new SqliteDelegationUse(connection.db, new WriteCoordinator());
    expect(await uses.consume('wbs', 'expired', 101, 100)).toBe(true);
    expect(await uses.consume('wbs', 'live', 200, 100)).toBe(true);
    expect(await uses.consume('wbs', 'next', 200, 102)).toBe(true);
    expect(await uses.consume('wbs', 'live', 200, 102)).toBe(false);
    expect(connection.db.all(sql`SELECT jti FROM delegation_use ORDER BY jti`)).toEqual([
      { jti: 'live' },
      { jti: 'next' },
    ]);
  } finally {
    connection.close();
  }
});

it('fails when the use table is missing', async () => {
  const connection = openConnection(path);
  try {
    connection.db.run(sql`DROP TABLE delegation_use`);
    let failure: unknown;
    try {
      await new SqliteDelegationUse(connection.db, new WriteCoordinator()).consume(
        'wbs',
        'new',
        200,
        100,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

it('fails when the use table is read-only', async () => {
  const connection = openReadOnlyConnection(path);
  try {
    // Proof (2026-09-28): bypassing storage resolved admission against this
    // read-only database instead of rejecting.
    let failure: unknown;
    try {
      await new SqliteDelegationUse(connection.db, new WriteCoordinator()).consume(
        'wbs',
        'new',
        200,
        100,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

it('prunes no more than 1,000 expired rows per consumption', async () => {
  const connection = openConnection(path);
  try {
    for (let index = 0; index < 1_001; index += 1) {
      connection.db.run(sql`INSERT INTO delegation_use (issuer, jti, expires_at)
        VALUES ('wbs', ${`expired-${String(index)}`}, 99)`);
    }
    connection.db.run(sql`INSERT INTO delegation_use (issuer, jti, expires_at)
      VALUES ('wbs', 'live', 200)`);
    expect(
      await new SqliteDelegationUse(connection.db, new WriteCoordinator()).consume(
        'wbs',
        'next',
        200,
        100,
      ),
    ).toBe(true);
    expect(
      connection.db.all<{ count: number }>(
        sql`SELECT COUNT(*) AS count FROM delegation_use WHERE expires_at <= 100`,
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await new SqliteDelegationUse(connection.db, new WriteCoordinator()).consume(
        'wbs',
        'live',
        200,
        100,
      ),
    ).toBe(false);
  } finally {
    connection.close();
  }
});

it('refuses rollback after activation or while a live use remains', async () => {
  const connection = openConnection(path);
  try {
    const uses = new SqliteDelegationUse(connection.db, new WriteCoordinator());
    await uses.consume(
      'wbs',
      'live',
      Math.floor(Date.now() / 1000) + 120,
      Math.floor(Date.now() / 1000),
    );
    expect(() => rollbackTo(path, FOLDER, '20260928010000_add_project_solution')).toThrow();
    connection.db.run(sql`DELETE FROM delegation_use`);
    connection.db.run(
      sql`UPDATE organization_activation SET state = 'activated', activated_at = 5`,
    );
    expect(() => rollbackTo(path, FOLDER, '20260928010000_add_project_solution')).toThrow();
  } finally {
    connection.close();
  }
});

it('allows pre-activation rollback once every use has expired', () => {
  const connection = openConnection(path);
  try {
    connection.db.run(sql`INSERT INTO delegation_use (issuer, jti, expires_at)
      VALUES ('wbs', 'old', 1)`);
  } finally {
    connection.close();
  }
  expect(rollbackTo(path, FOLDER, '20260928020000_add_email_verification')).toEqual([
    '20261022213000_add_optimization_boundary_certificates',
    '20261022212000_add_cross_project_dependency_activation',
    '20261022211000_add_external_dependencies',
    '20261022210000_add_project_abbreviations',
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
  ]);
});
