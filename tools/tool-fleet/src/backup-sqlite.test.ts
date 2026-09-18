import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { S3Client } from 'bun';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
  backupSqlite,
  createS3Store,
  type ObjectStore,
  restoreSqlite,
  snapshotSqlite,
  verifySqlite,
} from './backup-sqlite';

function createLiveDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(
    'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC, name TEXT)',
  );
  db.run(
    "INSERT INTO __drizzle_migrations (hash, created_at, name) VALUES ('h1', 1, '20260426171432_talented_smiling_tiger'), ('h2', 2, '20260804194845_add_users')",
  );
  db.run('CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  db.run("INSERT INTO project VALUES ('known-row', 'Recovery drill')");
  return db;
}

function memoryStore(): ObjectStore & { readonly objects: Map<string, Uint8Array<ArrayBuffer>> } {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  let version = 0;
  return {
    objects,
    put(key, body) {
      objects.set(key, body);
      version += 1;
      return Promise.resolve(`v${String(version)}`);
    },
    get(key) {
      const body = objects.get(key);
      if (body === undefined) return Promise.reject(new Error(`missing ${key}`));
      return Promise.resolve(body);
    },
  };
}

describe('snapshotSqlite', () => {
  it('captures committed WAL rows while the writer stays open', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    const writer = createLiveDatabase(join(directory, 'wbs.db'));
    try {
      const snapshot = await snapshotSqlite(join(directory, 'wbs.db'), join(directory, 'copy.db'));
      expect(snapshot.migrations.map(({ name }) => name)).toEqual([
        '20260426171432_talented_smiling_tiger',
        '20260804194845_add_users',
      ]);
      const copy = new Database(join(directory, 'copy.db'), { readonly: true });
      expect(copy.query('SELECT name FROM project').all()).toEqual([{ name: 'Recovery drill' }]);
      copy.close();
    } finally {
      writer.close();
    }
  });

  it('refuses a database without applied migrations', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    const db = new Database(join(directory, 'empty.db'), { create: true });
    db.run('CREATE TABLE project (id TEXT)');
    db.close();
    expect(snapshotSqlite(join(directory, 'empty.db'), join(directory, 'copy.db'))).rejects.toThrow(
      /__drizzle_migrations/,
    );
    expect(existsSync(join(directory, 'copy.db'))).toBe(false);
  });

  it('refuses a snapshot that violates a foreign key', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    const db = createLiveDatabase(join(directory, 'wbs.db'));
    db.run('CREATE TABLE step (id TEXT, project_id TEXT REFERENCES project(id))');
    db.run('PRAGMA foreign_keys = OFF');
    db.run("INSERT INTO step VALUES ('orphan', 'no-such-project')");
    db.close();
    // Proof: removing the foreign_key_check guard made this negative resolve on 2026-09-18.
    expect(snapshotSqlite(join(directory, 'wbs.db'), join(directory, 'copy.db'))).rejects.toThrow(
      /foreign_key_check/,
    );
  });

  it('refuses to replace an existing snapshot', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    createLiveDatabase(join(directory, 'wbs.db')).close();
    await writeFile(join(directory, 'copy.db'), 'previous');
    expect(snapshotSqlite(join(directory, 'wbs.db'), join(directory, 'copy.db'))).rejects.toThrow(
      /already exists/,
    );
  });
});

describe('backupSqlite and restoreSqlite', () => {
  it('restores the known row and migration set from its report', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    createLiveDatabase(join(directory, 'wbs.db')).close();
    const store = memoryStore();
    const report = await backupSqlite({
      database: 'wbs',
      sourcePath: join(directory, 'wbs.db'),
      scratchDirectory: directory,
      prefix: 'sqlite',
      sourceRevision: 'a'.repeat(40),
      store,
      now: new Date('2026-09-18T01:02:03.004Z'),
    });
    expect(report).toMatchObject({
      objectKey: 'sqlite/wbs/20260918T010203004Z.db',
      objectVersion: 'v1',
      sourceRevision: 'a'.repeat(40),
      restoreProcedureVersion: 'sqlite-restore/1',
    });
    const restored = await restoreSqlite({
      reportKey: `${report.objectKey}.report.json`,
      targetPath: join(directory, 'restored.db'),
      store,
    });
    expect(restored.sha256).toBe(report.sha256);
    expect((await verifySqlite(join(directory, 'restored.db'))).migrations).toEqual(
      report.migrations,
    );
  });

  it('refuses restored bytes that differ from the report', async () => {
    const directory = await scratchAsync('sqlite-backup-');
    const writer = createLiveDatabase(join(directory, 'wbs.db'));
    const store = memoryStore();
    const report = await backupSqlite({
      database: 'wbs',
      sourcePath: join(directory, 'wbs.db'),
      scratchDirectory: directory,
      prefix: 'sqlite',
      sourceRevision: 'b'.repeat(40),
      store,
      now: new Date('2026-09-18T00:00:00.000Z'),
    });
    writer.run("INSERT INTO project VALUES ('later-row', 'Written after the backup')");
    writer.close();
    const substitute = join(directory, 'substitute.db');
    await snapshotSqlite(join(directory, 'wbs.db'), substitute);
    store.objects.set(report.objectKey, new Uint8Array(await Bun.file(substitute).arrayBuffer()));
    // Proof: removing the report sha256 comparison made this negative resolve on 2026-09-18.
    expect(
      restoreSqlite({
        reportKey: `${report.objectKey}.report.json`,
        targetPath: join(directory, 'restored.db'),
        store,
      }),
    ).rejects.toThrow(/bytes differ from its report/);
    expect(existsSync(join(directory, 'restored.db'))).toBe(false);
  });
});

describe('createS3Store', () => {
  it('refuses an upload the store did not version', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(null, { status: 200 }),
    });
    try {
      const store = createS3Store(
        new S3Client({
          endpoint: `http://127.0.0.1:${String(server.port)}`,
          bucket: 'backups',
          region: 'test',
          accessKeyId: 'test',
          secretAccessKey: 'test',
          virtualHostedStyle: false,
        }),
      );
      // Proof: returning the absent version header as a string made this negative resolve on
      // 2026-09-18.
      expect(
        store.put('sqlite/wbs/x.db', new Uint8Array([1]), 'application/octet-stream'),
      ).rejects.toThrow(/no object version/);
    } finally {
      await server.stop(true);
    }
  });
});
