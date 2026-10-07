import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
    policy: { maxAttempts: 2, wholeTickMs: 5000 },
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

function seedVersionNineForLockTest(source: ReturnType<typeof fixture>): void {
  createVersionEight(source);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run(`CREATE TABLE activation_observation_schedule (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), repository_id INTEGER NOT NULL,
    configuration_identity TEXT NOT NULL, attempt_sequence INTEGER NOT NULL,
    burst_attempts INTEGER NOT NULL, last_started_at INTEGER)`);
  database.query(`INSERT INTO activation_observation_schedule VALUES (1, ?, ?, 0, 0, NULL)`).run(
    source.config.binding.repositoryId,
    hashCanonical({
      binding: source.config.binding,
      pin: source.config.pin,
      policy: source.config.policy,
    }),
  );
  database.run('PRAGMA user_version = 9');
  database.close();
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

test('two real processes cannot read concurrently and crash releases the same lock inode', async () => {
  const source = fixture();
  // Seed only the setup state so a watched early-release mutation cannot fail
  // first in initialization; the exercised owner is the real runtime path.
  seedVersionNineForLockTest(source);
  const configurationPath = join(source.directory, 'process-config.json');
  writeFileSync(configurationPath, JSON.stringify(source.config), { mode: 0o600 });
  const markerPath = join(source.directory, 'entered');
  const probeMarker = join(source.directory, 'probe-entered');
  const releasePath = join(source.directory, 'release');
  const lockPath = join(source.directory, 'observation.lock');
  writeFileSync(lockPath, '', { flag: 'wx', mode: 0o600 });
  const firstInode = statSync(lockPath).ino;
  const processPath = join(import.meta.dir, 'observation-state-process.ts');
  const held = Bun.spawn(['bun', processPath, configurationPath, 'hold', markerPath, releasePath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const deadline = performance.now() + 5000;
    while (!existsSync(markerPath)) {
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
