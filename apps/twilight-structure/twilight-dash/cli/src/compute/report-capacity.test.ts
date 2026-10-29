import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import {
  ConfigurationRefusal,
  type ProviderAdapter,
  type ReporterConfiguration,
  WbsCredential,
} from './configuration';
import { kubernetesStubAdapter } from './kubernetes';
import type { ComputeProvider, Measurement, ResourceBinding } from './provider';
import {
  reportCapacityCommand,
  type ReporterDependencies,
  ReporterExit,
  runReporter,
  sleepUnlessInterrupted,
} from './report-capacity';
import { fakeCredential } from './testing/credential';
import { createSshFixture, MEMINFO_15_7 } from './testing/ssh-fixture';

const CREDENTIAL = fakeCredential();
/** A cold entrypoint start under load; the in-test kill sits inside it, so exit 1 stays asserted. */
const ENTRYPOINT_BUDGET_MS = 60_000;
const SECRET = CREDENTIAL.slice('wbs_mk_'.length);

interface RecordedPut {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: unknown;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/**
 * A fake WBS: records every request and answers from `answers` in order, the last one repeating.
 */
function fakeWbs(answers: readonly Answer[]) {
  const puts: RecordedPut[] = [];
  return {
    puts,
    send: async (request: Request): Promise<Response> => {
      puts.push({
        url: request.url,
        authorization: request.headers.get('authorization'),
        body: (await request.json()) as unknown,
      });
      const answer = answers[Math.min(puts.length - 1, answers.length - 1)];
      return Response.json(answer.body, { status: answer.status });
    },
  };
}

const stored: Answer = {
  status: 200,
  body: {
    providerId: 'h4claw',
    observedAt: 0,
    cadenceSeconds: 300,
    outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
    reportedBy: 'agent-dash',
    reportedAt: 0,
  },
};

/** A measurement before the provider stamps it. */
type Unstamped = Measurement extends infer Each
  ? Each extends Measurement
    ? Omit<Each, 'observedAt'>
    : never
  : never;

/** A provider answering `measurements` in turn (the last repeating), at the instant it is handed. */
function scriptedProvider(
  measurements: readonly (Unstamped | Error)[] = [
    { kind: 'measured', capacityUnits: 15, usageUnits: 8, evidence: 'scripted' },
  ],
) {
  let calls = 0;
  const listeners = new Set<() => void>();
  const provider: ComputeProvider = {
    kind: 'ssh_host',
    instanceId: 'h4claw',
    capabilities: { measures: new Set(['memory_gib']), runs: true },
    observe: (_binding: ResourceBinding, now: number) => {
      const next = measurements[Math.min(calls, measurements.length - 1)];
      calls += 1;
      if (next instanceof Error) return Promise.reject(next);
      const measurement: Measurement = { ...next, observedAt: now };
      return Promise.resolve(measurement);
    },
    run: () => Promise.reject(new Error('scripted providers run nothing')),
    onRunChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    provider,
    signalRun: () => {
      for (const listener of listeners) listener();
    },
  };
}

function reporterConfiguration(
  provider: ComputeProvider,
  bindings: readonly ResourceBinding[] = [{ resourceId: 'h4claw-ram', measure: 'memory_gib' }],
): ReporterConfiguration {
  return {
    wbsOrigin: 'https://wbs-dev.example',
    credential: new WbsCredential(CREDENTIAL),
    cadenceSeconds: 300,
    instances: [{ instanceId: 'h4claw', provider, bindings }],
  };
}

/**
 * Dependencies with a stepping clock and a sleep that returns at once but ends the test after
 * `ticks` sleeps, so a loop that should have exited is caught instead of running forever.
 */
function dependencies(send: ReporterDependencies['send'], ticks = 6) {
  let now = 1_760_000_000_000;
  const sleeps: number[] = [];
  const output: string[] = [];
  const deps: ReporterDependencies = {
    clock: { read: () => (now += 1000) },
    send,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      if (sleeps.length > ticks)
        return Promise.reject(new Error('test budget: the loop kept going'));
      return Promise.resolve();
    },
    write: (text) => {
      output.push(text);
    },
  };
  return { deps, sleeps, output };
}

async function exitOf(run: Promise<never>): Promise<Error> {
  try {
    await run;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw new Error('the reporter threw a non-Error', { cause });
  }
  throw new Error('the reporter returned');
}

// Flips in `wbs-mcp-agent-surface` task 7.2: the reporter still PUTs with its `wbs_mk_` key
// itself on be-01's `/api`, which M9 (task 7.1) refuses, and 7.2 makes it an MCP client. The
// fake WBS below is that `/api` route; be-01's side is already on the MCP path (task 7.0).
describe('report-capacity against a fake WBS', () => {
  test('sends one PUT per binding per tick with cadenceSeconds, the credential only in the header', async () => {
    const wbs = fakeWbs([stored]);
    const { provider } = scriptedProvider();
    const bindings: ResourceBinding[] = [
      { resourceId: 'h4claw-ram', measure: 'memory_gib' },
      { resourceId: 'h4claw-tmp', measure: 'memory_gib' },
    ];
    const run = dependencies(wbs.send, 2);
    const exit = await exitOf(runReporter(reporterConfiguration(provider, bindings), run.deps));
    expect(exit.message).toBe('test budget: the loop kept going');
    expect(run.sleeps).toEqual([300_000, 300_000, 300_000]);
    expect(wbs.puts.map((put) => put.url)).toEqual(
      [1, 2, 3].flatMap(() => [
        'https://wbs-dev.example/api/compute-providers/h4claw/resources/h4claw-ram/capacity-report',
        'https://wbs-dev.example/api/compute-providers/h4claw/resources/h4claw-tmp/capacity-report',
      ]),
    );
    expect(wbs.puts[0].authorization).toBe(`Bearer ${CREDENTIAL}`);
    expect(wbs.puts[0].body).toEqual({
      observedAt: 1_760_000_001_000,
      cadenceSeconds: 300,
      outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
    });
    expect(run.output.join('')).not.toContain(SECRET);
  });

  test('reports an unreachable measurement rather than swallowing it', async () => {
    const wbs = fakeWbs([stored]);
    const { provider } = scriptedProvider([
      {
        kind: 'unreachable',
        reason: 'ssh timeout: no answer from h4claw within the command deadline',
      },
    ]);
    await exitOf(runReporter(reporterConfiguration(provider), dependencies(wbs.send, 0).deps));
    expect(wbs.puts[0].body).toEqual({
      observedAt: 1_760_000_001_000,
      cadenceSeconds: 300,
      outcome: {
        kind: 'unreachable',
        reason: 'ssh timeout: no answer from h4claw within the command deadline',
      },
    });
  });

  test('ticks right after a run starts or ends, outside the cadence', async () => {
    const wbs = fakeWbs([stored]);
    const scripted = scriptedProvider();
    const run = dependencies(wbs.send);
    // A run that changes while the first tick reports must wake the next sleep at once.
    run.deps = {
      ...run.deps,
      sleep: (milliseconds, interrupt) => {
        run.sleeps.push(milliseconds);
        if (run.sleeps.length > 3)
          return Promise.reject(new Error('test budget: the loop kept going'));
        if (run.sleeps.length === 1) {
          scripted.signalRun();
          expect(interrupt.aborted).toBe(true);
        } else {
          expect(interrupt.aborted).toBe(false);
        }
        return Promise.resolve();
      },
    };
    await exitOf(runReporter(reporterConfiguration(scripted.provider), run.deps));
    expect(wbs.puts).toHaveLength(4);
  });

  test('exits another_reporter after three consecutive report_superseded on one binding', async () => {
    const superseded: Answer = {
      status: 409,
      body: { error: 'report_superseded', storedObservedAt: 1_760_000_002_000 },
    };
    const wbs = fakeWbs([
      stored,
      superseded,
      superseded,
      stored,
      superseded,
      superseded,
      superseded,
    ]);
    const { provider } = scriptedProvider();
    const exit = await exitOf(
      runReporter(reporterConfiguration(provider), dependencies(wbs.send, 10).deps),
    );
    expect(exit).toBeInstanceOf(ReporterExit);
    expect(exit.message).toBe(
      'another_reporter: instance h4claw resource h4claw-ram: 3 consecutive report_superseded',
    );
    // The stored answer between the second and third superseded reset the count.
    expect(wbs.puts).toHaveLength(7);
  });

  test('exits on 401 and sends nothing further', async () => {
    const wbs = fakeWbs([stored, { status: 401, body: { error: 'unknown_identity' } }]);
    const { provider } = scriptedProvider();
    const run = dependencies(wbs.send, 6);
    const exit = await exitOf(runReporter(reporterConfiguration(provider), run.deps));
    expect(exit.message).toBe(
      'refused: instance h4claw resource h4claw-ram: HTTP 401 unknown_identity',
    );
    expect(wbs.puts).toHaveLength(2);
    expect(`${exit.message}\n${run.output.join('')}`).not.toContain(SECRET);
  });

  test.each([
    [
      403,
      { error: 'not_an_agent_principal', personKind: 'person' },
      'HTTP 403 not_an_agent_principal',
    ],
    [404, { error: 'unknown_provider' }, 'HTTP 404 unknown_provider'],
    [
      409,
      { error: 'provider_mismatch', providerId: 'h2puni' },
      'HTTP 409 provider_mismatch (resource names h2puni)',
    ],
    [
      400,
      { error: 'observedAt_in_future', skewMs: 400_000 },
      'HTTP 400 observedAt_in_future (skew 400000 ms)',
    ],
    [302, null, 'HTTP 302'],
  ])('exits at once on %d', async (status, body, detail) => {
    const wbs = fakeWbs([{ status, body }]);
    const { provider } = scriptedProvider();
    const exit = await exitOf(
      runReporter(reporterConfiguration(provider), dependencies(wbs.send).deps),
    );
    expect(exit.message).toBe(`refused: instance h4claw resource h4claw-ram: ${detail}`);
    expect(wbs.puts).toHaveLength(1);
  });

  test('retries a single 5xx after one cadence, then exits on the second', async () => {
    const recovered = fakeWbs([
      { status: 503, body: null },
      stored,
      { status: 502, body: null },
      stored,
    ]);
    const once = dependencies(recovered.send, 3);
    const budget = await exitOf(
      runReporter(reporterConfiguration(scriptedProvider().provider), once.deps),
    );
    expect(budget.message).toBe('test budget: the loop kept going');
    expect(recovered.puts).toHaveLength(4);

    const down = fakeWbs([stored, { status: 503, body: null }]);
    const exit = await exitOf(
      runReporter(reporterConfiguration(scriptedProvider().provider), dependencies(down.send).deps),
    );
    expect(exit.message).toBe(
      'wbs_unavailable: instance h4claw resource h4claw-ram: HTTP 503 after a retry',
    );
    expect(down.puts).toHaveLength(3);
  });

  test('treats a transport fault to WBS as a 5xx', async () => {
    let calls = 0;
    const send = (): Promise<Response> => {
      calls += 1;
      return Promise.reject(new TypeError('fetch failed'));
    };
    const exit = await exitOf(
      runReporter(reporterConfiguration(scriptedProvider().provider), dependencies(send).deps),
    );
    expect(exit.message).toBe(
      'wbs_unavailable: instance h4claw resource h4claw-ram: transport fault TypeError after a retry',
    );
    expect(calls).toBe(2);
  });

  test('counts only consecutive report_superseded', async () => {
    const superseded: Answer = {
      status: 409,
      body: { error: 'report_superseded', storedObservedAt: 1_760_000_002_000 },
    };
    const unavailable: Answer = { status: 503, body: null };
    const wbs = fakeWbs([superseded, superseded, unavailable, superseded, superseded, stored]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(wbs.send, 6).deps,
      ),
    );
    expect(exit.message).toBe('test budget: the loop kept going');
    expect(wbs.puts).toHaveLength(7);
  });

  test('throws on a 200 that carries no stored report', async () => {
    const wbs = fakeWbs([{ status: 200, body: { ok: true } }]);
    const exit = await exitOf(
      runReporter(reporterConfiguration(scriptedProvider().provider), dependencies(wbs.send).deps),
    );
    expect(exit.message).toBe('WBS answered 200 without a stored report for resource h4claw-ram');
    expect(wbs.puts).toHaveLength(1);
  });

  test('adds a fixed number of abort listeners whatever the number of ticks', async () => {
    // Restored in `finally`; each is called with its own receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = AbortSignal.prototype.addEventListener;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const any = AbortSignal.any;
    let listeners = 0;
    let composites = 0;
    AbortSignal.prototype.addEventListener = function (
      this: AbortSignal,
      ...args: Parameters<AbortSignal['addEventListener']>
    ) {
      if (args[0] === 'abort') listeners += 1;
      original.apply(this, args);
    };
    AbortSignal.any = (signals) => {
      composites += 1;
      return any(signals);
    };
    try {
      const counts: number[] = [];
      for (const ticks of [2, 12]) {
        listeners = 0;
        await exitOf(
          runReporter(
            reporterConfiguration(scriptedProvider().provider),
            dependencies(fakeWbs([stored]).send, ticks).deps,
          ),
        );
        counts.push(listeners);
      }
      // The stop listener itself is seen, so the count is not vacuously zero.
      expect(counts[0]).toBeGreaterThan(0);
      expect(counts[1]).toBe(counts[0]);
      expect(composites).toBe(0);
    } finally {
      AbortSignal.prototype.addEventListener = original;
      AbortSignal.any = any;
    }
  });

  test('exits with the provider error when a reachable host answers nonsense', async () => {
    const wbs = fakeWbs([stored]);
    const { provider } = scriptedProvider([
      new Error('/proc/meminfo on h4claw has no MemTotal line'),
    ]);
    const exit = await exitOf(
      runReporter(reporterConfiguration(provider), dependencies(wbs.send).deps),
    );
    expect(exit.message).toBe('/proc/meminfo on h4claw has no MemTotal line');
    expect(wbs.puts).toEqual([]);
  });
});

describe('the report-capacity command', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'dash-report-capacity-'));
  const fixture = createSshFixture({ 'h4claw.fixture': { meminfo: MEMINFO_15_7 } });
  afterAll(() => {
    fixture.close();
    rmSync(scratch, { force: true, recursive: true });
  });

  test(
    'runs from the entrypoint, reports through the ssh client on PATH, exits on 401, never prints the key',
    async () => {
      const received: RecordedPut[] = [];
      const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch: async (request) => {
          received.push({
            url: new URL(request.url).pathname,
            authorization: request.headers.get('authorization'),
            body: (await request.json()) as unknown,
          });
          return received.length === 1
            ? Response.json(stored.body)
            : Response.json({ error: 'unknown_identity' }, { status: 401 });
        },
      });
      afterAll(() => {
        void server.stop(true);
      });
      const configPath = join(scratch, 'reporter.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          wbsOrigin: `http://127.0.0.1:${String(server.port)}`,
          credential: CREDENTIAL,
          cadenceSeconds: 30,
          instances: [
            {
              instanceId: 'h4claw',
              kind: 'ssh_host',
              host: 'h4claw.fixture',
              sshTransportFile: fixture.transportFile,
              bindings: [
                { resourceId: 'h4claw-ram', measure: 'memory_gib' },
                { resourceId: 'h4claw-slots', measure: 'agent_slots', slots: 4 },
              ],
            },
          ],
        }),
      );
      chmodSync(configPath, 0o600);
      const child = Bun.spawn({
        cmd: [
          process.execPath,
          join(import.meta.dir, '..', 'entrypoint.ts'),
          'report-capacity',
          '--config',
          configPath,
        ],
        env: {
          PATH: `${fixture.binDirectory}:${process.env['PATH'] ?? ''}`,
          HOME: scratch,
          SSH_AUTH_SOCK: fixture.agentSocket,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      // A reporter that fails to exit is killed rather than left running past the test.
      const deadline = setTimeout(() => {
        child.kill();
      }, ENTRYPOINT_BUDGET_MS - 5_000);
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      clearTimeout(deadline);
      expect(exitCode).toBe(1);
      expect(stderr).toBe(
        'error: refused: instance h4claw resource h4claw-slots: HTTP 401 unknown_identity\n',
      );
      expect(received.map((put) => [put.url, put.authorization, put.body])).toEqual([
        [
          '/api/compute-providers/h4claw/resources/h4claw-ram/capacity-report',
          `Bearer ${CREDENTIAL}`,
          {
            observedAt: expect.any(Number) as number,
            cadenceSeconds: 30,
            outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
          },
        ],
        [
          '/api/compute-providers/h4claw/resources/h4claw-slots/capacity-report',
          `Bearer ${CREDENTIAL}`,
          {
            observedAt: expect.any(Number) as number,
            cadenceSeconds: 30,
            outcome: { kind: 'measured', capacityUnits: 4, usageUnits: 0 },
          },
        ],
      ]);
      expect(
        stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as unknown),
      ).toMatchObject([
        { resourceId: 'h4claw-ram', measurement: 'measured', answer: 'stored' },
        { resourceId: 'h4claw-slots', measurement: 'measured', answer: 'refused' },
      ]);
      expect(`${stdout}${stderr}`).not.toContain(SECRET);
    },
    ENTRYPOINT_BUDGET_MS,
  );

  test('refuses a configuration readable by others before any request', () => {
    const configPath = join(scratch, 'shared.json');
    writeFileSync(configPath, JSON.stringify({ credential: CREDENTIAL }));
    chmodSync(configPath, 0o644);
    const execution = Bun.spawnSync({
      cmd: [
        process.execPath,
        join(import.meta.dir, '..', 'entrypoint.ts'),
        'report-capacity',
        '--config',
        configPath,
      ],
      env: { PATH: `${fixture.binDirectory}:${process.env['PATH'] ?? ''}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(execution.exitCode).toBe(1);
    const stderr = execution.stderr.toString('utf8');
    expect(stderr).toStartWith('error: credential_not_owner_only: ');
    expect(stderr).not.toContain(SECRET);
    expect(execution.stdout.toString('utf8')).toBe('');
  });
});

describe('sleepUnlessInterrupted', () => {
  test('resolves when the interrupt aborts, long before the timer', async () => {
    const interrupt = new AbortController();
    let settled = false;
    const sleeping = sleepUnlessInterrupted(3_600_000, interrupt.signal).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    interrupt.abort();
    await sleeping;
    expect(settled).toBe(true);
  });

  test('resolves at once for an interrupt already aborted, and on its timer otherwise', async () => {
    await sleepUnlessInterrupted(3_600_000, AbortSignal.abort());
    await sleepUnlessInterrupted(5, new AbortController().signal);
  });
});

describe('a stub provider', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'dash-report-stub-'));
  afterAll(() => {
    rmSync(scratch, { force: true, recursive: true });
  });

  /** The kubernetes stub, counting every call the reporter makes on the provider it opens. */
  function spyingStub(): { adapter: ProviderAdapter; calls: string[] } {
    const stub = kubernetesStubAdapter();
    const calls: string[] = [];
    return {
      calls,
      adapter: {
        ...stub,
        open: async (settings) => {
          const provider = await stub.open(settings);
          return {
            ...provider,
            kind: provider.kind,
            instanceId: provider.instanceId,
            capabilities: provider.capabilities,
            observe: (binding, now) => {
              calls.push('observe');
              return provider.observe(binding, now);
            },
            run: (request, now) => {
              calls.push('run');
              return provider.run(request, now);
            },
            onRunChange: (listener) => {
              calls.push('onRunChange');
              return provider.onRunChange(listener);
            },
          };
        },
      },
    };
  }

  test('refuses a kubernetes instance at startup, never reaching the stub', async () => {
    // A WBS that refuses any outcome but `measured` and `unreachable`, as the contract does.
    const puts: unknown[] = [];
    const send = async (request: Request): Promise<Response> => {
      const body = (await request.json()) as { outcome?: { kind?: unknown } };
      puts.push(body);
      const kind = body.outcome?.kind;
      return kind === 'measured' || kind === 'unreachable'
        ? Response.json(stored.body)
        : Response.json({ error: 'invalid_body' }, { status: 400 });
    };
    const configPath = join(scratch, 'cluster.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        wbsOrigin: 'https://wbs-dev.example',
        credential: CREDENTIAL,
        instances: [
          {
            instanceId: 'cluster-1',
            kind: 'kubernetes',
            bindings: [{ resourceId: 'cluster-ram', measure: 'memory_gib' }],
          },
        ],
      }),
    );
    chmodSync(configPath, 0o600);
    const spy = spyingStub();
    const exit = await exitOf(
      reportCapacityCommand(
        ['--config', configPath],
        { kubernetes: spy.adapter },
        dependencies(send, 0).deps,
      ),
    );
    expect(exit.message).toBe(
      'provider_not_implemented: instance cluster-1 is a kubernetes, whose adapter is a stub this Dash cannot report from',
    );
    expect(exit).toBeInstanceOf(ConfigurationRefusal);
    expect(spy.calls).toEqual([]);
    expect(puts).toEqual([]);
  });
});
