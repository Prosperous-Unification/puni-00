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
import type { Logger } from 'drizzle-orm';
import * as bunSqlite from 'drizzle-orm/bun-sqlite';

import { activateDependencies } from './cross-project-dependency-activation';
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
function prepareWrapperSubject(fault: WrapperSubject['fault']): WrapperSubject {
  path = join(directory, 'wrapper.db');
  const seed = openDatabase(path);
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
  spyOn(bunSqlite, 'drizzle').mockImplementation(
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
  spyOn(Database.prototype, 'close').mockImplementation(function (
    this: Database,
    ...args: Parameters<Database['close']>
  ) {
    closed.push(this);
    const attempt: NativeCloseAttempt = {
      original: nativeClose,
      receiver: this,
      args,
      phase: 'production',
      entered: false,
      returned: false,
    };
    closeAttempts.push(attempt);
    if (subject.fault === 'before') throw subject.cleanup;
    attempt.entered = true;
    attempt.original.apply(attempt.receiver, attempt.args);
    attempt.returned = true;
    if (subject.fault === 'after') throw subject.cleanup;
  });
  return subject;
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
