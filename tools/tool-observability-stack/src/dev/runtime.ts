import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type } from 'arktype';

import { parseStorage } from './autonomous';
import { preflightDevDeployment, renderDevCompose } from './deployment';
import { executeBounded, validateDevContainer } from './source';

const Hash = /^[a-f0-9]{64}$/;
const Container = type({
  id: Hash,
  name: 'string',
  startedAt: 'string',
  restartCount: 'number',
  status: 'string',
  project: 'string',
  service: 'string',
  image: 'string',
  ports: type({ target: 'number', ip: 'string', port: 'number' }).array(),
  volumes: 'string[]',
  aliases: 'string[]',
  memory: 'number',
  cpuQuota: 'number',
  pidsLimit: 'number | null',
  networks: 'string[]',
});
const Manifest = type({
  environment: "'dev'",
  host: "'h3mon'",
  project: "'puni-dev-observability'",
  sourceCommit: /^[a-f0-9]{40}$/,
  files: { '[string]': Hash },
});
const H3 = type({
  observedAt: 'number',
  hostname: 'string',
  memory: 'number',
  storage: 'string',
  dockerVersion: 'string',
  listeners: 'string',
  checks: type({ path: 'string', expected: Hash, actual: Hash }).array(),
  manifests: Manifest.array(),
  network: { Id: 'string', Driver: 'string', Internal: 'boolean' },
  baseline: {
    hostname: 'string',
    containers: type({
      id: Hash,
      name: 'string',
      startedAt: 'string',
      restartCount: 'number',
      status: 'string',
      project: 'string',
    }).array(),
    preservedHashes: { '[string]': Hash },
  },
  containers: Container.array(),
  volumes: type({ name: 'string', project: 'string', volume: 'string' }).array(),
});
const H1 = type({
  observedAt: 'number',
  hostname: 'string',
  user: 'string',
  arch: 'string',
  memory: 'number',
  manifest: {
    sourceCommit: 'string',
    binarySha256: Hash,
    binaryBytes: 'number',
    target: 'string',
    builtOn: 'string',
    bunVersion: 'string',
  },
  binaryHash: Hash,
  binaryBytes: 'number',
  existingTunnelHash: Hash,
  existingTunnel: 'string',
  baseline: { host: 'string', existingTunnelHash: Hash, existingTunnel: 'string' },
  storage: 'string',
  linger: 'string',
  listeners: 'string',
  tunnelPid: 'number',
  units: { '[string]': 'string | null' },
  probe: {
    source: {
      kind: "'ssh-dev-container'",
      containerValidated: 'boolean',
      containerId: 'string | null',
    },
    observedAt: 'number',
    producerVersion: 'string',
  },
  health: {
    checkedAt: 'number',
    health: { state: "'missing' | 'incomplete' | 'stale' | 'complete'" },
    storage: { state: "'complete' | 'unavailable'" },
    application: { state: "'complete' | 'incomplete' | 'unavailable'" },
  },
});
const project = 'puni-dev-observability';
const root = '/home/monitor/puni-dev-observability';
const sourceCommit = 'ab4f7cf6e3023f2f2851bbf85dfb920c7de0859d';
const binaryHash = '281c51a2542784f8b46df5ad8f7a22ab4f29b738a90b15a7bd1c9937a743374c';

/** Authenticated snapshots are still external input. Validates only the already staged
 * releases, preserved baseline and named resources; never authorizes arbitrary host/service operations.
 * A stale checkpoint is retained evidence, not a launch success claim. The observer validates its full schema on start.
 */
export function validateRuntimeSnapshot(monitor: unknown, observer: unknown, now: number) {
  const h3 = H3.assert(monitor),
    h1 = H1.assert(observer);
  // Proof: wrong-host/observer-identity negatives are admitted with this predicate removed.
  if (
    h3.hostname !== 'ubuntu-8gb-hel1-1-8GB-FIN42' ||
    h3.dockerVersion !== '29.7.2' ||
    h3.baseline.hostname !== h3.hostname ||
    h1.hostname !== 'ubuntu-4gb-ash-1' ||
    h1.baseline.host !== h1.hostname ||
    h1.user !== 'claw' ||
    h1.arch !== 'x86_64'
  )
    throw new Error('runtime host identity refused');
  // Proof: stale/future snapshot negatives exercise both clock bounds.
  if (
    ![now, h3.observedAt, h1.observedAt].every(Number.isFinite) ||
    [h3.observedAt, h1.observedAt].some((time) => time > now || now - time > 60000)
  )
    throw new Error('runtime snapshot must be fresh within 60 seconds');
  // Proof: altered and missing hash inventories fail independently when this guard is bypassed.
  if (
    h3.manifests.length !== 2 ||
    h3.manifests[1].sourceCommit !== 'c811f34bf21a5be0a07a3bebf043f651556e50dc' ||
    Object.keys(h3.baseline.preservedHashes).length !== 4 ||
    h3.checks.length !==
      h3.manifests.reduce((count, manifest) => count + Object.keys(manifest.files).length, 4) ||
    h3.manifests.some((manifest) => Object.keys(manifest.files).length !== 12) ||
    h3.checks.some((check) => check.expected !== check.actual)
  )
    throw new Error('runtime config inventory/hash mismatch');
  const requiredHashes = [
    ...h3.manifests.flatMap((manifest, index) =>
      Object.entries(manifest.files).map(([name, expected]) => ({
        path: `${root}/releases/${index === 0 ? 'a1ffe27e7' : 'c811f34bf'}/${name}`,
        expected,
      })),
    ),
    ...Object.entries(h3.baseline.preservedHashes).map(([path, expected]) => ({ path, expected })),
  ];
  // Proof: missing/duplicated named check records cannot stand in for unread files.
  if (
    new Set(h3.checks.map((check) => check.path)).size !== requiredHashes.length ||
    requiredHashes.some(
      (required) =>
        !h3.checks.some(
          (check) => check.path === required.path && check.expected === required.expected,
        ),
    )
  )
    throw new Error('runtime hash inventory does not cover named files');
  // Proof: missing baseline and restarted old container negatives exercise preservation refusal.
  if (
    h3.baseline.containers.length !== 7 ||
    h3.baseline.containers.some(
      (old) =>
        !h3.containers.some(
          (current) =>
            current.id === old.id &&
            current.name === old.name &&
            current.startedAt === old.startedAt &&
            current.restartCount === old.restartCount &&
            current.project === old.project &&
            current.status === 'running',
        ),
    )
  )
    throw new Error('preserved service baseline changed');
  const compose = renderDevCompose();
  const names = Object.keys(compose.services).sort();
  const owned = h3.containers.filter((container) => container.project === project);
  // Proof: missing/foreign owned services cannot be adopted.
  if (
    owned.length !== 6 ||
    owned
      .map((container) => container.service)
      .sort()
      .join(',') !== names.join(',')
  )
    throw new Error('expected all six owned dev services');
  for (const container of owned) {
    const service = compose.services[container.service];
    // Proof: altered image, missing/public mapping and foreign volume negatives fail this exact runtime comparison.
    if (
      container.status !== 'running' ||
      container.memory !== service.mem_limit ||
      container.cpuQuota !== service.cpus * 1000000000 ||
      container.pidsLimit !== service.pids_limit ||
      container.networks.join(',') !==
        (container.service === 'prometheus'
          ? 'h3mon-observability_query,puni-dev-observability_dev'
          : 'puni-dev-observability_dev') ||
      container.image !== service.image ||
      JSON.stringify([...container.ports].sort((left, right) => left.port - right.port)) !==
        JSON.stringify(
          service.ports
            .map((port) => ({
              target: port.target,
              ip: port.host_ip,
              port: Number(port.published),
            }))
            .sort((left, right) => left.port - right.port),
        ) ||
      container.volumes.length !== 1 ||
      container.volumes[0] !== `${project}_${container.service}`
    )
      throw new Error(`owned service shape refused: ${container.service}`);
  }
  // Proof: foreign/missing named volumes never authorize queue initialization.
  if (
    h3.volumes.length !== 6 ||
    names.some(
      (name) =>
        !h3.volumes.some(
          (volume) =>
            volume.name === `${project}_${name}` &&
            volume.project === project &&
            volume.volume === name,
        ),
    )
  )
    throw new Error('volume ownership refused');
  const published = owned.flatMap((container) => container.ports.map((port) => port.port));
  // Proof: a foreign container with a dev published port fails even though its project differs.
  if (
    h3.containers.some(
      (container) =>
        container.project !== project &&
        container.ports.some((port) => published.includes(port.port)),
    )
  )
    throw new Error('foreign dev port collision');
  // Proof: removing the required owned alias admits `requires the Grafana query alias on the owned Prometheus member`.
  // Foreign alias and changed network identity negatives cannot be discounted as owned occupancy.
  if (
    !owned.some(
      (container) =>
        container.service === 'prometheus' && container.aliases.includes('puni-dev-prometheus'),
    ) ||
    h3.network.Driver !== 'bridge' ||
    h3.network.Internal ||
    h3.network.Id !== 'a8c94b425b03ae71d4d5a72cd6947310ee97431358f7e62b4e0cdbb29bd10311' ||
    h3.containers.some(
      (container) =>
        container.aliases.includes('puni-dev-prometheus') &&
        (container.project !== project || container.service !== 'prometheus'),
    )
  )
    throw new Error('query network ownership refused');
  // Proof: altered binary/old tunnel, restarted old tunnel, no-linger and local checkpoint negatives independently fail adoption.
  if (
    h1.manifest.sourceCommit !== sourceCommit ||
    h1.manifest.binarySha256 !== binaryHash ||
    h1.binaryHash !== binaryHash ||
    h1.binaryBytes !== 109467824 ||
    h1.manifest.binaryBytes !== h1.binaryBytes ||
    h1.manifest.builtOn !== 'local' ||
    h1.manifest.target !== 'bun-linux-x64' ||
    h1.manifest.bunVersion !== '1.4.4' ||
    h1.existingTunnelHash !== h1.baseline.existingTunnelHash ||
    h1.existingTunnelHash !== '1efb7824b3902a962a5f68b60cd9c384afa651c7ac99d1b8e9350a78a3ac67f4' ||
    h1.existingTunnel !== h1.baseline.existingTunnel ||
    !h1.existingTunnel.includes('ActiveState=active') ||
    h1.linger !== 'yes' ||
    h1.probe.producerVersion !== sourceCommit
  )
    throw new Error('observer ownership/baseline refused');
  // Proof: future checkpoint and insufficient observer capacity fail before unit adoption.
  if (
    !Number.isFinite(h1.memory) ||
    h1.memory < 512 * 1024 ** 2 ||
    [h1.probe.observedAt, h1.health.checkedAt].some(
      (time) => !Number.isFinite(time) || time <= 0 || time > now,
    )
  )
    throw new Error('observer capacity/checkpoint refused');
  const units = renderObserverUnits();
  for (const [name, expected] of Object.entries(units)) {
    // Proof: a colliding named unit with different content is never overwritten.
    if (!Object.hasOwn(h1.units, name) || (h1.units[name] !== null && h1.units[name] !== expected))
      throw new Error(`unit collision: ${name}`);
  }
  for (const line of h1.listeners.split('\n').filter(Boolean)) {
    const address = line.trim().split(/\s+/)[3];
    if ([14318, 19200, 19090].some((port) => address.endsWith(`:${String(port)}`))) {
      // Proof: foreign tunnel port listener fails unless exact named unit/PID and loopback match.
      if (
        h1.units['puni-dev-observability-tunnel.service'] !==
          units['puni-dev-observability-tunnel.service'] ||
        h1.tunnelPid <= 0 ||
        !line.includes(`pid=${String(h1.tunnelPid)},`) ||
        !address.startsWith('127.0.0.1:')
      )
        throw new Error('foreign observer tunnel listener');
    }
  }
  const observerStorage = parseStorage(h1.storage, h1.observedAt);
  // Proof: insufficient observer disk fails before installation.
  if (observerStorage.availableBytes < 1024 ** 3) throw new Error('insufficient observer disk');
  const storage = parseStorage(h3.storage, h3.observedAt);
  const ownedEndpoints = new Set(
    owned.flatMap((container) => container.ports.map((port) => `${port.ip}:${String(port.port)}`)),
  );
  const occupiedPorts: number[] = [];
  for (const line of h3.listeners.split('\n').filter(Boolean)) {
    const address = line.trim().split(/\s+/)[3];
    const port = Number(address.split(':').at(-1));
    // Proof: removing this guard admits the 10.1.0.2/wildcard/IPv6 host-listener negatives.
    // Only the exact loopback endpoint of an already ownership-validated Docker mapping is excluded.
    if (published.includes(port) && !ownedEndpoints.has(address))
      throw new Error('foreign dev host listener');
    if (!ownedEndpoints.has(address)) occupiedPorts.push(port);
  }

  return {
    expiresAt: Math.min(h3.observedAt, h1.observedAt) + 60000,
    capacity: {
      observedAt: h3.observedAt,
      availableMemoryBytes: h3.memory,
      availableDiskBytes: storage.availableBytes,
      occupiedPorts,
    },
    queryNetwork: {
      id: h3.network.Id,
      name: 'h3mon-observability_query',
      driver: 'bridge',
      internal: false,
      occupiedAliases: [] as string[],
    },
    preservedContainers: h3.baseline.containers,
    volumes: h3.volumes,
    releaseFiles: h3.manifests[1].files,
    checkpoints: { probe: h1.probe, health: h1.health },
    dockerVersion: h3.dockerVersion,
  };
}

/** Fresh read-only SSH only; subprocess deadlines/caps reuse {@link executeBounded}.
 * Local inputs still pass {@link preflightDevDeployment}; no mutation follows automatically.
 * A result expires after 60 seconds. Re-run immediately before each separately reviewed remote write.
 */
export async function preflightRuntime(configDirectory: string, sshExecutable = 'ssh') {
  const signal = AbortSignal.timeout(45000);
  const script = readFileSync(new URL('./runtime-snapshot.py', import.meta.url), 'utf8');
  const read = async (host: 'h1claw' | 'h3mon', mode: 'h1' | 'h3') => {
    const captured = await executeBounded(
      [
        sshExecutable,
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'ConnectTimeout=5',
        host,
        'python3',
        '-',
        mode,
      ],
      script,
      signal,
    );
    // Proof: valid snapshot stdout with exit 7 is accepted if this guard is removed.
    if (captured.exitCode !== 0) throw new Error(`read-only runtime snapshot failed: ${host}`);
    const parsed: unknown = JSON.parse(captured.stdout);
    return parsed;
  };
  const [monitor, observer, source] = await Promise.all([
    read('h3mon', 'h3'),
    read('h1claw', 'h1'),
    executeBounded(
      [
        sshExecutable,
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'ConnectTimeout=5',
        'h1claw',
        'ssh',
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'ConnectTimeout=5',
        'h2puni',
        'sudo',
        '-n',
        'docker',
        'inspect',
        'wbs-dev-src',
      ],
      '',
      signal,
    ),
  ]);
  // Proof: valid dev inspect stdout with exit 7 is accepted if this guard is removed.
  if (source.exitCode !== 0) throw new Error('read-only dev source inspection failed');
  const containerId = validateDevContainer(source.stdout);
  const now = Date.now(),
    verified = validateRuntimeSnapshot(monitor, observer, now);
  // Proof: altered local-file subprocess fixture is accepted if this manifest hash guard is removed.
  for (const [name, expected] of Object.entries(verified.releaseFiles)) {
    if (
      name.includes('/') ||
      name.includes('..') ||
      createHash('sha256')
        .update(readFileSync(join(configDirectory, name)))
        .digest('hex') !== expected
    )
      throw new Error(`local candidate hash mismatch: ${name}`);
  }
  const compose = renderDevCompose();
  const shape = await preflightDevDeployment({
    environment: 'dev',
    host: 'h3mon',
    configDirectory,
    now,
    capacity: verified.capacity,
    compose,
  });
  return {
    phase: 'runtime-preflight-validated',
    observedAt: now,
    containerId,
    ...verified,
    shape,
  };
}

/** Fixed h1claw user units for the already verified immutable observer release.
 * Missing checkpoints fail in the observer; initialization is deliberately a separate operation.
 * Three failures within five minutes leave a visible failed service requiring operator inspection.
 * Resource controls require the user manager's delegated cgroup controllers; inspect effective properties after start.
 */
export function renderObserverUnits(): Record<string, string> {
  const bounds = `StartLimitIntervalSec=300s
StartLimitBurst=3

[Service]
Type=simple
Restart=on-failure
RestartSec=10s
TimeoutStopSec=25s
KillSignal=SIGTERM
KillMode=control-group
MemoryMax=256M
CPUQuota=25%
TasksMax=32
UMask=0077
StandardOutput=journal
StandardError=journal
LogRateLimitIntervalSec=30s
LogRateLimitBurst=100
`;
  return {
    'puni-dev-observability-tunnel.service': `[Unit]
Description=Puni dev observation private forwards
After=network-online.target
Wants=network-online.target
${bounds}ExecStart=/usr/bin/ssh -N -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o ConnectionAttempts=1 -o ExitOnForwardFailure=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=2 -L 127.0.0.1:14318:127.0.0.1:14318 -L 127.0.0.1:19200:127.0.0.1:19200 -L 127.0.0.1:19090:127.0.0.1:19090 h3mon

[Install]
WantedBy=default.target
`,
    'puni-dev-observability.service': `[Unit]
Description=Puni dev bounded autonomous observation
After=puni-dev-observability-tunnel.service
Wants=puni-dev-observability-tunnel.service
${bounds}WorkingDirectory=/home/claw
ExecStart=/home/claw/.local/lib/puni-dev-observability/ab4f7cf6e/observer --otlp http://127.0.0.1:14318 --elastic http://127.0.0.1:19200 --prometheus http://127.0.0.1:19090 --version ab4f7cf6e3023f2f2851bbf85dfb920c7de0859d --checkpoint /home/claw/.local/state/puni-dev-observability/probe.json --health-checkpoint /home/claw/.local/state/puni-dev-observability/health.json

[Install]
WantedBy=default.target
`,
  };
}
