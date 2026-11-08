import * as filesystem from 'node:fs';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- retains actual native connections to prevent GC from hiding failed-opener ownership leaks
import { Database, SQLiteError, type SQLQueryBindings } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import type { Logger } from 'drizzle-orm';
import * as bunSqlite from 'drizzle-orm/bun-sqlite';

import { isSnapshotCleanupUnknown, snapshotDatabase, verifySnapshotBounded } from './backup';
import { activateDependencies } from './cross-project-dependency-activation';
import * as connections from './db';
import {
  type Connection,
  openDatabase,
  openExistingConnection,
  openReadOnlyConnection,
  openReadOnlyDatabase,
} from './db';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';

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
const nativeDrizzle = bunSqlite.drizzle;
let directory: string;
let path: string;
let retained: Set<Database>;
let closed: Database[];
interface NativeCloseAttempt {
  readonly original: typeof nativeClose;
  readonly receiver: Database;
  readonly args: Parameters<Database['close']>;
  readonly phase: 'production' | 'fixture-retirement';
  entered: boolean;
  returned: boolean;
}
let closeAttempts: NativeCloseAttempt[];
interface WrapperCall {
  readonly original: typeof nativeDrizzle;
  readonly receiver: unknown;
  readonly args: Parameters<typeof nativeDrizzle>;
  readonly configuredClient: unknown;
  entered: boolean;
  returned: boolean;
  wrapper: ReturnType<typeof nativeDrizzle> | undefined;
}
interface WrapperSubject {
  readonly seed: Database;
  readonly seedClose: NativeCloseAttempt;
  readonly primary: Error;
  readonly cleanup: Error;
  readonly fault: 'none' | 'before' | 'after';
  readonly calls: WrapperCall[];
  readonly logger: Logger;
  returnedConnection: Connection | undefined;
  observed: unknown;
}
let wrapperSubject: WrapperSubject | undefined;
let stopped: Error | undefined;
beforeEach(() => {
  if (stopped !== undefined) throw stopped;
  directory = mkdtempSync(join(tmpdir(), 'wbs-database-initialization-'));
  path = join(directory, 'malformed.db');
  writeFileSync(path, 'not a SQLite database');
  retained = new Set();
  closed = [];
  closeAttempts = [];
  wrapperSubject = undefined;
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
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args: arguments_,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    attempt.entered = true;
    attempt.original.apply(attempt.receiver, attempt.args);
    attempt.returned = true;
  });
});
afterEach(() => {
  if (stopped !== undefined) throw stopped;
  mock.restore();
  if (closeAttempts.some((attempt) => attempt.entered && !attempt.returned)) {
    stopped = new Error('SQLite fixture STOP: native close entered without an observed return', {
      cause: { retained, closeAttempts, wrapperSubject },
    });
    throw stopped;
  }
  if (wrapperSubject !== undefined) {
    const subject = wrapperSubject;
    const clients = [...retained];
    const client = clients.at(0);
    const call = subject.calls.at(0);
    const returned = subject.returnedConnection;
    const hasReturnedConnection =
      returned !== undefined && '$client' in returned.db && returned.db.$client === client;
    const hasWrapperWitness =
      subject.calls.length === 1 &&
      call !== undefined &&
      call.entered &&
      call.returned &&
      call.wrapper !== undefined &&
      call.wrapper.$client === client &&
      call.configuredClient === client;
    const attempts = closeAttempts.filter((attempt) => attempt.phase === 'production');
    const attempt = attempts.at(0);
    const hasKnownReturn =
      attempts.length === 1 &&
      attempt !== undefined &&
      attempt.receiver === client &&
      attempt.entered &&
      attempt.returned;
    const hasMissingWrapperClose =
      attempts.length === 0 && (hasWrapperWitness || hasReturnedConnection);
    const hasWithheldWrapperClose =
      subject.fault === 'before' &&
      attempts.length === 1 &&
      attempt !== undefined &&
      attempt.receiver === client &&
      !attempt.entered &&
      !attempt.returned &&
      hasWrapperWitness;
    if (
      clients.length !== 1 ||
      client === undefined ||
      !subject.seedClose.entered ||
      !subject.seedClose.returned ||
      subject.seedClose.receiver !== subject.seed ||
      (!hasKnownReturn && !hasMissingWrapperClose && !hasWithheldWrapperClose)
    ) {
      stopped = new Error('SC2 fixture STOP: wrapper original has no authorized known retirement', {
        cause: { subject, retained, closeAttempts },
      });
      throw stopped;
    }
  }
  // Only a deliberately withheld original receives its first native close here, after assertions.
  for (const database of retained) {
    if (closeAttempts.some((attempt) => attempt.receiver === database && attempt.returned))
      continue;
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: database,
      args: [true],
      phase: 'fixture-retirement',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    attempt.entered = true;
    try {
      attempt.original.apply(attempt.receiver, attempt.args);
    } catch (cause) {
      stopped = new Error('SQLite fixture STOP: first fixture close did not return', {
        cause: { failure: cause, attempt, retained, closeAttempts, wrapperSubject },
      });
      throw stopped;
    }
    attempt.returned = true;
  }
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

it('readonly initialization preserves the exact primary after a successful original close', () => {
  const primary = new Error('SC1 readonly initialization primary');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  let observed: unknown;
  try {
    openReadOnlyDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBe(primary);
  expect(isSqliteCleanupUnknown(observed)).toBe(false);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC1 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
});

it('readonly initialization classifies a cleanup throw before original close delegation', () => {
  const primary = new Error('SC1 readonly initialization primary');
  const cleanup = new Error('SC1 readonly cleanup refusal');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args: arguments_,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    throw cleanup;
  });
  let observed: unknown;
  try {
    openReadOnlyDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('SC1 aggregate attribution absent');
  expect(observed.cause).toBe(primary);
  expect(observed.errors).toEqual([primary, cleanup]);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC1 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(false);
  expect(attempt.returned).toBe(false);
  expect(isSqliteCleanupUnknown(observed)).toBe(true);
});

it('readonly initialization classifies a cleanup throw after original close returns', () => {
  const primary = new Error('SC1 readonly initialization primary');
  const cleanup = new Error('SC1 readonly cleanup refusal');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args: arguments_,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    attempt.entered = true;
    attempt.original.apply(attempt.receiver, attempt.args);
    attempt.returned = true;
    throw cleanup;
  });
  let observed: unknown;
  try {
    openReadOnlyDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('SC1 aggregate attribution absent');
  expect(observed.cause).toBe(primary);
  expect(observed.errors).toEqual([primary, cleanup]);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC1 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(observed)).toBe(true);
});

it('SC2 writable initialization preserves the exact primary after a successful original close', () => {
  const primary = new Error('SC2 writable initialization primary');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  let observed: unknown;
  try {
    openDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBe(primary);
  expect(isSqliteCleanupUnknown(observed)).toBe(false);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
});

it('SC2 writable initialization classifies a cleanup throw before original close delegation', () => {
  const primary = new Error('SC2 writable initialization primary');
  const cleanup = new Error('SC2 writable cleanup refusal');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args: arguments_,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    throw cleanup;
  });
  let observed: unknown;
  try {
    openDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('SC2 aggregate attribution absent');
  expect(observed.cause).toBe(primary);
  expect(observed.errors).toEqual([primary, cleanup]);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(false);
  expect(attempt.returned).toBe(false);
  expect(isSqliteCleanupUnknown(observed)).toBe(true);
});

it('SC2 writable initialization classifies a cleanup throw after original close returns', () => {
  const primary = new Error('SC2 writable initialization primary');
  const cleanup = new Error('SC2 writable cleanup refusal');
  spyOn(Database.prototype, 'run').mockImplementation(function (this: Database) {
    retained.add(this);
    throw primary;
  });
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...arguments_: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args: arguments_,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    attempt.entered = true;
    attempt.original.apply(attempt.receiver, attempt.args);
    attempt.returned = true;
    throw cleanup;
  });
  let observed: unknown;
  try {
    openDatabase(path);
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('SC2 aggregate attribution absent');
  expect(observed.cause).toBe(primary);
  expect(observed.errors).toEqual([primary, cleanup]);
  expect(retained.size).toBe(1);
  expect(closed).toHaveLength(1);
  expect(closeAttempts).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(retained.has(attempt.receiver)).toBe(true);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(observed)).toBe(true);
});

/** Seeds and closes the setup client before observing one actual wrapper-return refusal. */
function prepareWrapperSubject(
  fault: WrapperSubject['fault'],
  seedObserver?: ReturnType<typeof observeSeedClose>,
  seedKind: 'empty' | 'migration-ledger' = 'empty',
): WrapperSubject & {
  readonly nativeOutcomes: readonly TaggedNativeClose[];
  restoreDrizzle(): void;
  restoreClose(): void;
} {
  path = join(directory, 'wrapper.db');
  const seed = openDatabase(path);
  if (seedKind === 'migration-ledger') {
    seed.run('CREATE TABLE __drizzle_migrations (id INTEGER, created_at INTEGER, name TEXT)');
    seed.run(
      "INSERT INTO __drizzle_migrations VALUES (1,1,'20260426171432_talented_smiling_tiger')",
    );
  }
  seed.close();
  expect(retained.size).toBe(1);
  expect(retained.has(seed)).toBe(true);
  expect(closeAttempts).toHaveLength(1);
  const seedClose = closeAttempts.at(0);
  if (seedClose === undefined) throw new Error('SC2 seed native close evidence absent');
  expect(seedClose.receiver).toBe(seed);
  expect(seedClose.original).toBe(nativeClose);
  expect(seedClose.entered).toBe(true);
  expect(seedClose.returned).toBe(true);
  seedObserver?.restore();
  const subject: WrapperSubject = {
    seed,
    seedClose,
    primary: new Error('SC2 actual wrapper-return refusal'),
    cleanup: new Error('SC2 wrapper cleanup refusal'),
    fault,
    calls: [],
    logger: { logQuery: () => undefined },
    returnedConnection: undefined,
    observed: undefined,
  };
  wrapperSubject = subject;
  retained = new Set();
  closed = [];
  closeAttempts = [];
  const wrapping = spyOn(bunSqlite, 'drizzle').mockImplementation(
    Object.assign(
      function (this: unknown, ...args: Parameters<typeof nativeDrizzle>) {
        const config: unknown = args[0];
        const call: WrapperCall = {
          original: nativeDrizzle,
          receiver: this,
          args,
          configuredClient:
            typeof config === 'object' && config !== null && 'client' in config
              ? config.client
              : undefined,
          entered: false,
          returned: false,
          wrapper: undefined,
        };
        subject.calls.push(call);
        call.entered = true;
        call.wrapper = call.original.apply(call.receiver, call.args);
        call.returned = true;
        throw subject.primary;
      },
      { mock: nativeDrizzle.mock },
    ),
  );
  const nativeOutcomes: TaggedNativeClose[] = [];
  const closing = spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...args: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: TaggedNativeClose = {
      original: nativeClose,
      receiver: this,
      args,
      phase: 'production',
      entered: false,
      returned: false,
      nativeOutcome: { kind: 'not-entered' },
    };
    closeAttempts.push(attempt);
    nativeOutcomes.push(attempt);
    if (subject.fault === 'before') throw subject.cleanup;
    delegateTaggedNativeClose(attempt);
    if (subject.fault === 'after') throw subject.cleanup;
  });
  return Object.assign(subject, {
    nativeOutcomes,
    restoreDrizzle: () => {
      wrapping.mockRestore();
    },
    restoreClose: () => {
      closing.mockRestore();
    },
  });
}

it('SC2 existing wrapper preserves the exact primary after a successful original close', () => {
  const subject = prepareWrapperSubject('none');
  try {
    subject.returnedConnection = openExistingConnection(path);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config)).toEqual(['client']);
  expect(subject.observed).toBe(subject.primary);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_EXISTING_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(false);
});

it('SC2 existing wrapper classifies a cleanup throw before original close delegation', () => {
  const subject = prepareWrapperSubject('before');
  try {
    subject.returnedConnection = openExistingConnection(path);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config)).toEqual(['client']);
  expect(subject.observed).toBeInstanceOf(AggregateError);
  if (!(subject.observed instanceof AggregateError))
    throw new Error('SC2 wrapper attribution absent');
  expect(subject.observed.cause).toBe(subject.primary);
  expect(subject.observed.errors).toEqual([subject.primary, subject.cleanup]);
  expect(subject.observed.errors[0]).toBe(subject.primary);
  expect(subject.observed.errors[1]).toBe(subject.cleanup);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_EXISTING_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(false);
  expect(attempt.returned).toBe(false);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(true);
});

it('SC2 existing wrapper classifies a cleanup throw after original close returns', () => {
  const subject = prepareWrapperSubject('after');
  try {
    subject.returnedConnection = openExistingConnection(path);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config)).toEqual(['client']);
  expect(subject.observed).toBeInstanceOf(AggregateError);
  if (!(subject.observed instanceof AggregateError))
    throw new Error('SC2 wrapper attribution absent');
  expect(subject.observed.cause).toBe(subject.primary);
  expect(subject.observed.errors).toEqual([subject.primary, subject.cleanup]);
  expect(subject.observed.errors[0]).toBe(subject.primary);
  expect(subject.observed.errors[1]).toBe(subject.cleanup);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_EXISTING_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(true);
});

it('SC2 readonly wrapper preserves the exact primary after a successful original close', () => {
  const subject = prepareWrapperSubject('none');
  try {
    subject.returnedConnection = openReadOnlyConnection(path, subject.logger);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config).sort()).toEqual(['client', 'logger']);
  expect('logger' in config && config.logger).toBe(subject.logger);
  expect(subject.observed).toBe(subject.primary);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_READONLY_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(false);
});

it('SC2 readonly wrapper classifies a cleanup throw before original close delegation', () => {
  const subject = prepareWrapperSubject('before');
  try {
    subject.returnedConnection = openReadOnlyConnection(path, subject.logger);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config).sort()).toEqual(['client', 'logger']);
  expect('logger' in config && config.logger).toBe(subject.logger);
  expect(subject.observed).toBeInstanceOf(AggregateError);
  if (!(subject.observed instanceof AggregateError))
    throw new Error('SC2 wrapper attribution absent');
  expect(subject.observed.cause).toBe(subject.primary);
  expect(subject.observed.errors).toEqual([subject.primary, subject.cleanup]);
  expect(subject.observed.errors[0]).toBe(subject.primary);
  expect(subject.observed.errors[1]).toBe(subject.cleanup);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_READONLY_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(false);
  expect(attempt.returned).toBe(false);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(true);
});

it('SC2 readonly wrapper classifies a cleanup throw after original close returns', () => {
  const subject = prepareWrapperSubject('after');
  try {
    subject.returnedConnection = openReadOnlyConnection(path, subject.logger);
  } catch (cause) {
    subject.observed = cause;
  }
  expect(subject.calls).toHaveLength(1);
  const call = subject.calls.at(0);
  if (call === undefined) throw new Error('SC2 actual wrapper call evidence absent');
  expect(call.original).toBe(nativeDrizzle);
  expect(call.entered).toBe(true);
  expect(call.returned).toBe(true);
  expect(call.args).toHaveLength(1);
  const wrapper = call.wrapper;
  if (wrapper === undefined) throw new Error('SC2 actual returned wrapper absent');
  expect(retained.size).toBe(1);
  expect(retained.has(wrapper.$client)).toBe(true);
  expect(call.configuredClient).toBe(wrapper.$client);
  const config: unknown = call.args[0];
  if (typeof config !== 'object' || config === null)
    throw new Error('SC2 actual production wrapper config absent');
  expect(Object.keys(config).sort()).toEqual(['client', 'logger']);
  expect('logger' in config && config.logger).toBe(subject.logger);
  expect(subject.observed).toBeInstanceOf(AggregateError);
  if (!(subject.observed instanceof AggregateError))
    throw new Error('SC2 wrapper attribution absent');
  expect(subject.observed.cause).toBe(subject.primary);
  expect(subject.observed.errors).toEqual([subject.primary, subject.cleanup]);
  expect(subject.observed.errors[0]).toBe(subject.primary);
  expect(subject.observed.errors[1]).toBe(subject.cleanup);
  expect(subject.returnedConnection).toBeUndefined();
  expect(
    closeAttempts.filter((attempt) => attempt.phase === 'production'),
    'SC2_READONLY_WRAPPER_REQUIRED_PRODUCTION_CLOSE',
  ).toHaveLength(1);
  expect(closed).toHaveLength(1);
  const attempt = closeAttempts.at(0);
  if (attempt === undefined) throw new Error('SC2 wrapper original close evidence absent');
  expect(attempt.original).toBe(nativeClose);
  expect(attempt.receiver).toBe(wrapper.$client);
  expect(attempt.args).toEqual([true]);
  expect(attempt.phase).toBe('production');
  expect(attempt.entered).toBe(true);
  expect(attempt.returned).toBe(true);
  expect(isSqliteCleanupUnknown(subject.observed)).toBe(true);
});

type LowerReadArguments =
  | Parameters<typeof filesystem.readSync>
  | [number, NodeJS.ArrayBufferView, number, number, filesystem.ReadPosition | null];

type LowerNativeOutcome =
  | { readonly kind: 'not-entered' }
  | { readonly kind: 'entered' }
  | { readonly kind: 'returned' }
  | { readonly kind: 'threw'; readonly cause: unknown };
interface TaggedNativeClose extends NativeCloseAttempt {
  nativeOutcome: LowerNativeOutcome;
}

/** Keeps actual native throws distinct from an absent cause, including thrown undefined. */
function delegateTaggedNativeClose(attempt: TaggedNativeClose): void {
  attempt.entered = true;
  attempt.nativeOutcome = { kind: 'entered' };
  try {
    attempt.original.apply(attempt.receiver, attempt.args);
  } catch (cause) {
    attempt.nativeOutcome = { kind: 'threw', cause };
    throw cause;
  }
  attempt.returned = true;
  attempt.nativeOutcome = { kind: 'returned' };
}

/** Records the real setup client's first native close before any later subject ledger reset. */
function observeSeedClose() {
  const attempts: TaggedNativeClose[] = [];
  const closing = spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...args: Parameters<Database['close']>
  ) {
    const attempt: TaggedNativeClose = {
      original: nativeClose,
      receiver: this,
      args,
      phase: 'production',
      entered: false,
      returned: false,
      nativeOutcome: { kind: 'not-entered' },
    };
    attempts.push(attempt);
    closeAttempts.push(attempt);
    closed.push(this);
    delegateTaggedNativeClose(attempt);
  });
  return {
    attempts,
    restore: () => {
      closing.mockRestore();
    },
  };
}

interface LowerPinnedDescriptor {
  readonly descriptor: number;
  readonly path: Parameters<typeof filesystem.openSync>[0];
  kind: 'parent' | 'file' | 'unexpected';
  readonly closes: {
    readonly original: typeof filesystem.closeSync;
    readonly receiver: unknown;
    readonly args: [number];
    outcome: LowerNativeOutcome;
  }[];
}

/** Observes only returned backup-owned descriptors; never retries or discharges an uncertain close. */
function captureLowerPins(path: string) {
  const open = filesystem.openSync;
  const close = filesystem.closeSync;
  const openCalls: {
    readonly original: typeof open;
    readonly receiver: unknown;
    readonly args: Parameters<typeof open>;
    outcome: LowerNativeOutcome;
  }[] = [];
  const originals: LowerPinnedDescriptor[] = [];
  const order: LowerPinnedDescriptor[] = [];
  const opened = spyOn(filesystem, 'openSync').mockImplementation(function (
    this: unknown,
    ...args: Parameters<typeof open>
  ) {
    const call = {
      original: open,
      receiver: this,
      args,
      outcome: { kind: 'entered' } as LowerNativeOutcome,
    };
    openCalls.push(call);
    let descriptor: number;
    try {
      descriptor = call.original.apply(call.receiver, call.args);
    } catch (cause) {
      call.outcome = { kind: 'threw', cause };
      throw cause;
    }
    // Retain the returned FD before classifying its pathname or any other continuation.
    const original: LowerPinnedDescriptor = {
      descriptor,
      path: args[0],
      kind: 'unexpected',
      closes: [],
    };
    originals.push(original);
    call.outcome = { kind: 'returned' };
    original.kind = args[0] === dirname(path) ? 'parent' : args[0] === path ? 'file' : 'unexpected';
    return descriptor;
  });
  const closing = spyOn(filesystem, 'closeSync').mockImplementation(function (
    this: unknown,
    descriptor,
  ) {
    const candidates = originals.filter((original) => original.descriptor === descriptor);
    const original = candidates.at(0);
    if (candidates.length !== 1 || original === undefined)
      throw new Error('SC3 STOP: descriptor close has ambiguous acquisition', {
        cause: { descriptor, openCalls, originals, order },
      });
    const call = {
      original: close,
      receiver: this,
      args: [descriptor] as [number],
      outcome: { kind: 'not-entered' } as LowerNativeOutcome,
    };
    original.closes.push(call);
    order.push(original);
    if (original.closes.length !== 1)
      throw new Error('SC3 STOP: duplicate descriptor native entry refused', {
        cause: { openCalls, originals, order },
      });
    call.outcome = { kind: 'entered' };
    try {
      call.original.call(call.receiver, ...call.args);
    } catch (cause) {
      call.outcome = { kind: 'threw', cause };
      throw cause;
    }
    call.outcome = { kind: 'returned' };
  });
  return {
    originals,
    openCalls,
    order,
    close,
    requireReturned: (expected: 'none' | 'pinned') => {
      const expectedKinds: LowerPinnedDescriptor['kind'][] =
        expected === 'none' ? [] : ['parent', 'file'];
      expect(originals.map((original) => original.kind)).toEqual(expectedKinds);
      expect(openCalls.map((call) => call.outcome.kind)).toEqual(
        expected === 'none' ? [] : ['returned', 'returned'],
      );
      expect(openCalls.map((call) => call.args)).toEqual(
        expected === 'none'
          ? []
          : [
              [dirname(path), filesystem.constants.O_RDONLY | filesystem.constants.O_DIRECTORY],
              [
                path,
                filesystem.constants.O_RDONLY |
                  filesystem.constants.O_NOFOLLOW |
                  filesystem.constants.O_NONBLOCK,
              ],
            ],
      );
      for (const call of openCalls) {
        expect(call.original).toBe(open);
        expect(call.receiver).toBeUndefined();
      }
      expect(order.map((original) => original.kind)).toEqual(
        expected === 'none' ? [] : ['file', 'parent'],
      );
      expect(order).toEqual(expected === 'none' ? [] : [...originals].reverse());
      for (const original of originals) {
        expect(original.closes).toHaveLength(1);
        expect(original.closes.at(0)?.original).toBe(close);
        expect(original.closes.at(0)?.receiver).toBeUndefined();
        expect(original.closes.at(0)?.args).toEqual([original.descriptor]);
        expect(original.closes.at(0)?.outcome.kind).toBe('returned');
      }
      if (expected === 'pinned')
        expect(originals.at(0)?.descriptor).not.toBe(originals.at(1)?.descriptor);
    },
    restore: () => {
      opened.mockRestore();
      closing.mockRestore();
    },
  };
}

it('SC3 snapshot retains genuine initialization cleanup failure', () => {
  const lowerPath = join(directory, 'genuine-initialization.db');
  const primary = new Error('SC3 actual readonly initialization refusal');
  const cleanup = new Error('SC3 actual readonly initializer close refusal');
  const seedObserver = observeSeedClose();
  const subjectAttempts: TaggedNativeClose[] = [];
  const subjectClients: Database[] = [];
  const runCalls: { readonly receiver: Database; readonly args: Parameters<Database['run']> }[] =
    [];
  type OpenerOutcome =
    | { kind: 'entered' }
    | { kind: 'returned'; connection: Connection }
    | { kind: 'threw'; cause: unknown };
  const openerCalls: {
    readonly original: typeof connections.openReadOnlyConnection;
    readonly receiver: unknown;
    readonly args: Parameters<typeof connections.openReadOnlyConnection>;
    outcome: OpenerOutcome;
  }[] = [];
  let bodyOutcome: { kind: 'entered' } | { kind: 'returned' } | { kind: 'threw'; cause: unknown } =
    { kind: 'entered' };
  let snapshotOutcome:
    | { kind: 'not-called' }
    | { kind: 'returned'; value: unknown }
    | { kind: 'threw'; cause: unknown } = { kind: 'not-called' };
  let pins: ReturnType<typeof captureLowerPins> | undefined;
  let restoreSubject: (() => void) | undefined;
  try {
    const seed = openDatabase(lowerPath);
    seed.run('CREATE TABLE lower_probe (id INTEGER PRIMARY KEY)');
    seed.close(true);
    expect(seedObserver.attempts).toHaveLength(1);
    expect(seedObserver.attempts.at(0)?.receiver).toBe(seed);
    expect(seedObserver.attempts.at(0)?.args).toEqual([true]);
    expect(seedObserver.attempts.at(0)?.nativeOutcome.kind).toBe('returned');
    expect(seedObserver.attempts.at(0)?.entered).toBe(true);
    expect(seedObserver.attempts.at(0)?.returned).toBe(true);
    retained = new Set();
    closed = [];
    closeAttempts = [];
    const run = spyOn(Database.prototype, 'run').mockImplementation(function (
      this: Database,
      ...args: Parameters<Database['run']>
    ) {
      retained.add(this);
      if (!subjectClients.includes(this)) subjectClients.push(this);
      runCalls.push({ receiver: this, args });
      throw primary;
    });
    const closing = spyOn(Database.prototype, 'close').mockImplementation(function (
      this: Database,
      ...args: Parameters<Database['close']>
    ) {
      const attempt: TaggedNativeClose = {
        original: nativeClose,
        receiver: this,
        args,
        phase: 'production',
        entered: false,
        returned: false,
        nativeOutcome: { kind: 'not-entered' },
      };
      subjectAttempts.push(attempt);
      closeAttempts.push(attempt);
      closed.push(this);
      throw cleanup;
    });
    const open = connections.openReadOnlyConnection;
    const opener = spyOn(connections, 'openReadOnlyConnection').mockImplementation(function (
      this: unknown,
      ...args: Parameters<typeof open>
    ) {
      const call = {
        original: open,
        receiver: this,
        args,
        outcome: { kind: 'entered' } as OpenerOutcome,
      };
      openerCalls.push(call);
      try {
        const connection = call.original.apply(call.receiver, call.args);
        call.outcome = { kind: 'returned', connection };
        return connection;
      } catch (cause) {
        call.outcome = { kind: 'threw', cause };
        throw cause;
      }
    });
    const wrapping = spyOn(bunSqlite, 'drizzle');
    const reading = spyOn(filesystem, 'readSync');
    restoreSubject = () => {
      run.mockRestore();
      closing.mockRestore();
      opener.mockRestore();
      wrapping.mockRestore();
      reading.mockRestore();
    };
    pins = captureLowerPins(lowerPath);
    try {
      const value = verifySnapshotBounded(lowerPath, {
        maxBytes: 1073741824,
        deadline: performance.now() + 10000,
      });
      snapshotOutcome = { kind: 'returned', value };
    } catch (cause) {
      snapshotOutcome = { kind: 'threw', cause };
    }
    expect(openerCalls).toHaveLength(1);
    const call = openerCalls.at(0);
    if (call === undefined) throw new Error('SC3 genuine opener outcome absent');
    expect(call.original).toBe(open);
    expect(call.args).toEqual([lowerPath]);
    expect(call.outcome.kind).toBe('threw');
    if (call.outcome.kind !== 'threw')
      throw new Error('SC3 initializer unexpectedly returned a Connection');
    expect(subjectClients).toHaveLength(1);
    const client = subjectClients.at(0);
    if (client === undefined) throw new Error('SC3 actual initialized client absent');
    expect(retained.has(client)).toBe(true);
    expect(runCalls).toHaveLength(1);
    expect(runCalls.at(0)?.receiver).toBe(client);
    expect(runCalls.at(0)?.args).toEqual(['PRAGMA busy_timeout = 5000;']);
    expect(subjectAttempts).toHaveLength(1);
    const attempt = subjectAttempts.at(0);
    if (attempt === undefined) throw new Error('SC3 initializer close attempt absent');
    expect(attempt.original).toBe(nativeClose);
    expect(attempt.receiver).toBe(client);
    expect(attempt.args).toEqual([true]);
    expect(attempt.entered).toBe(false);
    expect(attempt.returned).toBe(false);
    expect(attempt.nativeOutcome.kind).toBe('not-entered');
    expect(wrapping).toHaveBeenCalledTimes(0);
    expect(reading).toHaveBeenCalledTimes(0);
    pins.requireReturned('pinned');
    const lower = call.outcome.cause;
    expect(lower).toBeInstanceOf(AggregateError);
    if (!(lower instanceof AggregateError)) throw new Error('SC3 actual lower aggregate absent');
    expect(lower.cause).toBe(primary);
    expect(lower.errors).toEqual([primary, cleanup]);
    expect(lower.errors[0]).toBe(primary);
    expect(lower.errors[1]).toBe(cleanup);
    expect(snapshotOutcome.kind).toBe('threw');
    if (snapshotOutcome.kind !== 'threw') throw new Error('SC3 snapshot unexpectedly returned');
    const observed = snapshotOutcome.cause;
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError))
      throw new Error('SC3 snapshot lower attribution absent');
    expect(observed.errors).toEqual([lower]);
    expect(observed.errors[0]).toBe(lower);
    expect(isSqliteCleanupUnknown(lower)).toBe(true);
    expect(isSnapshotCleanupUnknown(observed)).toBe(true);
    bodyOutcome = { kind: 'returned' };
  } catch (cause) {
    bodyOutcome = { kind: 'threw', cause };
    throw cause;
  } finally {
    try {
      expect(seedObserver.attempts).toHaveLength(1);
      expect(seedObserver.attempts.at(0)?.nativeOutcome.kind).toBe('returned');
      // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
      if (pins === undefined) throw new Error('SC3 pinned call did not begin');
      pins.requireReturned('pinned');
      const attempt = subjectAttempts.at(0);
      if (
        subjectAttempts.length !== 1 ||
        subjectClients.length !== 1 ||
        attempt === undefined ||
        attempt.receiver !== subjectClients.at(0) ||
        attempt.original !== nativeClose ||
        attempt.args.length !== 1 ||
        attempt.args[0] !== true ||
        attempt.entered ||
        attempt.returned ||
        attempt.nativeOutcome.kind !== 'not-entered'
      )
        // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
        throw new Error('SC3 initializer lacks authorized first native retirement');
      const retirement: TaggedNativeClose = {
        original: attempt.original,
        receiver: attempt.receiver,
        args: attempt.args,
        phase: 'fixture-retirement',
        entered: false,
        returned: false,
        nativeOutcome: { kind: 'not-entered' },
      };
      closeAttempts.push(retirement);
      closed.push(retirement.receiver);
      delegateTaggedNativeClose(retirement);
      expect(retirement.nativeOutcome.kind).toBe('returned');
      expect(retirement.entered).toBe(true);
      expect(retirement.returned).toBe(true);
      expect(subjectAttempts.at(0)?.entered).toBe(false);
      expect(subjectAttempts.at(0)?.returned).toBe(false);
    } catch (cause) {
      stopped = new Error('SC3 STOP: lower initializer retirement is not known', {
        // tagged exact caught value, including undefined, remains beside every original and native outcome
        cause: {
          failure: { kind: 'threw', cause },
          bodyOutcome,
          snapshotOutcome,
          seedObserver,
          subjectClients,
          subjectAttempts,
          openerCalls,
          pins,
          retained,
          closeAttempts,
        },
      });
      // eslint-disable-next-line no-unsafe-finally -- STOP preserves native ambiguity before any fallback cleanup; existing beforeEach refuses further acquisition
      throw stopped;
    } finally {
      try {
        restoreSubject?.();
        pins?.restore();
        seedObserver.restore();
      } catch (cause) {
        stopped = new Error('SC3 STOP: lower initializer observer restoration failed', {
          // exact restoration failure and original body outcome remain tagged beside every original
          cause: {
            failure: { kind: 'threw', cause },
            bodyOutcome,
            snapshotOutcome,
            seedObserver,
            subjectClients,
            subjectAttempts,
            openerCalls,
            pins,
            retained,
            closeAttempts,
          },
        });
        // eslint-disable-next-line no-unsafe-finally -- restoration ambiguity retains the original body evidence and prevents fallback native cleanup
        throw stopped;
      }
    }
  }
});

it('SC3 cleanup identity survives diagnostic mutation and rejects ordinary aggregate inheritance', () => {
  const seedObserver = observeSeedClose();
  let subject: ReturnType<typeof prepareWrapperSubject> | undefined;
  let firstPins: ReturnType<typeof captureLowerPins> | undefined;
  let secondPins: ReturnType<typeof captureLowerPins> | undefined;
  let restoreFirst: (() => void) | undefined;
  const secondRestorers: (() => void)[] = [];
  let firstRestored = false;
  type OpenerOutcome =
    | { kind: 'entered' }
    | { kind: 'returned'; connection: Connection }
    | { kind: 'threw'; cause: unknown };
  const openerCalls: {
    readonly original: typeof connections.openReadOnlyConnection;
    readonly receiver: unknown;
    readonly args: Parameters<typeof connections.openReadOnlyConnection>;
    outcome: OpenerOutcome;
  }[] = [];
  let bodyOutcome: { kind: 'entered' } | { kind: 'returned' } | { kind: 'threw'; cause: unknown } =
    { kind: 'entered' };
  let firstOutcome:
    | { kind: 'not-called' }
    | { kind: 'returned'; value: unknown }
    | { kind: 'threw'; cause: unknown } = { kind: 'not-called' };
  let secondOutcome:
    | { kind: 'not-called' }
    | { kind: 'returned'; value: unknown }
    | { kind: 'threw'; cause: unknown } = { kind: 'not-called' };
  const secondClients: Database[] = [];
  const secondNativeAttempts: TaggedNativeClose[] = [];
  const secondRuns: {
    readonly receiver: Database;
    readonly args: Parameters<Database['run']>;
    outcome: { kind: 'entered' } | { kind: 'returned' } | { kind: 'threw'; cause: unknown };
  }[] = [];
  const secondOpenerCalls: (typeof openerCalls)[number][] = [];
  const readCalls: {
    readonly original: typeof filesystem.readSync;
    readonly receiver: unknown;
    readonly args: LowerReadArguments;
    readonly semanticClose: TaggedNativeClose | undefined;
    readonly semanticEntered: boolean | undefined;
    readonly semanticReturned: boolean | undefined;
    readonly semanticOutcome: LowerNativeOutcome | undefined;
    outcome:
      { kind: 'entered' } | { kind: 'returned'; count: number } | { kind: 'threw'; cause: unknown };
  }[] = [];
  try {
    subject = prepareWrapperSubject('after', seedObserver, 'migration-ledger');
    expect(seedObserver.attempts).toHaveLength(1);
    expect(seedObserver.attempts.at(0)?.receiver).toBe(subject.seed);
    expect(seedObserver.attempts.at(0)?.args).toEqual([]);
    expect(seedObserver.attempts.at(0)?.nativeOutcome.kind).toBe('returned');
    const actualSubject = subject;
    const open = connections.openReadOnlyConnection;
    const opener = spyOn(connections, 'openReadOnlyConnection').mockImplementation(function (
      this: unknown,
      ...args: Parameters<typeof open>
    ) {
      const call: (typeof openerCalls)[number] = {
        original: open,
        receiver: this,
        args,
        outcome: { kind: 'entered' },
      };
      openerCalls.push(call);
      try {
        const connection = call.original.apply(call.receiver, call.args);
        // Retain an actual returned Connection before any fallible validation.
        call.outcome = { kind: 'returned', connection };
        actualSubject.returnedConnection = connection;
        return connection;
      } catch (cause) {
        call.outcome = { kind: 'threw', cause };
        actualSubject.observed = cause;
        throw cause;
      }
    });
    const reading = spyOn(filesystem, 'readSync');
    restoreFirst = () => {
      opener.mockRestore();
      reading.mockRestore();
    };
    firstPins = captureLowerPins(path);
    try {
      const value = verifySnapshotBounded(path, {
        maxBytes: 1073741824,
        deadline: performance.now() + 10000,
      });
      firstOutcome = { kind: 'returned', value };
    } catch (cause) {
      firstOutcome = { kind: 'threw', cause };
    }
    expect(openerCalls).toHaveLength(1);
    const opening = openerCalls.at(0);
    if (opening === undefined) throw new Error('SC3 identity actual opener absent');
    expect(opening.original).toBe(open);
    expect(opening.args).toEqual([path]);
    expect(opening.outcome.kind).toBe('threw');
    if (opening.outcome.kind !== 'threw')
      throw new Error('SC3 identity wrapper unexpectedly returned a Connection');
    expect(subject.returnedConnection).toBeUndefined();
    expect(retained.size).toBe(1);
    const client = [...retained].at(0);
    if (client === undefined) throw new Error('SC3 identity actual native client absent');
    expect(subject.calls).toHaveLength(1);
    const wrapped = subject.calls.at(0);
    if (wrapped === undefined) throw new Error('SC3 identity actual wrapper call absent');
    expect(wrapped.original).toBe(nativeDrizzle);
    expect(wrapped.entered).toBe(true);
    expect(wrapped.returned).toBe(true);
    expect(wrapped.configuredClient).toBe(client);
    expect(wrapped.wrapper?.$client).toBe(client);
    expect(wrapped.args).toEqual([{ client, logger: undefined }]);
    expect(closeAttempts).toHaveLength(1);
    expect(subject.nativeOutcomes).toHaveLength(1);
    const attempt = subject.nativeOutcomes.at(0);
    if (attempt === undefined) throw new Error('SC3 identity actual native close absent');
    expect(attempt.original).toBe(nativeClose);
    expect(attempt.receiver).toBe(client);
    expect(attempt.args).toEqual([true]);
    expect(attempt.phase).toBe('production');
    expect(attempt.entered).toBe(true);
    expect(attempt.returned).toBe(true);
    expect(attempt.nativeOutcome.kind).toBe('returned');
    expect(reading).toHaveBeenCalledTimes(0);
    firstPins.requireReturned('pinned');
    const lower = opening.outcome.cause;
    expect(lower).toBeInstanceOf(AggregateError);
    if (!(lower instanceof AggregateError))
      throw new Error('SC3 identity genuine lower aggregate absent');
    expect(lower.cause).toBe(subject.primary);
    expect(lower.errors).toEqual([subject.primary, subject.cleanup]);
    expect(lower.errors[0]).toBe(subject.primary);
    expect(lower.errors[1]).toBe(subject.cleanup);
    expect(firstOutcome.kind).toBe('threw');
    if (firstOutcome.kind !== 'threw')
      throw new Error('SC3 identity first snapshot unexpectedly returned');
    const snapshot = firstOutcome.cause;
    expect(snapshot).toBeInstanceOf(AggregateError);
    if (!(snapshot instanceof AggregateError))
      throw new Error('SC3 identity genuine snapshot aggregate absent');
    expect(snapshot.errors).toEqual([lower]);
    expect(snapshot.errors[0]).toBe(lower);
    expect(isSqliteCleanupUnknown(lower)).toBe(true);
    expect(isSnapshotCleanupUnknown(snapshot)).toBe(true);

    // Every first-call native original has returned before changing diagnostics or beginning phase two.
    subject.restoreDrizzle();
    subject.restoreClose();
    restoreFirst();
    firstPins.restore();
    firstRestored = true;
    // The single-wrapper phase is complete; both native clients remain in the ordinary ledger.
    wrapperSubject = undefined;
    const diagnostic = new Error('SC3 replacement public diagnostic');
    lower.errors = [diagnostic];
    lower.cause = diagnostic;
    snapshot.errors = [diagnostic];
    snapshot.cause = diagnostic;
    expect(lower.errors).toEqual([diagnostic]);
    expect(lower.cause).toBe(diagnostic);
    expect(snapshot.errors).toEqual([diagnostic]);
    expect(snapshot.cause).toBe(diagnostic);
    expect(isSqliteCleanupUnknown(lower)).toBe(true);
    expect(isSnapshotCleanupUnknown(snapshot)).toBe(true);
    expect(isSnapshotCleanupUnknown(lower)).toBe(false);
    expect(isSqliteCleanupUnknown(snapshot)).toBe(false);
    const lowerClone: unknown = Object.create(
      Reflect.getPrototypeOf(lower),
      Object.getOwnPropertyDescriptors(lower),
    );
    const snapshotClone: unknown = Object.create(
      Reflect.getPrototypeOf(snapshot),
      Object.getOwnPropertyDescriptors(snapshot),
    );
    const lowerPrototype: unknown = Object.create(Reflect.getPrototypeOf(lower));
    const snapshotPrototype: unknown = Object.create(Reflect.getPrototypeOf(snapshot));
    const ordinaryLower = new AggregateError([subject.primary, subject.cleanup], lower.message, {
      cause: subject.primary,
    });
    const ordinarySnapshot = new AggregateError([lower], snapshot.message, { cause: lower });
    const wrapper = new AggregateError([snapshot], snapshot.message, { cause: snapshot });
    expect(isSqliteCleanupUnknown(lowerClone)).toBe(false);
    expect(isSnapshotCleanupUnknown(lowerClone)).toBe(false);
    expect(isSqliteCleanupUnknown(snapshotClone)).toBe(false);
    expect(isSnapshotCleanupUnknown(snapshotClone)).toBe(false);
    expect(isSqliteCleanupUnknown(lowerPrototype)).toBe(false);
    expect(isSnapshotCleanupUnknown(lowerPrototype)).toBe(false);
    expect(isSqliteCleanupUnknown(snapshotPrototype)).toBe(false);
    expect(isSnapshotCleanupUnknown(snapshotPrototype)).toBe(false);
    expect(isSqliteCleanupUnknown(ordinaryLower)).toBe(false);
    expect(isSnapshotCleanupUnknown(ordinaryLower)).toBe(false);
    expect(isSqliteCleanupUnknown(ordinarySnapshot)).toBe(false);
    expect(isSnapshotCleanupUnknown(ordinarySnapshot)).toBe(false);
    expect(isSqliteCleanupUnknown(wrapper)).toBe(false);
    expect(isSnapshotCleanupUnknown(wrapper)).toBe(false);

    // A second real verifier completes SQL and closes its semantic client before the actual read refusal.
    const ordinary = new AggregateError([lower], lower.message, { cause: lower });
    const read = filesystem.readSync;
    const readingAgain = spyOn(filesystem, 'readSync').mockImplementation(function (
      this: unknown,
      ...args: LowerReadArguments
    ) {
      const semanticClose = secondNativeAttempts.at(0);
      const call: (typeof readCalls)[number] = {
        original: read,
        receiver: this,
        args,
        semanticClose,
        semanticEntered: semanticClose?.entered,
        semanticReturned: semanticClose?.returned,
        semanticOutcome: semanticClose?.nativeOutcome,
        outcome: { kind: 'entered' },
      };
      readCalls.push(call);
      try {
        const count = args.length === 5 ? read(...args) : read(...args);
        call.outcome = { kind: 'returned', count };
      } catch (cause) {
        call.outcome = { kind: 'threw', cause };
        throw cause;
      }
      throw ordinary;
    });
    secondRestorers.push(() => {
      readingAgain.mockRestore();
    });
    const runningAgain = spyOn(Database.prototype, 'run').mockImplementation(function (
      this: Database,
      ...args: Parameters<Database['run']>
    ) {
      retained.add(this);
      if (!secondClients.includes(this)) secondClients.push(this);
      const call: (typeof secondRuns)[number] = {
        receiver: this,
        args,
        outcome: { kind: 'entered' },
      };
      secondRuns.push(call);
      try {
        const value = nativeRun.apply(this, args);
        call.outcome = { kind: 'returned' };
        return value;
      } catch (cause) {
        call.outcome = { kind: 'threw', cause };
        throw cause;
      }
    });
    secondRestorers.push(() => {
      runningAgain.mockRestore();
    });
    const closingAgain = spyOn(Database.prototype, 'close').mockImplementation(function (
      this: Database,
      ...args: Parameters<Database['close']>
    ) {
      const attempt: TaggedNativeClose = {
        original: nativeClose,
        receiver: this,
        args,
        phase: 'production',
        entered: false,
        returned: false,
        nativeOutcome: { kind: 'not-entered' },
      };
      secondNativeAttempts.push(attempt);
      closeAttempts.push(attempt);
      closed.push(this);
      delegateTaggedNativeClose(attempt);
    });
    secondRestorers.push(() => {
      closingAgain.mockRestore();
    });
    const secondOpening = spyOn(connections, 'openReadOnlyConnection').mockImplementation(function (
      this: unknown,
      ...args: Parameters<typeof open>
    ) {
      const call: (typeof secondOpenerCalls)[number] = {
        original: open,
        receiver: this,
        args,
        outcome: { kind: 'entered' },
      };
      secondOpenerCalls.push(call);
      try {
        const connection = call.original.apply(call.receiver, call.args);
        call.outcome = { kind: 'returned', connection };
        return connection;
      } catch (cause) {
        call.outcome = { kind: 'threw', cause };
        throw cause;
      }
    });
    secondRestorers.push(() => {
      secondOpening.mockRestore();
    });
    const secondWrapping = spyOn(bunSqlite, 'drizzle');
    secondRestorers.push(() => {
      secondWrapping.mockRestore();
    });
    secondPins = captureLowerPins(path);
    try {
      const value = verifySnapshotBounded(path, {
        maxBytes: 1073741824,
        deadline: performance.now() + 10000,
      });
      secondOutcome = { kind: 'returned', value };
    } catch (cause) {
      secondOutcome = { kind: 'threw', cause };
    }
    expect(secondRuns).toHaveLength(1);
    expect(secondClients).toHaveLength(1);
    const secondClient = secondClients.at(0);
    if (secondClient === undefined) throw new Error('SC3 identity second actual client absent');
    expect(secondClient).not.toBe(client);
    expect(secondRuns.at(0)?.receiver).toBe(secondClient);
    expect(secondRuns.at(0)?.args).toEqual(['PRAGMA busy_timeout = 5000;']);
    expect(secondRuns.at(0)?.outcome.kind).toBe('returned');
    expect(secondOpenerCalls).toHaveLength(1);
    const secondOpeningCall = secondOpenerCalls.at(0);
    if (secondOpeningCall === undefined)
      throw new Error('SC3 identity second actual opener absent');
    expect(secondOpeningCall.original).toBe(open);
    expect(secondOpeningCall.args).toEqual([path]);
    expect(secondOpeningCall.outcome.kind).toBe('returned');
    if (secondOpeningCall.outcome.kind !== 'returned')
      throw new Error('SC3 identity second opener did not return');
    const secondConnection = secondOpeningCall.outcome.connection;
    expect('$client' in secondConnection.db).toBe(true);
    if (!('$client' in secondConnection.db))
      throw new Error('SC3 identity second wrapper client absent');
    expect(secondConnection.db.$client).toBe(secondClient);
    expect(secondWrapping).toHaveBeenCalledTimes(1);
    expect(secondWrapping.mock.calls.at(0)).toEqual([{ client: secondClient, logger: undefined }]);
    expect(secondNativeAttempts).toHaveLength(1);
    const secondClose = secondNativeAttempts.at(0);
    if (secondClose === undefined) throw new Error('SC3 identity second native close absent');
    expect(secondClose.original).toBe(nativeClose);
    expect(secondClose.receiver).toBe(secondClient);
    expect(secondClose.args).toEqual([]);
    expect(secondClose.entered).toBe(true);
    expect(secondClose.returned).toBe(true);
    expect(secondClose.nativeOutcome.kind).toBe('returned');
    expect(readCalls).toHaveLength(1);
    const actualRead = readCalls.at(0);
    if (actualRead === undefined) throw new Error('SC3 identity actual read absent');
    expect(actualRead.semanticClose).toBe(secondClose);
    expect(actualRead.semanticEntered).toBe(true);
    expect(actualRead.semanticReturned).toBe(true);
    expect(actualRead.semanticOutcome?.kind).toBe('returned');
    expect(actualRead.original).toBe(read);
    expect(actualRead.receiver).toBeUndefined();
    expect(actualRead.args).toHaveLength(5);
    expect(actualRead.args[0] === secondPins.originals.at(1)?.descriptor).toBe(true);
    expect(actualRead.args[1].byteLength).toBe(1048576);
    expect(actualRead.args[2]).toBe(0);
    expect(actualRead.args[3]).toBe(1048576);
    expect(actualRead.args[4]).toBe(0);
    expect(actualRead.outcome.kind).toBe('returned');
    if (actualRead.outcome.kind !== 'returned')
      throw new Error('SC3 identity original read did not return');
    expect(actualRead.outcome.count).toBeGreaterThan(0);
    expect(retained.size).toBe(2);
    expect(retained.has(client)).toBe(true);
    expect(retained.has(secondClient)).toBe(true);
    expect(closeAttempts).toHaveLength(2);
    expect(closeAttempts.at(0)).toBe(attempt);
    expect(closeAttempts.at(1)).toBe(secondClose);
    expect(subject.nativeOutcomes).toHaveLength(1);
    expect(subject.nativeOutcomes.at(0)?.nativeOutcome.kind).toBe('returned');
    secondPins.requireReturned('pinned');
    expect(secondOutcome.kind).toBe('threw');
    if (secondOutcome.kind !== 'threw')
      throw new Error('SC3 identity second snapshot unexpectedly returned');
    expect(secondOutcome.cause).toBe(ordinary);
    expect(ordinary.errors).toEqual([lower]);
    expect(ordinary.errors[0]).toBe(lower);
    expect(ordinary.cause).toBe(lower);
    expect(isSqliteCleanupUnknown(ordinary)).toBe(false);
    expect(isSnapshotCleanupUnknown(ordinary)).toBe(false);
    expect(isSqliteCleanupUnknown(lower)).toBe(true);
    expect(isSnapshotCleanupUnknown(snapshot)).toBe(true);
    bodyOutcome = { kind: 'returned' };
  } catch (cause) {
    bodyOutcome = { kind: 'threw', cause };
    throw cause;
  } finally {
    try {
      // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
      if (subject === undefined) throw new Error('SC3 identity wrapper setup did not complete');
      expect(seedObserver.attempts).toHaveLength(1);
      expect(seedObserver.attempts.at(0)?.receiver).toBe(subject.seed);
      expect(seedObserver.attempts.at(0)?.nativeOutcome.kind).toBe('returned');
      // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
      if (firstPins === undefined) throw new Error('SC3 identity first pinned call did not begin');
      firstPins.requireReturned('pinned');
      if (secondPins !== undefined) secondPins.requireReturned('pinned');
      expect(retained.size).toBe(secondPins === undefined ? 1 : 2);
      expect(closeAttempts).toHaveLength(secondPins === undefined ? 1 : 2);
      expect(subject.nativeOutcomes).toHaveLength(1);
      const attempt = subject.nativeOutcomes.at(0);
      if (
        attempt?.original !== nativeClose ||
        !retained.has(attempt.receiver) ||
        attempt.args.length !== 1 ||
        attempt.args[0] !== true ||
        !attempt.entered ||
        !attempt.returned ||
        attempt.nativeOutcome.kind !== 'returned'
      )
        // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
        throw new Error('SC3 identity native original has no observed return');
      if (secondPins !== undefined) {
        const secondClose = secondNativeAttempts.at(0);
        if (
          secondClients.length !== 1 ||
          secondNativeAttempts.length !== 1 ||
          secondClose?.original !== nativeClose ||
          secondClose.receiver !== secondClients.at(0) ||
          !retained.has(secondClose.receiver) ||
          secondClose.args.length !== 0 ||
          !secondClose.entered ||
          !secondClose.returned ||
          secondClose.nativeOutcome.kind !== 'returned'
        )
          // eslint-disable-next-line no-unsafe-finally -- this retirement guard is caught below and retained with the original body outcome before any native fallback
          throw new Error('SC3 identity second native original has no observed return');
      }
    } catch (cause) {
      stopped = new Error('SC3 STOP: identity fixture originals are not known returned', {
        // tagged exact caught value, including undefined, remains beside each original and native outcome
        cause: {
          failure: { kind: 'threw', cause },
          bodyOutcome,
          firstOutcome,
          secondOutcome,
          seedObserver,
          subject,
          openerCalls,
          readCalls,
          secondClients,
          secondNativeAttempts,
          secondRuns,
          secondOpenerCalls,
          firstPins,
          secondPins,
          retained,
          closeAttempts,
        },
      });
      // eslint-disable-next-line no-unsafe-finally -- STOP preserves all actual originals; afterEach must not attempt fallback cleanup
      throw stopped;
    } finally {
      try {
        for (const restore of [...secondRestorers].reverse()) restore();
        secondPins?.restore();
        if (!firstRestored) {
          subject?.restoreDrizzle();
          subject?.restoreClose();
          restoreFirst?.();
          firstPins?.restore();
          seedObserver.restore();
        }
      } catch (cause) {
        stopped = new Error('SC3 STOP: identity observer restoration failed', {
          // exact caught value stays tagged beside both phases and all original references
          cause: {
            failure: { kind: 'threw', cause },
            bodyOutcome,
            firstOutcome,
            secondOutcome,
            seedObserver,
            subject,
            openerCalls,
            readCalls,
            secondClients,
            secondNativeAttempts,
            secondRuns,
            secondOpenerCalls,
            firstPins,
            secondPins,
            retained,
            closeAttempts,
          },
        });
        // eslint-disable-next-line no-unsafe-finally -- retain restoration ambiguity and block fallback cleanup rather than discard the body outcome
        throw stopped;
      }
    }
  }
});

it('SC3 snapshot retains genuine wrapper cleanup failure', () => {
  const seedObserver = observeSeedClose();
  const subject = prepareWrapperSubject('after', seedObserver);
  const snapshotPath = join(directory, 'wrapper-snapshot.db');
  const partialPath = join(directory, '.wrapper-snapshot.db.partial');
  const originalOpen = connections.openExistingConnection;
  const openerCalls: {
    readonly original: typeof originalOpen;
    readonly receiver: unknown;
    readonly args: Parameters<typeof originalOpen>;
    outcome:
      | { readonly kind: 'entered' }
      | { readonly kind: 'returned'; readonly connection: Connection }
      | { readonly kind: 'threw'; readonly cause: unknown };
  }[] = [];
  const sourceRuns: { readonly receiver: Database; readonly args: Parameters<Database['run']> }[] =
    [];
  const sourceQueries: {
    readonly receiver: Database;
    readonly args: Parameters<Database['query']>;
  }[] = [];
  const opening = spyOn(connections, 'openExistingConnection').mockImplementation(function (
    this: unknown,
    ...args: Parameters<typeof originalOpen>
  ) {
    const call: (typeof openerCalls)[number] = {
      original: originalOpen,
      receiver: this,
      args,
      outcome: { kind: 'entered' },
    };
    openerCalls.push(call);
    try {
      const connection = call.original.apply(call.receiver, call.args);
      call.outcome = { kind: 'returned', connection };
      subject.returnedConnection = connection;
      return connection;
    } catch (cause) {
      call.outcome = { kind: 'threw', cause };
      throw cause;
    }
  });
  const running = spyOn(Database.prototype, 'run').mockImplementation(function (
    this: Database,
    ...args: Parameters<Database['run']>
  ) {
    sourceRuns.push({ receiver: this, args });
    retained.add(this);
    return nativeRun.apply(this, args);
  });
  // eslint-disable-next-line @typescript-eslint/unbound-method -- saved native query is called below with its exact observed receiver and arguments
  const originalQuery = Database.prototype.query;
  const querying = spyOn(Database.prototype, 'query').mockImplementation(function <
    Row,
    Bindings extends SQLQueryBindings | SQLQueryBindings[],
  >(this: Database, ...args: Parameters<Database['query']>) {
    sourceQueries.push({ receiver: this, args });
    const query = originalQuery<Row, Bindings>;
    return query.apply(this, args);
  });
  const descriptorOpen = spyOn(filesystem, 'openSync');
  const publicationRename = spyOn(filesystem, 'renameSync');
  let bodyOutcome:
    | { readonly kind: 'entered' }
    | { readonly kind: 'returned' }
    | { readonly kind: 'threw'; readonly cause: unknown } = { kind: 'entered' };
  let snapshotOutcome:
    | { readonly kind: 'entered' }
    | { readonly kind: 'returned'; readonly snapshot: unknown }
    | { readonly kind: 'threw'; readonly cause: unknown } = { kind: 'entered' };
  try {
    expect(seedObserver.attempts).toHaveLength(1);
    const seedClose = seedObserver.attempts.at(0);
    if (seedClose === undefined) throw new Error('SC3 actual setup native close absent');
    expect(seedClose === subject.seedClose).toBe(true);
    expect(seedClose.original).toBe(nativeClose);
    expect(seedClose.receiver).toBe(subject.seed);
    expect(seedClose.args).toEqual([]);
    expect(seedClose.nativeOutcome).toEqual({ kind: 'returned' });
    expect(seedClose.entered).toBe(true);
    expect(seedClose.returned).toBe(true);
    try {
      const snapshot = snapshotDatabase(path, snapshotPath);
      snapshotOutcome = { kind: 'returned', snapshot };
    } catch (cause) {
      snapshotOutcome = { kind: 'threw', cause };
      subject.observed = cause;
    }
    expect(snapshotOutcome.kind).toBe('threw');
    if (snapshotOutcome.kind !== 'threw') throw new Error('SC3 snapshot unexpectedly returned');
    expect(openerCalls).toHaveLength(1);
    const opener = openerCalls.at(0);
    if (opener === undefined) throw new Error('SC3 actual source opener absent');
    expect(opener.original).toBe(originalOpen);
    expect(opener.args).toEqual([path]);
    expect(opener.outcome.kind).toBe('threw');
    if (opener.outcome.kind !== 'threw')
      throw new Error('SC3 source opener unexpectedly returned a Connection');
    const lower = opener.outcome.cause;
    expect(lower).toBeInstanceOf(AggregateError);
    if (!(lower instanceof AggregateError)) throw new Error('SC3 lower attribution absent');
    expect(lower.cause).toBe(subject.primary);
    expect(lower.errors).toHaveLength(2);
    expect(lower.errors[0]).toBe(subject.primary);
    expect(lower.errors[1]).toBe(subject.cleanup);

    expect(subject.calls).toHaveLength(1);
    const call = subject.calls.at(0);
    if (call?.wrapper === undefined) throw new Error('SC3 actual Drizzle wrapper return absent');
    expect(call.original).toBe(nativeDrizzle);
    expect(call.entered).toBe(true);
    expect(call.returned).toBe(true);
    expect(call.configuredClient).toBe(call.wrapper.$client);
    expect(retained.size).toBe(1);
    expect(retained.has(call.wrapper.$client)).toBe(true);
    expect(subject.returnedConnection).toBeUndefined();
    expect(subject.nativeOutcomes).toHaveLength(1);
    expect(closeAttempts).toHaveLength(1);
    const attempt = subject.nativeOutcomes.at(0);
    if (attempt === undefined) throw new Error('SC3 original native close evidence absent');
    expect(attempt === closeAttempts.at(0)).toBe(true);
    expect(attempt.original).toBe(nativeClose);
    expect(attempt.receiver).toBe(call.wrapper.$client);
    expect(attempt.args).toEqual([true]);
    expect(attempt.phase).toBe('production');
    expect(attempt.nativeOutcome).toEqual({ kind: 'returned' });
    expect(attempt.entered).toBe(true);
    expect(attempt.returned).toBe(true);
    expect(closed).toEqual([call.wrapper.$client]);

    expect(sourceRuns.map((run) => run.receiver)).toEqual([
      call.wrapper.$client,
      call.wrapper.$client,
      call.wrapper.$client,
      call.wrapper.$client,
      call.wrapper.$client,
    ]);
    expect(sourceRuns.map((run) => run.args)).toEqual([
      ['PRAGMA busy_timeout = 5000;'],
      ['PRAGMA busy_timeout = 0;'],
      ['PRAGMA journal_mode = WAL;'],
      ['PRAGMA busy_timeout = 5000;'],
      ['PRAGMA foreign_keys = ON;'],
    ]);
    expect(sourceQueries.map((query) => query.receiver)).toEqual([
      call.wrapper.$client,
      call.wrapper.$client,
      call.wrapper.$client,
      call.wrapper.$client,
    ]);
    expect(sourceQueries.map((query) => query.args)).toEqual([
      ['PRAGMA busy_timeout;'],
      ['PRAGMA journal_mode;'],
      ['PRAGMA busy_timeout;'],
      ['PRAGMA foreign_keys;'],
    ]);
    expect(sourceQueries.some((query) => query.args[0].includes('VACUUM'))).toBe(false);
    expect(descriptorOpen).toHaveBeenCalledTimes(0);
    expect(publicationRename).toHaveBeenCalledTimes(0);
    expect(filesystem.existsSync(partialPath)).toBe(false);
    expect(filesystem.existsSync(snapshotPath)).toBe(false);
    expect(subject.observed).toBe(snapshotOutcome.cause);
    expect(subject.observed).toBeInstanceOf(AggregateError);
    if (!(subject.observed instanceof AggregateError))
      throw new Error('SC3 snapshot attribution absent');
    expect(subject.observed.errors).toHaveLength(1);
    expect(subject.observed.errors[0]).toBe(lower);
    expect(isSqliteCleanupUnknown(lower)).toBe(true);
    expect(isSnapshotCleanupUnknown(subject.observed)).toBe(true);
    bodyOutcome = { kind: 'returned' };
  } catch (cause) {
    bodyOutcome = { kind: 'threw', cause };
    throw cause;
  } finally {
    try {
      opening.mockRestore();
      running.mockRestore();
      querying.mockRestore();
      descriptorOpen.mockRestore();
      publicationRename.mockRestore();
      subject.restoreDrizzle();
      subject.restoreClose();
    } catch (cause) {
      stopped = new Error('SC3 STOP: wrapper observer restoration failed', {
        cause: {
          failure: { kind: 'threw', cause },
          bodyOutcome,
          snapshotOutcome,
          seedObserver,
          subject,
          openerCalls,
          sourceRuns,
          sourceQueries,
          closeAttempts,
        },
      });
      // eslint-disable-next-line no-unsafe-finally -- restoration STOP retains exact body and originals before blocking fallback cleanup
      throw stopped;
    }
  }
});
