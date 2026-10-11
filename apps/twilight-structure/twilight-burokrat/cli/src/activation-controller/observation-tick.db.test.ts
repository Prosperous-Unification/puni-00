import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { ActivationController } from './controller';
import { GitHubReadFailure } from './github-reader';
import { observationExitCode, runObservationCli } from './observation-cli';
import {
  initializeObservationState,
  migrateObservationRecoveryState,
  withObservationAttempt,
} from './observation-state';
import { runObservationTick } from './observation-tick';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('v9 scheduler explicitly migrates to durable recovery state before a tick', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.state)).toBe('initialized');
  expect(await migrateObservationRecoveryState(source.state)).toBe('migrated');
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 10 });
    expect(
      database.query('SELECT COUNT(*) AS count FROM activation_observation_attempt').get(),
    ).toEqual({
      count: 0,
    });
  } finally {
    database.close();
  }
});

test('scheduled tick refuses a version-nine marker even when recovery tables exist', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  const database = new Database(source.databasePath, { create: false, strict: true });
  database.run('PRAGMA user_version = 9');
  database.close();
  let reads = 0;
  await expectTickRefusal(
    runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
    'observation recovery schema unsupported',
  );
  expect(reads).toBe(0);
});

test('provider cooldown is committed with a failed attempt and survives reopen', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  let reads = 0;
  const reader = {
    listOpenPullRequests: () => {
      reads += 1;
      return Promise.reject(new GitHubReadFailure('rate-limited', 'rate limited', 429, 1700));
    },
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  };
  await expectTickRefusal(
    runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader,
    }),
    'observation tick failed',
  );
  expect(reads).toBe(1);
  const first = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      first
        .query('SELECT attempt_sequence, burst_attempts FROM activation_observation_schedule')
        .get(),
    ).toEqual({
      attempt_sequence: 1,
      burst_attempts: 1,
    });
    expect(
      first.query('SELECT outcome FROM activation_observation_attempt WHERE sequence = 1').get(),
    ).toEqual({
      outcome: 'provider-failure',
    });
    expect(
      first.query('SELECT next_attempt_at FROM activation_observation_recovery').get(),
    ).toEqual({
      next_attempt_at: 1700,
    });
  } finally {
    first.close();
  }
  expect(
    await runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader,
    }),
  ).toEqual({ kind: 'deferred' });
  expect(reads).toBe(1);
});

test('an exhausted burst remains failed until a complete recovery probe', async () => {
  const source = fixture();
  let clock = 1000;
  const state = { ...source.state, clock: () => clock };
  await initializeObservationState(state);
  await migrateObservationRecoveryState(state);
  let reads = 0;
  let succeed = false;
  const reader = {
    listOpenPullRequests: () => {
      reads += 1;
      return succeed
        ? Promise.resolve({ pulls: [], nextPage: null })
        : Promise.reject(new GitHubReadFailure('unavailable', 'transient unavailable'));
    },
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  };
  const tick = () =>
    runObservationTick({ state, reader, signal: new AbortController().signal, cleanupMs: 100 });
  await expectTickRefusal(tick(), 'observation tick failed');
  clock = 1200;
  await expectTickRefusal(tick(), 'observation tick failed');
  clock = 2199;
  expect(await tick()).toEqual({ kind: 'deferred' });
  expect(reads).toBe(2);
  const failed = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      failed.query('SELECT health, next_attempt_at FROM activation_observation_recovery').get(),
    ).toEqual({
      health: 'failed',
      next_attempt_at: 2200,
    });
  } finally {
    failed.close();
  }
  clock = 2200;
  await expectTickRefusal(tick(), 'observation tick failed');
  expect(reads).toBe(3);
  const stillFailed = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      stillFailed
        .query('SELECT health, next_attempt_at FROM activation_observation_recovery')
        .get(),
    ).toEqual({
      health: 'failed',
      next_attempt_at: 3200,
    });
  } finally {
    stillFailed.close();
  }
  clock = 3200;
  succeed = true;
  expect(await tick()).toEqual({ kind: 'complete', requestCount: 0 });
  const recovered = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      recovered
        .query('SELECT attempt_sequence, burst_attempts FROM activation_observation_schedule')
        .get(),
    ).toEqual({
      attempt_sequence: 4,
      burst_attempts: 0,
    });
    expect(
      recovered.query('SELECT health, next_attempt_at FROM activation_observation_recovery').get(),
    ).toEqual({
      health: 'healthy',
      next_attempt_at: null,
    });
    expect(
      recovered
        .query(
          'SELECT sequence, kind, outcome FROM activation_observation_attempt ORDER BY sequence',
        )
        .all(),
    ).toEqual([
      { sequence: 1, kind: 'burst', outcome: 'provider-failure' },
      { sequence: 2, kind: 'burst', outcome: 'provider-failure' },
      { sequence: 3, kind: 'recovery', outcome: 'provider-failure' },
      { sequence: 4, kind: 'recovery', outcome: 'complete' },
    ]);
  } finally {
    recovered.close();
  }
  clock = 3100;
  await expectTickRefusal(tick(), 'observation clock rolled back');
  expect(reads).toBe(4);
});

test('provider minimum beyond the local horizon is never shortened', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  let reads = 0;
  const reader = {
    listOpenPullRequests: () => {
      reads += 1;
      return Promise.reject(new GitHubReadFailure('rate-limited', 'retry later', 429, 100_000));
    },
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  };
  const tick = () =>
    runObservationTick({
      state: source.state,
      reader,
      signal: new AbortController().signal,
      cleanupMs: 100,
    });
  await expectTickRefusal(tick(), 'observation tick failed');
  expect(await tick()).toEqual({ kind: 'deferred' });
  expect(reads).toBe(1);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database
        .query('SELECT provider_not_before, next_attempt_at FROM activation_observation_recovery')
        .get(),
    ).toEqual({
      provider_not_before: 100_000,
      next_attempt_at: 100_000,
    });
  } finally {
    database.close();
  }
});

for (const corruption of [
  'missing-attempt',
  'wrong-binding',
  'missing-recovery-table',
  'weakened-recovery-table',
] as const)
  test(`partial v10 ${corruption} refuses without provider work or repair`, async () => {
    const source = fixture();
    await initializeObservationState(source.state);
    await migrateObservationRecoveryState(source.state);
    const emptyReader = {
      listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
      getPullRequest: () => Promise.reject(new Error('unexpected current read')),
    };
    if (corruption === 'missing-attempt')
      expect(
        await runObservationTick({
          state: source.state,
          reader: emptyReader,
          signal: new AbortController().signal,
          cleanupMs: 100,
        }),
      ).toEqual({ kind: 'complete', requestCount: 0 });
    const database = new Database(source.databasePath, { create: false, strict: true });
    try {
      if (corruption === 'missing-attempt')
        database.run('DELETE FROM activation_observation_attempt WHERE sequence = 1');
      if (corruption === 'wrong-binding')
        database.run(
          `UPDATE activation_observation_recovery SET configuration_identity = '${'f'.repeat(64)}'`,
        );
      if (corruption === 'missing-recovery-table')
        database.run('DROP TABLE activation_observation_recovery');
      if (corruption === 'weakened-recovery-table') {
        database.run('ALTER TABLE activation_observation_recovery RENAME TO recovery_backup');
        database.run(
          'CREATE TABLE activation_observation_recovery AS SELECT * FROM recovery_backup',
        );
        database.run('DROP TABLE recovery_backup');
      }
    } finally {
      database.close();
    }
    let reads = 0;
    const reader = {
      listOpenPullRequests: () => {
        reads += 1;
        return Promise.resolve({ pulls: [], nextPage: null });
      },
      getPullRequest: emptyReader.getPullRequest,
    };
    await expectTickRefusal(
      runObservationTick({
        state: source.state,
        reader,
        signal: new AbortController().signal,
        cleanupMs: 100,
      }),
    );
    expect(reads).toBe(0);
    const reopened = new Database(source.databasePath, { create: false, strict: true });
    try {
      expect(reopened.query('PRAGMA user_version').get()).toEqual({ user_version: 10 });
      if (corruption === 'missing-attempt')
        expect(
          reopened.query('SELECT COUNT(*) AS count FROM activation_observation_attempt').get(),
        ).toEqual({ count: 0 });
      if (corruption === 'wrong-binding')
        expect(
          reopened
            .query('SELECT configuration_identity FROM activation_observation_recovery')
            .get(),
        ).toEqual({ configuration_identity: 'f'.repeat(64) });
    } finally {
      reopened.close();
    }
  });

test('corrupt exhausted burst cannot start a third burst', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  const failureReader = {
    listOpenPullRequests: () => Promise.reject(new GitHubReadFailure('unavailable', 'unavailable')),
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  };
  let clock = 1000;
  const state = { ...source.state, clock: () => clock };
  for (const at of [1000, 1200]) {
    clock = at;
    await expectTickRefusal(
      runObservationTick({
        state,
        reader: failureReader,
        signal: new AbortController().signal,
        cleanupMs: 100,
      }),
    );
  }
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    database.run(
      "UPDATE activation_observation_recovery SET health='unknown', mode='burst', next_attempt_at=NULL",
    );
  } finally {
    database.close();
  }
  let reads = 0;
  let refusal: unknown;
  try {
    await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    });
  } catch (cause) {
    refusal = cause;
  }
  expect(reads).toBe(0);
  expect(String(refusal)).toContain('observation recovery record malformed');
  const after = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      after
        .query('SELECT attempt_sequence, burst_attempts FROM activation_observation_schedule')
        .get(),
    ).toEqual({ attempt_sequence: 2, burst_attempts: 2 });
  } finally {
    after.close();
  }
});

test('attempt sequence overflow refuses before provider read', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    database
      .query('UPDATE activation_observation_schedule SET attempt_sequence=?, last_started_at=1000')
      .run(Number.MAX_SAFE_INTEGER);
    database
      .query('UPDATE activation_observation_recovery SET legacy_watermark=?, last_clock_at=1000')
      .run(Number.MAX_SAFE_INTEGER);
  } finally {
    database.close();
  }
  let reads = 0;
  let refusal: unknown;
  try {
    await runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    });
  } catch (cause) {
    refusal = cause;
  }
  expect(reads).toBe(0);
  expect(String(refusal)).toContain('observation attempt sequence overflow');
});

test('reservation insert failure rolls back sequence before any provider read', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  const queryDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = queryDescriptor?.value;
  if (queryDescriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  let reads = 0;
  Object.defineProperty(Database.prototype, 'query', {
    ...queryDescriptor,
    value: function failJournalInsert(this: Database, sql: string) {
      if (sql.includes('INSERT INTO activation_observation_attempt'))
        throw new Error('reservation journal insert sentinel');
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  try {
    await expectTickRefusal(
      runObservationTick({
        state: source.state,
        signal: new AbortController().signal,
        cleanupMs: 100,
        reader: {
          listOpenPullRequests: () => {
            reads += 1;
            return Promise.resolve({ pulls: [], nextPage: null });
          },
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      }),
      'reservation journal insert sentinel',
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', queryDescriptor);
  }
  expect(reads).toBe(0);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database
        .query('SELECT attempt_sequence, burst_attempts FROM activation_observation_schedule')
        .get(),
    ).toEqual({ attempt_sequence: 0, burst_attempts: 0 });
    expect(
      database.query('SELECT active_sequence FROM activation_observation_recovery').get(),
    ).toEqual({ active_sequence: null });
    expect(
      database.query('SELECT COUNT(*) AS count FROM activation_observation_attempt').get(),
    ).toEqual({ count: 0 });
  } finally {
    database.close();
  }
});

test('terminal singleton write failure rolls back attempt outcome and cooldown together', async () => {
  const source = fixture();
  await initializeObservationState(source.state);
  await migrateObservationRecoveryState(source.state);
  const queryDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = queryDescriptor?.value;
  if (queryDescriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  Object.defineProperty(Database.prototype, 'query', {
    ...queryDescriptor,
    value: function failTerminalRecovery(this: Database, sql: string) {
      if (sql.includes('UPDATE activation_observation_recovery SET active_sequence=NULL, health='))
        throw new Error('terminal recovery write sentinel');
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  try {
    await expectTickRefusal(
      runObservationTick({
        state: source.state,
        signal: new AbortController().signal,
        cleanupMs: 100,
        reader: {
          listOpenPullRequests: () =>
            Promise.reject(new GitHubReadFailure('rate-limited', 'rate limited', 429, 1700)),
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      }),
      'observation and finalization failed',
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', queryDescriptor);
  }
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database
        .query('SELECT outcome, provider_not_before FROM activation_observation_attempt')
        .get(),
    ).toEqual({ outcome: null, provider_not_before: null });
    expect(
      database
        .query(
          'SELECT active_sequence, provider_not_before, next_attempt_at FROM activation_observation_recovery',
        )
        .get(),
    ).toEqual({ active_sequence: 1, provider_not_before: null, next_attempt_at: null });
  } finally {
    database.close();
  }
});

for (const corruption of ['classification', 'history'] as const)
  test(`corrupt ${corruption} cannot authorize another provider read`, async () => {
    const source = fixture();
    await initializeObservationState(source.state);
    await migrateObservationRecoveryState(source.state);
    const failureReader = {
      listOpenPullRequests: () =>
        Promise.reject(new GitHubReadFailure('unavailable', 'unavailable')),
      getPullRequest: () => Promise.reject(new Error('unexpected current read')),
    };
    await expectTickRefusal(
      runObservationTick({
        state: source.state,
        reader: failureReader,
        signal: new AbortController().signal,
        cleanupMs: 100,
      }),
    );
    const database = new Database(source.databasePath, { create: false, strict: true });
    try {
      if (corruption === 'classification')
        database.run(
          "UPDATE activation_observation_attempt SET classification='complete' WHERE sequence=1",
        );
      else database.run('UPDATE activation_observation_recovery SET last_failure_sequence=NULL');
    } finally {
      database.close();
    }
    let reads = 0;
    let refusal: unknown;
    try {
      await runObservationTick({
        state: { ...source.state, clock: () => 1200 },
        signal: new AbortController().signal,
        cleanupMs: 100,
        reader: {
          listOpenPullRequests: () => {
            reads += 1;
            return Promise.resolve({ pulls: [], nextPage: null });
          },
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      });
    } catch (cause) {
      refusal = cause;
    }
    expect(reads).toBe(0);
    expect(String(refusal)).toContain(
      corruption === 'classification'
        ? 'observation recovery attempt inconsistent'
        : 'observation recovery terminal history changed',
    );
  });

async function initializeTickState(
  state: Parameters<typeof initializeObservationState>[0],
): Promise<'initialized' | 'busy'> {
  const created = await initializeObservationState(state);
  if (created === 'initialized')
    expect(await migrateObservationRecoveryState(state)).toBe('migrated');
  return created;
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-observation-tick-'));
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
  const state = {
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
    policy: {
      maxAttempts: 2,
      wholeTickMs: 500,
      maxSubjects: 100,
      initialDelayMs: 100,
      maxDelayMs: 400,
      fallbackDelayMs: 200,
      recoveryProbeMs: 1000,
      horizonMs: 5000,
    },
    clock: () => 1000,
  };
  const pull = {
    number: 282,
    state: 'open',
    draft: false,
    head: { sha: '1'.repeat(40), repo: { id: 8241 } },
    base: { sha: '2'.repeat(40), ref: 'main', repo: { id: 8241 } },
  };
  return { state, pull, databasePath: join(directory, 'activation.sqlite') };
}

function requestCount(path: string): number {
  const database = new Database(path, { create: false, strict: true });
  try {
    const row = database.query('SELECT COUNT(*) AS count FROM activation_request').get() as {
      count: number;
    };
    return row.count;
  } finally {
    database.close();
  }
}

function observationRows(path: string): Record<string, number> {
  const database = new Database(path, { create: false, strict: true });
  try {
    const counts: Record<string, number> = {};
    for (const table of [
      'activation_obligation',
      'activation_attempt',
      'activation_review_attempt',
      'activation_review_dispatch',
      'activation_check_attempt',
      'activation_check_dispatch',
    ]) {
      const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      };
      counts[table] = row.count;
    }
    const request = database.query('SELECT stage, lease_owner FROM activation_request').get() as {
      stage: string;
      lease_owner: string | null;
    };
    expect(request.stage).toBe('observed');
    expect(request.lease_owner).toBeNull();
    return counts;
  } finally {
    database.close();
  }
}

async function expectTickRefusal(pending: Promise<unknown>, message?: string): Promise<void> {
  let cause: unknown;
  try {
    await pending;
  } catch (failure) {
    cause = failure;
  }
  expect(cause).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(cause)).toContain(message);
}

async function finishWithin<T>(pending: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('tick test watchdog expired'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

test('one complete tick records the selected PR without downstream work', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const aborter = new AbortController();
  const originalFetch = globalThis.fetch;
  let forbiddenCalls = 0;
  globalThis.fetch = Object.assign(
    () => {
      forbiddenCalls += 1;
      return Promise.resolve(new Response('unexpected effect'));
    },
    { preconnect: originalFetch.preconnect },
  );
  let outcome;
  try {
    outcome = await runObservationTick({
      state: source.state,
      signal: aborter.signal,
      cleanupMs: 500,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
        getPullRequest: () => Promise.resolve(source.pull),
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(outcome).toEqual({ kind: 'complete', requestCount: 1 });
  expect(forbiddenCalls).toBe(0);
  expect(requestCount(source.databasePath)).toBe(1);
  expect(Object.values(observationRows(source.databasePath))).toEqual([0, 0, 0, 0, 0, 0]);
});

test('composed tick binds protected subject cap before any current read', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, maxSubjects: 1 } };
  expect(await initializeTickState(state)).toBe('initialized');
  let currentReads = 0;
  let refusal: unknown;
  try {
    await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 500,
      reader: {
        listOpenPullRequests: () =>
          Promise.resolve({
            pulls: [source.pull, { ...source.pull, number: 283 }],
            nextPage: null,
          }),
        getPullRequest: (_owner, _name, number) => {
          currentReads += 1;
          return Promise.resolve(
            number === source.pull.number ? source.pull : { ...source.pull, number },
          );
        },
      },
    });
  } catch (cause) {
    refusal = cause;
  }
  expect(String(refusal)).toContain('observation tick failed');
  expect(currentReads).toBe(0);
  expect(requestCount(source.databasePath)).toBe(0);
});

test('CLI status mapping never reports busy, cancellation or failure as success', async () => {
  expect(observationExitCode({ kind: 'complete', requestCount: 0 })).toBe(0);
  expect(observationExitCode({ kind: 'busy' })).toBe(75);
  expect(observationExitCode({ kind: 'cancelled' })).toBe(124);
  expect(observationExitCode({ kind: 'cancelled' }, 'SIGINT')).toBe(130);
  expect(observationExitCode({ kind: 'cancelled' }, 'SIGTERM')).toBe(143);
  const source = fixture();
  let reads = 0;
  const diagnostics: unknown[] = [];
  expect(
    await runObservationCli({
      state: source.state,
      cleanupMs: 200,
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
  ).toBe(1);
  expect(reads).toBe(0);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-failure',
      code: 'tick-failed',
      action: 'inspect protected observation state and provider health',
    },
  ]);
});

test('CLI diagnostic redacts provider credentials and never reports raw errors', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const diagnostics: unknown[] = [];
  const code = await runObservationCli({
    state: source.state,
    cleanupMs: 200,
    reportDiagnostic: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
    reader: {
      listOpenPullRequests: () => Promise.reject(new Error('Bearer harmless-sentinel-token')),
      getPullRequest: () => Promise.reject(new Error('unexpected current read')),
    },
  });
  expect(code).toBe(1);
  expect(diagnostics).toHaveLength(1);
  expect(JSON.stringify(diagnostics)).not.toContain('harmless-sentinel-token');
  expect(JSON.stringify(diagnostics)).toContain('inspect protected observation state');
});

test('already cancelled tick acquires no lock and calls no provider', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const aborter = new AbortController();
  aborter.abort();
  let reads = 0;
  const outcome = await runObservationTick({
    state: source.state,
    signal: aborter.signal,
    cleanupMs: 200,
    reader: {
      listOpenPullRequests: () => {
        reads += 1;
        return Promise.resolve({ pulls: [], nextPage: null });
      },
      getPullRequest: () => {
        reads += 1;
        return Promise.resolve(source.pull);
      },
    },
  });
  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(reads).toBe(0);
  expect(requestCount(source.databasePath)).toBe(0);
});

test('cleanup and whole-tick budgets refuse malformed values before provider work', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  let reads = 0;
  const reader = {
    listOpenPullRequests: () => {
      reads += 1;
      return Promise.resolve({ pulls: [], nextPage: null });
    },
    getPullRequest: () => {
      reads += 1;
      return Promise.resolve(source.pull);
    },
  };
  for (const cleanupMs of [0, Number.NaN, 60_001]) {
    let caught: unknown;
    try {
      await runObservationTick({
        state: source.state,
        signal: new AbortController().signal,
        cleanupMs,
        reader,
      });
    } catch (cause) {
      caught = cause;
    }
    expect(String(caught)).toContain('observation cleanup budget malformed');
  }
  for (const wholeTickMs of [0, Number.NaN, 3_600_001]) {
    let caught: unknown;
    try {
      await runObservationTick({
        state: { ...source.state, policy: { ...source.state.policy, wholeTickMs } },
        signal: new AbortController().signal,
        cleanupMs: 200,
        reader,
      });
    } catch (cause) {
      caught = cause;
    }
    expect(String(caught)).toContain('observation whole-tick budget malformed');
  }
  expect(reads).toBe(0);
  expect(requestCount(source.databasePath)).toBe(0);
});

test('tick preserves both provider failure and controller cleanup failure', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const closeDescriptor = Object.getOwnPropertyDescriptor(ActivationController.prototype, 'close');
  const originalClose: unknown = closeDescriptor?.value;
  if (typeof originalClose !== 'function') throw new Error('controller close fixture absent');
  ActivationController.prototype.close = function () {
    Reflect.apply(originalClose, this, []);
    throw new Error('controller close sentinel');
  };
  try {
    let caught: unknown;
    try {
      await runObservationTick({
        state: source.state,
        signal: new AbortController().signal,
        cleanupMs: 200,
        reader: {
          listOpenPullRequests: () => Promise.reject(new Error('provider sentinel')),
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      });
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map(String)).toEqual([
      'Error: provider sentinel',
      'Error: controller close sentinel',
    ]);
    expect(requestCount(source.databasePath)).toBe(0);
  } finally {
    if (closeDescriptor !== undefined)
      Object.defineProperty(ActivationController.prototype, 'close', closeDescriptor);
  }
});

test('abort-ignoring current reader settles before terminal journal close', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const aborter = new AbortController();
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let readerSignal: AbortSignal | undefined;
  let closes = 0;
  const closeDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'close');
  const originalClose: unknown = closeDescriptor?.value;
  if (typeof originalClose !== 'function') throw new Error('database close fixture absent');
  Database.prototype.close = function () {
    closes += 1;
    Reflect.apply(originalClose, this, []);
  };
  try {
    const tick = runObservationTick({
      state: source.state,
      signal: aborter.signal,
      cleanupMs: 200,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
        getPullRequest: (_owner, _name, _number, signal) => {
          readerSignal = signal;
          markStarted?.();
          return new Promise<never>(() => {
            /* An abort-ignoring provider never settles. */
          });
        },
      },
    });
    await finishWithin(started, 200);
    expect(closes).toBe(1);
    aborter.abort();
    expect(readerSignal?.aborted).toBe(true);
    expect(await finishWithin(tick, 150)).toEqual({ kind: 'cancelled' });
    expect(closes).toBe(3);
  } finally {
    if (closeDescriptor !== undefined)
      Object.defineProperty(Database.prototype, 'close', closeDescriptor);
  }
  expect(requestCount(source.databasePath)).toBe(0);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database.query('SELECT outcome, classification FROM activation_observation_attempt').get(),
    ).toEqual({
      outcome: 'cancelled',
      classification: null,
    });
    expect(
      database
        .query('SELECT health, last_failure_sequence FROM activation_observation_recovery')
        .get(),
    ).toEqual({
      health: 'unknown',
      last_failure_sequence: null,
    });
  } finally {
    database.close();
  }
});

test('synchronous current work cannot commit after whole-tick deadline', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 5 } };
  expect(await initializeTickState(state)).toBe('initialized');
  const outcome = await runObservationTick({
    state,
    signal: new AbortController().signal,
    cleanupMs: 200,
    reader: {
      listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
      getPullRequest: () => {
        const until = performance.now() + 20;
        while (performance.now() < until) {
          /* The event-loop timer cannot fire. */
        }
        return Promise.resolve(source.pull);
      },
    },
  });
  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(requestCount(source.databasePath)).toBe(0);
});

test('transaction crossing monotonic deadline rolls back every subject write', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 500 } };
  expect(await initializeTickState(state)).toBe('initialized');
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = descriptor?.value;
  if (descriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  let blocked = false;
  Object.defineProperty(Database.prototype, 'query', {
    ...descriptor,
    value: function (this: Database, sql: string) {
      if (sql.includes('INSERT INTO activation_request') && !blocked) {
        blocked = true;
        const until = performance.now() + 600;
        while (performance.now() < until) {
          /* Hold the writer inside its transaction. */
        }
      }
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  try {
    const outcome = await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 200,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
        getPullRequest: () => Promise.resolve(source.pull),
      },
    });
    expect(blocked).toBe(true);
    expect(outcome).toEqual({ kind: 'cancelled' });
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
  }
  expect(requestCount(source.databasePath)).toBe(0);
});

test('cancelled later subject preserves the earlier committed observation', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  let markSecond: (() => void) | undefined;
  const secondStarted = new Promise<void>((resolve) => {
    markSecond = resolve;
  });
  const second = {
    ...source.pull,
    number: 283,
    head: { ...source.pull.head, sha: '9'.repeat(40) },
  };
  const aborter = new AbortController();
  const tick = runObservationTick({
    state: source.state,
    signal: aborter.signal,
    cleanupMs: 200,
    reader: {
      listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull, second], nextPage: null }),
      getPullRequest: (_owner, _name, number) => {
        if (number === 282) return Promise.resolve(source.pull);
        markSecond?.();
        return new Promise<never>(() => {
          /* The second provider response stays held. */
        });
      },
    },
  });
  await finishWithin(secondStarted, 200);
  aborter.abort();
  expect(await finishWithin(tick, 150)).toEqual({ kind: 'cancelled' });
  expect(requestCount(source.databasePath)).toBe(1);
});

test('unsettled local continuation terminates with the process lock still owned', async () => {
  const source = fixture();
  expect(await initializeTickState(source.state)).toBe('initialized');
  const configurationPath = join(source.state.stateDirectory, 'tick-process-config.json');
  const enteredPath = join(source.state.stateDirectory, 'tick-entered');
  const closedPath = join(source.state.stateDirectory, 'tick-closed');
  writeFileSync(configurationPath, JSON.stringify(source.state), { mode: 0o600 });
  const child = Bun.spawn(
    [
      'bun',
      join(import.meta.dir, 'observation-tick-process.ts'),
      configurationPath,
      enteredPath,
      closedPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  try {
    await finishWithin(
      (async () => {
        while (!existsSync(enteredPath)) {
          if (child.exitCode !== null)
            throw new Error(
              `tick process exited early: ${await new Response(child.stderr).text()}`,
            );
          await Bun.sleep(10);
        }
      })(),
      2000,
    );
    expect(await withObservationAttempt(source.state, () => Promise.resolve('unexpected'))).toEqual(
      { kind: 'busy' },
    );
    expect(await finishWithin(child.exited, 2000)).toBe(124);
    expect(existsSync(closedPath)).toBe(false);
    expect(requestCount(source.databasePath)).toBe(0);
  } finally {
    child.kill(9);
    await child.exited;
  }
  const pending = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      pending.query('SELECT sequence, outcome FROM activation_observation_attempt').get(),
    ).toEqual({
      sequence: 1,
      outcome: null,
    });
  } finally {
    pending.close();
  }
  let reads = 0;
  const reader = {
    listOpenPullRequests: () => {
      reads += 1;
      return Promise.resolve({ pulls: [], nextPage: null });
    },
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  };
  expect(
    await runObservationTick({
      state: source.state,
      reader,
      signal: new AbortController().signal,
      cleanupMs: 100,
    }),
  ).toEqual({ kind: 'deferred' });
  expect(reads).toBe(0);
  const sealed = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      sealed.query('SELECT sequence, outcome FROM activation_observation_attempt').get(),
    ).toEqual({
      sequence: 1,
      outcome: 'interrupted',
    });
    expect(
      sealed
        .query('SELECT attempt_sequence, burst_attempts FROM activation_observation_schedule')
        .get(),
    ).toEqual({
      attempt_sequence: 1,
      burst_attempts: 1,
    });
  } finally {
    sealed.close();
  }
  expect(
    await runObservationTick({
      state: { ...source.state, clock: () => 1100 },
      reader,
      signal: new AbortController().signal,
      cleanupMs: 100,
    }),
  ).toEqual({ kind: 'complete', requestCount: 0 });
  expect(reads).toBe(1);
});

for (const phase of ['controller', 'scheduler', 'terminal'] as const)
  test(`synchronous close overrun in ${phase} exits fatally before releasing the process lock`, async () => {
    const source = fixture();
    const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 300 } };
    expect(await initializeTickState(state)).toBe('initialized');
    const configurationPath = join(state.stateDirectory, 'close-process-config.json');
    const enteredPath = join(state.stateDirectory, 'close-entered');
    const returnedPath = join(state.stateDirectory, 'close-returned');
    writeFileSync(configurationPath, JSON.stringify(state), { mode: 0o600 });
    const child = Bun.spawn(
      [
        'bun',
        join(import.meta.dir, 'observation-close-process.ts'),
        configurationPath,
        enteredPath,
        returnedPath,
        phase,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    try {
      await finishWithin(
        (async () => {
          while (!existsSync(enteredPath)) {
            if (child.exitCode !== null)
              throw new Error(
                `close fixture exited early: ${await new Response(child.stderr).text()}`,
              );
            await Bun.sleep(10);
          }
        })(),
        2000,
      );
      expect(await withObservationAttempt(state, () => Promise.resolve('unexpected'))).toEqual({
        kind: 'busy',
      });
      expect(await finishWithin(child.exited, 2000)).toBe(124);
      expect(existsSync(returnedPath)).toBe(false);
      expect(requestCount(source.databasePath)).toBe(0);
    } finally {
      child.kill(9);
      await child.exited;
    }
  });

test('synchronous close crossing the tick deadline within cleanup grace cannot return complete', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 80 } };
  expect(await initializeTickState(state)).toBe('initialized');
  const originalClose: (this: ActivationController) => void = Reflect.get(
    ActivationController.prototype,
    'close',
  );
  ActivationController.prototype.close = function closeAfterDeadline() {
    const until = performance.now() + 90;
    while (performance.now() < until) {
      /* Model synchronous SQLite teardown. */
    }
    originalClose.call(this);
  };
  try {
    const outcome = await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 500,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    });
    expect(outcome).toEqual({ kind: 'cancelled' });
  } finally {
    ActivationController.prototype.close = originalClose;
  }
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'cancelled',
    });
  } finally {
    database.close();
  }
});

test('cancelled last burst reservation reopens in recovery mode', async () => {
  const source = fixture();
  let clock = 1000;
  const state = {
    ...source.state,
    clock: () => clock,
    policy: { ...source.state.policy, maxAttempts: 1 },
  };
  await initializeTickState(state);
  const aborter = new AbortController();
  expect(
    await runObservationTick({
      state,
      signal: aborter.signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          aborter.abort();
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
  ).toEqual({ kind: 'cancelled' });
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(
      database.query('SELECT mode, health FROM activation_observation_recovery').get(),
    ).toEqual({
      mode: 'recovery',
      health: 'unknown',
    });
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'cancelled',
    });
  } finally {
    database.close();
  }
  clock = 10_000;
  expect(
    await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
  ).toEqual({ kind: 'complete', requestCount: 0 });
});

test('scheduler close crossing deadline cannot persist complete attempt', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 80 } };
  await initializeTickState(state);
  const queryDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = queryDescriptor?.value;
  if (queryDescriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  const originalClose: (this: Database) => void = Reflect.get(Database.prototype, 'close');
  const schedulers = new WeakSet<Database>();
  let schedulerObserved = false;
  Object.defineProperty(Database.prototype, 'query', {
    ...queryDescriptor,
    value: function identifyScheduler(this: Database, sql: string) {
      if (sql.includes('INSERT INTO activation_observation_attempt')) {
        schedulers.add(this);
        schedulerObserved = true;
      }
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  Database.prototype.close = function closeAfterDeadline() {
    if (schedulers.has(this)) {
      const until = performance.now() + 90;
      while (performance.now() < until) {
        /* Model synchronous scheduler teardown. */
      }
    }
    originalClose.call(this);
  };
  try {
    expect(
      await runObservationTick({
        state,
        signal: new AbortController().signal,
        cleanupMs: 500,
        reader: {
          listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      }),
    ).toEqual({ kind: 'cancelled' });
  } finally {
    Database.prototype.close = originalClose;
    Object.defineProperty(Database.prototype, 'query', queryDescriptor);
  }
  expect(schedulerObserved).toBe(true);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'cancelled',
    });
  } finally {
    database.close();
  }
});

test('terminal close crossing only the tick deadline preserves committed completion', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 80 } };
  await initializeTickState(state);
  const queryDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = queryDescriptor?.value;
  if (queryDescriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  const originalClose: (this: Database) => void = Reflect.get(Database.prototype, 'close');
  const terminals = new WeakSet<Database>();
  let terminalObserved = false;
  Object.defineProperty(Database.prototype, 'query', {
    ...queryDescriptor,
    value: function identifyTerminal(this: Database, sql: string) {
      if (sql.includes('UPDATE activation_observation_attempt SET')) {
        terminals.add(this);
        terminalObserved = true;
      }
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  Database.prototype.close = function closeAfterCommit() {
    if (terminals.has(this)) {
      const until = performance.now() + 90;
      while (performance.now() < until) {
        /* Model post-commit cleanup. */
      }
    }
    originalClose.call(this);
  };
  try {
    expect(
      await runObservationTick({
        state,
        signal: new AbortController().signal,
        cleanupMs: 500,
        reader: {
          listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      }),
    ).toEqual({ kind: 'complete', requestCount: 0 });
  } finally {
    Database.prototype.close = originalClose;
    Object.defineProperty(Database.prototype, 'query', queryDescriptor);
  }
  expect(terminalObserved).toBe(true);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'complete',
    });
  } finally {
    database.close();
  }
});

test('terminal close failure reports cleanup while retaining committed completion', async () => {
  const source = fixture();
  await initializeTickState(source.state);
  const queryDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  const originalQuery: unknown = queryDescriptor?.value;
  if (queryDescriptor === undefined || typeof originalQuery !== 'function')
    throw new Error('database query fixture absent');
  const originalClose: (this: Database) => void = Reflect.get(Database.prototype, 'close');
  const terminals = new WeakSet<Database>();
  Object.defineProperty(Database.prototype, 'query', {
    ...queryDescriptor,
    value: function identifyTerminal(this: Database, sql: string) {
      if (sql.includes('UPDATE activation_observation_attempt SET')) terminals.add(this);
      return Reflect.apply(originalQuery, this, [sql]) as ReturnType<Database['query']>;
    },
  });
  Database.prototype.close = function failAfterCommit() {
    originalClose.call(this);
    if (terminals.has(this)) throw new Error('terminal close sentinel');
  };
  try {
    await expectTickRefusal(
      runObservationTick({
        state: source.state,
        signal: new AbortController().signal,
        cleanupMs: 100,
        reader: {
          listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
          getPullRequest: () => Promise.reject(new Error('unexpected current read')),
        },
      }),
      'terminal close sentinel',
    );
  } finally {
    Database.prototype.close = originalClose;
    Object.defineProperty(Database.prototype, 'query', queryDescriptor);
  }
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'complete',
    });
  } finally {
    database.close();
  }
});

test('deadline crossing during terminal write records cancellation before COMMIT', async () => {
  const source = fixture();
  let clockCalls = 0;
  const state = {
    ...source.state,
    policy: { ...source.state.policy, wholeTickMs: 80 },
    clock: () => {
      clockCalls += 1;
      if (clockCalls === 2) {
        const until = performance.now() + 90;
        while (performance.now() < until) {
          /* Model synchronous terminal validation. */
        }
      }
      return 1000;
    },
  };
  await initializeTickState(state);
  expect(
    await runObservationTick({
      state,
      signal: new AbortController().signal,
      cleanupMs: 500,
      reader: {
        listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
  ).toEqual({ kind: 'cancelled' });
  expect(clockCalls).toBeGreaterThanOrEqual(2);
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    expect(database.query('SELECT outcome FROM activation_observation_attempt').get()).toEqual({
      outcome: 'cancelled',
    });
  } finally {
    database.close();
  }
});

test('missing cooldown timestamp cannot bypass retained provider minimum', async () => {
  const source = fixture();
  await initializeTickState(source.state);
  let reads = 0;
  await expectTickRefusal(
    runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.reject(new GitHubReadFailure('rate-limited', 'rate limited', 429, 1700));
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
    'observation tick failed',
  );
  const database = new Database(source.databasePath, { create: false, strict: true });
  try {
    database.run('UPDATE activation_observation_recovery SET next_attempt_at=NULL');
  } finally {
    database.close();
  }
  await expectTickRefusal(
    runObservationTick({
      state: source.state,
      signal: new AbortController().signal,
      cleanupMs: 100,
      reader: {
        listOpenPullRequests: () => {
          reads += 1;
          return Promise.resolve({ pulls: [], nextPage: null });
        },
        getPullRequest: () => Promise.reject(new Error('unexpected current read')),
      },
    }),
    'observation recovery record malformed',
  );
  expect(reads).toBe(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`CLI ${signal} cancels a held reader and exits without a success status`, async () => {
    const source = fixture();
    expect(await initializeTickState(source.state)).toBe('initialized');
    const configurationPath = join(source.state.stateDirectory, 'cli-process-config.json');
    const enteredPath = join(source.state.stateDirectory, 'cli-entered');
    writeFileSync(configurationPath, JSON.stringify(source.state), { mode: 0o600 });
    const child = Bun.spawn(
      ['bun', join(import.meta.dir, 'observation-cli-process.ts'), configurationPath, enteredPath],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    try {
      await finishWithin(
        (async () => {
          while (!existsSync(enteredPath)) {
            if (child.exitCode !== null)
              throw new Error(
                `CLI fixture exited early: ${await new Response(child.stderr).text()}`,
              );
            await Bun.sleep(10);
          }
        })(),
        2000,
      );
      child.kill(signal);
      expect(await finishWithin(child.exited, 2000)).toBe(signal === 'SIGINT' ? 130 : 143);
      expect(requestCount(source.databasePath)).toBe(0);
    } finally {
      child.kill(9);
      await child.exited;
    }
  });
}
