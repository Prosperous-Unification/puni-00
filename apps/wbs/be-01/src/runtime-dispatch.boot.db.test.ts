import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createLogger } from '@wbs/observability';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { expect, test } from 'bun:test';

import { buildApp } from './app';
import { bootBe01, type RunningBe } from './boot';
import { TEST_JWT_KEY } from './testing/auth-fixture';
import { TEST_MCP_SERVICE_SETTINGS } from './testing/machine-grant-fixture';
import { OrganizationHarness } from './testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

async function awaitPhase<T>(promise: Promise<T>, phase: string, milliseconds = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(() => {
          reject(new Error('runtime dispatch phase expired: ' + phase));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function createBarrier() {
  return Promise.withResolvers<undefined>();
}

type IntegrationVariant =
  | 'normal'
  | 'dual-failure'
  | 'held-readiness'
  | 'held-disposal'
  | 'delayed-ready'
  | 'invalid-ready-hold';

async function runIntegration(
  variant: IntegrationVariant = 'normal',
  tracePath?: string,
): Promise<void> {
  const harness = OrganizationHarness.openComposed();
  const directory = mkdtempSync(join(tmpdir(), 'runtime-dispatch-boot-'));
  let stopped = false;
  let running: RunningBe | undefined;
  let booting: Promise<RunningBe> | undefined;
  let source: ReturnType<typeof openSqliteSource> | undefined;
  let worker: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  const entered = createBarrier();
  const release = createBarrier();
  const held = Promise.withResolvers<never>();
  const pending: unknown[] = [];
  let waiting: ReturnType<typeof Promise.withResolvers<unknown>> | undefined;
  let childFailure: Promise<never> | undefined;
  /** Worker preparation includes real SQLite, authenticated reads and claim construction. */
  const receivePhase = async (phase: string) => {
    const next =
      pending.length > 0
        ? pending.shift()
        : await awaitPhase(
            Promise.race([
              (waiting = Promise.withResolvers<unknown>()).promise,
              ...(childFailure === undefined ? [] : [childFailure]),
            ]),
            phase,
            // Proof: T1 held the real worker after claim construction; the old 8000 ms
            // allowance emitted "runtime dispatch phase expired: ready" before any turn.
            phase === 'ready' ? 22000 : 8000,
          );
    waiting = undefined;
    // Proof: E1 sends a malformed phase; this assertion rejects it.
    assert(next !== null && typeof next === 'object' && 'phase' in next, 'malformed worker phase');
    expect(next.phase).toBe(phase);
    return next;
  };
  let conditionalPosts = 0;
  const paths: string[] = [];
  let primaryFailed = false;
  let primaryFailure: unknown;
  try {
    await awaitPhase(harness.register('ada'), 'register');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'admin');
    harness.bind('ada', 'org-a');
    harness.activate();
    const created = await awaitPhase(
      harness.call('ada', 'POST', '/api/projects', { name: 'Runtime dispatch' }),
      'project',
    );
    assert(created.body !== null && typeof created.body === 'object' && 'project' in created.body);
    const project = created.body.project;
    assert(
      project !== null &&
        typeof project === 'object' &&
        'id' in project &&
        typeof project.id === 'string',
    );
    harness.sqlite.run("INSERT INTO person (id, name) VALUES ('person', 'Person')");
    harness.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('person', 'org-a', 'Person')",
    );
    harness.sqlite.run(
      "INSERT INTO step (id, project_id, name, position, code) VALUES ('step', ?, 'Plan', 100, 'plan')",
      [project.id],
    );
    harness.sqlite.run(
      "INSERT INTO work_item (id, project_id, position, name, readiness) VALUES ('work', ?, 10, 'Work', 'ready')",
      [project.id],
    );
    const credential = harness.token('ada');
    const actorId = harness.userId('ada');
    const dbPath = await awaitPhase(harness.stopForRecovery(), 'seed shutdown');
    stopped = true;
    const trace = (stage: HeldTrace['stage']) => {
      if (tracePath === undefined) throw new Error('held integration trace path missing');
      writeFileSync(
        tracePath,
        JSON.stringify({ stage, dbPath, dbPresent: existsSync(dbPath), port: running?.port }),
        { mode: 0o600 },
      );
    };
    if (variant === 'held-readiness' || variant === 'held-disposal')
      process.on('SIGTERM', () => {
        trace('signal');
        process.exit(0);
      });
    booting = bootBe01(
      {
        dbPath,
        port: 0,
        appOrigin: 'http://localhost',
        logger: createLogger({ service: 'be-01', level: 'error' }),
        jwtKey: TEST_JWT_KEY,
        gwUrl: 'http://gw.invalid',
        internalAuthSecret: 's'.repeat(32),
        browserSessionAuthority: 'disabled',
        organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
        // Proof: without these settings, the real boot and Dash worker test refused this
        // activated store at readiness, naming all three MCP settings (2026-10-27).
        mcpService: TEST_MCP_SERVICE_SETTINGS,
      },
      {
        openSource(options) {
          source = openSqliteSource(options);
          if (variant === 'held-readiness') {
            const run = source.uow.run.bind(source.uow);
            source.uow.run = (act) =>
              run(async (scope) => {
                const inspect = scope.stores.runtimeCommands.inspectLedger.bind(
                  scope.stores.runtimeCommands,
                );
                scope.stores.runtimeCommands.inspectLedger = async () => {
                  trace('readiness-held');
                  await held.promise;
                  return inspect();
                };
                try {
                  return await act(scope);
                } finally {
                  scope.stores.runtimeCommands.inspectLedger = inspect;
                }
              });
          }
          return source;
        },
        makeApp(options) {
          assert(source !== undefined, 'boot source missing');
          const app = buildApp({
            ...options,
            organizations: new SqliteOrganizationAccess(
              source.db,
              userBoundOrganizationOf((userId) =>
                Promise.resolve(userId === actorId ? 'org-a' : null),
              ),
              Date.now,
            ),
          });
          if (variant === 'held-disposal') {
            const stop = app.stop.bind(app);
            app.stop = async () => {
              trace('disposal-held');
              await held.promise;
              return stop();
            };
          }
          app.onRequest(async ({ request }) => {
            const path = new URL(request.url).pathname;
            paths.push(request.method + ' ' + path);
            if (request.method === 'POST' && path.endsWith('/runtime-commands')) {
              conditionalPosts += 1;
              entered.resolve(undefined);
              await awaitPhase(release.promise, 'held original HTTP request');
            }
          });
          return app;
        },
      },
    );
    running = await awaitPhase(booting, 'boot');
    expect(running.port).toBeGreaterThan(0);
    if (variant === 'dual-failure') {
      const stop = running.stop;
      running.stop = async () => {
        await stop();
        throw new Error('injected receiver cleanup failure');
      };
      throw new Error('injected receiver original failure');
    }
    const configPath = join(directory, 'worker.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        base: 'http://127.0.0.1:' + String(running.port),
        credential,
        organizationId: 'org-a',
        projectId: project.id,
        path: join(directory, 'runs.sqlite'),
        ...(variant === 'delayed-ready'
          ? { readyHold: 'after-build' }
          : variant === 'invalid-ready-hold'
            ? { readyHold: 'invalid' }
            : {}),
      }),
      { mode: 0o600 },
    );
    worker = Bun.spawn(
      [
        process.execPath,
        resolve(
          import.meta.dir,
          '../../../twilight-structure/twilight-dash/cli/src/runs/testing/runtime-dispatch-worker.ts',
        ),
        configPath,
      ],
      {
        cwd: resolve(import.meta.dir, '../../../..'),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ipc(message: unknown) {
          if (waiting !== undefined) waiting.resolve(message);
          else pending.push(message);
        },
      },
    );
    const child = worker;
    const output = new Response(child.stdout).text();
    const errors = new Response(child.stderr).text();
    // Proof: E2 exits the child with code 7; the phase race reports that exit.
    childFailure = child.exited.then(async (code) => {
      throw new Error(
        'worker exited ' +
          String(code) +
          ': ' +
          (await errors).replaceAll(credential, '[redacted]'),
      );
    });
    // Phase races report early exit; expected final exit also settles this rejection.
    void childFailure.catch(() => undefined);
    const readyStarted = performance.now();
    await receivePhase('ready');
    // Proof: T4 removed the real worker's after-build hold; the delayed case emitted
    // "real worker ready within old allowance" instead of exercising the new window.
    if (variant === 'delayed-ready')
      assert(performance.now() - readyStarted > 8000, 'real worker ready within old allowance');
    child.send('go');
    await awaitPhase(Promise.race([entered.promise, childFailure]), 'request entry');
    expect(conditionalPosts).toBe(1);
    assert(source !== undefined);
    expect(source.db.all('SELECT * FROM runtime_command_receipt')).toHaveLength(1);
    expect(source.db.all('SELECT * FROM runtime_claim_binding')).toHaveLength(0);
    child.send('duplicate');
    const absent = await receivePhase('absent');
    expect(absent).toMatchObject({ phase: 'absent', status: 404, posts: 1 });
    expect(conditionalPosts).toBe(1);
    expect(source.db.all('SELECT * FROM runtime_claim_binding')).toHaveLength(0);
    release.resolve(undefined);
    await receivePhase('lost');
    expect(source.db.all('SELECT * FROM runtime_command_receipt')).toHaveLength(2);
    expect(source.db.all('SELECT * FROM runtime_claim_binding')).toHaveLength(1);
    child.send('reconcile');
    const claimed = await receivePhase('claimed');
    assert(
      'evidence' in claimed &&
        typeof claimed.evidence === 'string' &&
        'intent' in claimed &&
        'ack' in claimed,
    );
    const receipts = source.db.all<{ accepted: string }>(
      "SELECT accepted FROM runtime_command_receipt WHERE command_id='receiver-claim'",
    );
    expect(receipts).toHaveLength(1);
    const receipt = receipts.at(0);
    assert(receipt !== undefined);
    const stored: unknown = JSON.parse(receipt.accepted);
    assert(
      stored !== null &&
        typeof stored === 'object' &&
        'receipt' in stored &&
        'canonicalRequest' in stored &&
        'requestDigest' in stored,
    );
    expect(JSON.parse(claimed.evidence)).toEqual(stored.receipt);
    expect(claimed.intent).toMatchObject({
      canonicalRequest: stored.canonicalRequest,
      requestDigest: stored.requestDigest,
    });
    expect(claimed).toMatchObject({
      intent: { commandId: 'receiver-claim' },
      ack: { kind: 'claim_accepted', attempt: { state: { kind: 'ready' }, holdsCapacity: true } },
    });
    expect(source.db.all('SELECT * FROM claim')).toHaveLength(1);
    expect(source.db.all('SELECT lease_expires_at,lease_revoked_at FROM claim')).toEqual([
      { lease_expires_at: null, lease_revoked_at: null },
    ]);
    expect(source.db.all('SELECT * FROM command_journal')).toHaveLength(1);
    const tables = [
      'claim',
      'step_progress',
      'step_node_attempt',
      'actual',
      'command_journal',
      'runtime_command_receipt',
      'runtime_claim_binding',
      'runtime_authority',
    ];
    const receiver = source;
    const readBusinessState = () =>
      Object.fromEntries(
        tables.map((table) => [
          table,
          receiver.db.all('SELECT * FROM ' + table + ' ORDER BY rowid'),
        ]),
      );
    const beforeTurn = readBusinessState();
    child.send('turn');
    const completed = await receivePhase('complete');
    expect(completed).toMatchObject({
      phase: 'complete',
      turns: 1,
      posts: 1,
      reopened: true,
      holdsCapacity: true,
    });
    // Proof: B1 writes actual extra progress; this comparison rejects it.
    expect(readBusinessState()).toEqual(beforeTurn);
    expect(conditionalPosts).toBe(1);
    expect(paths.some((path) => path.endsWith('/claims'))).toBe(true);
    expect(await awaitPhase(child.exited, 'worker exit')).toBe(0);
    expect(await awaitPhase(output, 'stdout drain')).toBe('');
    expect(await awaitPhase(errors, 'stderr drain')).toBe('');
  } catch (cause) {
    primaryFailed = true;
    primaryFailure = cause;
  }
  release.resolve(undefined);
  if (worker?.exitCode === null) worker.kill();
  // Keep the actual acquisition and disposal promises owned after an observation deadline.
  // The parent process bounds this join and removes TMPDIR only after the whole group exits.
  const cleanup = await Promise.allSettled([
    ...(worker === undefined ? [] : [worker.exited]),
    // Proof: C7 drops late acquisition and C8 races disposal; the two actual
    // integration holds catch lost ownership and early child completion.
    ...(booting === undefined ? [] : [booting.then((booted) => booted.stop())]),
    ...(stopped ? [] : [harness.closeComposed()]),
  ]);
  const failures: unknown[] = [];
  for (const release of cleanup)
    if (release.status === 'rejected') failures.push(release.reason as unknown);
  if (failures.length === 0) {
    try {
      if (stopped) rmSync(dirname(harness.databasePath()), { recursive: true });
    } catch (cause) {
      failures.push(cause);
    }
    try {
      rmSync(directory, { recursive: true });
    } catch (cause) {
      failures.push(cause);
    }
  }
  // Proof: C4 drops the original failure; the combined-error case rejects it.
  if (failures.length > 0)
    throw new AggregateError(
      primaryFailed ? [primaryFailure, ...failures] : failures,
      'runtime dispatch failed with cleanup failure',
    );
  if (primaryFailed) throw primaryFailure;
}

type HeldRole = 'readiness' | 'disposal' | 'forced-disposal' | 'disposal-start-delayed';
interface HeldTrace {
  stage: 'readiness-held' | 'disposal-held' | 'signal';
  dbPath: string;
  dbPresent: boolean;
  port?: number;
}

async function runHeldReceiver(role: HeldRole, tracePath: string): Promise<void> {
  const harness = OrganizationHarness.openComposed();
  const dbPath = await harness.stopForRecovery();
  const pending = Promise.withResolvers<never>();
  let receiver: RunningBe | undefined;
  const trace = (stage: HeldTrace['stage']) => {
    writeFileSync(
      tracePath,
      JSON.stringify({ stage, dbPath, dbPresent: existsSync(dbPath), port: receiver?.port }),
      { mode: 0o600 },
    );
  };
  process.on('SIGTERM', () => {
    // Proof: C3 falsely exits on SIGTERM; forced disposal rejects a graceful result.
    if (role === 'forced-disposal') return;
    trace('signal');
    process.exit(0);
  });
  const options = {
    dbPath,
    port: 0,
    appOrigin: 'http://localhost',
    logger: createLogger({ service: 'be-01', level: 'error' }),
    jwtKey: TEST_JWT_KEY,
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    browserSessionAuthority: 'disabled' as const,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
  };
  if (role === 'readiness') {
    await bootBe01(options, {
      openSource(settings) {
        const opened = openSqliteSource(settings);
        const run = opened.uow.run.bind(opened.uow);
        opened.uow.run = (act) =>
          run(async (scope) => {
            const inspect = scope.stores.runtimeCommands.inspectLedger.bind(
              scope.stores.runtimeCommands,
            );
            scope.stores.runtimeCommands.inspectLedger = async () => {
              trace('readiness-held');
              await pending.promise;
              return inspect();
            };
            try {
              return await act(scope);
            } finally {
              scope.stores.runtimeCommands.inspectLedger = inspect;
            }
          });
        return opened;
      },
      makeApp: buildApp,
    });
  } else {
    receiver = await bootBe01(options, {
      openSource: openSqliteSource,
      makeApp(settings) {
        const app = buildApp(settings);
        const stop = app.stop.bind(app);
        app.stop = async () => {
          trace('disposal-held');
          await pending.promise;
          return stop();
        };
        return app;
      },
    });
    if (role === 'disposal-start-delayed') await Bun.sleep(8100);
    await receiver.stop();
  }
  throw new Error('held receiver unexpectedly completed');
}

type ContainedRole =
  | 'integration'
  | 'integration-ready-delayed'
  | 'integration-invalid-hold'
  | 'integration-readiness'
  | 'integration-disposal'
  | 'integration-disposal-delayed'
  | 'readiness'
  | 'readiness-unreported'
  | 'disposal'
  | 'disposal-start-delayed'
  | 'forced-disposal'
  | 'dual-failure';
interface ContainedConfig {
  role: ContainedRole;
  tracePath: string;
}

function readContainedConfig(path: string): ContainedConfig {
  // Proof: C5 writes mode 0644; the real child refuses that config.
  assert.equal(statSync(path).mode & 0o777, 0o600, 'private child role mode');
  const configured: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert(
    configured !== null &&
      typeof configured === 'object' &&
      'role' in configured &&
      (configured.role === 'integration' ||
        configured.role === 'integration-ready-delayed' ||
        configured.role === 'integration-invalid-hold' ||
        configured.role === 'integration-readiness' ||
        configured.role === 'integration-disposal' ||
        configured.role === 'integration-disposal-delayed' ||
        configured.role === 'readiness' ||
        configured.role === 'readiness-unreported' ||
        configured.role === 'disposal' ||
        configured.role === 'disposal-start-delayed' ||
        configured.role === 'forced-disposal' ||
        configured.role === 'dual-failure') &&
      'tracePath' in configured &&
      typeof configured.tracePath === 'string',
    'invalid private child role',
  );
  return { role: configured.role, tracePath: configured.tracePath };
}

function readHeldTrace(path: string): HeldTrace {
  const observed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  // Proof: C6 emits a malformed marker after real boot reaches inspection;
  // the parent rejects the marker before accepting its phase.
  assert(
    observed !== null &&
      typeof observed === 'object' &&
      'stage' in observed &&
      (observed.stage === 'readiness-held' ||
        observed.stage === 'disposal-held' ||
        observed.stage === 'signal') &&
      'dbPath' in observed &&
      typeof observed.dbPath === 'string' &&
      'dbPresent' in observed &&
      typeof observed.dbPresent === 'boolean',
    'malformed held receiver trace',
  );
  const port: unknown = 'port' in observed ? observed.port : undefined;
  assert(
    port === undefined || (typeof port === 'number' && Number.isSafeInteger(port) && port > 0),
    'malformed held receiver trace',
  );
  return {
    stage: observed.stage,
    dbPath: observed.dbPath,
    dbPresent: observed.dbPresent,
    port,
  };
}

async function waitForHeldTrace(
  path: string,
  stage: HeldTrace['stage'],
  child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  milliseconds: number,
): Promise<HeldTrace> {
  const deadline = performance.now() + milliseconds;
  while (performance.now() < deadline) {
    if (existsSync(path)) {
      const observed = readHeldTrace(path);
      if (observed.stage === stage) return observed;
    }
    if (child.exitCode !== null) throw new Error('contained receiver exited before ' + stage);
    await Bun.sleep(10);
  }
  // Proof: the real delayed integration marker exceeded the old 8000 ms entry budget and
  // emitted this named preparation error; 22000 ms then passed the held ownership checks.
  throw new Error('contained receiver phase expired: ' + stage);
}

function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return false;
    throw cause;
  }
}

function signalOwnedGroup(pid: number, signal: NodeJS.Signals): void {
  assert(Number.isSafeInteger(pid) && pid > 0, 'invalid owned process group');
  try {
    process.kill(-pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}

async function joinOwnedGroup(child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>): Promise<void> {
  const pid = child.pid;
  assert(Number.isSafeInteger(pid) && pid > 0, 'invalid owned process group');
  if (child.exitCode === null) {
    signalOwnedGroup(pid, 'SIGTERM');
    try {
      await awaitPhase(child.exited, 'graceful child exit', 750);
    } catch (cause) {
      if (!(cause instanceof Error && cause.message.includes('phase expired'))) throw cause;
      signalOwnedGroup(pid, 'SIGKILL');
      await awaitPhase(child.exited, 'forced child exit', 2000);
    }
  }
  if (groupExists(pid)) signalOwnedGroup(pid, 'SIGKILL');
  const deadline = performance.now() + 1500;
  while (groupExists(pid)) {
    if (performance.now() >= deadline) throw new Error('owned process group did not exit');
    await Bun.sleep(10);
  }
}

function sanitizeChildOutput(output: string): string {
  return output
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted]');
}

interface ContainedObservation {
  exitCode: number;
  output: string;
  held?: HeldTrace;
  signaled?: HeldTrace;
  rootRemoved: boolean;
  preparationMilliseconds?: number;
}

/**
 * Complete integration: 35000 ms child completion plus at most 8250 ms join/drain fits its
 * 50000 ms parent; child ceiling is 45000 ms. Held integration retains its 22000 ms marker,
 * 8500 ms observation, 40000 ms child and 45000 ms parent (worst parent path 39400 ms).
 * Simple held receivers allow 22000 ms before the real marker; health and held-exit checks
 * trigger termination by 22650 ms, before the 30000 ms child ceiling. Their full parent
 * path is at most 22000 + 8900 = 30900 ms, below its 35000 ms ceiling. The intentionally
 * missing marker keeps 8000 ms and a 20000 ms parent above its 16250 ms failure/cleanup bound.
 */
async function runContainedReceiver(
  role: ContainedRole,
  expectedStage?: HeldTrace['stage'],
  healthSignal?: AbortSignal,
): Promise<ContainedObservation> {
  const heldIntegration =
    role === 'integration-readiness' ||
    role === 'integration-disposal' ||
    role === 'integration-disposal-delayed';
  const completeIntegration = role === 'integration' || role === 'integration-ready-delayed';
  const simpleHeldReceiver =
    role === 'readiness' ||
    role === 'disposal' ||
    role === 'disposal-start-delayed' ||
    role === 'forced-disposal';
  // Proof: T2 delayed actual booted-receiver stop entry; the old 8000 ms simple marker
  // allowance emitted "contained receiver phase expired: disposal-held" after owned join.
  const preparationMilliseconds = heldIntegration || simpleHeldReceiver ? 22000 : 8000;
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'runtime-dispatch-owned-'));
  const root = join(fixtureRoot, 'runtime');
  const markerDirectory = join(fixtureRoot, 'markers');
  const tracePath = join(markerDirectory, 'trace.json');
  const configPath = join(root, 'role.json');
  let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  try {
    mkdirSync(root, { mode: 0o700 });
    // Proof: D1/D2 delete the runtime directory early; this sibling marker
    // remains available for the held child to report the missing database.
    mkdirSync(markerDirectory, { mode: 0o700 });
    writeFileSync(configPath, JSON.stringify({ role, tracePath }), { mode: 0o600 });
    child = Bun.spawn(
      [
        process.execPath,
        'test',
        import.meta.path,
        '-t',
        'contained ' + role,
        '--timeout=' + String(heldIntegration ? 40000 : completeIntegration ? 45000 : 30000),
      ],
      {
        cwd: resolve(import.meta.dir, '../../../..'),
        env: { ...process.env, TMPDIR: root, PUNI_RUNTIME_DISPATCH_CHILD_CONFIG: configPath },
        detached: true,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
  } catch (acquisition) {
    try {
      rmSync(fixtureRoot, { recursive: true });
    } catch (cleanup) {
      throw new AggregateError(
        [acquisition, cleanup],
        'contained receiver spawn and cleanup failed',
        {
          cause: cleanup,
        },
      );
    }
    throw acquisition;
  }
  const output = new Response(child.stdout).text();
  const errors = new Response(child.stderr).text();
  let primaryFailed = false;
  let primaryFailure: unknown;
  let held: HeldTrace | undefined;
  let observedPreparationMilliseconds: number | undefined;
  let exitCode: number | undefined;
  try {
    if (
      role === 'readiness' ||
      role === 'readiness-unreported' ||
      role === 'disposal' ||
      role === 'disposal-start-delayed' ||
      role === 'forced-disposal' ||
      role === 'integration-readiness' ||
      role === 'integration-disposal' ||
      role === 'integration-disposal-delayed' ||
      expectedStage !== undefined
    ) {
      const preparationStarted = performance.now();
      held = await waitForHeldTrace(
        tracePath,
        expectedStage ??
          (role === 'readiness' ||
          role === 'readiness-unreported' ||
          role === 'integration-readiness'
            ? 'readiness-held'
            : 'disposal-held'),
        child,
        preparationMilliseconds,
      );
      observedPreparationMilliseconds = performance.now() - preparationStarted;
      assert.equal(held.dbPresent, true, 'actual held receiver must own its SQLite file');
      if (role === 'readiness' || role === 'integration-readiness')
        assert.equal(held.port, undefined, 'listener started before readiness');
      if (role !== 'readiness' && role !== 'integration-readiness') {
        assert(held.port !== undefined && held.port > 0, 'actual held receiver port missing');
        const health = await fetch('http://127.0.0.1:' + String(held.port) + '/health', {
          signal: healthSignal ?? AbortSignal.timeout(500),
        });
        assert.equal(health.status, 200, 'held stop must leave the actual listener active');
      }
      if (
        role === 'integration-readiness' ||
        role === 'integration-disposal' ||
        role === 'integration-disposal-delayed'
      ) {
        await Bun.sleep(8500);
        assert.equal(
          existsSync(held.dbPath),
          true,
          'integration removed DB before actual acquisition/disposal',
        );
        // Proof: C8 races actual stop; the child exits while disposal is held.
        assert.equal(
          child.exitCode,
          null,
          'integration exited before actual acquisition/disposal completed',
        );
      }
      await assert.rejects(
        awaitPhase(child.exited, 'held receiver before termination', 150),
        /phase expired/,
      );
    } else {
      exitCode = await awaitPhase(
        child.exited,
        'contained ' + role,
        completeIntegration ? 35000 : 22000,
      );
    }
  } catch (cause) {
    primaryFailed = true;
    primaryFailure = cause;
  }
  const cleanupFailures: unknown[] = [];
  let joined = false;
  try {
    await joinOwnedGroup(child);
    joined = true;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  let childOutput = '';
  if (joined) {
    try {
      childOutput = sanitizeChildOutput(
        (await awaitPhase(output, 'child stdout drain', 2000)) +
          (await awaitPhase(errors, 'child stderr drain', 2000)),
      );
    } catch (cause) {
      cleanupFailures.push(cause);
    }
  }
  let signaled: HeldTrace | undefined;
  if (joined && held !== undefined) {
    try {
      signaled = readHeldTrace(tracePath);
    } catch (cause) {
      cleanupFailures.push(cause);
    }
  }
  if (joined) {
    try {
      // Proof: D1/D2 remove the runtime directory before this join;
      // the held child reports DB deletion through the owned marker.
      rmSync(fixtureRoot, { recursive: true });
    } catch (cause) {
      cleanupFailures.push(cause);
    }
  }
  if (primaryFailed && childOutput !== '') {
    // Proof: N1 discarded this sanitized context; the real dual-failure child made the
    // parent test emit "sanitized child output missing from primary failure".
    // Proof: R1 dropped `cause`; the real held-listener health fetch rejected with a readonly
    // TimeoutError and the parent emitted "readonly health cause was replaced".
    const context = '\ncontained child output (sanitized):\n' + childOutput;
    primaryFailure = new Error('contained receiver primary failure' + context, {
      cause: primaryFailure,
    });
  }
  if (cleanupFailures.length > 0)
    throw new AggregateError(
      primaryFailed ? [primaryFailure, ...cleanupFailures] : cleanupFailures,
      'contained receiver failed with cleanup failure',
    );
  if (primaryFailed) throw primaryFailure;
  assert(exitCode !== undefined || held !== undefined, 'contained receiver made no observation');
  return {
    exitCode: exitCode ?? child.exitCode ?? -1,
    output: childOutput,
    held,
    signaled,
    rootRemoved: !existsSync(fixtureRoot),
    preparationMilliseconds: observedPreparationMilliseconds,
  };
}

const childConfigPath = process.env['PUNI_RUNTIME_DISPATCH_CHILD_CONFIG'];
if (childConfigPath === undefined) {
  test('real boot and Dash worker retain conditional uncertainty then one observed turn without business completion', async () => {
    const observed = await runContainedReceiver('integration');
    assert.equal(observed.exitCode, 0, observed.output);
    assert.match(observed.output, /1 pass/, 'contained integration did not run');
    assert.equal(observed.rootRemoved, true);
  }, 50000);
  test('real Dash worker ready after delayed preparation still completes one observed turn', async () => {
    const observed = await runContainedReceiver('integration-ready-delayed');
    assert.equal(observed.exitCode, 0, observed.output);
    assert.match(observed.output, /1 pass/, 'contained delayed integration did not run');
    assert.equal(observed.rootRemoved, true);
  }, 50000);
  test('worker refuses an unknown private ready hold before receiving commands', async () => {
    const observed = await runContainedReceiver('integration-invalid-hold');
    assert.notEqual(observed.exitCode, 0, 'unknown worker hold was accepted');
    assert.match(observed.output, /worker exited/, 'worker error did not reach the parent');
    assert.match(observed.output, /readyHold/, 'private selector error was not reported');
    assert.equal(observed.rootRemoved, true);
  }, 35000);
  for (const role of ['readiness', 'disposal'] as const) {
    test(
      'contains delayed actual receiver ' + role + ' before database removal',
      async () => {
        const observed = await runContainedReceiver(role);
        assert.equal(observed.held?.dbPresent, true);
        assert.equal(
          observed.signaled?.stage,
          'signal',
          'held receiver did not observe termination',
        );
        assert.equal(observed.signaled.dbPresent, true, 'DB deleted before receiver disposal');
        assert.equal(observed.rootRemoved, true);
        if (role === 'disposal') {
          assert(observed.held.port !== undefined);
          await assert.rejects(
            fetch('http://127.0.0.1:' + String(observed.held.port) + '/health', {
              signal: AbortSignal.timeout(500),
            }),
          );
        }
      },
      35000,
    );
  }
  test('forces and joins an actual receiver with delayed disposal after graceful refusal', async () => {
    const observed = await runContainedReceiver('forced-disposal');
    assert.equal(observed.held?.stage, 'disposal-held');
    assert.equal(
      observed.signaled?.stage,
      'disposal-held',
      'forced termination must not be reported as graceful',
    );
    assert.notEqual(observed.exitCode, 0, 'held receiver ignored SIGTERM yet exited normally');
    assert.equal(observed.rootRemoved, true);
    assert(observed.held.port !== undefined);
    await assert.rejects(
      fetch('http://127.0.0.1:' + String(observed.held.port) + '/health', {
        signal: AbortSignal.timeout(500),
      }),
    );
  }, 35000);
  test('real receiver disposal after delayed startup retains its listener and database until joined', async () => {
    const observed = await runContainedReceiver('disposal-start-delayed');
    // Proof: T5 removed the actual post-boot hold; this test emitted
    // "real receiver marker appeared within old allowance".
    assert(
      (observed.preparationMilliseconds ?? 0) > 8000,
      'real receiver marker appeared within old allowance',
    );
    assert.equal(observed.held?.stage, 'disposal-held');
    assert.equal(observed.held.dbPresent, true);
    assert(observed.held.port !== undefined && observed.held.port > 0);
    assert.equal(observed.signaled?.stage, 'signal');
    assert.equal(observed.signaled.dbPresent, true, 'DB deleted before receiver disposal');
    assert.equal(observed.rootRemoved, true);
    await assert.rejects(
      fetch('http://127.0.0.1:' + String(observed.held.port) + '/health', {
        signal: AbortSignal.timeout(500),
      }),
    );
  }, 35000);
  for (const role of ['integration-readiness', 'integration-disposal'] as const) {
    test(
      'retains actual ' + role + ' across its inner deadline',
      async () => {
        const observed = await runContainedReceiver(role);
        assert.equal(observed.held?.dbPresent, true);
        assert.equal(observed.signaled?.stage, 'signal');
        assert.equal(
          observed.signaled.dbPresent,
          true,
          'integration removed DB before actual acquisition/disposal',
        );
        assert.equal(observed.rootRemoved, true);
      },
      45000,
    );
  }
  test('retains delayed real integration disposal after more than eight seconds of preparation', async () => {
    const observed = await runContainedReceiver('integration-disposal-delayed');
    assert(
      (observed.preparationMilliseconds ?? 0) > 8000,
      'real marker appeared within old preparation allowance',
    );
    assert.equal(observed.held?.stage, 'disposal-held');
    assert.equal(observed.signaled?.stage, 'signal');
    assert.equal(
      observed.signaled.dbPresent,
      true,
      'integration removed DB before actual acquisition/disposal',
    );
    assert.equal(observed.rootRemoved, true);
  }, 45000);
  test('missing real readiness marker has a named finite deadline and joins its owned child', async () => {
    // Proof: the child writes its actual readiness marker to the sibling unreported path;
    // the parent observes the named 8000 ms deadline and no owned directory survives.
    const before = readdirSync(tmpdir())
      .filter((name) => name.startsWith('runtime-dispatch-owned-'))
      .sort();
    await assert.rejects(runContainedReceiver('readiness-unreported'), (failure: unknown) => {
      assert(failure instanceof Error);
      assert(failure.cause instanceof Error, 'missing marker cause not preserved');
      assert.match(failure.cause.message, /contained receiver phase expired: readiness-held/);
      assert.match(failure.message, /contained child output \(sanitized\)/);
      return true;
    });
    const after = readdirSync(tmpdir())
      .filter((name) => name.startsWith('runtime-dispatch-owned-'))
      .sort();
    assert.deepEqual(after, before, 'owned receiver storage survived marker timeout');
  }, 20000);
  test('failed real child retains both sanitized causes beside its parent phase failure', async () => {
    await assert.rejects(
      runContainedReceiver('dual-failure', 'disposal-held'),
      (failure: unknown) => {
        assert(failure instanceof Error);
        assert.match(
          failure.message,
          /contained child output \(sanitized\)/,
          'sanitized child output missing from primary failure',
        );
        assert(failure.cause instanceof Error);
        assert.match(failure.cause.message, /contained receiver exited before disposal-held/);
        assert.match(failure.message, /injected receiver original failure/);
        assert.match(failure.message, /injected receiver cleanup failure/);
        return true;
      },
    );
  }, 35000);
  test('readonly health failure preserves its original cause after actual child cleanup', async () => {
    const healthFailure = new DOMException('injected health deadline', 'TimeoutError');
    const before = readdirSync(tmpdir())
      .filter((name) => name.startsWith('runtime-dispatch-owned-'))
      .sort();
    await assert.rejects(
      runContainedReceiver('disposal', undefined, AbortSignal.abort(healthFailure)),
      (failure: unknown) => {
        assert(failure instanceof Error);
        assert.equal(failure.cause, healthFailure, 'readonly health cause was replaced');
        assert.match(failure.message, /contained child output \(sanitized\)/);
        return true;
      },
    );
    const after = readdirSync(tmpdir())
      .filter((name) => name.startsWith('runtime-dispatch-owned-'))
      .sort();
    assert.deepEqual(after, before, 'owned receiver storage survived readonly health failure');
  }, 35000);
  test('retains original and real receiver cleanup failures', async () => {
    const observed = await runContainedReceiver('dual-failure');
    assert.notEqual(observed.exitCode, 0, 'faulted child unexpectedly passed');
    assert.match(
      observed.output,
      /injected receiver original failure/,
      'original failure missing from combined report',
    );
    assert.match(observed.output, /injected receiver cleanup failure/);
    assert.equal(observed.rootRemoved, true);
  }, 35000);
} else {
  const configured = readContainedConfig(childConfigPath);
  const role = configured.role;
  if (role === 'integration') {
    test('contained integration', () => runIntegration(), 45000);
  } else if (role === 'integration-ready-delayed') {
    test('contained integration-ready-delayed', () => runIntegration('delayed-ready'), 45000);
  } else if (role === 'integration-invalid-hold') {
    test('contained integration-invalid-hold', () => runIntegration('invalid-ready-hold'), 30000);
  } else if (role === 'dual-failure') {
    test('contained dual-failure', () => runIntegration('dual-failure'), 30000);
  } else if (role === 'integration-readiness') {
    test(
      'contained integration-readiness',
      () => runIntegration('held-readiness', configured.tracePath),
      40000,
    );
  } else if (role === 'integration-disposal') {
    test(
      'contained integration-disposal',
      () => runIntegration('held-disposal', configured.tracePath),
      40000,
    );
  } else if (role === 'integration-disposal-delayed') {
    test('contained integration-disposal-delayed', async () => {
      await Bun.sleep(8100);
      await runIntegration('held-disposal', configured.tracePath);
    }, 40000);
  } else if (role === 'readiness-unreported') {
    test(
      'contained readiness-unreported',
      () => runHeldReceiver('readiness', join(dirname(configured.tracePath), 'unreported.json')),
      30000,
    );
  } else {
    test('contained ' + role, () => runHeldReceiver(role, configured.tracePath), 30000);
  }
}
