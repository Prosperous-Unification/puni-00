import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { S3Client } from 'bun';
import { Database } from 'bun:sqlite';

// This file runs unchanged inside the digest-locked Bun image through the
// `sqlite-backup` ConfigMap, so it may import only Bun and Node built-ins.
// `validatePlatform` rejects a ConfigMap whose copy differs from these bytes.

/** Restore steps in docs/infra/recovery.md that consume a report of this shape. */
export const restoreProcedureVersion = 'sqlite-restore/1';

export interface AppliedMigration {
  readonly name: string;
  readonly hash: string;
}

export interface VerifiedSnapshot {
  readonly sha256: string;
  readonly bytes: number;
  readonly migrations: readonly AppliedMigration[];
}

export interface BackupReport extends VerifiedSnapshot {
  readonly schemaVersion: 1;
  readonly database: string;
  readonly objectKey: string;
  readonly objectVersion: string;
  readonly sourceRevision: string;
  readonly restoreProcedureVersion: typeof restoreProcedureVersion;
  readonly capturedAt: string;
}

export interface ObjectStore {
  /** Stores bytes and returns the store's version id for them. */
  put(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<string>;
  get(key: string): Promise<Uint8Array<ArrayBuffer>>;
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/**
 * Check one SQLite file the way a restore will rely on it.
 *
 * Throws when `integrity_check` is not `ok`, when `foreign_key_check` reports a
 * row, or when the Drizzle migration table is absent or empty: a database
 * without applied migrations is never a WBS snapshot worth keeping.
 */
export async function verifySqlite(path: string): Promise<VerifiedSnapshot> {
  const db = new Database(path, { readonly: true });
  let migrations: AppliedMigration[];
  try {
    const integrity = db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`${path} failed integrity_check`);
    }
    if (db.query('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error(`${path} failed foreign_key_check`);
    }
    const table = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      )
      .get();
    if (table === null) throw new Error(`${path} has no __drizzle_migrations table`);
    migrations = db
      .query<{ name: string | null; hash: string }, []>(
        'SELECT name, hash FROM __drizzle_migrations ORDER BY created_at, id',
      )
      .all()
      .map(({ name, hash }) => {
        if (name === null) throw new Error(`${path} has a migration row without a name`);
        return { name, hash };
      });
  } finally {
    db.close();
  }
  if (migrations.length === 0) throw new Error(`${path} has no applied migrations`);
  const { size } = await stat(path);
  return { sha256: await sha256File(path), bytes: size, migrations };
}

/**
 * Write an application-consistent copy of a live WAL database with `VACUUM INTO`.
 *
 * `VACUUM INTO` reads one transaction snapshot and takes no writer lock, which is
 * why it replaces a filesystem copy. The copy is verified before it is renamed
 * into place, so `snapshotPath` never names an unverified file. Throws when the
 * target already exists.
 */
export async function snapshotSqlite(
  sourcePath: string,
  snapshotPath: string,
): Promise<VerifiedSnapshot> {
  if (existsSync(snapshotPath)) throw new Error(`${snapshotPath} already exists`);
  const partialPath = join(dirname(snapshotPath), `.${basename(snapshotPath)}.partial`);
  await rm(partialPath, { force: true });
  const source = new Database(sourcePath, { readonly: true });
  try {
    source.run('PRAGMA busy_timeout = 5000');
    source.query('VACUUM INTO ?').run(partialPath);
  } finally {
    source.close();
  }
  const verified = await verifySqlite(partialPath);
  await rename(partialPath, snapshotPath);
  return verified;
}

function sameMigrations(left: readonly AppliedMigration[], right: readonly AppliedMigration[]) {
  return (
    left.length === right.length &&
    left.every(
      (migration, index) =>
        migration.name === right[index]?.name && migration.hash === right[index]?.hash,
    )
  );
}

/** Snapshot, verify and upload one database, then upload its report beside it. */
export async function backupSqlite(options: {
  readonly database: string;
  readonly sourcePath: string;
  readonly scratchDirectory: string;
  readonly prefix: string;
  readonly sourceRevision: string;
  readonly store: ObjectStore;
  readonly now: Date;
}): Promise<BackupReport> {
  const capturedAt = options.now.toISOString();
  const stamp = capturedAt.replaceAll(/[-:.]/g, '');
  const snapshotPath = join(options.scratchDirectory, `${options.database}-${stamp}.db`);
  const snapshot = await snapshotSqlite(options.sourcePath, snapshotPath);
  const objectKey = `${options.prefix}/${options.database}/${stamp}.db`;
  const objectVersion = await options.store.put(
    objectKey,
    new Uint8Array(await readFile(snapshotPath)),
    'application/vnd.sqlite3',
  );
  const report: BackupReport = {
    schemaVersion: 1,
    database: options.database,
    objectKey,
    objectVersion,
    sourceRevision: options.sourceRevision,
    restoreProcedureVersion,
    capturedAt,
    ...snapshot,
  };
  await options.store.put(
    `${objectKey}.report.json`,
    new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`),
    'application/json',
  );
  await rm(snapshotPath);
  return report;
}

function parseReport(bytes: Uint8Array, key: string): BackupReport {
  const report: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (
    typeof report !== 'object' ||
    report === null ||
    !('schemaVersion' in report) ||
    report.schemaVersion !== 1 ||
    !('restoreProcedureVersion' in report) ||
    report.restoreProcedureVersion !== restoreProcedureVersion ||
    !('objectKey' in report) ||
    typeof report.objectKey !== 'string' ||
    !('sha256' in report) ||
    typeof report.sha256 !== 'string' ||
    !('migrations' in report) ||
    !Array.isArray(report.migrations)
  ) {
    throw new Error(`${key} is not a ${restoreProcedureVersion} SQLite backup report`);
  }
  // The checks above cover every field the restore reads; the report was written by
  // backupSqlite and is only ever compared against, never trusted for control flow.
  return report as BackupReport;
}

/**
 * Restore one reported snapshot to a new path and prove it matches its report.
 *
 * Throws before `targetPath` exists when the downloaded bytes, integrity checks
 * or applied migration set differ from the report, or when `targetPath` already
 * exists: a restore never overwrites a database.
 */
export async function restoreSqlite(options: {
  readonly reportKey: string;
  readonly targetPath: string;
  readonly store: ObjectStore;
}): Promise<BackupReport> {
  if (existsSync(options.targetPath)) throw new Error(`${options.targetPath} already exists`);
  const report = parseReport(await options.store.get(options.reportKey), options.reportKey);
  const partialPath = join(dirname(options.targetPath), `.${basename(options.targetPath)}.partial`);
  await writeFile(partialPath, await options.store.get(report.objectKey));
  try {
    const restored = await verifySqlite(partialPath);
    if (restored.sha256 !== report.sha256) {
      throw new Error(`${report.objectKey} bytes differ from its report`);
    }
    if (!sameMigrations(restored.migrations, report.migrations)) {
      throw new Error(`${report.objectKey} migration set differs from its report`);
    }
  } catch (cause) {
    await rm(partialPath, { force: true });
    throw cause;
  }
  await rename(partialPath, options.targetPath);
  return report;
}

/**
 * An S3-compatible store that requires bucket versioning.
 *
 * Uploads go through a presigned PUT so the response's `x-amz-version-id` is
 * visible; a store that returns none is refused, because the off-region copy
 * and retention rules depend on retained object generations.
 */
export function createS3Store(client: S3Client): ObjectStore {
  return {
    async put(key, body, contentType) {
      const url = client.presign(key, { method: 'PUT', expiresIn: 900, type: contentType });
      const response = await fetch(url, {
        method: 'PUT',
        body,
        headers: { 'content-type': contentType },
      });
      if (!response.ok) {
        throw new Error(`Upload of ${key} failed with HTTP ${String(response.status)}`);
      }
      const version = response.headers.get('x-amz-version-id');
      if (version === null || version === '' || version === 'null') {
        throw new Error(`Upload of ${key} returned no object version; enable bucket versioning`);
      }
      return version;
    },
    async get(key) {
      return new Uint8Array(await client.file(key).arrayBuffer());
    },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} must be set`);
  return value;
}

function storeFromEnv(): ObjectStore {
  return createS3Store(
    new S3Client({
      endpoint: requireEnv('S3_ENDPOINT'),
      bucket: requireEnv('S3_BUCKET'),
      region: requireEnv('S3_REGION'),
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
      virtualHostedStyle: false,
    }),
  );
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === 'backup') {
    const report = await backupSqlite({
      database: requireEnv('BACKUP_DATABASE_NAME'),
      sourcePath: requireEnv('BACKUP_DATABASE_PATH'),
      scratchDirectory: requireEnv('BACKUP_SCRATCH_DIRECTORY'),
      prefix: requireEnv('BACKUP_PREFIX'),
      sourceRevision: requireEnv('PUNI_SOURCE_REVISION'),
      store: storeFromEnv(),
      now: new Date(),
    });
    console.log(JSON.stringify(report));
  } else if (mode === 'restore') {
    const report = await restoreSqlite({
      reportKey: requireEnv('RESTORE_REPORT_KEY'),
      targetPath: requireEnv('RESTORE_TARGET_PATH'),
      store: storeFromEnv(),
    });
    console.log(JSON.stringify(report));
  } else {
    throw new Error('Usage: backup-sqlite.ts backup|restore');
  }
}
