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
import { GitHubReadFailure } from './github-reader';
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
  // Proof: changing the lower bound to zero let an unbounded/empty-workload
  // policy initialize in the mounted policy fixture.
  maxSubjects: 'number.integer>=1',
}).onUndeclaredKey('reject');
const RecoveryPolicy = type({
  maxAttempts: 'number.integer>=1',
  wholeTickMs: 'number.integer>=1',
  maxSubjects: 'number.integer>=1',
  // Proof: defaulting a missing delay or admitting zero let the corresponding
  // mounted migration fixture succeed instead of refusing trusted policy.
  initialDelayMs: 'number.integer>=1',
  maxDelayMs: 'number.integer>=1',
  fallbackDelayMs: 'number.integer>=1',
  recoveryProbeMs: 'number.integer>=1',
  horizonMs: 'number.integer>=1',
}).onUndeclaredKey('reject');
const ScheduleRow = type({
  singleton: '1',
  repository_id: 'number.integer>=1',
  configuration_identity: /^[0-9a-f]{64}$/,
  attempt_sequence: 'number.integer>=0',
  burst_attempts: 'number.integer>=0',
  last_started_at: 'number.integer>=0|null',
}).onUndeclaredKey('reject');
const RecoveryRow = type({
  singleton: '1',
  repository_id: 'number.integer>=1',
  configuration_identity: /^[0-9a-f]{64}$/,
  legacy_watermark: 'number.integer>=0',
  active_sequence: 'number.integer>=1|null',
  health: "'unknown'|'healthy'|'failed'",
  mode: "'burst'|'recovery'",
  provider_not_before: 'number.integer>=0|null',
  next_attempt_at: 'number.integer>=0|null',
  last_clock_at: 'number.integer>=0|null',
  last_failure_sequence: 'number.integer>=1|null',
  last_success_sequence: 'number.integer>=1|null',
}).onUndeclaredKey('reject');
const AttemptRow = type({
  sequence: 'number.integer>=1',
  configuration_identity: /^[0-9a-f]{64}$/,
  started_at: 'number.integer>=0',
  kind: "'burst'|'recovery'",
  outcome: "'complete'|'cancelled'|'provider-failure'|'local-failure'|'interrupted'|null",
  classification: 'string|null',
  finished_at: 'number.integer>=0|null',
  provider_not_before: 'number.integer>=0|null',
}).onUndeclaredKey('reject');

export interface ObservationStateConfig {
  readonly stateDirectory: string;
  readonly bootstrapPath: string;
  readonly pin: TrustedBootstrapPin;
  readonly binding: GitHubRepositoryBinding;
  readonly policy: {
    readonly maxAttempts: number;
    readonly wholeTickMs: number;
    readonly maxSubjects: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly fallbackDelayMs?: number;
    readonly recoveryProbeMs?: number;
    readonly horizonMs?: number;
  };
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

interface PreparedRecoveryState extends PreparedState {
  readonly legacyConfigurationIdentity: string;
  readonly policy: typeof RecoveryPolicy.infer;
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

function inspectProtected(path: string, directory: boolean): void {
  // Proof: removing lexical normalization admitted an absolute `directory/.` alias.
  if (!isAbsolute(path) || resolve(path) !== path)
    throw new Error('observation protected path must be canonical absolute');
  const serviceUid = process.getuid?.();
  if (serviceUid === undefined) throw new Error('observation requires a POSIX owner identity');
  const rootUid = lstatSync(sep).uid;
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
    // Proof: removing this component check changed the nested-link refusal
    // to the later ancestor-type diagnostic; it did not admit work.
    if (entry.isSymbolicLink()) throw new Error(`observation protected path symlink: ${ancestor}`);
    if (ancestor !== path && !entry.isDirectory())
      throw new Error(`observation protected ancestor malformed: ${ancestor}`);
    // Proof: omitting owner validation admitted a foreign-owned 0755 or
    // sticky 1777 ancestor whose owner could replace the protected child.
    if (entry.uid !== rootUid && entry.uid !== serviceUid)
      throw new Error(`observation protected ancestor owner changed: ${ancestor}`);
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
  const policy = parseOrThrow(SchedulePolicy, {
    maxAttempts: config.policy.maxAttempts,
    wholeTickMs: config.policy.wholeTickMs,
    maxSubjects: config.policy.maxSubjects,
  });
  // Proof: independently omitting either ceiling admitted its out-of-bound
  // configured value in the mounted policy test.
  // Proof: omitting this subject ceiling let 10,001 subjects initialize,
  // despite the finite trusted workload policy.
  if (policy.maxAttempts > 100 || policy.wholeTickMs > 3_600_000 || policy.maxSubjects > 10_000) {
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

function prepareRecovery(config: ObservationStateConfig): PreparedRecoveryState {
  const legacy = prepare(config);
  // Proof: injecting a fallback for absent initialDelayMs migrated the
  // missing-policy fixture, whereas the required parser refuses it.
  const policy = parseOrThrow(RecoveryPolicy, config.policy);
  // Proof: independently removing each initial/max/recovery/fallback ordering
  // or the horizon ceiling let its named invalid-policy fixture migrate v10.
  if (
    policy.initialDelayMs > policy.maxDelayMs ||
    policy.maxDelayMs > policy.recoveryProbeMs ||
    policy.recoveryProbeMs > policy.horizonMs ||
    policy.fallbackDelayMs > policy.horizonMs ||
    policy.horizonMs > 86_400_000
  )
    throw new Error('observation retry policy malformed');
  return {
    ...legacy,
    legacyConfigurationIdentity: legacy.configurationIdentity,
    configurationIdentity: hashCanonical({ binding: config.binding, pin: config.pin, policy }),
    policy,
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
  beforeRelease?: () => void,
): Promise<{ readonly kind: 'busy' } | { readonly kind: 'owned'; readonly value: T }> {
  inspectProtected(directory, true);
  const lockPath = join(directory, 'observation.lock');
  const descriptor = openSync(
    lockPath,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | CloseOnExec,
    0o600,
  );
  let owned = false;
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
      owned = true;
      return { kind: 'owned', value: await work() };
    },
    () => {
      // Proof: skipping the lock-held release callback let synchronous
      // controller close return after cleanup expiry before fatal exit.
      if (owned) beforeRelease?.();
      // Proof: moving this close ahead of awaited work let the second process run.
      // The inode is never removed; the kernel releases ownership on process death.
      closeSync(descriptor);
    },
  );
}

const ScheduleDefinition = `CREATE TABLE activation_observation_schedule (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    repository_id INTEGER NOT NULL,
    configuration_identity TEXT NOT NULL,
    attempt_sequence INTEGER NOT NULL CHECK (attempt_sequence >= 0),
    burst_attempts INTEGER NOT NULL CHECK (burst_attempts >= 0),
    last_started_at INTEGER
  )`;

const RecoveryDefinition = `CREATE TABLE activation_observation_recovery (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    repository_id INTEGER NOT NULL,
    configuration_identity TEXT NOT NULL,
    legacy_watermark INTEGER NOT NULL CHECK (legacy_watermark >= 0),
    active_sequence INTEGER,
    health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'failed')),
    mode TEXT NOT NULL CHECK (mode IN ('burst', 'recovery')),
    provider_not_before INTEGER,
    next_attempt_at INTEGER,
    last_clock_at INTEGER,
    last_failure_sequence INTEGER,
    last_success_sequence INTEGER
  )`;
const AttemptDefinition = `CREATE TABLE activation_observation_attempt (
    sequence INTEGER PRIMARY KEY CHECK (sequence >= 1),
    configuration_identity TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('burst', 'recovery')),
    outcome TEXT CHECK (outcome IN ('complete', 'cancelled', 'provider-failure', 'local-failure', 'interrupted')),
    classification TEXT,
    finished_at INTEGER,
    provider_not_before INTEGER
  )`;

/** Explicit additive v9-to-v10 recovery upgrade; no scheduled invocation performs migration. */
export async function migrateObservationRecoveryState(
  config: ObservationStateConfig,
  afterRecoveryWrite?: () => void,
): Promise<'migrated' | 'busy'> {
  const locked = await withLock(config.stateDirectory, async () => {
    const recovery = prepareRecovery(config);
    inspectProtected(recovery.databasePath, false);
    const database = new Database(recovery.databasePath, { create: false, strict: true });
    return settleWithCleanup(
      () => {
        database.run('BEGIN IMMEDIATE');
        try {
          const legacy = readSchedule(database, {
            ...recovery,
            configurationIdentity: recovery.legacyConfigurationIdentity,
          });
          database.run(RecoveryDefinition);
          database.run(AttemptDefinition);
          database
            .query(
              `INSERT INTO activation_observation_recovery
               (singleton, repository_id, configuration_identity, legacy_watermark,
                active_sequence, health, mode, provider_not_before, next_attempt_at,
                last_clock_at, last_failure_sequence, last_success_sequence)
               VALUES (1, ?, ?, ?, NULL, 'unknown', ?, NULL, ?, ?, NULL, NULL)`,
            )
            .run(
              recovery.repositoryId,
              recovery.configurationIdentity,
              legacy.attempt_sequence,
              legacy.burst_attempts >= recovery.maxAttempts ? 'recovery' : 'burst',
              legacy.last_started_at === null
                ? null
                : requireFuture(legacy.last_started_at, recovery.policy.recoveryProbeMs),
              legacy.last_started_at,
            );
          database
            .query(
              `UPDATE activation_observation_schedule SET configuration_identity = ? WHERE singleton = 1`,
            )
            .run(recovery.configurationIdentity);
          database.run('PRAGMA user_version = 10');
          // Proof: moving COMMIT before the injected late fault left v10 schema
          // and the new policy binding installed instead of restoring v9.
          afterRecoveryWrite?.();
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

function createSchedule(database: Database, state: PreparedState): void {
  database.run(ScheduleDefinition);
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
  const requiredPrimary: Record<string, string> = {
    activation_request: 'request_identity',
    activation_delivery: 'source_id delivery_id',
    activation_subject: 'repository_id subject_key',
    activation_obligation: 'request_identity obligation_identity',
    activation_attempt: 'request_identity obligation_identity attempt',
    activation_review_attempt: 'request_identity review_id attempt',
    activation_review_dispatch: 'effect_key',
    activation_review_dispatch_progress: 'effect_key',
    activation_review_dispatch_fact: 'effect_key',
    activation_check_attempt: 'request_identity obligation_identity attempt',
    activation_check_dispatch: 'effect_key',
    activation_check_dispatch_progress: 'effect_key',
    activation_check_dispatch_fact: 'effect_key',
  };
  const nullable: Record<string, string> = {
    activation_request:
      'request_identity lease_owner lease_expires_at evaluation_plan_identity evidence_set_identity',
    activation_obligation: 'review_id command_identity phase receipt_identity',
    activation_review_dispatch: 'effect_key',
    activation_review_dispatch_progress: 'effect_key',
    activation_review_dispatch_fact: 'effect_key',
    activation_check_dispatch: 'effect_key',
    activation_check_dispatch_progress: 'effect_key',
    activation_check_dispatch_fact: 'effect_key',
  };
  const integerColumns: Record<string, string> = {
    activation_request:
      'repository_id version lease_epoch lease_expires_at pairing_version current',
    activation_subject: 'repository_id high_water_generation observation_version',
    activation_obligation: 'attempt',
    activation_attempt: 'attempt',
    activation_review_attempt: 'attempt',
    activation_review_dispatch:
      'attempt created_at deadline_at max_dispatch_attempts owner_epoch version',
    activation_review_dispatch_progress: 'dispatch_attempts owner_epoch version',
    activation_check_attempt: 'attempt',
    activation_check_dispatch: 'attempt created_at deadline_at max_dispatch_attempts',
    activation_check_dispatch_progress: 'dispatch_attempts owner_epoch version',
  };
  const uniqueColumns: Partial<Record<string, string>> = {
    activation_attempt: 'receipt_identity',
    activation_review_attempt: 'invocation_id',
    activation_review_dispatch: 'request_identity review_id attempt',
    activation_check_attempt: 'invocation_id',
    activation_check_dispatch: 'request_identity obligation_identity attempt',
  };
  const requiredChecks: Record<string, string> = {
    activation_request: 'CHECK (pairing_version IN (0, 1));CHECK (current IN (0, 1))',
    activation_subject: 'CHECK (high_water_generation >= 0);CHECK (observation_version >= 1)',
    activation_obligation: 'CHECK (attempt >= 0)',
    activation_attempt: 'CHECK (attempt >= 0)',
    activation_review_attempt: 'CHECK (attempt >= 0)',
    activation_review_dispatch:
      "CHECK (attempt >= 0);CHECK (max_dispatch_attempts >= 1);CHECK (state = 'reserved');CHECK (owner_epoch >= 0);CHECK (version >= 0)",
    activation_review_dispatch_progress:
      "CHECK (state IN ('reserved', 'dispatching', 'uncertain', 'acknowledged', 'exhausted'));CHECK (dispatch_attempts >= 0);CHECK (owner_epoch >= 0);CHECK (version >= 0)",
    activation_check_attempt: 'CHECK (attempt >= 0)',
    activation_check_dispatch: 'CHECK (attempt >= 0);CHECK (max_dispatch_attempts >= 1)',
    activation_check_dispatch_progress:
      "CHECK (state IN ('reserved', 'dispatching', 'uncertain', 'acknowledged', 'exhausted'));CHECK (dispatch_attempts >= 0);CHECK (owner_epoch >= 0);CHECK (version >= 0)",
  };
  const requiredForeign: Record<string, string> = {
    activation_obligation: 'request_identity:activation_request:request_identity',
    activation_attempt:
      'request_identity:activation_obligation:request_identity obligation_identity:activation_obligation:obligation_identity',
    activation_review_attempt: 'request_identity:activation_request:request_identity',
    activation_review_dispatch:
      'request_identity:activation_review_attempt:request_identity review_id:activation_review_attempt:review_id attempt:activation_review_attempt:attempt',
    activation_review_dispatch_progress: 'effect_key:activation_review_dispatch:effect_key',
    activation_review_dispatch_fact: 'effect_key:activation_review_dispatch:effect_key',
    activation_check_attempt:
      'request_identity:activation_obligation:request_identity obligation_identity:activation_obligation:obligation_identity',
    activation_check_dispatch:
      'request_identity:activation_check_attempt:request_identity obligation_identity:activation_check_attempt:obligation_identity attempt:activation_check_attempt:attempt',
    activation_check_dispatch_progress: 'effect_key:activation_check_dispatch:effect_key',
    activation_check_dispatch_fact: 'effect_key:activation_check_dispatch:effect_key',
  };
  for (const [name, columns] of Object.entries(requiredColumns)) {
    const found: unknown = database
      .query("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(name);
    // Proof: omitting this table check let a scheduled callback run after
    // activation_delivery was removed from an otherwise version-9 store.
    if (found === null) throw new Error(`observation state partial: ${name}`);
    const definition = parseOrThrow(type({ sql: 'string' }), found).sql;
    const actualColumns: unknown = database.query(`PRAGMA table_info(${name})`).all();
    const columnNames = parseOrThrow(
      type({
        name: 'string',
        type: 'string',
        notnull: 'number.integer>=0',
        pk: 'number.integer>=0',
      }).array(),
      actualColumns,
    );
    // Proof: omitting column inventory admitted a delivery table without payload_digest.
    if (
      columnNames
        .map((column) => column.name)
        .sort()
        .join(' ') !== columns.split(' ').sort().join(' ')
    )
      throw new Error(`observation state partial columns: ${name}`);
    // Proof: independent CHECK(1), missing-PK and nullable-owner substitutions
    // each ran the scheduled callback when only its corresponding comparison
    // was removed; the restored test refused before work.
    if (
      (requiredChecks[name] ?? '')
        .split(';')
        .filter(Boolean)
        .some((fragment) => !definition.includes(fragment)) ||
      columnNames
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name)
        .join(' ') !== requiredPrimary[name] ||
      // Proof: omitting this per-column join let nullable delivery source_id
      // retain its composite PK ordinal while running scheduled work.
      columnNames.some(
        (column) =>
          column.notnull !== ((nullable[name] ?? '').split(' ').includes(column.name) ? 0 : 1),
      ) ||
      // Proof: replacing delivery payload_digest TEXT with INTEGER reached
      // scheduled work when this declared-affinity join was removed.
      columnNames.some(
        (column) =>
          column.type !==
          ((integerColumns[name] ?? '').split(' ').includes(column.name) ? 'INTEGER' : 'TEXT'),
      )
    )
      throw new Error(`observation state partial constraints: ${name}`);
    const foreignRows: unknown = database.query(`PRAGMA foreign_key_list(${name})`).all();
    const foreign = parseOrThrow(
      type({
        id: 'number.integer>=0',
        seq: 'number.integer>=0',
        table: 'string',
        from: 'string',
        to: 'string',
        on_update: 'string',
        on_delete: 'string',
        match: 'string',
      }).array(),
      foreignRows,
    );
    const expectedForeign = (requiredForeign[name] ?? '').split(' ').filter(Boolean);
    // Proof: omitting the group/sequence join let one composite obligation
    // reference become two independent FKs and still run scheduled work.
    if (
      foreign
        .map(
          (row) =>
            `${String(row.id)}:${String(row.seq)}:${row.from}:${row.table}:${row.to}:${row.on_update}:${row.on_delete}:${row.match}`,
        )
        .join(' ') !==
      expectedForeign
        .map((binding, sequence) => `0:${String(sequence)}:${binding}:NO ACTION:NO ACTION:NONE`)
        .join(' ')
    )
      throw new Error(`observation state partial foreign keys: ${name}`);
    const indexRows: unknown = database.query(`PRAGMA index_list(${name})`).all();
    const indexes = parseOrThrow(
      type({
        name: 'string',
        unique: 'number.integer>=0',
        origin: 'string',
        partial: 'number.integer>=0',
      }).array(),
      indexRows,
    );
    const signatures = indexes
      .map((index) => {
        const indexColumns: unknown = database
          .query('SELECT * FROM pragma_index_info(?)')
          .all(index.name);
        const keys = parseOrThrow(
          type({ seqno: 'number.integer>=0', name: 'string' }).array(),
          indexColumns,
        );
        const indexedAttributes: unknown = database
          .query('SELECT * FROM pragma_index_xinfo(?)')
          .all(index.name);
        const attributes = parseOrThrow(
          type({
            key: 'number.integer>=0',
            desc: 'number.integer>=0',
            coll: 'string|null',
          }).array(),
          indexedAttributes,
        );
        // Proof: omitting the binary/ascending key check let a delivery PK
        // rebuilt with NOCASE source_id collation run scheduled work.
        if (
          attributes.some(
            (attribute) =>
              attribute.key === 1 && (attribute.desc !== 0 || attribute.coll !== 'BINARY'),
          )
        )
          throw new Error(`observation state partial index attributes: ${name}`);
        return `${index.origin}:${String(index.unique)}:${String(index.partial)}:${keys
          .sort((left, right) => left.seqno - right.seqno)
          .map((key) => key.name)
          .join(' ')}`;
      })
      .sort();
    const inlineUnique = uniqueColumns[name];
    const expectedIndexes = [
      `pk:1:0:${requiredPrimary[name]}`,
      ...(inlineUnique === undefined ? [] : [`u:1:0:${inlineUnique}`]),
      ...(name === 'activation_request' ? ['c:1:1:repository_id subject_key'] : []),
      ...(name === 'activation_review_dispatch' ? ['c:0:0:request_identity'] : []),
    ].sort();
    // Proof: dropping review invocation_id UNIQUE kept the named table and
    // PK but admitted work until this complete index signature was joined.
    if (signatures.join(';') !== expectedIndexes.join(';'))
      throw new Error(`observation state partial indexes: ${name}`);
  }
  const requiredIndexes = {
    activation_current_subject: {
      table: 'activation_request',
      sql: 'CREATE UNIQUE INDEX activation_current_subject ON activation_request(repository_id, subject_key) WHERE current = 1',
    },
    activation_dispatch_request: {
      table: 'activation_review_dispatch',
      sql: 'CREATE INDEX activation_dispatch_request ON activation_review_dispatch(request_identity)',
    },
  } as const;
  for (const [name, expected] of Object.entries(requiredIndexes)) {
    const index: unknown = database
      .query("SELECT tbl_name, sql FROM sqlite_schema WHERE type = 'index' AND name = ?")
      .get(name);
    // Proof: omitting index inventory admitted a store missing activation_dispatch_request.
    if (index === null) throw new Error(`observation state partial index: ${name}`);
    const actual = parseOrThrow(type({ tbl_name: 'string', sql: 'string' }), index);
    // Proof: omitting this SQL/table join let a same-named nonunique index on
    // activation_delivery admit the scheduled callback.
    if (actual.tbl_name !== expected.table || actual.sql.replace(/\s+/g, ' ') !== expected.sql)
      throw new Error(`observation state partial index: ${name}`);
  }
}

function readSchedule(database: Database, state: PreparedState): typeof ScheduleRow.infer {
  // Proof: omitting this version check let a version-ten store spend an attempt.
  if (readVersion(database) !== 9) throw new Error('observation state schema unsupported');
  assertActivationSchema(database);
  const definition: unknown = database
    .query(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name='activation_observation_schedule'",
    )
    .get();
  // Proof: omitting the exact scheduler definition accepted an unconstrained
  // table with two rows and ran the scheduled callback.
  if (
    definition === null ||
    parseOrThrow(type({ sql: 'string' }), definition).sql !== ScheduleDefinition
  )
    throw new Error('observation scheduler schema malformed');
  // The exact schema has singleton INTEGER PRIMARY KEY CHECK(singleton = 1):
  // a successful row read below therefore establishes exactly one record.
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
    // Proof: omitting this safe-timestamp predicate ran work for persisted
    // last_started_at=9007199254740992 after other row fields stayed valid.
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
  beforeLockRelease?: () => void,
): Promise<{ readonly kind: 'busy' } | { readonly kind: 'owned'; readonly value: T }> {
  return withLock(
    config.stateDirectory,
    async () => {
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
            // Proof: replacing this scheduled rollback aggregation with raw
            // ROLLBACK lost the primary budget fault when rollback also threw.
            rethrowWithCleanup(cause, () => {
              database.run('ROLLBACK');
            });
          }
          return work({ sequence });
        },
        () => {
          database.close();
        },
      );
    },
    beforeLockRelease,
  );
}

function readRecovery(
  database: Database,
  state: PreparedRecoveryState,
): {
  readonly schedule: typeof ScheduleRow.infer;
  readonly recovery: typeof RecoveryRow.infer;
} {
  // Proof: removing this version fence admitted a v9 marker with v10 tables
  // and ran the mounted provider reader.
  if (readVersion(database) !== 10) throw new Error('observation recovery schema unsupported');
  assertActivationSchema(database);
  for (const [name, definition] of [
    ['activation_observation_schedule', ScheduleDefinition],
    ['activation_observation_recovery', RecoveryDefinition],
    ['activation_observation_attempt', AttemptDefinition],
  ] as const) {
    const raw: unknown = database
      .query("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?")
      .get(name);
    // Proof: skipping the exact definition comparison admitted a CHECK-free
    // recovery table and ran the mounted provider reader.
    if (raw === null || parseOrThrow(type({ sql: 'string' }), raw).sql !== definition)
      throw new Error(`observation recovery table malformed: ${name}`);
  }
  const schedule = parseOrThrow(
    ScheduleRow,
    database.query('SELECT * FROM activation_observation_schedule').get(),
  );
  const recovery = parseOrThrow(
    RecoveryRow,
    database.query('SELECT * FROM activation_observation_recovery').get(),
  );
  // Proof: removing this binding join let a mismatched recovery configuration
  // issue a provider GET from the protected store.
  if (
    schedule.repository_id !== state.repositoryId ||
    recovery.repository_id !== state.repositoryId ||
    schedule.configuration_identity !== state.configurationIdentity ||
    recovery.configuration_identity !== state.configurationIdentity
  )
    throw new Error('observation recovery binding changed');
  if (
    !Number.isSafeInteger(schedule.attempt_sequence) ||
    !Number.isSafeInteger(schedule.burst_attempts) ||
    !Number.isSafeInteger(recovery.legacy_watermark) ||
    schedule.attempt_sequence < recovery.legacy_watermark ||
    schedule.burst_attempts > schedule.attempt_sequence ||
    schedule.burst_attempts > state.maxAttempts ||
    (schedule.attempt_sequence === 0) !== (schedule.last_started_at === null) ||
    (schedule.last_started_at !== null && !Number.isSafeInteger(schedule.last_started_at)) ||
    (recovery.active_sequence !== null && recovery.active_sequence !== schedule.attempt_sequence) ||
    (recovery.last_clock_at !== null && !Number.isSafeInteger(recovery.last_clock_at)) ||
    (recovery.next_attempt_at !== null && !Number.isSafeInteger(recovery.next_attempt_at)) ||
    (recovery.provider_not_before !== null &&
      !Number.isSafeInteger(recovery.provider_not_before)) ||
    (recovery.next_attempt_at !== null &&
      recovery.provider_not_before !== null &&
      recovery.next_attempt_at < recovery.provider_not_before) ||
    // Proof: omitting this null-cooldown consistency check let the mounted
    // retained 1700ms provider minimum issue an early second GET.
    (recovery.provider_not_before !== null && recovery.next_attempt_at === null) ||
    (recovery.health === 'failed' && recovery.next_attempt_at === null) ||
    (recovery.health === 'failed' && recovery.mode !== 'recovery') ||
    // Proof: omitting this exhausted-burst mode invariant let a corrupted
    // active-burst state issue a third provider GET.
    (recovery.mode === 'burst' &&
      schedule.burst_attempts >= state.maxAttempts &&
      recovery.active_sequence === null) ||
    (recovery.last_failure_sequence !== null &&
      (!Number.isSafeInteger(recovery.last_failure_sequence) ||
        recovery.last_failure_sequence > schedule.attempt_sequence)) ||
    (recovery.last_success_sequence !== null &&
      (!Number.isSafeInteger(recovery.last_success_sequence) ||
        recovery.last_success_sequence > schedule.attempt_sequence))
  )
    throw new Error('observation recovery record malformed');
  const retained: unknown[] = database
    .query('SELECT * FROM activation_observation_attempt ORDER BY sequence')
    .all();
  // Proof: omitting the contiguous-journal join let a deleted earlier
  // reservation disappear from accepted history after a later terminal fact.
  if (retained.length !== schedule.attempt_sequence - recovery.legacy_watermark)
    throw new Error('observation recovery attempt missing');
  let lastFailureSequence: number | null = null;
  let lastSuccessSequence: number | null = null;
  for (const [offset, raw] of retained.entries()) {
    const attempt = parseOrThrow(AttemptRow, raw);
    if (
      attempt.sequence !== recovery.legacy_watermark + offset + 1 ||
      attempt.configuration_identity !== state.configurationIdentity ||
      !Number.isSafeInteger(attempt.started_at) ||
      (attempt.outcome === null) !== (attempt.finished_at === null) ||
      (attempt.finished_at !== null &&
        (!Number.isSafeInteger(attempt.finished_at) || attempt.finished_at < attempt.started_at)) ||
      (attempt.provider_not_before !== null &&
        !Number.isSafeInteger(attempt.provider_not_before)) ||
      (attempt.outcome === 'complete' && attempt.classification !== null) ||
      (attempt.outcome === 'cancelled' && attempt.classification !== null) ||
      (attempt.outcome === 'interrupted' && attempt.classification !== 'process-exit') ||
      // Proof: omitting provider classification validation let a changed
      // terminal fact authorize the next provider GET.
      (attempt.outcome === 'provider-failure' &&
        attempt.classification !== 'unavailable' &&
        attempt.classification !== 'rate-limited') ||
      (attempt.outcome === 'local-failure' &&
        attempt.classification !== 'local' &&
        attempt.classification !== 'invalid-response' &&
        attempt.classification !== 'inaccessible') ||
      (attempt.outcome === null && offset !== retained.length - 1) ||
      (offset === retained.length - 1 &&
        (recovery.active_sequence === null) !== (attempt.outcome !== null))
    )
      throw new Error('observation recovery attempt inconsistent');
    if (
      attempt.outcome === 'provider-failure' ||
      attempt.outcome === 'local-failure' ||
      attempt.outcome === 'interrupted'
    )
      lastFailureSequence = attempt.sequence;
    if (attempt.outcome === 'complete') lastSuccessSequence = attempt.sequence;
  }
  // Proof: omitting the derived terminal-history join let a cleared
  // last-failure pointer authorize another provider GET.
  if (
    lastFailureSequence !== recovery.last_failure_sequence ||
    lastSuccessSequence !== recovery.last_success_sequence
  )
    throw new Error('observation recovery terminal history changed');
  return { schedule, recovery };
}

function requireClock(config: ObservationStateConfig, prior: number | null): number {
  const now = config.clock();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('observation clock malformed');
  // Proof: removing this rollback refusal let a persisted future cooldown be
  // evaluated against an older clock in the mounted restart fixture.
  if (prior !== null && now < prior) throw new Error('observation clock rolled back');
  return now;
}

function requireFuture(now: number, delay: number): number {
  const future = now + delay;
  if (!Number.isSafeInteger(future)) throw new Error('observation retry time overflow');
  return future;
}

function findProviderFailure(cause: unknown): GitHubReadFailure | undefined {
  let current = cause;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current instanceof GitHubReadFailure) return current;
    if (!(current instanceof Error)) return undefined;
    current = current.cause;
  }
  return undefined;
}

function delayForBurst(policy: typeof RecoveryPolicy.infer, burst: number): number {
  return Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** Math.min(burst - 1, 30));
}

function finalizeRecovery(
  database: Database,
  state: PreparedRecoveryState,
  config: ObservationStateConfig,
  attempt: { readonly sequence: number; readonly kind: 'burst' | 'recovery' },
  outcome: 'complete' | 'cancelled' | 'provider-failure' | 'local-failure',
  failure?: GitHubReadFailure,
  shouldCancel?: () => boolean,
): 'complete' | 'cancelled' | 'provider-failure' | 'local-failure' {
  database.run('BEGIN IMMEDIATE');
  try {
    const { schedule, recovery } = readRecovery(database, state);
    if (recovery.active_sequence !== attempt.sequence)
      throw new Error('observation recovery active attempt changed');
    const now = requireClock(config, recovery.last_clock_at);
    let health: typeof recovery.health = recovery.health;
    let mode: typeof recovery.mode = recovery.mode;
    let providerNotBefore = recovery.provider_not_before;
    let nextAttemptAt = recovery.next_attempt_at;
    let classification: string | null = null;
    if (outcome === 'complete') {
      // Proof: replacing the healthy transition with prior health left a
      // complete recovery probe recorded while failed health remained.
      health = 'healthy';
      mode = 'burst';
      providerNotBefore = null;
      nextAttemptAt = null;
      database
        .query('UPDATE activation_observation_schedule SET burst_attempts = 0 WHERE singleton = 1')
        .run();
    } else if (outcome === 'provider-failure') {
      classification = failure?.kind ?? 'unavailable';
      const localDelay =
        attempt.kind === 'recovery'
          ? state.policy.recoveryProbeMs
          : delayForBurst(state.policy, schedule.burst_attempts);
      // Proof: ignoring the validated provider minimum shortened a 100,000ms
      // retry to the local fallback in the mounted long-delay tick.
      const fallback =
        failure?.retryAfterEpochMs ?? requireFuture(now, state.policy.fallbackDelayMs);
      providerNotBefore = Math.max(providerNotBefore ?? 0, fallback);
      nextAttemptAt = Math.max(requireFuture(now, localDelay), providerNotBefore);
      if (attempt.kind === 'recovery' || schedule.burst_attempts >= state.maxAttempts) {
        // Proof: preserving unknown health after the second failure made the
        // mounted exhausted-burst snapshot fail its durable failed-state assertion.
        health = 'failed';
        mode = 'recovery';
        nextAttemptAt = Math.max(nextAttemptAt, requireFuture(now, state.policy.recoveryProbeMs));
      }
    } else if (outcome === 'local-failure') {
      classification = failure?.kind ?? 'local';
      nextAttemptAt = Math.max(
        nextAttemptAt ?? 0,
        requireFuture(now, state.policy.horizonMs),
        providerNotBefore ?? 0,
      );
      health = 'failed';
      mode = 'recovery';
    } else {
      nextAttemptAt = Math.max(
        nextAttemptAt ?? 0,
        requireFuture(
          now,
          attempt.kind === 'recovery' ? state.policy.recoveryProbeMs : state.policy.initialDelayMs,
        ),
        providerNotBefore ?? 0,
      );
      if (attempt.kind === 'burst' && schedule.burst_attempts >= state.maxAttempts) {
        // Proof: omitting the recovery-mode assignment after cancelled final
        // burst left the mounted persisted mode=burst instead of recovery.
        mode = 'recovery';
        nextAttemptAt = Math.max(nextAttemptAt, requireFuture(now, state.policy.recoveryProbeMs));
      }
    }
    const updated = database
      .query(
        `UPDATE activation_observation_attempt SET
         outcome=?, classification=?, finished_at=?, provider_not_before=?
         WHERE sequence=? AND configuration_identity=? AND outcome IS NULL`,
      )
      .run(
        outcome,
        classification,
        now,
        providerNotBefore,
        attempt.sequence,
        state.configurationIdentity,
      );
    if (updated.changes !== 1) throw new Error('observation recovery attempt changed');
    // Proof: splitting the transaction here retained provider-failure outcome
    // and 1700ms minimum after the injected singleton write failed; intact
    // rollback leaves both journal and cooldown pending together.
    database
      .query(
        `UPDATE activation_observation_recovery SET active_sequence=NULL, health=?, mode=?,
         provider_not_before=?, next_attempt_at=?, last_clock_at=?,
         last_failure_sequence=?, last_success_sequence=? WHERE singleton=1`,
      )
      .run(
        health,
        mode,
        providerNotBefore,
        nextAttemptAt,
        now,
        outcome === 'provider-failure' || outcome === 'local-failure'
          ? attempt.sequence
          : recovery.last_failure_sequence,
        outcome === 'complete' ? attempt.sequence : recovery.last_success_sequence,
      );
    // Proof: omitting this monotonic pre-COMMIT check let synchronous terminal
    // validation cross the deadline and persist complete instead of cancelled.
    if (outcome === 'complete' && shouldCancel?.()) {
      database.run('ROLLBACK');
      return finalizeRecovery(database, state, config, attempt, 'cancelled');
    }
    database.run('COMMIT');
    return outcome;
  } catch (cause) {
    rethrowWithCleanup(cause, () => {
      database.run('ROLLBACK');
    });
  }
}

/** Owns one durable v10 reservation and terminal fact around one bounded observation. */
export async function withRecoveryObservation<
  T extends { readonly kind: 'complete' | 'cancelled' },
>(
  config: ObservationStateConfig,
  work: (attempt: ObservationAttempt) => Promise<T>,
  beforeLockRelease?: () => void,
  shouldCancel?: () => boolean,
): Promise<
  | { readonly kind: 'busy' }
  | { readonly kind: 'deferred' }
  | { readonly kind: 'owned'; readonly value: T; readonly terminalOutcome: T['kind'] }
> {
  const locked = await withLock(
    config.stateDirectory,
    async () => {
      const state = prepareRecovery(config);
      inspectProtected(state.databasePath, false);
      const database = new Database(state.databasePath, { create: false, strict: true });
      let databaseClosed = false;
      return settleWithCleanup(
        async () => {
          const now = requireClock(config, readRecovery(database, state).recovery.last_clock_at);
          database.run('BEGIN IMMEDIATE');
          let reservation:
            | { readonly kind: 'deferred' }
            | {
                readonly kind: 'reserved';
                readonly sequence: number;
                readonly attemptKind: 'burst' | 'recovery';
              };
          try {
            let { schedule, recovery } = readRecovery(database, state);
            if (recovery.active_sequence !== null) {
              const interrupted = database
                .query(
                  `UPDATE activation_observation_attempt SET outcome='interrupted',
                   classification='process-exit', finished_at=?
                   WHERE sequence=? AND outcome IS NULL`,
                )
                .run(now, recovery.active_sequence);
              if (interrupted.changes !== 1)
                throw new Error('observation recovery interrupted attempt missing');
              const exhausted = schedule.burst_attempts >= state.maxAttempts;
              const delayed = requireFuture(
                now,
                exhausted ? state.policy.recoveryProbeMs : state.policy.initialDelayMs,
              );
              database
                .query(
                  `UPDATE activation_observation_recovery SET active_sequence=NULL,
                   health=?, mode=?, next_attempt_at=?, last_clock_at=?, last_failure_sequence=? WHERE singleton=1`,
                )
                .run(
                  exhausted ? 'failed' : recovery.health,
                  exhausted ? 'recovery' : recovery.mode,
                  Math.max(
                    delayed,
                    recovery.provider_not_before ?? 0,
                    recovery.next_attempt_at ?? 0,
                  ),
                  now,
                  recovery.active_sequence,
                );
              ({ schedule, recovery } = readRecovery(database, state));
            }
            // Proof: omitting the persisted cooldown guard let the reopened
            // tick issue another provider GET instead of returning deferred.
            if (recovery.next_attempt_at !== null && now < recovery.next_attempt_at) {
              reservation = { kind: 'deferred' };
            } else {
              const attemptKind = recovery.mode;
              const sequence = schedule.attempt_sequence + 1;
              // Proof: omitting the high-water check let an unsafe sequence
              // reach the provider reader in the mounted overflow fixture.
              if (!Number.isSafeInteger(sequence))
                throw new Error('observation attempt sequence overflow');
              database
                .query(
                  `UPDATE activation_observation_schedule SET attempt_sequence=?,
                   burst_attempts=burst_attempts+?, last_started_at=? WHERE singleton=1`,
                )
                .run(sequence, attemptKind === 'burst' ? 1 : 0, now);
              // Proof: omitting the journal insertion let a real child enter
              // provider work, die, and leave no pending attempt to seal.
              database
                .query(
                  `INSERT INTO activation_observation_attempt
                   (sequence, configuration_identity, started_at, kind,
                    outcome, classification, finished_at, provider_not_before)
                   VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
                )
                .run(sequence, state.configurationIdentity, now, attemptKind);
              database
                .query(
                  `UPDATE activation_observation_recovery SET active_sequence=?,
                   last_clock_at=? WHERE singleton=1`,
                )
                .run(sequence, now);
              reservation = { kind: 'reserved', sequence, attemptKind };
            }
            // Proof: splitting the transaction after the counter update left
            // sequence 1 committed when injected journal insertion failed;
            // the intact transaction retains sequence 0 and no provider read.
            database.run('COMMIT');
          } catch (cause) {
            rethrowWithCleanup(cause, () => {
              database.run('ROLLBACK');
            });
          }
          // Proof: omitting this early close let the mounted delayed scheduler
          // teardown cross the deadline after a complete journal fact was written.
          database.close();
          databaseClosed = true;
          if (reservation.kind === 'deferred') return { kind: 'deferred' } as const;
          const attempt = { sequence: reservation.sequence, kind: reservation.attemptKind };
          const finish = async (
            outcome: 'complete' | 'cancelled' | 'provider-failure' | 'local-failure',
            provider?: GitHubReadFailure,
          ): Promise<'complete' | 'cancelled' | 'provider-failure' | 'local-failure'> => {
            const terminal = new Database(state.databasePath, { create: false, strict: true });
            return settleWithCleanup(
              () => {
                return finalizeRecovery(
                  terminal,
                  state,
                  config,
                  attempt,
                  outcome,
                  provider,
                  shouldCancel,
                );
              },
              () => {
                terminal.close();
              },
            );
          };
          let value: T;
          try {
            value = await work({ sequence: attempt.sequence });
          } catch (cause) {
            const provider = findProviderFailure(cause);
            const outcome =
              provider?.kind === 'unavailable' || provider?.kind === 'rate-limited'
                ? 'provider-failure'
                : 'local-failure';
            try {
              await finish(outcome, provider);
            } catch (completionFailure) {
              throw new AggregateError(
                [cause, completionFailure],
                'observation and finalization failed',
                { cause: completionFailure },
              );
            }
            throw cause;
          }
          // Proof: rewriting a cancelled observation as complete left a
          // false successful journal fact in the held-reader cancellation test.
          const terminalOutcome = await finish(value.kind);
          if (terminalOutcome !== 'complete' && terminalOutcome !== 'cancelled')
            throw new Error('observation terminal outcome malformed');
          return { kind: 'owned', value, terminalOutcome } as const;
        },
        () => {
          if (!databaseClosed) database.close();
        },
      );
    },
    beforeLockRelease,
  );
  return locked.kind === 'busy' ? locked : locked.value;
}
