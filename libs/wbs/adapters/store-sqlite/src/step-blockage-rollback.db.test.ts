import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { runMigrations } from './migrate';
import {
  decodeSavedStepBlockages,
  removeSavedStepBlockages,
  restoreStepBlockages,
  saveStepBlockages,
} from './step-blockage-rollback';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;
let connection: Connection;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-blockage-recovery-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
  connection.db.run(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
  );
  connection.db.run(
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('foreign','Foreign','u',0,1)",
  );
  connection.db.run(
    "INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1),('qa','p','QA',2),('foreign','foreign','Other',1)",
  );
  connection.db.run(
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0),('b','p','B',2,0)",
  );
  connection.db.run(
    "INSERT INTO step_blockage (work_item_id,step_id,blocked_at,created_at,updated_at,created_by) VALUES ('a','dev',100,10,20,'u')",
  );
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

const CLI = new URL(
  '../../../../../apps/wbs/be-01/src/step-blockage-rollback-cli.ts',
  import.meta.url,
).pathname;
async function runCli(command: string, file: string, dbPath = path) {
  const child = Bun.spawn([process.execPath, CLI, command, file], {
    env: { ...process.env, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe('step blockage recovery', () => {
  it('saves, removes and restores every column exactly', () => {
    const saved = saveStepBlockages(connection.db);
    expect(saved).toEqual({
      format: 'step-blockage-save',
      version: 1,
      rows: [
        {
          work_item_id: 'a',
          step_id: 'dev',
          blocked_at: 100,
          created_at: 10,
          updated_at: 20,
          created_by: 'u',
        },
      ],
    });
    expect(removeSavedStepBlockages(connection.db, saved)).toBe(1);
    expect(saveStepBlockages(connection.db).rows).toEqual([]);
    expect(restoreStepBlockages(connection.db, saved)).toBe(1);
    expect(saveStepBlockages(connection.db)).toEqual(saved);
  });

  it('refuses a stale save without removing any facts', () => {
    const saved = saveStepBlockages(connection.db);
    connection.db.run('UPDATE step_blockage SET blocked_at=101');
    expect(() => removeSavedStepBlockages(connection.db, saved)).toThrow(/does not match/);
    expect(saveStepBlockages(connection.db).rows[0]?.blocked_at).toBe(101);
  });

  it('refuses a nonempty restore even for disjoint existing facts', () => {
    const saved = saveStepBlockages(connection.db);
    removeSavedStepBlockages(connection.db, saved);
    connection.db.run(
      "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('b','qa',200)",
    );
    expect(() => restoreStepBlockages(connection.db, saved)).toThrow(/not empty/);
    expect(saveStepBlockages(connection.db).rows).toHaveLength(1);
    expect(saveStepBlockages(connection.db).rows[0]?.work_item_id).toBe('b');
  });

  it('refuses malformed envelopes, rows and every timestamp field at the decoder', () => {
    const saved = saveStepBlockages(connection.db);
    for (const malformed of [
      null,
      {},
      { ...saved, format: 'other' },
      { ...saved, version: 2 },
      { ...saved, extra: true },
      { ...saved, rows: null },
      { ...saved, rows: [null] },
      { ...saved, rows: [{}] },
      { ...saved, rows: [{ ...saved.rows[0], work_item_id: 3 }] },
      { ...saved, rows: [{ ...saved.rows[0], extra: true }] },
    ]) {
      expect(() => decodeSavedStepBlockages(malformed)).toThrow();
    }
    for (const field of ['blocked_at', 'created_at', 'updated_at']) {
      for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, '10']) {
        expect(() =>
          decodeSavedStepBlockages({ ...saved, rows: [{ ...saved.rows[0], [field]: value }] }),
        ).toThrow();
      }
    }
  });

  it('rejects duplicate saved identities before writing', () => {
    const saved = saveStepBlockages(connection.db);
    removeSavedStepBlockages(connection.db, saved);
    expect(() =>
      decodeSavedStepBlockages({ ...saved, rows: [...saved.rows, ...saved.rows] }),
    ).toThrow(/duplicate saved step blockage/);
    expect(() =>
      restoreStepBlockages(connection.db, { ...saved, rows: [...saved.rows, ...saved.rows] }),
    ).toThrow(/duplicate saved step blockage/);
    expect(saveStepBlockages(connection.db).rows).toEqual([]);
  });

  it('refuses lost owners, lost steps, parent owners and cross-project restore atomically', () => {
    const saved = saveStepBlockages(connection.db);
    removeSavedStepBlockages(connection.db, saved);
    for (const row of [
      { ...saved.rows[0], work_item_id: 'gone' },
      { ...saved.rows[0], step_id: 'gone' },
      { ...saved.rows[0], step_id: 'foreign' },
    ]) {
      expect(() =>
        restoreStepBlockages(connection.db, { ...saved, rows: [...saved.rows, row] }),
      ).toThrow();
      expect(saveStepBlockages(connection.db).rows).toEqual([]);
    }
    connection.db.run(
      "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('child','p','a','Child',1,0)",
    );
    expect(() => restoreStepBlockages(connection.db, saved)).toThrow();
    expect(saveStepBlockages(connection.db).rows).toEqual([]);
  });

  it('refuses an absent table instead of saving an empty backup', () => {
    connection.db.run('DROP TABLE step_blockage');
    expect(() => saveStepBlockages(connection.db)).toThrow(/step_blockage/);
  });

  it('requires DB_PATH and a valid verb at the CLI boundary', async () => {
    const file = join(directory, 'saved.json');
    expect((await runCli('erase', file)).stderr).toContain('usage:');
    expect((await runCli('save', '')).stderr).toContain('usage:');
    const missingFile = Bun.spawn([process.execPath, CLI, 'save'], {
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await missingFile.exited).not.toBe(0);
    expect(await new Response(missingFile.stderr).text()).toContain('usage:');
    const { DB_PATH: _path, ...environment } = process.env;
    const child = Bun.spawn([process.execPath, CLI, 'save', file], {
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('DB_PATH must be set');
  }, 10000);

  it('refuses overwriting a recovery file after removal and restores all original columns', async () => {
    const file = join(directory, 'saved.json');
    const original = saveStepBlockages(connection.db);
    expect((await runCli('save', file)).exitCode).toBe(0);
    const bytes = await Bun.file(file).text();
    expect((await runCli('remove', file)).exitCode).toBe(0);
    expect(saveStepBlockages(connection.db).rows).toEqual([]);
    const repeatedSave = await runCli('save', file);
    expect(repeatedSave.exitCode).not.toBe(0);
    expect(repeatedSave.stderr).toContain('EEXIST');
    expect(await Bun.file(file).text()).toBe(bytes);
    expect((await runCli('restore', file)).exitCode).toBe(0);
    expect(saveStepBlockages(connection.db)).toEqual(original);
  }, 10000);

  it('runs the CLI round trip and rejects malformed/absent inputs without creating databases', async () => {
    const file = join(directory, 'saved.json');
    const saved = await runCli('save', file);
    expect(saved).toMatchObject({ exitCode: 0 });
    expect(saved.stdout).toContain('saved: 1');
    expect((await runCli('remove', file)).exitCode).toBe(0);
    expect((await runCli('restore', file)).exitCode).toBe(0);
    expect((await runCli('erase', join(directory, 'invalid-verb.json'))).stderr).toContain(
      'usage:',
    );
    const missingDatabaseSave = join(directory, 'missing-database-save.json');
    const missingDatabase = await runCli(
      'save',
      missingDatabaseSave,
      join(directory, 'missing.db'),
    );
    expect(missingDatabase.exitCode).not.toBe(0);
    expect(missingDatabase.stderr).toContain('unable to open database file');
    expect(existsSync(missingDatabaseSave)).toBe(false);
    expect(existsSync(join(directory, 'missing.db'))).toBe(false);
    // Proof: chmod fault changed to readable mode; fresh-destination CLI negative
    // failed on exit 0 instead of being masked by EEXIST; watched 2026-10-13.
    chmodSync(path, 0);
    try {
      const unreadableDatabaseSave = join(directory, 'unreadable-database-save.json');
      const unreadableDatabase = await runCli('save', unreadableDatabaseSave);
      expect(unreadableDatabase.exitCode).not.toBe(0);
      expect(unreadableDatabase.stderr).toContain('unable to open database file');
      expect(existsSync(unreadableDatabaseSave)).toBe(false);
    } finally {
      chmodSync(path, 0o600);
    }
    const absent = await runCli('restore', join(directory, 'missing.json'));
    expect(absent.exitCode).not.toBe(0);
    expect(absent.stderr).toContain('ENOENT');
    writeFileSync(join(directory, 'broken.json'), '{');
    const malformedFile = await runCli('restore', join(directory, 'broken.json'));
    expect(malformedFile.exitCode).not.toBe(0);
    expect(malformedFile.stderr).toContain('JSON Parse error');
    const directoryDatabaseSave = join(directory, 'directory-database-save.json');
    const directoryDatabase = await runCli('save', directoryDatabaseSave, directory);
    expect(directoryDatabase.exitCode).not.toBe(0);
    expect(directoryDatabase.stderr).toContain('unable to open database file');
    expect(existsSync(directoryDatabaseSave)).toBe(false);
  });
});
