import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { openReadOnlyDatabase } from '../db';
import { type CatalogueFixtureTemplates, migrateEmptyCatalogueFixture } from './catalogue-database';

const owned: string[] = [];

afterEach(() => {
  for (const directory of owned.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function ownDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-catalogue-template-'));
  owned.push(directory);
  return directory;
}

/**
 * Schema, header pragmas and every table's rows. Build wall-clock cells (`applied_at`,
 * `access_role.created_at`) and the random ledger id are elided; {@link readLedgerId} reads it.
 */
function dumpDatabase(path: string) {
  const db = openReadOnlyDatabase(path);
  try {
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name COLLATE BINARY",
      )
      .all();
    return {
      integrity: db.query('PRAGMA integrity_check').all(),
      journalMode: db.query('PRAGMA journal_mode').all(),
      userVersion: db.query('PRAGMA user_version').all(),
      schema: db
        .query('SELECT * FROM sqlite_master ORDER BY type COLLATE BINARY, name COLLATE BINARY')
        .all(),
      tables: tables.map(({ name }) => ({
        name,
        rows: db
          .query<Record<string, unknown>, []>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .all()
          .map((row) =>
            name === '__drizzle_migrations'
              ? { ...row, applied_at: 'build time' }
              : name === 'access_role'
                ? { ...row, created_at: 'build time' }
                : name === 'runtime_ledger'
                  ? { ...row, ledger_id: 'random' }
                  : row,
          )
          .map((row) => JSON.stringify(row))
          .toSorted(),
      })),
    };
  } finally {
    db.close();
  }
}

/** Directory entries with mkdtemp suffixes elided; report sizes differ only by path spelling. */
function listDirectory(directory: string, prefix = ''): unknown[] {
  return readdirSync(join(directory, prefix))
    .toSorted()
    .flatMap((name) => {
      const relative = join(prefix, name);
      const stat = lstatSync(join(directory, relative));
      const shown = relative.replace(/^\.window-(snapshot|report)-[^/]+/, '.window-$1-*');
      const entry = {
        shown,
        mode: stat.mode,
        links: stat.nlink,
        bytes: stat.isDirectory() || name.endsWith('.json') ? null : stat.size,
      };
      return stat.isDirectory() ? [entry, ...listDirectory(directory, relative)] : [entry];
    })
    .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function readLedgerId(path: string): string {
  const db = openReadOnlyDatabase(path);
  try {
    const ledger = db
      .query<{ ledger_id: string }, []>('SELECT ledger_id FROM runtime_ledger WHERE id=1')
      .get();
    if (ledger === null) throw new Error('no runtime ledger in ' + path);
    return ledger.ledger_id;
  } finally {
    db.close();
  }
}

function readReport(directory: string) {
  return JSON.parse(readFileSync(join(directory, 'before-catalogue.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function migrate(directory: string, templates: CatalogueFixtureTemplates | null): number {
  const custody = { hasUnknownOwner: false };
  const started = performance.now();
  migrateEmptyCatalogueFixture(
    { path: join(directory, 'wbs.db'), directory, reportedAt: 1 },
    custody,
    templates,
  );
  expect(custody.hasUnknownOwner).toBe(false);
  return performance.now() - started;
}

test('a template copy matches a fresh build and costs under half of it', () => {
  const fresh = ownDirectory(),
    built = ownDirectory(),
    copied = ownDirectory(),
    again = ownDirectory();
  const templates: CatalogueFixtureTemplates = new Map();
  migrate(fresh, null);
  expect(templates.size).toBe(0);
  const building = migrate(built, templates);
  expect(templates.size).toBe(1);
  const copying = migrate(copied, templates);
  // Proof: bypassing the template lookup (every call builds) failed this bound on
  // Bun 1.4.4: the second build took 624 ms against a 531 ms limit; a copy takes ~10-20 ms.
  expect(copying).toBeLessThan(building / 2);
  // Read-only opens of a WAL database create sidecars, so this precedes every read.
  for (const directory of [fresh, copied])
    for (const sidecar of ['-wal', '-shm', '-journal'])
      for (const file of ['wbs.db', 'before-catalogue.db'])
        expect(lstatSync(join(directory, file + sidecar), { throwIfNoEntry: false })).toBe(
          undefined,
        );
  expect(listDirectory(copied)).toEqual(listDirectory(fresh));
  migrate(again, templates);
  const ledgers = [built, copied, again].flatMap((directory) => [
    readLedgerId(join(directory, 'wbs.db')),
    readLedgerId(join(directory, 'before-catalogue.db')),
  ]);
  // Proof: copying the template bytes without replaceLedgerId failed this check: all six
  // reads returned the build's one ledger id.
  expect(new Set(ledgers).size).toBe(3);
  for (const [index, ledger] of ledgers.entries())
    expect(ledger).toBe(ledgers[index - (index % 2)] ?? '');

  expect(dumpDatabase(join(copied, 'wbs.db'))).toEqual(dumpDatabase(join(fresh, 'wbs.db')));
  expect(dumpDatabase(join(copied, 'before-catalogue.db'))).toEqual(
    dumpDatabase(join(fresh, 'before-catalogue.db')),
  );
  expect(dumpDatabase(join(copied, 'wbs.db')).integrity).toEqual([{ integrity_check: 'ok' }]);

  const freshReport = readReport(fresh),
    copiedReport = readReport(copied);
  expect(Object.keys(copiedReport)).toEqual(Object.keys(freshReport));
  expect(copiedReport['sourcePath']).toBe(join(realpathSync(copied), 'wbs.db'));
  expect(copiedReport['snapshotPath']).toBe(join(realpathSync(copied), 'before-catalogue.db'));
  expect(copiedReport['migrations']).toEqual(freshReport['migrations']);
  expect(copiedReport['snapshotSha256']).toBe(
    createHash('sha256')
      .update(readFileSync(join(copied, 'before-catalogue.db')))
      .digest('hex'),
  );
  expect(copiedReport['snapshotBytes']).toBe(freshReport['snapshotBytes']);
  expect(copiedReport['sourceBytes']).toBe(freshReport['sourceBytes']);
});

test('refuses a corrupted template and rebuilds on the next call', () => {
  const templates: CatalogueFixtureTemplates = new Map();
  migrate(ownDirectory(), templates);
  const template = templates.values().next().value;
  if (template === undefined) throw new Error('expected one built template');
  template.database.writeUInt8(template.database.readUInt8(100) ^ 0xff, 100);
  expect(() => migrate(ownDirectory(), templates)).toThrow(
    'catalogue fixture template changed since its build',
  );
  expect(templates.size).toBe(0);
  const rebuilt = ownDirectory();
  migrate(rebuilt, templates);
  expect(templates.size).toBe(1);
  expect(dumpDatabase(join(rebuilt, 'wbs.db')).integrity).toEqual([{ integrity_check: 'ok' }]);
});

test('refuses an occupied directory as a build does', () => {
  const templates: CatalogueFixtureTemplates = new Map();
  migrate(ownDirectory(), templates);
  const occupied = ownDirectory();
  migrate(occupied, null);
  rmSync(join(occupied, 'wbs.db'));
  expect(() => migrate(occupied, templates)).toThrow('EEXIST');
});

test('refuses a template whose ledger id is absent from its bytes', () => {
  const templates: CatalogueFixtureTemplates = new Map();
  migrate(ownDirectory(), templates);
  const [[key, template] = []] = templates.entries();
  if (key === undefined || template === undefined) throw new Error('expected one built template');
  templates.set(key, { ...template, ledgerId: 'f'.repeat(template.ledgerId.length) });
  expect(() => migrate(ownDirectory(), templates)).toThrow(
    'catalogue fixture template lacks its ledger id',
  );
});
