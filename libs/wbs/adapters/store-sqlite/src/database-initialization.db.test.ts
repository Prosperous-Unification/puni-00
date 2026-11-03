import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- retains actual native connections to prevent GC from hiding failed-opener ownership leaks
import { Database, SQLiteError } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';

import { activateDependencies } from './cross-project-dependency-activation';
import { openDatabase, openExistingConnection, openReadOnlyDatabase } from './db';

const RECEIPT = {
  protocol: 'wbs-dependency-activation',
  version: 1,
  activationId: 'attempt',
  databaseIdentity: 'db',
  candidateImage: `wbs@sha256:${'a'.repeat(64)}`,
  rollbackImage: `wbs@sha256:${'b'.repeat(64)}`,
  participantProofSha256: 'c'.repeat(64),
  migrationCaptureSha256: 'd'.repeat(64),
  activatedAt: 1,
} as const;
const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
// eslint-disable-next-line @typescript-eslint/unbound-method -- observers call the original only with its native receiver through apply
const nativeRun = Database.prototype.run;
// eslint-disable-next-line @typescript-eslint/unbound-method -- teardown and observers pass the actual native receiver through call/apply
const nativeClose = Database.prototype.close;
let directory: string;
let path: string;
let retained: Set<Database>;
let closed: Database[];
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-database-initialization-'));
  path = join(directory, 'malformed.db');
  writeFileSync(path, 'not a SQLite database');
  retained = new Set();
  closed = [];
  spyOn(Database.prototype, 'run').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['run']>
  ) {
    retained.add(this);
    return nativeRun.apply(this, arguments_);
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['close']>
  ) {
    closed.push(this);
    nativeClose.apply(this, arguments_);
  });
});
afterEach(() => {
  mock.restore();
  for (const database of retained) nativeClose.call(database, true);
  rmSync(directory, { recursive: true, force: true });
});

for (const [name, open] of [
  ['creating opener', () => openDatabase(path)],
  ['existing opener', () => openExistingConnection(path)],
  ['activation', () => activateDependencies(path, FOLDER, RECEIPT)],
] as const) {
  it(`closes every malformed ${name} attempt before rethrowing its native error`, () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      let failure: unknown;
      try {
        open();
      } catch (cause) {
        failure = cause;
      }
      expect(failure).toBeInstanceOf(SQLiteError);
      expect(failure).toMatchObject({ code: 'SQLITE_NOTADB' });
    }
    expect(retained.size).toBe(30);
    expect(closed).toHaveLength(30);
    expect(new Set(closed)).toEqual(retained);
    for (const database of retained)
      expect(() => database.query('SELECT 1').get()).toThrow(/closed/i);
    expect(readFileSync(path, 'utf8')).toBe('not a SQLite database');
  });
}

it.skipIf(process.platform !== 'linux')(
  'retains no malformed activation database descriptors without garbage collection',
  () => {
    const count = (): number =>
      readdirSync('/proc/self/fd').filter((descriptor) => {
        // The listing's own descriptor is already closed when readdirSync returns.
        try {
          return readlinkSync(join('/proc/self/fd', descriptor)) === path;
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
          throw cause;
        }
      }).length;
    const baseline = count();
    for (let attempt = 0; attempt < 30; attempt += 1)
      expect(() => activateDependencies(path, FOLDER, RECEIPT)).toThrow();
    expect(retained.size).toBe(30);
    expect(count()).toBe(baseline);
  },
);

for (const [name, open] of [
  ['writable', () => openDatabase(path)],
  ['readonly', () => openReadOnlyDatabase(path)],
] as const) {
  it(`closes failed ${name} initialization and preserves the exact primary error`, () => {
    const failure = new Error('injected busy-timeout refusal');
    spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
      retained.add(this);
      throw failure;
    });
    let observed: unknown;
    try {
      open();
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBe(failure);
    expect(closed).toHaveLength(1);
    expect(new Set(closed)).toEqual(retained);
    for (const database of retained)
      expect(() => database.query('SELECT 1').get()).toThrow(/closed/i);
  });
}

it('preserves initialization and cleanup failures together with the primary cause', () => {
  const primary = new Error('injected initialization refusal');
  const cleanup = new Error('injected close refusal');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (this: Database) {
    closed.push(this);
    throw cleanup;
  });
  let observed: unknown;
  try {
    openReadOnlyDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('cleanup failure was not attributed');
  expect(observed.cause).toBe(primary);
  expect(observed.errors).toEqual([primary, cleanup]);
  expect(closed).toHaveLength(1);
});

it('closes a connection when the final WAL assertion refuses initialization', () => {
  expect(() => openDatabase(':memory:')).toThrow(/journal_mode/);
  expect(closed).toHaveLength(1);
  expect(new Set(closed)).toEqual(retained);
});

it('transfers valid connections to their caller without closing them', () => {
  const database = openDatabase(join(directory, 'valid.db'));
  expect(closed).toEqual([]);
  database.run('CREATE TABLE ownership_probe(id INTEGER)');
  database.run('INSERT INTO ownership_probe VALUES(1)');
  expect(database.query('SELECT id FROM ownership_probe').get()).toEqual({ id: 1 });
  database.close();
  expect(closed).toEqual([database]);
});
