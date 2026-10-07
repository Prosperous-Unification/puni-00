import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { dlopen, FFIType, toArrayBuffer } from 'bun:ffi';
import { Database } from 'bun:sqlite';

import { hashCanonical } from '../evidence/content-manifest';
import { readBootstrapConfiguration, type TrustedBootstrapPin } from './bootstrap';
import { openActivationController } from './controller';
import { type GitHubRepositoryBinding, validateGitHubRepositoryBinding } from './github-source';

const { symbols } = dlopen('libc.so.6', {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  __errno_location: { args: [], returns: FFIType.ptr },
});
const LockExclusiveNonblocking = 2 | 4;
// Linux O_CLOEXEC is absent from Node's cross-platform constants typing.
const CloseOnExec = 0o2000000;
const SchedulePolicy = type({
  maxAttempts: 'number.integer>=1',
  wholeTickMs: 'number.integer>=1',
}).onUndeclaredKey('reject');
const ScheduleRow = type({
  singleton: '1',
  repository_id: 'number.integer>=1',
  configuration_identity: /^[0-9a-f]{64}$/,
  attempt_sequence: 'number.integer>=0',
  burst_attempts: 'number.integer>=0',
  last_started_at: 'number.integer>=0|null',
}).onUndeclaredKey('reject');

export interface ObservationStateConfig {
  readonly stateDirectory: string;
  readonly bootstrapPath: string;
  readonly pin: TrustedBootstrapPin;
  readonly binding: GitHubRepositoryBinding;
  readonly policy: { readonly maxAttempts: number; readonly wholeTickMs: number };
  readonly clock: () => number;
}

export interface ObservationAttempt {
  readonly sequence: number;
}

interface PreparedState {
  readonly directory: string;
  readonly databasePath: string;
  readonly repositoryId: number;
  readonly configurationIdentity: string;
  readonly maxAttempts: number;
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

function inspectProtected(path: string, directory: boolean): void {
  if (!isAbsolute(path)) throw new Error('observation protected path must be absolute');
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(path);
  } catch (cause) {
    if (isAbsent(cause)) throw new Error(`observation protected path absent: ${path}`, { cause });
    throw new Error(`observation protected path unreadable: ${path}`, { cause });
  }
  const expectedMode = directory ? 0o700 : 0o600;
  if (
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    entry.isSymbolicLink() ||
    entry.uid !== process.getuid?.() ||
    // Proof: omitting mode validation let a 0755 state/config path initialize.
    (entry.mode & 0o777) !== expectedMode
  ) {
    throw new Error(`observation protected path malformed: ${path}`);
  }
}

function prepare(config: ObservationStateConfig): PreparedState {
  inspectProtected(config.stateDirectory, true);
  inspectProtected(config.bootstrapPath, false);
  // Proof: omitting the pinned read initialized state under wrong bootstrap bytes.
  readBootstrapConfiguration(config.bootstrapPath, config.pin);
  const binding = validateGitHubRepositoryBinding(config.binding);
  const policy = parseOrThrow(SchedulePolicy, config.policy);
  if (policy.maxAttempts > 100 || policy.wholeTickMs > 3_600_000) {
    throw new Error('observation schedule policy exceeds bounded limit');
  }
  return {
    directory: config.stateDirectory,
    databasePath: join(config.stateDirectory, 'activation.sqlite'),
    repositoryId: binding.repositoryId,
    configurationIdentity: hashCanonical({ binding, pin: config.pin, policy }),
    maxAttempts: policy.maxAttempts,
  };
}

async function settleWithCleanup<T>(work: () => T | Promise<T>, cleanup: () => void): Promise<T> {
  let outcome:
    | { readonly kind: 'value'; readonly value: T }
    | { readonly kind: 'failure'; readonly cause: unknown };
  try {
    outcome = { kind: 'value', value: await work() };
  } catch (cause) {
    outcome = { kind: 'failure', cause };
  }
  try {
    cleanup();
  } catch (cleanupFailure) {
    // Proof: discarding the work cause made a mounted database close failure
    // replace the original observation failure instead of retaining both.
    if (outcome.kind === 'failure') {
      throw new AggregateError(
        [outcome.cause, cleanupFailure],
        'observation work and cleanup failed',
        { cause: cleanupFailure },
      );
    }
    throw cleanupFailure;
  }
  if (outcome.kind === 'failure') throw outcome.cause;
  return outcome.value;
}

async function withLock<T>(
  directory: string,
  work: () => T | Promise<T>,
): Promise<{ readonly kind: 'busy' } | { readonly kind: 'owned'; readonly value: T }> {
  inspectProtected(directory, true);
  const lockPath = join(directory, 'observation.lock');
  const descriptor = openSync(
    lockPath,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | CloseOnExec,
    0o600,
  );
  return settleWithCleanup(
    async () => {
      const opened = fstatSync(descriptor);
      const named = lstatSync(lockPath);
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.uid !== process.getuid?.() ||
        (opened.mode & 0o777) !== 0o600 ||
        opened.dev !== named.dev ||
        opened.ino !== named.ino
      )
        throw new Error('observation lock inode malformed');
      // Proof: omitting flock let the real probe process run during the held owner;
      // removing the stable inode or closing before work settled did the same.
      if (symbols.flock(descriptor, LockExclusiveNonblocking) !== 0) {
        const errnoPointer = symbols.__errno_location();
        if (errnoPointer === null) throw new Error('observation lock errno unavailable');
        const errno = new DataView(toArrayBuffer(errnoPointer, 0, 4)).getInt32(0, true);
        // Proof: treating contention as an error made the real second process
        // exit instead of returning the explicit busy outcome.
        if (errno === 11) return { kind: 'busy' };
        throw new Error(`observation lock unavailable: errno ${String(errno)}`);
      }
      return { kind: 'owned', value: await work() };
    },
    () => {
      // Proof: moving this close ahead of awaited work let the second process run.
      // The inode is never removed; the kernel releases ownership on process death.
      closeSync(descriptor);
    },
  );
}

function createSchedule(database: Database, state: PreparedState): void {
  database.run(`CREATE TABLE activation_observation_schedule (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    repository_id INTEGER NOT NULL,
    configuration_identity TEXT NOT NULL,
    attempt_sequence INTEGER NOT NULL CHECK (attempt_sequence >= 0),
    burst_attempts INTEGER NOT NULL CHECK (burst_attempts >= 0),
    last_started_at INTEGER
  )`);
  database
    .query(
      `INSERT INTO activation_observation_schedule
    (singleton, repository_id, configuration_identity, attempt_sequence, burst_attempts, last_started_at)
    VALUES (1, ?, ?, 0, 0, NULL)`,
    )
    .run(state.repositoryId, state.configurationIdentity);
  database.run('PRAGMA user_version = 9');
}

function readVersion(database: Database): number {
  const raw: unknown = database.query('PRAGMA user_version').get();
  return parseOrThrow(type({ user_version: 'number.integer>=0' }), raw).user_version;
}

function assertActivationSchema(database: Database): void {
  const health: unknown = database.query('PRAGMA quick_check').get();
  if (parseOrThrow(type({ quick_check: 'string' }), health).quick_check !== 'ok') {
    throw new Error('observation state corrupt');
  }
  const mandatory = [
    'activation_request',
    'activation_delivery',
    'activation_subject',
    'activation_obligation',
    'activation_attempt',
    'activation_review_attempt',
    'activation_review_dispatch',
    'activation_check_dispatch',
  ];
  for (const name of mandatory) {
    const found: unknown = database
      .query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(name);
    // Proof: omitting this table check let a scheduled callback run after
    // activation_delivery was removed from an otherwise version-9 store.
    if (found === null) throw new Error(`observation state partial: ${name}`);
  }
}

function readSchedule(database: Database, state: PreparedState): typeof ScheduleRow.infer {
  if (readVersion(database) !== 9) throw new Error('observation state schema unsupported');
  assertActivationSchema(database);
  const raw: unknown = database.query('SELECT * FROM activation_observation_schedule').get();
  if (raw === null) throw new Error('observation scheduler record absent');
  const row = parseOrThrow(ScheduleRow, raw);
  // Proof: omitting the binding comparison let wrong repository/policy config
  // spend an attempt in the mounted persisted-store test.
  if (
    row.repository_id !== state.repositoryId ||
    row.configuration_identity !== state.configurationIdentity
  ) {
    throw new Error('observation scheduler binding changed');
  }
  return row;
}

function openEstablished(state: PreparedState): Database {
  try {
    inspectProtected(state.databasePath, false);
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('observation protected path absent:')) {
      // Proof: breaking this absent-store boundary created a database during a
      // refused scheduled invocation; the test requires no file after refusal.
      throw new Error('observation state absent', { cause });
    }
    throw cause;
  }
  let database: Database;
  try {
    database = new Database(state.databasePath, { create: false, strict: true });
  } catch (cause) {
    throw new Error('observation state unreadable', { cause });
  }
  try {
    readSchedule(database, state);
    return database;
  } catch (cause) {
    database.close();
    throw cause;
  }
}

/** Explicit fresh-store creation. It never overwrites an existing database. */
export async function initializeObservationState(
  config: ObservationStateConfig,
): Promise<'initialized' | 'busy'> {
  const locked = await withLock(config.stateDirectory, () => {
    const state = prepare(config);
    try {
      lstatSync(state.databasePath);
      // Proof: omitting this named exclusion changed refusal to EEXIST; the
      // no-replace link still kept established malformed bytes unchanged.
      throw new Error('observation state already exists');
    } catch (cause) {
      if (!isAbsent(cause)) throw cause;
    }
    const temporary = `${state.databasePath}.initializing-${randomUUID()}`;
    try {
      const controller = openActivationController({
        databasePath: temporary,
        bootstrapPath: config.bootstrapPath,
        pin: config.pin,
        clock: config.clock,
        readyCandidates: () => Promise.resolve([]),
        currentCandidate: () => Promise.reject(new Error('initialization has no provider read')),
        selectObligations: () => {
          throw new Error('initialization has no evaluation');
        },
      });
      controller.close();
      const database = new Database(temporary, { create: false, strict: true });
      try {
        database.run('BEGIN IMMEDIATE');
        try {
          createSchedule(database, state);
          database.run('COMMIT');
        } catch (cause) {
          database.run('ROLLBACK');
          throw cause;
        }
      } finally {
        database.close();
      }
      chmodSync(temporary, 0o600);
      // Hard-link creation has no replace semantics; a newly appeared final path refuses.
      linkSync(temporary, state.databasePath);
      return 'initialized' as const;
    } finally {
      rmSync(temporary, { force: true });
    }
  });
  return locked.kind === 'busy' ? 'busy' : locked.value;
}

/** Explicit additive v8-to-v9 upgrade; a scheduled open never invokes this operation. */
export async function migrateObservationState(
  config: ObservationStateConfig,
  afterScheduleWrite?: () => void,
): Promise<'migrated' | 'busy'> {
  const locked = await withLock(config.stateDirectory, () => {
    const state = prepare(config);
    inspectProtected(state.databasePath, false);
    const database = new Database(state.databasePath, { create: false, strict: true });
    try {
      // Proof: a partial v8 source refuses before adding the scheduler table.
      if (readVersion(database) !== 8) throw new Error('observation migration requires version 8');
      assertActivationSchema(database);
      const foreign: unknown = database
        .query('SELECT 1 FROM activation_request WHERE repository_id <> ? LIMIT 1')
        .get(state.repositoryId);
      // Proof: omitting this join migrated a store containing another repository.
      if (foreign !== null) throw new Error('observation migration source repository changed');
      database.run('BEGIN IMMEDIATE');
      try {
        // Proof: committing here before the injected late failure retained v9
        // schema instead of rolling back the complete additive migration.
        createSchedule(database, state);
        afterScheduleWrite?.();
        database.run('COMMIT');
      } catch (cause) {
        database.run('ROLLBACK');
        throw cause;
      }
      return 'migrated' as const;
    } finally {
      database.close();
    }
  });
  return locked.kind === 'busy' ? 'busy' : locked.value;
}

/** Reserves a durable scheduler attempt before any caller-supplied observation work. */
export async function withObservationAttempt<T>(
  config: ObservationStateConfig,
  work: (attempt: ObservationAttempt) => Promise<T>,
): Promise<{ readonly kind: 'busy' } | { readonly kind: 'owned'; readonly value: T }> {
  return withLock(config.stateDirectory, async () => {
    const state = prepare(config);
    const database = openEstablished(state);
    return settleWithCleanup(
      async () => {
        const now = config.clock();
        if (!Number.isSafeInteger(now) || now < 0) throw new Error('observation clock malformed');
        database.run('BEGIN IMMEDIATE');
        let sequence: number;
        try {
          const row = readSchedule(database, state);
          // Proof: omitting this budget check let a third persisted attempt begin.
          if (row.burst_attempts >= state.maxAttempts)
            throw new Error('observation attempt budget exhausted');
          sequence = row.attempt_sequence + 1;
          if (!Number.isSafeInteger(sequence))
            throw new Error('observation attempt sequence overflow');
          database
            .query(
              `UPDATE activation_observation_schedule SET
          attempt_sequence = ?, burst_attempts = burst_attempts + 1, last_started_at = ?
          WHERE singleton = 1`,
            )
            // Proof: failing to persist the new sequence made the post-crash
            // attempt reuse sequence 1 rather than advance to sequence 2.
            .run(sequence, now);
          database.run('COMMIT');
        } catch (cause) {
          database.run('ROLLBACK');
          throw cause;
        }
        return work({ sequence });
      },
      () => {
        database.close();
      },
    );
  });
}
