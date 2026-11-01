import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { ApiKey, mcpEndpointOf } from '../mcp/machine-token';
import { scriptedTools } from '../mcp/testing/scripted-tools';
import type { ToolAnswer } from '../mcp/wbs-tools';
import {
  ampleHost,
  gate,
  hostPoolFixture,
  insideLinuxNamespace,
  jobType,
} from '../resources/host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { ConfigurationRefusal, loadReporterConfiguration } from './configuration';
import { openHostPoolLedger } from './host-pool-ledger';
import type { ComputeProvider, Measurement, ResourceBinding } from './provider';
import {
  CAPACITY_REPORT_TOOL,
  type ReporterDependencies,
  runReporter,
  sleepUnlessInterrupted,
} from './report-capacity';
import { fakeCredential } from './testing/credential';

const CREDENTIAL = fakeCredential();
const silent = (): void => undefined;
const fixtures: { remove: () => void }[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.remove();
});

const stored: ToolAnswer = {
  kind: 'answered',
  body: { providerId: 'h2puni', observedAt: 0 },
};
const revoked: ToolAnswer = {
  kind: 'refused',
  status: 401,
  error: 'unauthenticated',
  body: { error: 'unauthenticated' },
};

/**
 * h2puni's managed-resource ledger as `dash-host-jobs` scenarios state it: 8 cores, 15 GiB with
 * 2 GiB headroom and two gate trees, with `gates` gates admitted host-locally (6 GiB each).
 */
async function h2puniLedger(gates: number) {
  const fixture = hostPoolFixture({
    cpuCores: 8,
    memoryGib: 15,
    headroom: { cpuCores: 0, memoryGib: 2 },
    gateTrees: 2,
    credential: CREDENTIAL,
  });
  fixtures.push(fixture);
  const runtime = ResourceRuntime.initialize(
    loadResourceConfiguration(fixture.config),
    { read: () => Date.now() },
    ampleHost,
  );
  const admit = async (label: string) => {
    const outcome = await runtime.admitHostJob(
      { descriptor: gate, label, waitSeconds: 1 },
      { pollMs: 5, signal: new AbortController().signal, report: silent },
    );
    if (outcome.kind !== 'admitted') throw new Error(`expected admission, got ${outcome.kind}`);
    return outcome.job;
  };
  for (let index = 0; index < gates; index++) await admit(`gate:${String(index)}`);
  return { fixture, runtime, admit, ledger: join(fixture.root, '.dash', 'resources.sqlite') };
}

/** The ssh adapter as the scenario reads h2puni: 15 GiB, 8 in use. */
function measuringProvider(): ComputeProvider {
  return {
    kind: 'ssh_host',
    instanceId: 'h2puni',
    capabilities: { measures: new Set(['memory_gib', 'cpu_cores']), runs: false },
    observe: (_binding: ResourceBinding, now: number) =>
      Promise.resolve<Measurement>({
        kind: 'measured',
        capacityUnits: 15,
        usageUnits: 8,
        observedAt: now,
        evidence: 'scripted',
      }),
    run: () => Promise.reject(new Error('runs nothing')),
    onRunChange: () => () => undefined,
  };
}

const pooledRam: ResourceBinding = {
  resourceId: 'h2puni-ram',
  measure: 'memory_gib',
  source: 'host_pool',
  dimension: 'memoryGib',
};

function dependencies(
  connect: ReporterDependencies['connect'],
  sleep: ReporterDependencies['sleep'],
): ReporterDependencies {
  return { clock: { read: () => Date.now() }, connect, sleep, write: silent };
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

/**
 * `dash-host-jobs` task 5.1 against a real managed-resource ledger, inside the private namespace
 * the runtime's `/proc` inspection needs (as host-jobs.test.ts runs).
 */
if (insideLinuxNamespace(import.meta.path))
  describe('the host pool binding source (dash-host-jobs 5.1)', () => {
    test('the ledger port reads what the runtime reserves, per dimension', async () => {
      const { runtime, ledger } = await h2puniLedger(2);
      const port = openHostPoolLedger(ledger);
      try {
        expect(
          ['cpuCores', 'memoryGib', 'tmpDiskGib', 'gate_tree'].map((dimension) =>
            port.reserved(dimension),
          ),
        ).toEqual([8, 12, 0, 2]);
        const reserved = runtime.hostPoolStatus().reserved;
        expect([reserved.cpuCores, reserved.memoryGib]).toEqual([8, 12]);
      } finally {
        port.close();
        runtime.close();
      }
    });

    test('refuses a ledger it cannot open or does not know', async () => {
      const { runtime, ledger, fixture } = await h2puniLedger(0);
      runtime.close();
      expect(() => openHostPoolLedger(join(fixture.base, 'absent.sqlite'))).toThrow(
        'cannot be opened read-only',
      );
      const { Database } = await import('bun:sqlite');
      const db = new Database(ledger);
      db.run('PRAGMA user_version=7');
      db.close();
      expect(() => openHostPoolLedger(ledger)).toThrow('is version 7, not 1');
    });

    // "Reserved beside measured": the ssh adapter reads 8 in use, the ledger reserves 12.
    test("reports the ledger's reservation beside the measured usage", async () => {
      const { runtime, ledger } = await h2puniLedger(2);
      const tools = scriptedTools(() => revoked);
      const exit = await exitOf(
        runReporter(
          {
            endpoint: mcpEndpointOf('https://wbs-dev.example/mcp'),
            credential: ApiKey.of(CREDENTIAL, 'the test key'),
            cadenceSeconds: 300,
            instances: [
              {
                instanceId: 'h2puni',
                provider: measuringProvider(),
                bindings: [pooledRam],
              },
            ],
            hostPool: openHostPoolLedger(ledger),
          },
          dependencies(
            () => tools,
            () => Promise.reject(new Error('one tick only')),
          ),
        ),
      );
      expect(exit.message).toContain('HTTP 401 unauthenticated');
      expect(tools.calls).toEqual([
        {
          name: CAPACITY_REPORT_TOOL,
          input: {
            providerId: 'h2puni',
            resourceId: 'h2puni-ram',
            observedAt: expect.any(Number) as number,
            cadenceSeconds: 300,
            outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8, reservedUnits: 12 },
          },
        },
      ]);
      runtime.close();
    });

    test("re-observes on the ledger's change, outside its cadence", async () => {
      const { runtime, ledger, admit } = await h2puniLedger(1);
      const answers: ToolAnswer[] = [stored, revoked];
      const tools = scriptedTools((_call, index) => {
        if (index >= answers.length) throw new Error('reported a third time');
        return answers[index];
      });
      let admitted = false;
      const exit = await exitOf(
        runReporter(
          {
            endpoint: mcpEndpointOf('https://wbs-dev.example/mcp'),
            credential: ApiKey.of(CREDENTIAL, 'the test key'),
            cadenceSeconds: 300,
            instances: [
              { instanceId: 'h2puni', provider: measuringProvider(), bindings: [pooledRam] },
            ],
            hostPool: openHostPoolLedger(ledger, 10),
          },
          dependencies(
            () => tools,
            (milliseconds, interrupt) => {
              // The second gate's admission is the ledger change; the cadence is never waited.
              if (!admitted) {
                admitted = true;
                void admit('gate:late');
              }
              return Promise.race([
                sleepUnlessInterrupted(milliseconds, interrupt),
                Bun.sleep(5_000).then(() => {
                  throw new Error('waited out the cadence');
                }),
              ]);
            },
          ),
        ),
      );
      expect(exit.message).toContain('HTTP 401 unauthenticated');
      expect(
        tools.calls.map(
          (call) => (call.input['outcome'] as { reservedUnits?: number }).reservedUnits,
        ),
      ).toEqual([6, 12]);
      runtime.close();
    });

    test('refuses a host pool binding the loader cannot honour, config_malformed', async () => {
      const { fixture } = await h2puniLedger(0);
      const write = (body: Record<string, unknown>) => {
        const path = join(fixture.base, 'report.json');
        writeFileSync(
          path,
          JSON.stringify({
            schemaVersion: 2,
            mcpResource: 'https://wbs-dev.example/mcp',
            credential: CREDENTIAL,
            instances: [
              {
                instanceId: 'h2puni',
                kind: 'ssh_host',
                bindings: [pooledRam],
                ...body['instance'],
              },
            ],
            ...body['top'],
          }),
        );
        chmodSync(path, 0o600);
        return path;
      };
      const adapters = {
        ssh_host: {
          isStub: false,
          measures: new Set(['memory_gib', 'cpu_cores', 'agent_slots'] as const),
          open: () => Promise.resolve(measuringProvider()),
        },
      };
      const ledger = { ledger: join(fixture.root, '.dash', 'resources.sqlite') };
      const refusals: [Record<string, unknown>, string][] = [
        [{ top: {} }, 'hostPool.ledger is required by a binding whose source is host_pool'],
        [
          {
            top: { hostPool: ledger },
            instance: { bindings: [{ resourceId: 'h2puni-ram', measure: 'memory_gib' }] },
          },
          'hostPool.ledger is unused without a binding whose source is host_pool',
        ],
        [
          {
            top: { hostPool: ledger },
            instance: { bindings: [{ ...pooledRam, measure: 'cpu_cores' }] },
          },
          'dimension memoryGib pairs with measure memory_gib',
        ],
        [
          {
            top: { hostPool: ledger },
            instance: { bindings: [{ ...pooledRam, dimension: 'gate_tree' }] },
          },
          'dimension gate_tree pairs with measure agent_slots',
        ],
        [
          {
            top: { hostPool: ledger },
            instance: {
              bindings: [{ resourceId: 'h2puni-ram', measure: 'memory_gib', source: 'host_pool' }],
            },
          },
          'names source and dimension together or neither',
        ],
      ];
      for (const [body, message] of refusals) {
        const refusal = await loadReporterConfiguration(write(body), adapters).catch(
          (cause: unknown) => cause,
        );
        expect(refusal).toBeInstanceOf(ConfigurationRefusal);
        expect((refusal as Error).message).toContain(message);
      }
      const loaded = await loadReporterConfiguration(
        write({ top: { hostPool: ledger } }),
        adapters,
      );
      expect(loaded.hostPool?.reserved('memoryGib')).toBe(0);
      loaded.hostPool?.close();
      // A job type sharing no dimension leaves the reservation untouched.
      expect(jobType('none', 0, 0).envelope.memoryGib).toBe(0);
    });
  });
