import { rejects } from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import * as connections from '@wbs/store-sqlite/db';
import { readMigrationFolders } from '@wbs/store-sqlite/migrate-down';
import { copyRecoveryPrefix } from '@wbs/store-sqlite/testing/recovery-state';
import { Database } from 'bun:sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots } from '../fixtures/source-startup';
import { decodeDependencyMigrationManifest } from './dependency-migration-artifact';

const migrationsDirectory = new URL('../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const predecessor = '20261115120000_add_step_migration_report';
const catalogue = '20261115130000_add_step_catalogue';

async function cleanRegisteredRoots(): Promise<void> {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
}
afterEach(cleanRegisteredRoots);

function ledger(path: string): readonly { name: string; hash: string }[] {
  const database = new Database(path, { create: false });
  try {
    return database
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      )
      .all();
  } finally {
    database.close();
  }
}
function historicalDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-fixture-prefix-'));
  roots.push(directory);
  return copyRecoveryPrefix(directory, predecessor);
}

test('default complete activation fixture retains exact current119 ledgers and separate atomic backups', async () => {
  const fixture = await completeActivationFixture(['prod']);
  const expected = readMigrationFolders(migrationsDirectory).map(({ name, hash }) => ({
    name,
    hash,
  }));
  expect(expected).toHaveLength(119);
  expect(ledger(fixture.prodPath)).toEqual(expected);
  expect(ledger(fixture.devPath)).toEqual(expected);
  for (const environment of ['prod', 'dev']) {
    const directory = join(fixture.root, environment + '-catalogue-fixture');
    expect(existsSync(join(directory, 'before-catalogue.db'))).toBe(true);
    expect(existsSync(join(directory, 'before-catalogue.json'))).toBe(true);
    expect(ledger(join(directory, 'before-catalogue.db'))).toEqual(expected.slice(0, 116));
  }
  const manifest = decodeDependencyMigrationManifest(
    readFileSync(
      join(
        fixture.root,
        'dependency-artifacts',
        fixture.request.migrations.manifestSha256,
        'manifest.json',
      ),
      'utf8',
    ),
    fixture.request.migrations,
  );
  expect(
    manifest.migrations.map(({ name, migration }) => ({ name, hash: migration.sha256 })),
  ).toEqual(expected);
  expect(manifest.migrations.map(({ name, down }) => ({ name, hash: down.sha256 }))).toEqual(
    readMigrationFolders(migrationsDirectory).map(({ name, downHash }) => ({
      name,
      hash: downHash,
    })),
  );
});

test('nondefault historical116 migration directory remains an actual116 fixture', async () => {
  const directory = historicalDirectory();
  const fixture = await completeActivationFixture(['prod'], directory);
  const expected = readMigrationFolders(directory).map(({ name, hash }) => ({ name, hash }));
  expect(expected).toHaveLength(116);
  expect(ledger(fixture.prodPath)).toEqual(expected);
  expect(ledger(fixture.devPath)).toEqual(expected);
  expect(existsSync(join(fixture.root, 'prod-catalogue-fixture'))).toBe(false);
  expect(existsSync(join(fixture.root, 'dev-catalogue-fixture'))).toBe(false);
});

test('nondefault pending117 still refuses through its actual ordinary migration path', async () => {
  const directory = historicalDirectory();
  cpSync(join(migrationsDirectory, catalogue), join(directory, catalogue), { recursive: true });
  await rejects(
    completeActivationFixture(['prod'], directory),
    /step catalogue migration requires the explicit atomic apply owner/,
  );
});

test('default catalogue close uncertainty retains only its owned root and the exact cause', async () => {
  const nativeOpen = connections.openExistingConnection;
  const closeFailure = new Error('actual catalogue report close projected uncertainty');
  let retainedRoot: string | undefined;
  let actualCloses = 0;
  const opening = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = nativeOpen(path);
    retainedRoot = dirname(dirname(dirname(path)));
    return {
      ...connection,
      close() {
        connection.close();
        actualCloses++;
        throw closeFailure;
      },
    };
  });
  try {
    await rejects(completeActivationFixture(['prod']), (cause: unknown) => {
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) return false;
      expect(cause.cause).toBe(closeFailure);
      expect(cause.message).toContain('retain ' + String(retainedRoot));
      return true;
    });
    expect(actualCloses).toBe(1);
    if (retainedRoot === undefined) throw new Error('actual retained catalogue root absent');
    const remaining = [...roots];
    expect(remaining.length).toBeGreaterThan(0);
    await cleanRegisteredRoots();
    expect(remaining.every((root) => !existsSync(root))).toBe(true);
    expect(existsSync(retainedRoot)).toBe(true);
    expect(existsSync(join(retainedRoot, 'prod/data/production.sqlite'))).toBe(true);
    expect(existsSync(join(retainedRoot, 'prod-catalogue-fixture'))).toBe(true);
  } finally {
    opening.mockRestore();
    // This fault followed the real close; its known terminal fixture may now be removed by this test.
    if (retainedRoot !== undefined) await rm(retainedRoot, { recursive: true, force: true });
  }
});
