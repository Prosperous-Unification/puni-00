import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

const ImagePin = type({ role: 'string', name: 'string', digest: 'string' });
const PlatformPins = type({
  charts: {
    elasticsearch: { images: ImagePin.array() },
    kibana: { images: ImagePin.array() },
    opentelemetryCollector: { images: ImagePin.array() },
    kubePrometheusStack: { images: ImagePin.array() },
  },
});

export interface DevService {
  image: string;
  profiles: string[];
  mem_limit: number;
  cpus: number;
  pids_limit: number;
  logging: { driver: string; options: Record<string, string> };
  ports: { host_ip: string; published: string; target: number }[];
  networks: string[];
  volumes: string[];
}
export interface DevCompose {
  name: string;
  services: Record<string, DevService>;
  networks: Record<string, { internal: boolean }>;
  volumes: Record<string, Record<string, never>>;
}
export interface DevPreflight {
  environment: string;
  host: string;
  configDirectory: string;
  now: number;
  capacity: {
    observedAt: number;
    availableMemoryBytes: number;
    availableDiskBytes: number;
    occupiedPorts: number[];
  };
  compose: DevCompose;
}
const mib = 1024 ** 2;
const gib = 1024 ** 3;

/**
 * Produces a Compose scaffold only. Images reuse infra/versions/toolchain.json;
 * the gateway digest was inspected with elastic-agent otel components. Commands, mounts,
 * health checks, retention and binary validation belong to the configuration slice.
 * This artifact must never be treated as an apply authorization.
 */
export function renderDevCompose(
  toolchainPath: string | URL = new URL(
    '../../../../infra/versions/toolchain.json',
    import.meta.url,
  ),
): DevCompose {
  // Proof: ignoring toolchainPath failed absent/malformed central-toolchain negatives.
  const input: unknown = JSON.parse(readFileSync(toolchainPath, 'utf8'));
  // Proof: bypassing PlatformPins.assert failed the missing-charts schema negative.
  const { charts } = PlatformPins.assert(input);
  const imageFor = (
    images: { role: string; name: string; digest: string }[],
    role: string,
  ): string => {
    const image = images.find((candidate) => candidate.role === role);
    // Proof: removing this throw failed `refuses missing locked image instead of substituting a floating image`.
    if (image === undefined) throw new Error(`missing locked image: ${role}`);
    return `${image.name}@${image.digest}`;
  };
  const services: Record<string, DevService> = {};
  const definitions: [string, string, number, number, number, string][] = [
    [
      'elasticsearch',
      imageFor(charts.elasticsearch.images, 'node'),
      2048,
      19200,
      9200,
      '/usr/share/elasticsearch/data',
    ],
    ['kibana', imageFor(charts.kibana.images, 'node'), 1024, 15601, 5601, '/usr/share/kibana/data'],
    [
      'collector',
      imageFor(charts.opentelemetryCollector.images, 'collector'),
      512,
      14318,
      4318,
      '/var/lib/otelcol',
    ],
    [
      'gateway',
      'docker.elastic.co/elastic-agent/elastic-agent:9.3.8@sha256:0b85d58ffa0e87c30baf3ab9cc3aab1e64da47607c6c1e10e9529d0665a54afd',
      1024,
      0,
      0,
      '/var/lib/elastic-agent',
    ],
    [
      'prometheus',
      imageFor(charts.kubePrometheusStack.images, 'prometheus'),
      768,
      19090,
      9090,
      '/prometheus',
    ],
    [
      'alertmanager',
      imageFor(charts.kubePrometheusStack.images, 'alertmanager'),
      256,
      19093,
      9093,
      '/alertmanager',
    ],
  ];
  const volumes: DevCompose['volumes'] = {};
  for (const [name, image, memory, published, target, storage] of definitions) {
    volumes[name] = {};
    services[name] = {
      image,
      profiles: ['dev'],
      mem_limit: memory * mib,
      cpus: name === 'elasticsearch' ? 2 : 1,
      pids_limit: 256,
      logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
      ports:
        published === 0 ? [] : [{ host_ip: '127.0.0.1', published: String(published), target }],
      networks: ['dev'],
      volumes: [`${name}:${storage}`],
    };
  }
  return {
    name: 'puni-dev-observability',
    services,
    networks: { dev: { internal: true } },
    volumes,
  };
}

/**
 * Checks a freshly collected host snapshot and required local input files without
 * runtime mutation. The caller collects capacity/port observations on h3mon;
 * this function does not attest that the supplied snapshot came from that host.
 * A successful shape assessment deliberately leaves binary validation pending.
 */
export async function preflightDevDeployment(
  request: DevPreflight,
): Promise<{ phase: 'shape-validated'; memoryBytes: number; pending: string[] }> {
  // Proof: removing this throw failed `refuses wrong environment before reading inputs`.
  if (request.environment !== 'dev') throw new Error('environment must be dev');
  // Proof: removing this throw failed `refuses wrong host before reading inputs`.
  if (request.host !== 'h3mon') throw new Error('host must be h3mon');
  const { capacity } = request;
  // Proof: removing this throw failed all three stale/future/NaN timestamp negatives.
  if (
    !Number.isFinite(request.now) ||
    !Number.isFinite(capacity.observedAt) ||
    capacity.observedAt > request.now ||
    request.now - capacity.observedAt > 60_000
  ) {
    throw new Error('capacity snapshot must be current within 60 seconds');
  }
  const serviceNames = Object.keys(request.compose.services).sort().join(',');
  // Proof: removing this throw failed missing-service and shared-project/network negatives.
  if (
    request.compose.name !== 'puni-dev-observability' ||
    !request.compose.networks['dev'].internal ||
    serviceNames !== 'alertmanager,collector,elasticsearch,gateway,kibana,prometheus'
  ) {
    throw new Error('topology must use the isolated named dev project and all six services');
  }
  let memoryBytes = 0;
  for (const [name, service] of Object.entries(request.compose.services)) {
    // Proof: removing this throw failed the memory/CPU/PID and log-bounds negatives.
    if (
      ![service.mem_limit, service.cpus, service.pids_limit].every(
        (limit) => Number.isFinite(limit) && limit > 0,
      ) ||
      service.logging.driver !== 'json-file' ||
      !/^[1-9][0-9]*m$/.test(service.logging.options['max-size']) ||
      !/^[1-9][0-9]*$/.test(service.logging.options['max-file'])
    ) {
      throw new Error(`${name} requires finite resource and log bounds`);
    }
    memoryBytes += service.mem_limit;
    for (const port of service.ports) {
      // Proof: removing this throw failed `refuses non-loopback publish`.
      if (port.host_ip !== '127.0.0.1') throw new Error(`${name} publish must bind loopback`);
      // Proof: removing this throw failed `refuses occupied publish ports`.
      if (capacity.occupiedPorts.includes(Number(port.published)))
        throw new Error(`${name} port ${port.published} is occupied`);
    }
  }
  // Proof: removing this throw failed `refuses insufficient availableMemoryBytes`.
  if (
    !Number.isFinite(capacity.availableMemoryBytes) ||
    capacity.availableMemoryBytes < memoryBytes + 2 * gib
  )
    throw new Error('insufficient memory including 2 GiB headroom');
  // Proof: removing this throw failed `refuses insufficient availableDiskBytes`.
  if (!Number.isFinite(capacity.availableDiskBytes) || capacity.availableDiskBytes < 30 * gib)
    throw new Error('insufficient disk: reserve at least 30 GiB');
  for (const name of [
    'collector.yaml',
    'gateway.yaml',
    'prometheus.yaml',
    'alertmanager.yaml',
    'elasticsearch.yaml',
    'kibana.yaml',
    'rollback.json',
  ]) {
    // Proof: redirecting collector.yaml to gateway.yaml failed the missing-input negative.
    const path = join(request.configDirectory, name);
    const metadata = await stat(path);
    // Proof: removing this throw failed the chmod-000 unreadable-input negative.
    if ((metadata.mode & 0o444) === 0) throw new Error(`unreadable input: ${path}`);
    const content = await readFile(path, 'utf8');
    // Proof: removing this throw failed `refuses empty input`.
    if (content.trim().length === 0) throw new Error(`empty input: ${path}`);
    if (name === 'rollback.json') {
      const rollback: unknown = JSON.parse(content);
      // Proof: removing this throw failed the preserveVolumes=false rollback negative.
      if (
        typeof rollback !== 'object' ||
        rollback === null ||
        !('environment' in rollback) ||
        rollback.environment !== 'dev' ||
        !('host' in rollback) ||
        rollback.host !== 'h3mon' ||
        !('project' in rollback) ||
        rollback.project !== 'puni-dev-observability' ||
        !('preserveVolumes' in rollback) ||
        rollback.preserveVolumes !== true
      )
        throw new Error('rollback must name dev/h3mon/project and preserve volumes');
    }
  }
  return {
    phase: 'shape-validated',
    memoryBytes,
    pending: [
      'pinned-binary-config-validation',
      'runtime-healthchecks',
      'retention-and-storage-bounds',
      'live-host-recheck',
    ],
  };
}
