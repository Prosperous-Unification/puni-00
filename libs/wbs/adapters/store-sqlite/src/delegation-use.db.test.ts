import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openReadOnlyConnection } from './db';
import { SqliteDelegationUse } from './delegation-use';
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
    first.postMessage({ path, barrier });
    second.postMessage({ path, barrier });
    const deadline = Date.now() + 5_000;
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

it('prunes expired uses without removing live uses, and fails on missing storage', () => {
  const connection = openConnection(path);
  try {
    const uses = new SqliteDelegationUse(connection.db);
    expect(uses.consume('wbs', 'expired', 101, 100)).toBe(true);
    expect(uses.consume('wbs', 'live', 200, 100)).toBe(true);
    expect(uses.consume('wbs', 'next', 200, 102)).toBe(true);
    expect(uses.consume('wbs', 'live', 200, 102)).toBe(false);
    expect(connection.db.all(sql`SELECT jti FROM delegation_use ORDER BY jti`)).toEqual([
      { jti: 'live' },
      { jti: 'next' },
    ]);
    connection.db.run(sql`DROP TABLE delegation_use`);
    expect(() => uses.consume('wbs', 'new', 200, 102)).toThrow();
  } finally {
    connection.close();
  }
});

it('fails when the use table is read-only', () => {
  const connection = openReadOnlyConnection(path);
  try {
    // Proof: ignoring a failed prune/write made this admission appear usable
    // against a read-only database (2026-09-28).
    expect(() => new SqliteDelegationUse(connection.db).consume('wbs', 'new', 200, 100)).toThrow();
  } finally {
    connection.close();
  }
});

it('prunes no more than 1,000 expired rows per consumption', () => {
  const connection = openConnection(path);
  try {
    for (let index = 0; index < 1_001; index += 1) {
      connection.db.run(sql`INSERT INTO delegation_use (issuer, jti, expires_at)
        VALUES ('wbs', ${`expired-${String(index)}`}, 99)`);
    }
    connection.db.run(sql`INSERT INTO delegation_use (issuer, jti, expires_at)
      VALUES ('wbs', 'live', 200)`);
    expect(new SqliteDelegationUse(connection.db).consume('wbs', 'next', 200, 100)).toBe(true);
    expect(
      connection.db.all<{ count: number }>(
        sql`SELECT COUNT(*) AS count FROM delegation_use WHERE expires_at <= 100`,
      ),
    ).toEqual([{ count: 1 }]);
    expect(new SqliteDelegationUse(connection.db).consume('wbs', 'live', 200, 100)).toBe(false);
  } finally {
    connection.close();
  }
});

it('refuses rollback after activation or while a live use remains', () => {
  const connection = openConnection(path);
  try {
    const uses = new SqliteDelegationUse(connection.db);
    uses.consume('wbs', 'live', Math.floor(Date.now() / 1000) + 120, Math.floor(Date.now() / 1000));
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
  expect(rollbackTo(path, FOLDER, '20260928010000_add_project_solution')).toEqual([
    '20260928030000_add_delegation_use',
  ]);
});
