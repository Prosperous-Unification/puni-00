import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { ApiKey, mcpEndpointOf } from '../mcp/machine-token';
import { scriptedTools } from '../mcp/testing/scripted-tools';
import { type ToolAnswer, WbsUnreachable } from '../mcp/wbs-tools';
import {
  ConfigurationRefusal,
  type ProviderAdapter,
  type ReporterConfiguration,
} from './configuration';
import { kubernetesStubAdapter } from './kubernetes';
import type { ComputeProvider, Measurement, ResourceBinding } from './provider';
import {
  CAPACITY_REPORT_TOOL,
  reportCapacityCommand,
  type ReporterDependencies,
  ReporterExit,
  runReporter,
  sleepUnlessInterrupted,
} from './report-capacity';
import { fakeCredential } from './testing/credential';
import { createSshFixture, MEMINFO_15_7 } from './testing/ssh-fixture';

const CREDENTIAL = fakeCredential();
const SECRET = CREDENTIAL.slice('wbs_mk_'.length);

/** One scripted answer of the fake WBS: what mcp-01 reports, or the call's rejection. */
type Answer = ToolAnswer | Error;

/**
 * A fake WBS behind mcp-01: records every tool call and answers from `answers` in order, the last
 * one repeating; an `Error` answer is the call's rejection.
 */
function fakeWbs(answers: readonly Answer[]) {
  const tools = scriptedTools((_call, index) => {
    const answer = answers[Math.min(index, answers.length - 1)];
    if (answer instanceof Error) return Promise.reject(answer);
    return answer;
  });
  return { tools, puts: tools.calls, connect: () => tools };
}

const refused = (status: number, body: unknown): ToolAnswer => ({
  kind: 'refused',
  status,
  error:
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : null,
  body,
});

const stored: ToolAnswer = {
  kind: 'answered',
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
    endpoint: mcpEndpointOf('https://wbs-dev.example/mcp'),
    credential: ApiKey.of(CREDENTIAL, 'the test key'),
    cadenceSeconds: 300,
    instances: [{ instanceId: 'h4claw', provider, bindings }],
  };
}

/**
 * Dependencies with a stepping clock and a sleep that returns at once but ends the test after
 * `ticks` sleeps, so a loop that should have exited is caught instead of running forever.
 */
function dependencies(connect: ReporterDependencies['connect'], ticks = 6) {
  let now = 1_760_000_000_000;
  const sleeps: number[] = [];
  const output: string[] = [];
  const deps: ReporterDependencies = {
    clock: { read: () => (now += 1000) },
    connect,
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

// The reporter is an MCP client (`wbs-mcp-agent-surface` task 7.2): the fake WBS below answers
// its tool calls as mcp-01 reports be-01's answers; `mcp-01 reports capacity…` further down runs
// the real path.
describe('report-capacity against a fake WBS', () => {
  test('calls the report tool once per binding per tick with cadenceSeconds, never with the key', async () => {
    const wbs = fakeWbs([stored]);
    const { provider } = scriptedProvider();
    const bindings: ResourceBinding[] = [
      { resourceId: 'h4claw-ram', measure: 'memory_gib' },
      { resourceId: 'h4claw-tmp', measure: 'memory_gib' },
    ];
    const run = dependencies(wbs.connect, 2);
    const exit = await exitOf(runReporter(reporterConfiguration(provider, bindings), run.deps));
    expect(exit.message).toBe('test budget: the loop kept going');
    expect(run.sleeps).toEqual([300_000, 300_000, 300_000]);
    expect(wbs.puts.map((put) => [put.name, put.input['resourceId']])).toEqual(
      [1, 2, 3].flatMap(() => [
        [CAPACITY_REPORT_TOOL, 'h4claw-ram'],
        [CAPACITY_REPORT_TOOL, 'h4claw-tmp'],
      ]),
    );
    expect(wbs.puts[0].input).toEqual({
      providerId: 'h4claw',
      resourceId: 'h4claw-ram',
      observedAt: 1_760_000_001_000,
      cadenceSeconds: 300,
      outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
    });
    expect(JSON.stringify(wbs.puts)).not.toContain(SECRET);
    expect(run.output.join('')).not.toContain(SECRET);
    // The tools opened for the run are closed when it ends.
    expect(wbs.tools.closed()).toBe(1);
  });

  test('reports an unreachable measurement rather than swallowing it', async () => {
    const wbs = fakeWbs([stored]);
    const { provider } = scriptedProvider([
      {
        kind: 'unreachable',
        reason: 'ssh timeout: no answer from h4claw within the command deadline',
      },
    ]);
    await exitOf(runReporter(reporterConfiguration(provider), dependencies(wbs.connect, 0).deps));
    expect(wbs.puts[0].input).toEqual({
      providerId: 'h4claw',
      resourceId: 'h4claw-ram',
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
    const run = dependencies(wbs.connect);
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
    const superseded = refused(409, {
      error: 'report_superseded',
      storedObservedAt: 1_760_000_002_000,
    });
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
      runReporter(reporterConfiguration(provider), dependencies(wbs.connect, 10).deps),
    );
    expect(exit).toBeInstanceOf(ReporterExit);
    expect(exit.message).toBe(
      'another_reporter: instance h4claw resource h4claw-ram: 3 consecutive report_superseded',
    );
    // The stored answer between the second and third superseded reset the count.
    expect(wbs.puts).toHaveLength(7);
  });

  test.each(['machine_credential_refused', 'insufficient_scope'])(
    'exits when mcp-01 answers %s and sends nothing further',
    async (reason) => {
      const wbs = fakeWbs([stored, { kind: 'not_called', reason }]);
      const { provider } = scriptedProvider();
      const run = dependencies(wbs.connect, 6);
      const exit = await exitOf(runReporter(reporterConfiguration(provider), run.deps));
      expect(exit.message).toBe(`refused: instance h4claw resource h4claw-ram: mcp-01 ${reason}`);
      expect(wbs.puts).toHaveLength(2);
      expect(`${exit.message}\n${run.output.join('')}`).not.toContain(SECRET);
    },
  );

  test('exits on a 401 be-01 relays and sends nothing further', async () => {
    const wbs = fakeWbs([stored, refused(401, { error: 'unknown_identity' })]);
    const { provider } = scriptedProvider();
    const run = dependencies(wbs.connect, 6);
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
    [400, 'a proxy page', 'HTTP 400'],
  ])('exits at once on %d', async (status, body, detail) => {
    const wbs = fakeWbs([refused(status, body)]);
    const { provider } = scriptedProvider();
    const exit = await exitOf(
      runReporter(reporterConfiguration(provider), dependencies(wbs.connect).deps),
    );
    expect(exit.message).toBe(`refused: instance h4claw resource h4claw-ram: ${detail}`);
    expect(wbs.puts).toHaveLength(1);
  });

  test('retries a single uncompleted call after one cadence, then exits on the second', async () => {
    const recovered = fakeWbs([
      { kind: 'not_called', reason: 'server_error' },
      stored,
      { kind: 'not_called', reason: 'rate_limited' },
      stored,
    ]);
    const once = dependencies(recovered.connect, 3);
    const budget = await exitOf(
      runReporter(reporterConfiguration(scriptedProvider().provider), once.deps),
    );
    expect(budget.message).toBe('test budget: the loop kept going');
    expect(recovered.puts).toHaveLength(4);

    const down = fakeWbs([stored, { kind: 'not_called', reason: 'server_error' }]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(down.connect).deps,
      ),
    );
    expect(exit.message).toBe(
      'wbs_unavailable: instance h4claw resource h4claw-ram: mcp-01 server_error after a retry',
    );
    expect(down.puts).toHaveLength(3);
  });

  test('treats a call that got no answer as transient', async () => {
    const wbs = fakeWbs([
      new WbsUnreachable(CAPACITY_REPORT_TOOL, { cause: new TypeError('fetch failed') }),
    ]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(wbs.connect).deps,
      ),
    );
    expect(exit.message).toBe(
      'wbs_unavailable: instance h4claw resource h4claw-ram: transport fault TypeError after a retry',
    );
    expect(wbs.puts).toHaveLength(2);
  });

  test('exits on an answer the tool client cannot attribute, never retrying it', async () => {
    const wbs = fakeWbs([new Error(`an unattributable tool error from ${CAPACITY_REPORT_TOOL}`)]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(wbs.connect).deps,
      ),
    );
    expect(exit.message).toBe(`an unattributable tool error from ${CAPACITY_REPORT_TOOL}`);
    expect(wbs.puts).toHaveLength(1);
  });

  test('counts only consecutive report_superseded', async () => {
    const superseded = refused(409, {
      error: 'report_superseded',
      storedObservedAt: 1_760_000_002_000,
    });
    const unavailable: Answer = { kind: 'not_called', reason: 'server_error' };
    const wbs = fakeWbs([superseded, superseded, unavailable, superseded, superseded, stored]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(wbs.connect, 6).deps,
      ),
    );
    expect(exit.message).toBe('test budget: the loop kept going');
    expect(wbs.puts).toHaveLength(7);
  });

  test('throws on a 200 that carries no stored report', async () => {
    const wbs = fakeWbs([{ kind: 'answered', body: { ok: true } }]);
    const exit = await exitOf(
      runReporter(
        reporterConfiguration(scriptedProvider().provider),
        dependencies(wbs.connect).deps,
      ),
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
            dependencies(fakeWbs([stored]).connect, ticks).deps,
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
      runReporter(reporterConfiguration(provider), dependencies(wbs.connect).deps),
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
  // Running it from the entrypoint against WBS: `report-capacity.boot.test.ts`.

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
    const tools = scriptedTools(({ input }) => {
      const kind = (input['outcome'] as { kind?: unknown } | undefined)?.kind;
      return kind === 'measured' || kind === 'unreachable'
        ? stored
        : refused(400, { error: 'invalid_body' });
    });
    const configPath = join(scratch, 'cluster.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        mcpResource: 'https://wbs-dev.example/mcp',
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
        dependencies(() => tools, 0).deps,
      ),
    );
    expect(exit.message).toBe(
      'provider_not_implemented: instance cluster-1 is a kubernetes, whose adapter is a stub this Dash cannot report from',
    );
    expect(exit).toBeInstanceOf(ConfigurationRefusal);
    expect(spy.calls).toEqual([]);
    expect(tools.calls).toEqual([]);
  });
});
