import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { ActivationController } from './controller';
import { observationExitCode, runObservationCli } from './observation-cli';
import { initializeObservationState, withObservationAttempt } from './observation-state';
import { runObservationTick } from './observation-tick';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

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
    policy: { maxAttempts: 2, wholeTickMs: 500, maxSubjects: 100 },
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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

test('abort-ignoring current reader settles as cancelled before SQLite closes', async () => {
  const source = fixture();
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
    expect(closes).toBe(0);
    aborter.abort();
    expect(readerSignal?.aborted).toBe(true);
    expect(await finishWithin(tick, 150)).toEqual({ kind: 'cancelled' });
    expect(closes).toBe(2);
  } finally {
    if (closeDescriptor !== undefined)
      Object.defineProperty(Database.prototype, 'close', closeDescriptor);
  }
  expect(requestCount(source.databasePath)).toBe(0);
});

test('synchronous current work cannot commit after whole-tick deadline', async () => {
  const source = fixture();
  const state = { ...source.state, policy: { maxAttempts: 2, wholeTickMs: 5, maxSubjects: 100 } };
  expect(await initializeObservationState(state)).toBe('initialized');
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
  const state = { ...source.state, policy: { maxAttempts: 2, wholeTickMs: 500, maxSubjects: 100 } };
  expect(await initializeObservationState(state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
  expect(await initializeObservationState(source.state)).toBe('initialized');
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
});

for (const phase of ['controller', 'scheduler'] as const)
  test(`synchronous close overrun in ${phase} exits fatally before releasing the process lock`, async () => {
    const source = fixture();
    const state = { ...source.state, policy: { ...source.state.policy, wholeTickMs: 300 } };
    expect(await initializeObservationState(state)).toBe('initialized');
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
  expect(await initializeObservationState(state)).toBe('initialized');
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
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`CLI ${signal} cancels a held reader and exits without a success status`, async () => {
    const source = fixture();
    expect(await initializeObservationState(source.state)).toBe('initialized');
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
