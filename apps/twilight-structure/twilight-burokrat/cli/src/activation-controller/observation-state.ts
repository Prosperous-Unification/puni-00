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
import { isAbsolute, join, resolve, sep } from 'node:path';

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
// Proof: accepting zero for either finite policy field let the mounted lower-bound
// fixture pass initialization instead of refusing the missing budget/deadline.
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
  // Proof: removing lexical normalization admitted an absolute `directory/.` alias.
  if (!isAbsolute(path) || resolve(path) !== path)
    throw new Error('observation protected path must be canonical absolute');
  let ancestor: string = sep;
  for (const component of path.split(sep).filter(Boolean)) {
    ancestor = join(ancestor, component);
    let entry: ReturnType<typeof lstatSync>;
    try {
      entry = lstatSync(ancestor);
    } catch (cause) {
      if (isAbsent(cause))
        throw new Error(`observation protected path absent: ${ancestor}`, { cause });
      throw new Error(`observation protected path unreadable: ${ancestor}`, { cause });
    }
    // Proof: removing this component check admitted the nested path through a
    // symlinked ancestor even though its final directory was ordinary.
    if (entry.isSymbolicLink()) throw new Error(`observation protected path symlink: ${ancestor}`);
    if (ancestor !== path && !entry.isDirectory())
      throw new Error(`observation protected ancestor malformed: ${ancestor}`);
    // Proof: omitting replaceability refusal admitted a 0777 non-sticky parent.
    if (ancestor !== path && (entry.mode & 0o022) !== 0 && (entry.mode & 0o1000) === 0)
      throw new Error(`observation protected ancestor replaceable: ${ancestor}`);
  }
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(path);
  } catch (cause) {
    if (isAbsent(cause)) throw new Error(`observation protected path absent: ${path}`, { cause });
    throw new Error(`observation protected path unreadable: ${path}`, { cause });
  }
  const expectedMode = directory ? 0o700 : 0o600;
  if (
    // Proof: omitting type changed a named refusal to ENOTDIR before lock open;
    // this is diagnostic specificity, not an observed authority grant.
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    entry.isSymbolicLink() ||
    // Proof: omitting link count let a second protected directory operate on
    // the same hard-linked database under a different lock inode.
    (!directory && entry.nlink !== 1) ||
    // Proof: a mounted UID mismatch reached initialization when this check
    // was removed; the fixture restores process.getuid after the attempt.
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
  // Proof: independently omitting either ceiling admitted its out-of-bound
  // configured value in the mounted policy test.
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

function rethrowWithCleanup(cause: unknown, cleanup: () => void): never {
  try {
    cleanup();
  } catch (cleanupFailure) {
    // Proof: omitting the primary cause lost schema-open or rollback failure
    // when their corresponding cleanup was independently injected to fail.
    throw new AggregateError([cause, cleanupFailure], 'observation work and cleanup failed', {
      cause: cleanupFailure,
    });
  }
  throw cause;
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
        // Proof: omitting link count admitted a hard-linked lock inode.
        opened.nlink !== 1 ||
        // Proof: independently injected wrong lock UID reached initialization
        // when this owner comparison was removed.
        opened.uid !== process.getuid?.() ||
        // Proof: omitting the lock mode comparison admitted a 0644 lock file.
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
  const requiredColumns = {
    activation_request:
      'request_identity repository_id subject_key request_bytes bootstrap_identity stage version lease_epoch lease_owner lease_expires_at evaluation_plan_identity evidence_set_identity pairing_version current',
    activation_delivery: 'source_id delivery_id payload_digest',
    activation_subject: 'repository_id subject_key high_water_generation observation_version',
    activation_obligation:
      'request_identity obligation_identity kind review_id executor_id protocol_identity command_identity phase attempt state receipt_identity',
    activation_attempt:
      'request_identity obligation_identity attempt receipt_identity receipt_bytes authentication_bytes status',
    activation_review_attempt: 'request_identity review_id attempt invocation_id',
    activation_review_dispatch:
      'effect_key request_identity plan_identity review_id attempt invocation_id cold_obligation_identity informed_obligation_identity authority_identity target_bytes payload_bytes payload_digest created_at deadline_at max_dispatch_attempts state owner_epoch owner_id version',
    activation_review_dispatch_progress:
      'effect_key state dispatch_attempts owner_epoch owner_id version',
    activation_review_dispatch_fact: 'effect_key observation_bytes observation_digest',
    // Proof: removing either of these inventory entries admitted a v9 store
    // missing that check table and let scheduled caller work run.
    activation_check_attempt: 'request_identity obligation_identity attempt invocation_id',
    activation_check_dispatch:
      'effect_key request_identity plan_identity obligation_identity attempt invocation_id command_identity protocol_identity manifest_bytes toolchain_identity sandbox_profile_identity authority_identity target_bytes payload_bytes payload_digest created_at deadline_at max_dispatch_attempts',
    activation_check_dispatch_progress:
      'effect_key state dispatch_attempts owner_epoch owner_id version',
    activation_check_dispatch_fact: 'effect_key observation_bytes observation_digest',
  } as const;
  for (const [name, columns] of Object.entries(requiredColumns)) {
    const found: unknown = database
      .query("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(name);
    // Proof: omitting this table check let a scheduled callback run after
    // activation_delivery was removed from an otherwise version-9 store.
    if (found === null) throw new Error(`observation state partial: ${name}`);
    const definition = parseOrThrow(type({ sql: 'string' }), found).sql;
    const actualColumns: unknown = database.query(`PRAGMA table_info(${name})`).all();
    const columnNames = parseOrThrow(type({ name: 'string' }).array(), actualColumns);
    // Proof: omitting column inventory admitted a delivery table without payload_digest.
    if (
      columnNames
        .map((column) => column.name)
        .sort()
        .join(' ') !== columns.split(' ').sort().join(' ')
    )
      throw new Error(`observation state partial columns: ${name}`);
    // Proof: omitting this DDL constraint check admitted an unconstrained
    // check-dispatch progress table with all expected column names.
    if (
      [
        'activation_request',
        'activation_subject',
        'activation_obligation',
        'activation_attempt',
        'activation_review_dispatch',
        'activation_review_dispatch_progress',
        'activation_check_attempt',
        'activation_check_dispatch',
        'activation_check_dispatch_progress',
      ].includes(name) &&
      !definition.includes('CHECK')
    )
      throw new Error(`observation state partial constraints: ${name}`);
  }
  for (const name of ['activation_current_subject', 'activation_dispatch_request']) {
    const index: unknown = database
      .query("SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = ?")
      .get(name);
    // Proof: omitting index inventory admitted a store missing activation_dispatch_request.
    if (index === null) throw new Error(`observation state partial index: ${name}`);
  }
}

function readSchedule(database: Database, state: PreparedState): typeof ScheduleRow.infer {
  // Proof: omitting this version check let a version-ten store spend an attempt.
  if (readVersion(database) !== 9) throw new Error('observation state schema unsupported');
  assertActivationSchema(database);
  const raw: unknown = database.query('SELECT * FROM activation_observation_schedule').get();
  if (raw === null) throw new Error('observation scheduler record absent');
  const row = parseOrThrow(ScheduleRow, raw);
  // Proof: independent equality and null-time omissions each admitted one
  // corrupted scheduler record and ran caller work.
  if (
    !Number.isSafeInteger(row.attempt_sequence) ||
    !Number.isSafeInteger(row.burst_attempts) ||
    row.attempt_sequence !== row.burst_attempts ||
    (row.attempt_sequence === 0) !== (row.last_started_at === null) ||
    (row.last_started_at !== null && !Number.isSafeInteger(row.last_started_at))
  )
    throw new Error('observation scheduler record malformed');
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
    rethrowWithCleanup(cause, () => {
      database.close();
    });
  }
}

/** Explicit fresh-store creation. It never overwrites an existing database. */
export async function initializeObservationState(
  config: ObservationStateConfig,
): Promise<'initialized' | 'busy'> {
  const locked = await withLock(config.stateDirectory, async () => {
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
    return settleWithCleanup(
      async () => {
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
        await settleWithCleanup(
          () => {
            database.run('BEGIN IMMEDIATE');
            try {
              createSchedule(database, state);
              database.run('COMMIT');
            } catch (cause) {
              rethrowWithCleanup(cause, () => {
                database.run('ROLLBACK');
              });
            }
          },
          () => {
            database.close();
          },
        );
        chmodSync(temporary, 0o600);
        // Hard-link creation has no replace semantics; a newly appeared final path refuses.
        linkSync(temporary, state.databasePath);
        return 'initialized' as const;
      },
      () => {
        rmSync(temporary, { force: true });
      },
    );
  });
  return locked.kind === 'busy' ? 'busy' : locked.value;
}

/** Explicit additive v8-to-v9 upgrade; a scheduled open never invokes this operation. */
export async function migrateObservationState(
  config: ObservationStateConfig,
  afterScheduleWrite?: () => void,
): Promise<'migrated' | 'busy'> {
  const locked = await withLock(config.stateDirectory, async () => {
    const state = prepare(config);
    inspectProtected(state.databasePath, false);
    const database = new Database(state.databasePath, { create: false, strict: true });
    return settleWithCleanup(
      () => {
        // Proof: moving BEGIN after the repository preflight let a subject row
        // committed at write-turn acquisition escape the foreign-history check.
        database.run('BEGIN IMMEDIATE');
        try {
          // Proof: a partial v8 source refuses before adding the scheduler table.
          if (readVersion(database) !== 8)
            throw new Error('observation migration requires version 8');
          assertActivationSchema(database);
          const foreign: unknown = database
            .query(
              `SELECT 1 FROM activation_request WHERE repository_id <> ?
          UNION ALL SELECT 1 FROM activation_subject WHERE repository_id <> ? LIMIT 1`,
            )
            .get(state.repositoryId, state.repositoryId);
          // Proof: omitting this join migrated a store containing another repository.
          // The same predicate covers request rows and subject-only closed tombstones;
          // omitting the subject branch independently migrated foreign history.
          if (foreign !== null) throw new Error('observation migration source repository changed');
          // Proof: committing here before the injected late failure retained v9
          // schema instead of rolling back the complete additive migration.
          createSchedule(database, state);
          afterScheduleWrite?.();
          database.run('COMMIT');
        } catch (cause) {
          rethrowWithCleanup(cause, () => {
            database.run('ROLLBACK');
          });
        }
        return 'migrated' as const;
      },
      () => {
        database.close();
      },
    );
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
        // Proof: omitting integer or negative validation separately let an
        // invalid clock spend an attempt in the mounted policy fixture.
        if (!Number.isSafeInteger(now) || now < 0) throw new Error('observation clock malformed');
        database.run('BEGIN IMMEDIATE');
        let sequence: number;
        try {
          const row = readSchedule(database, state);
          // Proof: omitting this budget check let a third persisted attempt begin.
          if (row.burst_attempts >= state.maxAttempts)
            throw new Error('observation attempt budget exhausted');
          sequence = row.attempt_sequence + 1;
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
