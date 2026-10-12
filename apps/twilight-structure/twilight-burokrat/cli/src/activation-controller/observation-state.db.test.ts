import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { openActivationController } from './controller';
import {
  initializeObservationState,
  migrateObservationRecoveryState,
  migrateObservationState,
  withObservationAttempt,
} from './observation-state';

async function expectRefusal(run: () => Promise<unknown>, message: string): Promise<void> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).toContain(message);
}

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('v9 recovery migration is additive and rolls back schema, binding and journal on late failure', async () => {
  const source = fixture();
  await initializeObservationState(source.config);
  const recovery = {
    ...source.config,
    policy: {
      ...source.config.policy,
      initialDelayMs: 100,
      maxDelayMs: 400,
      fallbackDelayMs: 200,
      recoveryProbeMs: 1000,
      horizonMs: 5000,
    },
  };
  const before = new Database(source.databasePath, { create: false, strict: true });
  const original = before.query('SELECT * FROM activation_observation_schedule').get();
  before.close();
  let failure: unknown;
  try {
    await migrateObservationRecoveryState(recovery, () => {
      throw new Error('late recovery migration sentinel');
    });
  } catch (cause) {
    failure = cause;
  }
  const rolledBack = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(rolledBack.query('PRAGMA user_version').get()).toEqual({ user_version: 9 });
    expect(rolledBack.query('SELECT * FROM activation_observation_schedule').get()).toEqual(
      original,
    );
    expect(
      rolledBack
        .query(
          "SELECT name FROM sqlite_schema WHERE name LIKE 'activation_observation_%' ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'activation_observation_schedule' }]);
  } finally {
    rolledBack.close();
  }
  expect(String(failure)).toContain('late recovery migration sentinel');
  expect(await migrateObservationRecoveryState(recovery)).toBe('migrated');
});

test('v9 nonzero scheduler migrates as an unclassified watermark without invented attempts', async () => {
  const source = fixture();
  await initializeObservationState(source.config);
  await withObservationAttempt(source.config, () => Promise.resolve(undefined));
  const recovery = {
    ...source.config,
    policy: {
      ...source.config.policy,
      initialDelayMs: 100,
      maxDelayMs: 400,
      fallbackDelayMs: 200,
      recoveryProbeMs: 1000,
      horizonMs: 5000,
    },
  };
  expect(await migrateObservationRecoveryState(recovery)).toBe('migrated');
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database
        .query(
          'SELECT attempt_sequence, burst_attempts, last_started_at FROM activation_observation_schedule',
        )
        .get(),
    ).toEqual({
      attempt_sequence: 1,
      burst_attempts: 1,
      last_started_at: 1000,
    });
    expect(
      database
        .query(
          'SELECT legacy_watermark, health, mode, next_attempt_at FROM activation_observation_recovery',
        )
        .get(),
    ).toEqual({
      legacy_watermark: 1,
      health: 'unknown',
      mode: 'burst',
      next_attempt_at: 2000,
    });
    expect(
      database.query('SELECT COUNT(*) AS count FROM activation_observation_attempt').get(),
    ).toEqual({ count: 0 });
  } finally {
    database.close();
  }
});

test('recovery migration rejects version-eight and changed legacy binding without writes', async () => {
  for (const sourceVersion of ['eight', 'wrong-binding'] as const) {
    const source = fixture();
    if (sourceVersion === 'eight') createVersionEight(source);
    else await initializeObservationState(source.config);
    const recovery = {
      ...source.config,
      binding:
        sourceVersion === 'wrong-binding'
          ? { ...source.config.binding, name: 'different-repository' }
          : source.config.binding,
      policy: {
        ...source.config.policy,
        initialDelayMs: 100,
        maxDelayMs: 400,
        fallbackDelayMs: 200,
        recoveryProbeMs: 1000,
        horizonMs: 5000,
      },
    };
    const database = new Database(source.databasePath, { create: false, strict: true });
    const before = database.query('PRAGMA user_version').get();
    database.close();
    await expectRefusal(
      () => migrateObservationRecoveryState(recovery),
      sourceVersion === 'eight'
        ? 'observation state schema unsupported'
        : 'scheduler binding changed',
    );
    const after = new Database(source.databasePath, { create: false, strict: true });
    try {
      expect(after.query('PRAGMA user_version').get()).toEqual(before);
      expect(
        after
          .query("SELECT name FROM sqlite_schema WHERE name='activation_observation_recovery'")
          .get(),
      ).toBeNull();
    } finally {
      after.close();
    }
  }
});

for (const policyFault of [
  'missing-initial',
  'zero-initial',
  'initial-order',
  'max-order',
  'recovery-order',
  'fallback-order',
  'horizon-ceiling',
] as const)
  test(`recovery policy ${policyFault} refuses before migration writes`, async () => {
    const source = fixture();
    await initializeObservationState(source.config);
    const policy: Record<string, number> = {
      ...source.config.policy,
      initialDelayMs: 100,
      maxDelayMs: 400,
      fallbackDelayMs: 200,
      recoveryProbeMs: 1000,
      horizonMs: 5000,
    };
    if (policyFault === 'missing-initial') delete policy['initialDelayMs'];
    if (policyFault === 'zero-initial') policy['initialDelayMs'] = 0;
    if (policyFault === 'initial-order') policy['initialDelayMs'] = 500;
    if (policyFault === 'max-order') policy['maxDelayMs'] = 1100;
    if (policyFault === 'recovery-order') policy['recoveryProbeMs'] = 6000;
    if (policyFault === 'fallback-order') policy['fallbackDelayMs'] = 6000;
    if (policyFault === 'horizon-ceiling') policy['horizonMs'] = 86_400_001;
    let failure: unknown;
    try {
      await migrateObservationRecoveryState({
        ...source.config,
        policy: policy as unknown as typeof source.config.policy,
      });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    const database = new Database(source.databasePath, { create: false, strict: true });
    try {
      expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 9 });
      expect(
        database
          .query("SELECT name FROM sqlite_schema WHERE name='activation_observation_recovery'")
          .get(),
      ).toBeNull();
    } finally {
      database.close();
    }
  });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-observation-state-'));
  chmodSync(directory, 0o700);
  scratch.push(directory);
  const bootstrapPath = join(directory, 'bootstrap.json');
  const bytes = serializeCanonical({
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: { requiredWorkflow: '.github/workflows/trusted-wiki.yml', protectedBranch: 'main' },
  });
  writeFileSync(bootstrapPath, bytes, { mode: 0o600 });
  const config = {
    stateDirectory: directory,
    bootstrapPath,
    pin: {
      identity: hashBytes(bytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
    binding: {
      repositoryId: 8241,
      owner: 'Prosperous-Unification',
      name: 'puni-00',
      targetRef: 'refs/heads/main',
      policyIdentity: '3'.repeat(64),
      mappingIdentity: '4'.repeat(64),
      toolkitIdentity: '5'.repeat(64),
      readDeadlineMs: 1000,
    },
    policy: { maxAttempts: 2, wholeTickMs: 5000, maxSubjects: 100 },
    clock: () => 1000,
  };
  return { directory, config, databasePath: join(directory, 'activation.sqlite') };
}

function createVersionEight(source: ReturnType<typeof fixture>): void {
  const controller = openActivationController({
    databasePath: source.databasePath,
    bootstrapPath: source.config.bootstrapPath,
    pin: source.config.pin,
    clock: source.config.clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.reject(new Error('fixture has no provider read')),
    selectObligations: () => {
      throw new Error('fixture has no evaluation');
    },
  });
  controller.close();
  chmodSync(source.databasePath, 0o600);
}

test('scheduled work and database cleanup failures retain both causes', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const originalClose = Object.getOwnPropertyDescriptor(Database.prototype, 'close')?.value as (
    this: Database,
  ) => void;
  const workFault = new Error('mounted observation work failure');
  const cleanupFault = new Error('mounted database close failure');
  Database.prototype.close = function () {
    originalClose.call(this);
    throw cleanupFault;
  };
  let caught: unknown;
  try {
    await withObservationAttempt(source.config, () => Promise.reject(workFault));
  } catch (error) {
    caught = error;
  } finally {
    Database.prototype.close = originalClose;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([workFault, cleanupFault]);
  expect(
    (await withObservationAttempt(source.config, () => Promise.resolve('reopened'))).kind,
  ).toBe('owned');
});

test('failed established open retains schema and close faults', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run('DROP TABLE activation_check_dispatch_fact');
  database.close();
  const originalClose = Object.getOwnPropertyDescriptor(Database.prototype, 'close')?.value as (
    this: Database,
  ) => void;
  const cleanupFault = new Error('mounted open-close fault');
  Database.prototype.close = function () {
    originalClose.call(this);
    throw cleanupFault;
  };
  let caught: unknown;
  try {
    await withObservationAttempt(source.config, () => Promise.resolve());
  } catch (error) {
    caught = error;
  } finally {
    Database.prototype.close = originalClose;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  const failures = (caught as AggregateError).errors as unknown[];
  expect(String(failures[0])).toContain('observation state partial');
  expect(failures[1]).toBe(cleanupFault);
});

test('failed migration retains late primary and close fault', async () => {
  const source = fixture();
  createVersionEight(source);
  const originalClose = Object.getOwnPropertyDescriptor(Database.prototype, 'close')?.value as (
    this: Database,
  ) => void;
  const primaryFault = new Error('mounted late migration fault');
  const cleanupFault = new Error('mounted migration-close fault');
  Database.prototype.close = function () {
    originalClose.call(this);
    throw cleanupFault;
  };
  let caught: unknown;
  try {
    await migrateObservationState(source.config, () => {
      throw primaryFault;
    });
  } catch (error) {
    caught = error;
  } finally {
    Database.prototype.close = originalClose;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([primaryFault, cleanupFault]);
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  reopened.close();
});

test('failed initializer retains schema and close faults without publishing state', async () => {
  const source = fixture();
  const runDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
  if (runDescriptor === undefined) throw new Error('fixture run descriptor missing');
  const originalRun = runDescriptor.value as (sql: string) => unknown;
  const originalClose = Object.getOwnPropertyDescriptor(Database.prototype, 'close')?.value as (
    this: Database,
  ) => void;
  const primaryFault = new Error('mounted initialization schema fault');
  const cleanupFault = new Error('mounted initialization-close fault');
  let closeFaultArmed = false;
  Object.defineProperty(Database.prototype, 'run', {
    ...runDescriptor,
    value: function (this: Database, sql: string) {
      if (sql.startsWith('CREATE TABLE activation_observation_schedule')) {
        closeFaultArmed = true;
        throw primaryFault;
      }
      return Reflect.apply(originalRun, this, [sql]);
    },
  });
  Database.prototype.close = function () {
    originalClose.call(this);
    if (closeFaultArmed) throw cleanupFault;
  };
  let caught: unknown;
  try {
    await initializeObservationState(source.config);
  } catch (error) {
    caught = error;
  } finally {
    Object.defineProperty(Database.prototype, 'run', runDescriptor);
    Database.prototype.close = originalClose;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([primaryFault, cleanupFault]);
  expect(existsSync(source.databasePath)).toBe(false);
});

test('migration rollback failure retains the primary and rollback faults', async () => {
  const source = fixture();
  createVersionEight(source);
  const runDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
  if (runDescriptor === undefined) throw new Error('fixture run descriptor missing');
  const originalRun = runDescriptor.value as (sql: string) => unknown;
  const primaryFault = new Error('mounted migration work fault');
  const rollbackFault = new Error('mounted rollback fault');
  Object.defineProperty(Database.prototype, 'run', {
    ...runDescriptor,
    value: function (this: Database, sql: string) {
      if (sql === 'ROLLBACK') throw rollbackFault;
      return Reflect.apply(originalRun, this, [sql]);
    },
  });
  let caught: unknown;
  try {
    await migrateObservationState(source.config, () => {
      throw primaryFault;
    });
  } catch (error) {
    caught = error;
  } finally {
    Object.defineProperty(Database.prototype, 'run', runDescriptor);
  }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([primaryFault, rollbackFault]);
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  reopened.close();
});

test('scheduled rollback failure retains the budget and rollback faults', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run(`UPDATE activation_observation_schedule
    SET attempt_sequence=2, burst_attempts=2, last_started_at=1000`);
  database.close();
  const runDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
  if (runDescriptor === undefined) throw new Error('fixture run descriptor missing');
  const originalRun = runDescriptor.value as (sql: string) => unknown;
  const rollbackFault = new Error('mounted scheduled rollback fault');
  Object.defineProperty(Database.prototype, 'run', {
    ...runDescriptor,
    value: function (this: Database, sql: string) {
      if (sql === 'ROLLBACK') throw rollbackFault;
      return Reflect.apply(originalRun, this, [sql]);
    },
  });
  let caught: unknown;
  try {
    await withObservationAttempt(source.config, () => Promise.resolve());
  } catch (error) {
    caught = error;
  } finally {
    Object.defineProperty(Database.prototype, 'run', runDescriptor);
  }
  expect(caught).toBeInstanceOf(AggregateError);
  const failures = (caught as AggregateError).errors as unknown[];
  expect(String(failures[0])).toContain('attempt budget exhausted');
  expect(failures[1]).toBe(rollbackFault);
});

test('activation controller reopens the additive scheduler schema without resetting it', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  await withObservationAttempt(source.config, () => Promise.resolve(undefined));
  const controller = openActivationController({
    databasePath: source.databasePath,
    bootstrapPath: source.config.bootstrapPath,
    pin: source.config.pin,
    clock: source.config.clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.reject(new Error('fixture has no provider read')),
    selectObligations: () => {
      throw new Error('fixture has no evaluation');
    },
  });
  controller.close();
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database.query('SELECT attempt_sequence FROM activation_observation_schedule').get(),
    ).toEqual({
      attempt_sequence: 1,
    });
  } finally {
    database.close();
  }
});

test('scheduled observation refuses absent state before provider work', async () => {
  const source = fixture();
  let called = 0;
  await expectRefusal(
    () =>
      withObservationAttempt(source.config, () => {
        called += 1;
        return Promise.resolve();
      }),
    'observation state absent',
  );
  expect(called).toBe(0);
  expect(existsSync(source.databasePath)).toBe(false);
});

test('explicit initialization cannot repair or overwrite established state', async () => {
  const source = fixture();
  writeFileSync(source.databasePath, 'established-malformed-state', { mode: 0o600 });
  const before = readFileSync(source.databasePath);
  await expectRefusal(
    () => initializeObservationState(source.config),
    'observation state already exists',
  );
  expect(readFileSync(source.databasePath)).toEqual(before);
  await expectRefusal(
    () => withObservationAttempt(source.config, () => Promise.resolve()),
    'database',
  );
  expect(readFileSync(source.databasePath)).toEqual(before);
});

test('explicit initialization reserves durable attempts without resetting after reopen', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const first = await withObservationAttempt(source.config, (attempt) =>
    Promise.resolve(attempt.sequence),
  );
  const second = await withObservationAttempt(source.config, (attempt) =>
    Promise.resolve(attempt.sequence),
  );
  expect(first).toEqual({ kind: 'owned', value: 1 });
  expect(second).toEqual({ kind: 'owned', value: 2 });
  await expectRefusal(
    () => withObservationAttempt(source.config, () => Promise.resolve(3)),
    'observation attempt budget exhausted',
  );
});

test('explicit migration adds only scheduler state and preserves version-eight rows', async () => {
  const source = fixture();
  createVersionEight(source);
  const before = new Database(source.databasePath, { create: false, strict: true });
  before
    .query('INSERT INTO activation_subject VALUES (?, ?, ?, ?)')
    .run(8241, 'pull-request:282', 7, 3);
  before.close();
  await expectRefusal(
    () => withObservationAttempt(source.config, () => Promise.resolve()),
    'observation state schema unsupported',
  );
  expect(await migrateObservationState(source.config)).toBe('migrated');
  const after = new Database(source.databasePath, { create: false, strict: true });
  expect(after.query('PRAGMA user_version').get()).toEqual({ user_version: 9 });
  expect(after.query('SELECT high_water_generation FROM activation_subject').get()).toEqual({
    high_water_generation: 7,
  });
  after.close();
  expect(
    await withObservationAttempt(source.config, (attempt) => Promise.resolve(attempt.sequence)),
  ).toEqual({ kind: 'owned', value: 1 });
});

test('late migration failure restores version-eight schema and data', async () => {
  const source = fixture();
  createVersionEight(source);
  await expectRefusal(
    () =>
      migrateObservationState(source.config, () => {
        throw new Error('injected late migration fault');
      }),
    'injected late migration fault',
  );
  const database = new Database(source.databasePath, { create: false, strict: true });
  expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  expect(
    database
      .query("SELECT name FROM sqlite_schema WHERE name = 'activation_observation_schedule'")
      .get(),
  ).toBeNull();
  database.close();
  expect(await migrateObservationState(source.config)).toBe('migrated');
});

test('explicit migration refuses an established foreign repository row', async () => {
  const source = fixture();
  createVersionEight(source);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database
    .query(
      `INSERT INTO activation_request
    (request_identity, repository_id, subject_key, request_bytes, bootstrap_identity,
      stage, version, lease_epoch, pairing_version, current)
    VALUES (?, 9999, 'pull-request:1', '{}', ?, 'observed', 0, 0, 1, 0)`,
    )
    .run('a'.repeat(64), source.config.pin.identity);
  database.close();
  await expectRefusal(
    () => migrateObservationState(source.config),
    'observation migration source repository changed',
  );
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  reopened.close();
});

test('explicit migration refuses partial version-eight schema without changes', async () => {
  const source = fixture();
  createVersionEight(source);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run('DROP TABLE activation_check_dispatch_fact');
  database.close();
  await expectRefusal(() => migrateObservationState(source.config), 'observation state partial');
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  expect(
    reopened
      .query("SELECT 1 FROM sqlite_schema WHERE name='activation_observation_schedule'")
      .get(),
  ).toBeNull();
  reopened.close();
});

test('foreign subject history alone prevents migration', async () => {
  const source = fixture();
  createVersionEight(source);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database
    .query('INSERT INTO activation_subject VALUES (?, ?, ?, ?)')
    .run(9999, 'pull-request:1', 1, 1);
  database.close();
  await expectRefusal(() => migrateObservationState(source.config), 'source repository changed');
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  reopened.close();
});

test('migration joins the latest repository history after acquiring its write turn', async () => {
  const source = fixture();
  createVersionEight(source);
  const runDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
  if (runDescriptor === undefined) throw new Error('fixture run descriptor missing');
  const originalRun = runDescriptor.value as (sql: string) => unknown;
  let inserted = false;
  Object.defineProperty(Database.prototype, 'run', {
    ...runDescriptor,
    value: function (this: Database, sql: string) {
      if (sql === 'BEGIN IMMEDIATE' && !inserted) {
        inserted = true;
        this.query('INSERT INTO activation_subject VALUES (?, ?, ?, ?)').run(
          9999,
          'pull-request:2',
          1,
          1,
        );
      }
      return Reflect.apply(originalRun, this, [sql]);
    },
  });
  try {
    await expectRefusal(() => migrateObservationState(source.config), 'source repository changed');
  } finally {
    Object.defineProperty(Database.prototype, 'run', runDescriptor);
  }
  expect(inserted).toBe(true);
  const reopened = new Database(source.databasePath, { create: false, strict: true });
  expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
  reopened.close();
});

test('hard-linked database cannot use a second process-lock inode', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const alias = mkdtempSync(join(tmpdir(), 'activation-observation-alias-'));
  chmodSync(alias, 0o700);
  scratch.push(alias);
  linkSync(source.databasePath, join(alias, 'activation.sqlite'));
  let called = 0;
  await expectRefusal(
    () =>
      withObservationAttempt({ ...source.config, stateDirectory: alias }, () => {
        called += 1;
        return Promise.resolve();
      }),
    'malformed',
  );
  expect(called).toBe(0);
});

test('noncanonical or symlinked protected ancestry refuses before initialization', async () => {
  const source = fixture();
  const alias = join(source.directory, 'link');
  symlinkSync(source.directory, alias);
  await expectRefusal(
    () => initializeObservationState({ ...source.config, stateDirectory: `${source.directory}/.` }),
    'canonical absolute',
  );
  await expectRefusal(
    () => initializeObservationState({ ...source.config, stateDirectory: `${alias}/.` }),
    'protected path',
  );
  expect(existsSync(source.databasePath)).toBe(false);
  await expectRefusal(
    () => initializeObservationState({ ...source.config, stateDirectory: alias }),
    'symlink',
  );
  const nested = join(source.directory, 'nested');
  mkdirSync(nested, { mode: 0o700 });
  await expectRefusal(
    () => initializeObservationState({ ...source.config, stateDirectory: join(alias, 'nested') }),
    'symlink',
  );
  const parent = mkdtempSync(join(tmpdir(), 'activation-replaceable-parent-'));
  scratch.push(parent);
  chmodSync(parent, 0o777);
  const child = join(parent, 'protected');
  mkdirSync(child, { mode: 0o700 });
  await expectRefusal(
    () => initializeObservationState({ ...source.config, stateDirectory: child }),
    'ancestor replaceable',
  );
});

test('nested symlink alone refuses before initialization', async () => {
  const source = fixture();
  const parent = join(source.directory, 'actual');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(join(parent, 'protected'), { mode: 0o700 });
  const alias = join(source.directory, 'alias');
  symlinkSync(parent, alias);
  await expectRefusal(
    () =>
      initializeObservationState({ ...source.config, stateDirectory: join(alias, 'protected') }),
    'protected path symlink',
  );
  expect(existsSync(join(parent, 'protected', 'activation.sqlite'))).toBe(false);
});

test('foreign-owned ordinary and sticky ancestors refuse before initialization', async () => {
  for (const mode of [0o755, 0o1777]) {
    const source = fixture();
    const parent = mkdtempSync(join(tmpdir(), 'activation-foreign-ancestor-'));
    scratch.push(parent);
    chmodSync(parent, mode);
    const protectedDirectory = join(parent, 'protected');
    mkdirSync(protectedDirectory, { mode: 0o700 });
    const configurationPath = join(source.directory, 'ancestor-config.json');
    writeFileSync(
      configurationPath,
      JSON.stringify({ ...source.config, stateDirectory: protectedDirectory }),
      { mode: 0o600 },
    );
    const processPath = join(import.meta.dir, 'observation-state-ancestor-process.ts');
    const child = Bun.spawn(['bun', processPath, configurationPath, parent], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(JSON.parse(output)).toEqual({
      error: `Error: observation protected ancestor owner changed: ${parent}`,
    });
    expect(existsSync(join(protectedDirectory, 'activation.sqlite'))).toBe(false);
  }
});

test('partial v9 tables and inconsistent scheduler counters refuse before work', async () => {
  for (const corrupt of ['drop-fact', 'drop-attempt', 'counter', 'null-time', 'unsafe-time']) {
    const source = fixture();
    expect(await initializeObservationState(source.config)).toBe('initialized');
    const database = new Database(source.databasePath, { create: false, strict: true });
    if (corrupt === 'drop-fact') database.run('DROP TABLE activation_check_dispatch_fact');
    if (corrupt === 'drop-attempt') database.run('DROP TABLE activation_check_attempt');
    if (corrupt === 'counter')
      database.run(`UPDATE activation_observation_schedule
        SET attempt_sequence=1, burst_attempts=0, last_started_at=1000`);
    if (corrupt === 'null-time')
      database.run(`UPDATE activation_observation_schedule
        SET attempt_sequence=1, burst_attempts=1, last_started_at=NULL`);
    if (corrupt === 'unsafe-time')
      database.run(`UPDATE activation_observation_schedule
        SET attempt_sequence=1, burst_attempts=1, last_started_at=9007199254740992`);
    database.close();
    let called = 0;
    await expectRefusal(
      () =>
        withObservationAttempt(source.config, () => {
          called += 1;
          return Promise.resolve();
        }),
      corrupt === 'counter' || corrupt === 'null-time' || corrupt === 'unsafe-time'
        ? 'scheduler record malformed'
        : 'observation state partial',
    );
    expect(called).toBe(0);
  }
});

test('missing column or essential index and unsupported version refuse before work', async () => {
  for (const corrupt of [
    'column',
    'index',
    'version',
    'constraint',
    'weak-check',
    'wrong-index',
    'missing-pk',
    'missing-fk',
    'nullable-column',
  ]) {
    const source = fixture();
    expect(await initializeObservationState(source.config)).toBe('initialized');
    const database = new Database(source.databasePath, { create: false, strict: true });
    if (corrupt === 'column')
      database.run('ALTER TABLE activation_delivery DROP COLUMN payload_digest');
    if (corrupt === 'index') database.run('DROP INDEX activation_dispatch_request');
    if (corrupt === 'version') database.run('PRAGMA user_version = 10');
    if (corrupt === 'constraint') {
      database.run('DROP TABLE activation_check_dispatch_progress');
      database.run(`CREATE TABLE activation_check_dispatch_progress (
        effect_key TEXT PRIMARY KEY, state TEXT NOT NULL, dispatch_attempts INTEGER NOT NULL,
        owner_epoch INTEGER NOT NULL, owner_id TEXT NOT NULL, version INTEGER NOT NULL)`);
    }
    if (corrupt === 'weak-check') {
      database.run('DROP TABLE activation_review_dispatch_progress');
      database.run(`CREATE TABLE activation_review_dispatch_progress (
        effect_key TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(1),
        dispatch_attempts INTEGER NOT NULL CHECK(dispatch_attempts >= 0),
        owner_epoch INTEGER NOT NULL CHECK(owner_epoch >= 0),
        owner_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 0),
        FOREIGN KEY(effect_key) REFERENCES activation_review_dispatch(effect_key))`);
    }
    if (corrupt === 'wrong-index') {
      database.run('DROP INDEX activation_current_subject');
      database.run('CREATE INDEX activation_current_subject ON activation_delivery(source_id)');
    }
    if (['missing-pk', 'missing-fk', 'nullable-column'].includes(corrupt)) {
      database.run('DROP TABLE activation_review_dispatch_progress');
      database.run(`CREATE TABLE activation_review_dispatch_progress (
        effect_key TEXT ${corrupt === 'missing-pk' ? 'NOT NULL' : 'PRIMARY KEY'},
        state TEXT NOT NULL CHECK (state IN ('reserved', 'dispatching', 'uncertain', 'acknowledged', 'exhausted')),
        dispatch_attempts INTEGER NOT NULL CHECK (dispatch_attempts >= 0),
        owner_epoch INTEGER NOT NULL CHECK (owner_epoch >= 0),
        owner_id TEXT ${corrupt === 'nullable-column' ? '' : 'NOT NULL'},
        version INTEGER NOT NULL CHECK (version >= 0)
        ${corrupt === 'missing-fk' ? '' : ', FOREIGN KEY(effect_key) REFERENCES activation_review_dispatch(effect_key)'}
      )`);
    }
    database.close();
    let called = 0;
    await expectRefusal(
      () =>
        withObservationAttempt(source.config, () => {
          called += 1;
          return Promise.resolve();
        }),
      corrupt === 'version' ? 'schema unsupported' : 'state partial',
    );
    expect(called).toBe(0);
  }
});

test('scheduler refuses unconstrained duplicate-row schema before work', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run('DROP TABLE activation_observation_schedule');
  database.run(`CREATE TABLE activation_observation_schedule (
    singleton INTEGER, repository_id INTEGER NOT NULL, configuration_identity TEXT NOT NULL,
    attempt_sequence INTEGER NOT NULL, burst_attempts INTEGER NOT NULL, last_started_at INTEGER)`);
  const identity = hashCanonical({
    binding: source.config.binding,
    pin: source.config.pin,
    policy: source.config.policy,
  });
  database
    .query('INSERT INTO activation_observation_schedule VALUES (?, ?, ?, 0, 0, NULL)')
    .run(1, 8241, identity);
  database
    .query('INSERT INTO activation_observation_schedule VALUES (?, ?, ?, 0, 0, NULL)')
    .run(2, 8241, identity);
  database.close();
  let called = 0;
  await expectRefusal(
    () =>
      withObservationAttempt(source.config, () => {
        called += 1;
        return Promise.resolve();
      }),
    'scheduler schema malformed',
  );
  expect(called).toBe(0);
});

for (const fault of [
  'nullable-delivery-pk',
  'missing-review-unique',
  'split-attempt-fk',
  'wrong-delivery-affinity',
  'collated-delivery-pk',
]) {
  test(`${fault} refuses scheduled work without changing state`, async () => {
    const source = fixture();
    expect(await initializeObservationState(source.config)).toBe('initialized');
    const database = new Database(source.databasePath, { create: false, strict: true });
    const table =
      fault === 'nullable-delivery-pk' ||
      fault === 'wrong-delivery-affinity' ||
      fault === 'collated-delivery-pk'
        ? 'activation_delivery'
        : fault === 'missing-review-unique'
          ? 'activation_review_attempt'
          : 'activation_attempt';
    const owned = database
      .query("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?")
      .get(table) as { sql: string };
    const replacement =
      fault === 'nullable-delivery-pk'
        ? owned.sql.replace('source_id TEXT NOT NULL', 'source_id TEXT')
        : fault === 'wrong-delivery-affinity'
          ? owned.sql.replace('payload_digest TEXT NOT NULL', 'payload_digest INTEGER NOT NULL')
          : fault === 'collated-delivery-pk'
            ? owned.sql.replace('source_id TEXT NOT NULL', 'source_id TEXT NOT NULL COLLATE NOCASE')
            : fault === 'missing-review-unique'
              ? owned.sql.replace(
                  'invocation_id TEXT NOT NULL UNIQUE',
                  'invocation_id TEXT NOT NULL',
                )
              : owned.sql.replace(
                  /FOREIGN KEY \(request_identity, obligation_identity\)\s+REFERENCES activation_obligation\(request_identity, obligation_identity\)/,
                  'FOREIGN KEY(request_identity) REFERENCES activation_obligation(request_identity), FOREIGN KEY(obligation_identity) REFERENCES activation_obligation(obligation_identity)',
                );
    expect(replacement).not.toBe(owned.sql);
    const before = database.query('SELECT * FROM activation_observation_schedule').all();
    database.run(`DROP TABLE ${table}`);
    database.run(replacement);
    database.close();
    let called = 0;
    await expectRefusal(
      () =>
        withObservationAttempt(source.config, () => {
          called += 1;
          return Promise.resolve();
        }),
      'observation state partial',
    );
    expect(called).toBe(0);
    const reopened = new Database(source.databasePath, { create: false, strict: true });
    expect(reopened.query('SELECT * FROM activation_observation_schedule').all()).toEqual(before);
    expect(
      reopened.query("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table),
    ).toEqual({ sql: replacement });
    reopened.close();
  });
}

test('policy ceilings and invalid clock refuse without spending an attempt', async () => {
  const source = fixture();
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, maxSubjects: 0 },
      }),
    'must be at least 1',
  );
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, maxSubjects: 10_001 },
      }),
    'bounded limit',
  );
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, maxAttempts: 0 },
      }),
    'must be at least 1',
  );
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, wholeTickMs: 0 },
      }),
    'must be at least 1',
  );
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, maxAttempts: 101 },
      }),
    'bounded limit',
  );
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        policy: { ...source.config.policy, wholeTickMs: 3_600_001 },
      }),
    'bounded limit',
  );
  expect(await initializeObservationState(source.config)).toBe('initialized');
  for (const clock of [NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expectRefusal(
      () =>
        withObservationAttempt({ ...source.config, clock: () => clock }, () => Promise.resolve()),
      'clock malformed',
    );
  }
  expect(
    await withObservationAttempt(source.config, (attempt) => Promise.resolve(attempt.sequence)),
  ).toEqual({
    kind: 'owned',
    value: 1,
  });
});

test('malformed lock mode refuses without caller work', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  chmodSync(join(source.directory, 'observation.lock'), 0o644);
  let called = 0;
  await expectRefusal(
    () =>
      withObservationAttempt(source.config, () => {
        called += 1;
        return Promise.resolve();
      }),
    'lock inode malformed',
  );
  expect(called).toBe(0);
});

test('hard-linked lock inode refuses without caller work', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.config)).toBe('initialized');
  linkSync(join(source.directory, 'observation.lock'), join(source.directory, 'extra-lock-link'));
  let called = 0;
  await expectRefusal(
    () =>
      withObservationAttempt(source.config, () => {
        called += 1;
        return Promise.resolve();
      }),
    'lock inode malformed',
  );
  expect(called).toBe(0);
});

test('protected state path type refusal is named before lock path construction', async () => {
  const source = fixture();
  chmodSync(source.config.bootstrapPath, 0o700);
  await expectRefusal(
    () =>
      initializeObservationState({ ...source.config, stateDirectory: source.config.bootstrapPath }),
    'protected path malformed',
  );
  expect(existsSync(source.databasePath)).toBe(false);
});

test('protected-path owner check refuses wrong owner before initialization', async () => {
  const source = fixture();
  const originalGetuid = process.getuid;
  if (originalGetuid === undefined) throw new Error('fixture requires a POSIX UID');
  const actualUid = originalGetuid();
  let checks = 0;
  process.getuid = () => {
    checks += 1;
    return checks === 2 ? actualUid + 1 : actualUid;
  };
  try {
    await expectRefusal(
      () => initializeObservationState(source.config),
      'protected path malformed',
    );
  } finally {
    process.getuid = originalGetuid;
  }
  expect(existsSync(source.databasePath)).toBe(false);
});

test('lock owner check refuses an independently mismatched lock inode', async () => {
  const source = fixture();
  const configurationPath = join(source.directory, 'lock-config.json');
  writeFileSync(configurationPath, JSON.stringify(source.config), { mode: 0o600 });
  const child = Bun.spawn(
    [
      'bun',
      join(import.meta.dir, 'observation-state-ancestor-process.ts'),
      configurationPath,
      join(source.directory, 'observation.lock'),
      'lock',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(JSON.parse(output)).toEqual({ error: 'Error: observation lock inode malformed' });
  expect(existsSync(source.databasePath)).toBe(false);
});

test('two real processes cannot read concurrently and crash releases the same lock inode', async () => {
  const source = fixture();
  // Seed only the setup state so a watched early-release mutation cannot fail
  // first in initialization; the exercised owner is the real runtime path.
  createVersionEight(source);
  expect(await migrateObservationState(source.config)).toBe('migrated');
  const configurationPath = join(source.directory, 'process-config.json');
  writeFileSync(configurationPath, JSON.stringify(source.config), { mode: 0o600 });
  const markerPath = join(source.directory, 'entered');
  const probeMarker = join(source.directory, 'probe-entered');
  const releasePath = join(source.directory, 'release');
  const lockPath = join(source.directory, 'observation.lock');
  const firstInode = statSync(lockPath).ino;
  const processPath = join(import.meta.dir, 'observation-state-process.ts');
  const held = Bun.spawn(['bun', processPath, configurationPath, 'hold', markerPath, releasePath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const deadline = performance.now() + 5000;
    while (!existsSync(markerPath)) {
      if (held.exitCode !== null) {
        throw new Error(
          `first observation process exited: ${await new Response(held.stderr).text()}`,
        );
      }
      if (performance.now() >= deadline) throw new Error('first observation process did not enter');
      await Bun.sleep(10);
    }
    const probe = Bun.spawn(
      ['bun', processPath, configurationPath, 'probe', probeMarker, releasePath],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const probeText = await new Response(probe.stdout).text();
    expect(await probe.exited).toBe(0);
    expect(JSON.parse(probeText)).toEqual({ outcome: { kind: 'busy' }, calls: 0 });
    expect(existsSync(probeMarker)).toBe(false);
    expect(await initializeObservationState(source.config)).toBe('busy');
    expect(await migrateObservationState(source.config)).toBe('busy');
    held.kill(9);
    await held.exited;
    expect(statSync(lockPath).ino).toBe(firstInode);
    expect(
      await withObservationAttempt(source.config, (attempt) => Promise.resolve(attempt.sequence)),
    ).toEqual({ kind: 'owned', value: 2 });
  } finally {
    held.kill(9);
    await held.exited;
  }
});

test('scheduled open refuses wrong repository and policy bindings without spending an attempt', async () => {
  const source = fixture();
  await initializeObservationState(source.config);
  let calls = 0;
  const work = () => {
    calls += 1;
    return Promise.resolve();
  };
  await expectRefusal(
    () =>
      withObservationAttempt(
        { ...source.config, binding: { ...source.config.binding, repositoryId: 8242 } },
        work,
      ),
    'observation scheduler binding changed',
  );
  await expectRefusal(
    () =>
      withObservationAttempt(
        { ...source.config, policy: { ...source.config.policy, maxAttempts: 3 } },
        work,
      ),
    'observation scheduler binding changed',
  );
  expect(calls).toBe(0);
  expect(
    await withObservationAttempt(source.config, (attempt) => Promise.resolve(attempt.sequence)),
  ).toEqual({ kind: 'owned', value: 1 });
});

test('scheduled open refuses missing and malformed scheduler record without repair', async () => {
  for (const mutation of ['missing', 'malformed'] as const) {
    const source = fixture();
    await initializeObservationState(source.config);
    const database = new Database(source.databasePath, { create: false, strict: true });
    if (mutation === 'missing') database.run('DELETE FROM activation_observation_schedule');
    else database.run("UPDATE activation_observation_schedule SET configuration_identity = 'bad'");
    database.close();
    const before = readFileSync(source.databasePath);
    await expectRefusal(
      () => withObservationAttempt(source.config, () => Promise.resolve()),
      mutation === 'missing' ? 'scheduler record absent' : 'configuration_identity',
    );
    expect(readFileSync(source.databasePath)).toEqual(before);
  }
});

test('scheduled open refuses partial established controller schema before work', async () => {
  const source = fixture();
  await initializeObservationState(source.config);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run('DROP TABLE activation_delivery');
  database.close();
  let calls = 0;
  await expectRefusal(
    () =>
      withObservationAttempt(source.config, () => {
        calls += 1;
        return Promise.resolve();
      }),
    'observation state partial',
  );
  expect(calls).toBe(0);
});

test('protected state and bootstrap modes refuse before initialization', async () => {
  for (const target of ['directory', 'bootstrap'] as const) {
    const source = fixture();
    chmodSync(target === 'directory' ? source.directory : source.config.bootstrapPath, 0o755);
    await expectRefusal(
      () => initializeObservationState(source.config),
      'observation protected path malformed',
    );
    expect(existsSync(source.databasePath)).toBe(false);
  }
});

test('explicit initialization refuses an unpinned bootstrap without creating state', async () => {
  const source = fixture();
  await expectRefusal(
    () =>
      initializeObservationState({
        ...source.config,
        pin: { ...source.config.pin, identity: 'f'.repeat(64) },
      }),
    'bootstrap configuration differs from independent pin',
  );
  expect(existsSync(source.databasePath)).toBe(false);
});
