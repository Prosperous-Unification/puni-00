import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { type DevPreflight, preflightDevDeployment, renderDevCompose } from './deployment';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

async function fixture(): Promise<DevPreflight> {
  const directory = await mkdtemp(join(tmpdir(), 'dev-observability-'));
  directories.push(directory);
  for (const name of [
    'collector.yaml',
    'gateway.yaml',
    'prometheus.yaml',
    'alertmanager.yaml',
    'elasticsearch.yaml',
    'kibana.yaml',
    'rollback.json',
    'rules.yaml',
    'retention.sh',
    'health.mjs',
  ]) {
    await writeFile(
      join(directory, name),
      name === 'rollback.json'
        ? JSON.stringify({
            environment: 'dev',
            host: 'h3mon',
            project: 'puni-dev-observability',
            preserveVolumes: true,
          })
        : 'fixture: only\n',
    );
  }
  return {
    environment: 'dev',
    host: 'h3mon',
    configDirectory: directory,
    now: 100000,
    capacity: {
      observedAt: 99999,
      availableMemoryBytes: 14 * 1024 ** 3,
      availableDiskBytes: 100 * 1024 ** 3,
      occupiedPorts: [],
    },
    compose: renderDevCompose(),
  };
}

async function expectRefusal(request: DevPreflight, message: RegExp): Promise<void> {
  const outcome = await preflightDevDeployment(request).then(
    () => 'accepted',
    (failure: unknown) => {
      if (!(failure instanceof Error)) throw failure;
      return failure.message;
    },
  );
  expect(outcome).toMatch(message);
}

it('refuses missing locked image instead of substituting a floating image', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dev-observability-pins-'));
  directories.push(directory);
  const pin = { role: 'node', name: 'fixture', digest: 'fixture' };
  const path = join(directory, 'toolchain.json');
  await writeFile(
    path,
    JSON.stringify({
      charts: {
        elasticsearch: { images: [] },
        kibana: { images: [pin] },
        opentelemetryCollector: { images: [pin] },
        kubePrometheusStack: { images: [pin] },
      },
    }),
  );
  expect(() => renderDevCompose(path)).toThrow(/locked image/);
});

it('refuses absent central toolchain file', () => {
  expect(() => renderDevCompose('/does-not-exist/dev-toolchain.json')).toThrow(/ENOENT/);
});
it.each(['{broken', '{"charts":{}}'])('refuses malformed central toolchain %s', async (content) => {
  const directory = await mkdtemp(join(tmpdir(), 'dev-observability-pins-'));
  directories.push(directory);
  const path = join(directory, 'toolchain.json');
  await writeFile(path, content);
  expect(() => renderDevCompose(path)).toThrow(
    content === '{broken' ? /JSON/ : /charts.elasticsearch must be an object/,
  );
});

describe('dev deployment preflight', () => {
  it('renders bounded private Compose but never certifies runtime readiness', async () => {
    const request = await fixture();
    const assessment = await preflightDevDeployment(request);
    expect(assessment.phase).toBe('shape-validated');
    expect(assessment.pending).toContain('pinned-binary-config-validation');
    expect(assessment.memoryBytes).toBe(5632 * 1024 ** 2);
    expect(request.compose.name).toBe('puni-dev-observability');
    expect(request.compose.networks['dev']).toEqual({ driver: 'bridge', internal: false });
    expect(Object.keys(request.compose.services)).toHaveLength(6);
    expect(
      Object.values(request.compose.services)
        .flatMap((service) => service.ports)
        .map((port) => port.published),
    ).toEqual(['19200', '15601', '14318', '19090', '19093']);
  });
  it.each([
    ['environment', 'production', /environment/],
    ['host', 'h2puni', /host/],
  ] as const)('refuses wrong %s before reading inputs', async (field, value, message) => {
    const request = await fixture();
    request[field] = value;
    request.configDirectory = '/does-not-exist/dev-config';
    await expectRefusal(request, message);
  });
  it('refuses missing input', async () => {
    const request = await fixture();
    await rm(join(request.configDirectory, 'collector.yaml'));
    await expectRefusal(request, /collector.yaml/);
  });
  it('refuses unreadable input independently of privileged test execution', async () => {
    const request = await fixture();
    await chmod(join(request.configDirectory, 'collector.yaml'), 0);
    await expectRefusal(request, /unreadable/);
  });
  it('refuses empty input', async () => {
    const request = await fixture();
    await writeFile(join(request.configDirectory, 'collector.yaml'), '');
    await expectRefusal(request, /empty/);
  });
  it('refuses rollback state that would permit volume removal', async () => {
    const request = await fixture();
    await writeFile(
      join(request.configDirectory, 'rollback.json'),
      JSON.stringify({
        environment: 'dev',
        host: 'h3mon',
        project: 'puni-dev-observability',
        preserveVolumes: false,
      }),
    );
    await expectRefusal(request, /rollback/);
  });
  it.each(['availableMemoryBytes', 'availableDiskBytes'] as const)(
    'refuses insufficient %s',
    async (field) => {
      const request = await fixture();
      request.capacity[field] = 1;
      await expectRefusal(request, field === 'availableMemoryBytes' ? /memory/ : /disk/);
    },
  );
  it.each([0, 100001, Number.NaN])(
    'refuses stale or invalid capacity timestamp %s',
    async (observedAt) => {
      const request = await fixture();
      request.capacity.observedAt = observedAt;
      await expectRefusal(request, /capacity/);
    },
  );
  it('refuses occupied publish ports', async () => {
    const request = await fixture();
    request.capacity.occupiedPorts = [19200];
    await expectRefusal(request, /occupied/);
  });
  it.each(['mem_limit', 'cpus', 'pids_limit'] as const)(
    'refuses unbounded service %s',
    async (field) => {
      const request = await fixture();
      request.compose.services['collector'][field] = 0;
      await expectRefusal(request, /bounds/);
    },
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses nonfinite resource bounds',
    async (limit) => {
      const request = await fixture();
      request.compose.services['collector'].mem_limit = limit;
      await expectRefusal(request, /bounds/);
    },
  );
  it('refuses unbounded container logs', async () => {
    const request = await fixture();
    request.compose.services['collector'].logging.options['max-file'] = '0';
    await expectRefusal(request, /bounds/);
  });
  it('refuses non-loopback publish', async () => {
    const request = await fixture();
    request.compose.services['elasticsearch'].ports[0].host_ip = '0.0.0.0';
    await expectRefusal(request, /loopback/);
  });
  it('refuses missing service bounds instead of passing an empty deployment', async () => {
    const request = await fixture();
    request.compose.services = {};
    await expectRefusal(request, /topology/);
  });
  it('refuses a shared project', async () => {
    const request = await fixture();
    request.compose.name = 'observability';
    await expectRefusal(request, /topology/);
  });
  it('refuses internal-only networking that suppresses host publishes', async () => {
    const request = await fixture();
    request.compose.networks['dev'].internal = true;
    await expectRefusal(request, /topology/);
  });
  it('refuses additional networks even when all services remain on dev', async () => {
    const request = await fixture();
    request.compose.networks['shared'] = { driver: 'bridge', internal: false };
    await expectRefusal(request, /topology/);
  });
  it.each([[], ['shared'], ['dev', 'shared']])(
    'refuses unapproved service network membership %j',
    async (...networks: string[]) => {
      const request = await fixture();
      request.compose.services['elasticsearch'].networks = networks;
      await expectRefusal(request, /topology/);
    },
  );
});

it.each(['rules.yaml', 'retention.sh', 'health.mjs'])(
  'refuses missing runnable input %s',
  async (name) => {
    const request = await fixture();
    await rm(join(request.configDirectory, name));
    await expectRefusal(request, new RegExp(name));
  },
);

it.each([{ external: true }, { name: 'shared-network' }, { driver: 'host' }])(
  'refuses shared or nonbridge network configuration %j',
  async (network) => {
    const request = await fixture();
    Object.assign(request.compose.networks['dev'], network);
    await expectRefusal(request, /topology/);
  },
);
