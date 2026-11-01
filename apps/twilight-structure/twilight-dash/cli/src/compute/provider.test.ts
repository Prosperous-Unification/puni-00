import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import {
  ConfigurationRefusal,
  type ConfigurationRefusalReason,
  type InstanceSettings,
  loadReporterConfiguration,
  type ProviderAdapter,
  type ProviderAdapters,
} from './configuration';
import { dockerAdapter } from './docker';
import { kubernetesStubAdapter } from './kubernetes';
import type { ComputeProvider, Measure, Measurement, ResourceBinding } from './provider';
import { fakeCredential } from './testing/credential';

const scratch = mkdtempSync(join(tmpdir(), 'dash-compute-config-'));
afterAll(() => {
  rmSync(scratch, { force: true, recursive: true });
});

const NOW = 1_760_000_000_000;

/** A provider that answers one fixed measurement at the instant it is handed. */
function fixedProvider(
  settings: InstanceSettings,
  measures: ReadonlySet<Measure>,
): ComputeProvider {
  return {
    kind: settings.kind,
    instanceId: settings.instanceId,
    capabilities: { measures, runs: false },
    observe: (_binding: ResourceBinding, now: number): Promise<Measurement> =>
      Promise.resolve({
        kind: 'measured',
        capacityUnits: 15,
        usageUnits: 8,
        observedAt: now,
        evidence: 'fixed',
      }),
    run: () => Promise.reject(new Error('fixed providers run nothing')),
    onRunChange: () => () => undefined,
  };
}

/** An adapter recording what it opened; `measures` defaults to all but agent_slots. */
function recordingAdapter(
  measures: ReadonlySet<Measure> = new Set(['memory_gib', 'disk_gib', 'cpu_cores']),
): ProviderAdapter & { opened: InstanceSettings[] } {
  const opened: InstanceSettings[] = [];
  return {
    isStub: false,
    measures,
    opened,
    open: (settings) => {
      opened.push(settings);
      return Promise.resolve(fixedProvider(settings, measures));
    },
  };
}

let fileCount = 0;
function writeConfiguration(content: unknown, mode = 0o600): string {
  fileCount += 1;
  const path = join(scratch, `config-${String(fileCount)}.json`);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  chmodSync(path, mode);
  return path;
}

function configuration(overrides: Record<string, unknown> = {}, credential = fakeCredential()) {
  return {
    schemaVersion: 2,
    mcpResource: 'https://wbs-dev.example/mcp',
    credential,
    instances: [
      {
        instanceId: 'h4claw',
        kind: 'docker',
        bindings: [{ resourceId: 'h4claw-ram', measure: 'memory_gib' }],
      },
    ],
    ...overrides,
  };
}

async function refusalOf(
  path: string,
  adapters: ProviderAdapters,
): Promise<{ reason: ConfigurationRefusalReason; message: string }> {
  try {
    await loadReporterConfiguration(path, adapters);
  } catch (cause) {
    if (cause instanceof ConfigurationRefusal)
      return { reason: cause.reason, message: cause.message };
    throw cause;
  }
  throw new Error(`loaded ${path}`);
}

describe('the ComputeProvider port', () => {
  test('a provider stamps its measurement with the injected instant, not a clock of its own', async () => {
    const adapter = recordingAdapter();
    const loaded = await loadReporterConfiguration(writeConfiguration(configuration()), {
      docker: adapter,
    });
    const [instance] = loaded.instances;
    const measurement = await instance.provider.observe(instance.bindings[0], NOW);
    expect(measurement).toEqual({
      kind: 'measured',
      capacityUnits: 15,
      usageUnits: 8,
      observedAt: NOW,
      evidence: 'fixed',
    });
    expect(loaded.cadenceSeconds).toBe(300);
    expect(loaded.endpoint).toEqual({
      resource: 'https://wbs-dev.example/mcp',
      issuer: 'https://wbs-dev.example/mcp/oauth',
      tokenUrl: 'https://wbs-dev.example/mcp/oauth/token',
    });
    expect(adapter.opened.map((settings) => settings.instanceId)).toEqual(['h4claw']);
  });
});

describe('loading a reporter configuration', () => {
  test('refuses an absent configuration config_absent', async () => {
    expect((await refusalOf(join(scratch, 'absent.json'), {})).reason).toBe('config_absent');
  });

  test('refuses an unreadable configuration config_unreadable, distinct from absent', async () => {
    const path = writeConfiguration(configuration(), 0o000);
    expect((await refusalOf(path, {})).reason).toBe('config_unreadable');
    const link = join(scratch, 'linked.json');
    symlinkSync(writeConfiguration(configuration()), link);
    expect((await refusalOf(link, {})).reason).toBe('config_unreadable');
  });

  test('refuses a directory config_unreadable and a file over 64 KiB config_malformed', async () => {
    const directory = mkdtempSync(join(scratch, 'directory-'));
    expect(await refusalOf(directory, {})).toEqual({
      reason: 'config_unreadable',
      message: expect.stringContaining('is not a regular file') as string,
    });
    const oversized = writeConfiguration(
      `${JSON.stringify(configuration())}${' '.repeat(64 * 1024)}`,
    );
    expect(await refusalOf(oversized, { docker: recordingAdapter() })).toEqual({
      reason: 'config_malformed',
      message: expect.stringContaining('exceeds 64 KiB') as string,
    });
  });

  test('refuses a group- or world-readable configuration credential_not_owner_only', async () => {
    for (const mode of [0o640, 0o604, 0o660]) {
      const refusal = await refusalOf(writeConfiguration(configuration(), mode), {
        docker: recordingAdapter(),
      });
      expect(refusal.reason, mode.toString(8)).toBe('credential_not_owner_only');
    }
  });

  test('refuses malformed JSON and a malformed shape config_malformed', async () => {
    const cases: readonly unknown[] = [
      '{"schemaVersion": 2,',
      [],
      configuration({ schemaVersion: 1 }),
      // The version before `wbs-mcp-agent-surface` task 7.2: an origin for `/api`, not an MCP endpoint.
      {
        ...configuration({ schemaVersion: 1, wbsOrigin: 'https://wbs-dev.example' }),
        mcpResource: undefined,
      },
      configuration({ cadenceSeconds: 29 }),
      configuration({ instances: [] }),
      configuration({ extra: true }),
      configuration({
        instances: [
          { instanceId: 'h4claw', kind: 'docker', bindings: [{ resourceId: 'r', measure: 'gpu' }] },
        ],
      }),
      configuration({
        instances: [
          {
            instanceId: 'h4claw',
            kind: 'docker',
            bindings: [{ resourceId: 'r', measure: 'disk_gib' }],
          },
        ],
      }),
      configuration({
        instances: [
          {
            instanceId: 'h4claw',
            kind: 'docker',
            bindings: [{ resourceId: 'r', measure: 'memory_gib', slots: 2 }],
          },
        ],
      }),
      configuration({
        instances: [
          {
            instanceId: 'a',
            kind: 'docker',
            bindings: [{ resourceId: 'r', measure: 'memory_gib' }],
          },
          {
            instanceId: 'b',
            kind: 'docker',
            bindings: [{ resourceId: 'r', measure: 'cpu_cores' }],
          },
        ],
      }),
      configuration({ mcpResource: 'not a url' }),
      configuration({ mcpResource: 'https://user:pass@wbs.example/mcp' }),
      configuration({ mcpResource: 'https://wbs.example/mcp?x=1' }),
      configuration({ mcpResource: 'https://wbs.example/mcp#x' }),
    ];
    for (const content of cases) {
      const adapter = recordingAdapter();
      const refusal = await refusalOf(writeConfiguration(content), { docker: adapter });
      expect(refusal.reason, JSON.stringify(content)).toBe('config_malformed');
      expect(adapter.opened).toEqual([]);
    }
  });

  test('refuses a plain-HTTP origin that is not loopback', async () => {
    const remote = await refusalOf(
      writeConfiguration(configuration({ mcpResource: 'http://wbs-dev.example/mcp' })),
      { docker: recordingAdapter() },
    );
    expect(remote.reason).toBe('config_malformed');
    const loopback = await loadReporterConfiguration(
      writeConfiguration(configuration({ mcpResource: 'http://127.0.0.1:3100/mcp' })),
      { docker: recordingAdapter() },
    );
    expect(loopback.endpoint.resource).toBe('http://127.0.0.1:3100/mcp');
  });

  test('never echoes a malformed credential or a well-formed one', async () => {
    const credential = fakeCredential();
    const malformed = `${credential}"`;
    for (const content of [
      configuration({}, malformed),
      configuration({ cadenceSeconds: 'x' }, credential),
      `{"credential": "${credential}", oops}`,
    ]) {
      const refusal = await refusalOf(writeConfiguration(content), { docker: recordingAdapter() });
      expect(refusal.reason).toBe('config_malformed');
      expect(refusal.message).not.toContain(credential.slice('wbs_mk_'.length));
    }
    const loaded = await loadReporterConfiguration(
      writeConfiguration(configuration({}, credential)),
      {
        docker: recordingAdapter(),
      },
    );
    const printed = [JSON.stringify(loaded), String(loaded.credential), Bun.inspect(loaded)].join(
      '\n',
    );
    expect(printed).not.toContain(credential.slice('wbs_mk_'.length));
    expect(loaded.credential.basicAuthorization()).toBe(
      `Basic ${btoa(`${credential.slice('wbs_mk_'.length, credential.indexOf('.'))}:${credential}`)}`,
    );
  });

  test('refuses a pool instance provider_kind_not_available before any adapter opens', async () => {
    const adapter = recordingAdapter();
    const refusal = await refusalOf(
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'pool-1',
              kind: 'puni_pool',
              bindings: [{ resourceId: 'pool-ram', measure: 'memory_gib' }],
            },
          ],
        }),
      ),
      { docker: adapter, ssh_host: adapter, kubernetes: adapter },
    );
    expect(refusal).toEqual({
      reason: 'provider_kind_not_available',
      message: expect.stringContaining('pool-1') as string,
    });
    expect(adapter.opened).toEqual([]);
  });

  test('refuses a kind this Dash has no adapter for provider_not_implemented', async () => {
    const refusal = await refusalOf(
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'cluster-1',
              kind: 'kubernetes',
              bindings: [{ resourceId: 'cluster-ram', measure: 'memory_gib' }],
            },
          ],
        }),
      ),
      { docker: recordingAdapter() },
    );
    expect(refusal).toEqual({
      reason: 'provider_not_implemented',
      message: expect.stringContaining('cluster-1') as string,
    });
  });

  test('refuses a measure the adapter lacks unsupported_measure before opening it', async () => {
    const adapter = recordingAdapter();
    const refusal = await refusalOf(
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'h4claw',
              kind: 'docker',
              bindings: [
                { resourceId: 'h4claw-ram', measure: 'memory_gib' },
                { resourceId: 'h4claw-slots', measure: 'agent_slots', slots: 4 },
              ],
            },
          ],
        }),
      ),
      { docker: adapter },
    );
    expect(refusal).toEqual({
      reason: 'unsupported_measure',
      message: expect.stringContaining('h4claw-slots') as string,
    });
    expect(adapter.opened).toEqual([]);
  });

  test('refuses a kubernetes instance provider_not_implemented, naming it, before its stub opens', async () => {
    const stub = kubernetesStubAdapter();
    const opened: string[] = [];
    const refusal = await refusalOf(
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'cluster-1',
              kind: 'kubernetes',
              bindings: [{ resourceId: 'cluster-ram', measure: 'memory_gib' }],
            },
          ],
        }),
      ),
      {
        kubernetes: {
          ...stub,
          open: (settings) => {
            opened.push(settings.instanceId);
            return stub.open(settings);
          },
        },
      },
    );
    expect(refusal).toEqual({
      reason: 'provider_not_implemented',
      message: expect.stringContaining('instance cluster-1 is a kubernetes') as string,
    });
    expect(opened).toEqual([]);
  });

  test('the kubernetes stub answers not_implemented from every method', async () => {
    const stub = await kubernetesStubAdapter().open({
      instanceId: 'cluster-1',
      kind: 'kubernetes',
      bindings: [],
    });
    expect(stub.capabilities.runs).toBe(true);
    expect([...stub.capabilities.measures].sort()).toEqual([
      'agent_slots',
      'cpu_cores',
      'disk_gib',
      'memory_gib',
    ]);
    expect(await stub.observe({ resourceId: 'r', measure: 'memory_gib' }, NOW)).toEqual({
      kind: 'not_implemented',
      observedAt: NOW,
    });
    expect(await stub.run({ command: ['true'], environment: {} }, NOW)).toEqual({
      kind: 'not_implemented',
    });
  });

  test('opens a docker instance with its context and image through the real adapter', async () => {
    const loaded = await loadReporterConfiguration(
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'h4claw-docker',
              kind: 'docker',
              dockerContext: 'h4claw',
              runImage: 'ghcr.io/puni/agent:1.2@sha256:abc',
              bindings: [
                { resourceId: 'docker-ram', measure: 'memory_gib' },
                { resourceId: 'docker-disk', measure: 'disk_gib', ceilingGib: 200 },
              ],
            },
          ],
        }),
      ),
      { docker: dockerAdapter({ dockerExecutable: '/nonexistent/docker', environment: {} }) },
    );
    const [instance] = loaded.instances;
    expect(instance.provider.kind).toBe('docker');
    expect(instance.provider.capabilities.runs).toBe(true);
  });

  test('refuses a docker disk binding without ceilingGib or with a path config_malformed', async () => {
    const docker = (bindings: unknown[], extra: Record<string, unknown> = {}) =>
      writeConfiguration(
        configuration({
          instances: [
            {
              instanceId: 'h4claw-docker',
              kind: 'docker',
              dockerContext: 'h4claw',
              bindings,
              ...extra,
            },
          ],
        }),
      );
    const adapters = { docker: recordingAdapter(), ssh_host: recordingAdapter() };
    for (const bindings of [
      [{ resourceId: 'disk', measure: 'disk_gib' }],
      [{ resourceId: 'disk', measure: 'disk_gib', path: '/var/lib/docker' }],
      [{ resourceId: 'disk', measure: 'disk_gib', path: '/', ceilingGib: 200 }],
      [{ resourceId: 'ram', measure: 'memory_gib', ceilingGib: 200 }],
    ]) {
      expect(await refusalOf(docker(bindings), adapters), JSON.stringify(bindings)).toMatchObject({
        reason: 'config_malformed',
      });
    }
    // An ssh_host disk binding still takes a path, never a ceiling.
    const sshDisk = writeConfiguration(
      configuration({
        instances: [
          {
            instanceId: 'h4claw',
            kind: 'ssh_host',
            bindings: [{ resourceId: 'disk', measure: 'disk_gib', ceilingGib: 200 }],
          },
        ],
      }),
    );
    expect(await refusalOf(sshDisk, adapters)).toMatchObject({ reason: 'config_malformed' });
  });

  test('refuses a docker context or image that could read as a flag config_malformed', async () => {
    for (const extra of [
      { dockerContext: '-H=tcp://evil' },
      { dockerContext: 'h4claw', runImage: '--privileged' },
      { dockerContext: 'x'.repeat(65) },
      { dockerContext: 'a' },
    ]) {
      const refusal = await refusalOf(
        writeConfiguration(
          configuration({
            instances: [
              {
                instanceId: 'h4claw-docker',
                kind: 'docker',
                bindings: [{ resourceId: 'ram', measure: 'memory_gib' }],
                ...extra,
              },
            ],
          }),
        ),
        { docker: recordingAdapter() },
      );
      expect(refusal, JSON.stringify(extra)).toMatchObject({ reason: 'config_malformed' });
      expect(refusal.message).not.toContain('evil');
    }
  });
});
