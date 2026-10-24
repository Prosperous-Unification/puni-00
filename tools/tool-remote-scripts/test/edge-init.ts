import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compareCandidate,
  constructCandidate,
  fingerprint,
  InitRefusal,
  type NativeContainer,
  parseNativeContainer,
} from '../src/lib/edge-init';
import {
  EngineTransport,
  type HostObserver,
  PrivateReceipts,
  runInitAdoption,
  type SelectedTarget,
  type TargetKind,
} from '../src/lib/edge-init-operation';
import { readFields, readIdentity, readString } from '../src/lib/managed-cohort';
import { observeSolverProcess, type SolverProcess } from '../src/lib/solver-host';

const LABEL = 'club.bulletpoints.edge-init-fixture';
const IMAGE = /^sha256:[a-f0-9]{64}$/;

/** Fixture effects and cleanup require both an invocation-owned name and its independent nonce label. */
export function verifyFixtureOwnership(container: NativeContainer, nonce: string): string {
  // Proof: separate label and name omissions each admitted a foreign fixture target; edge-init.test.ts failed.
  if (
    !/^[a-f0-9-]{8,64}$|^synthetic$/.test(nonce) ||
    readFields(container.config['Labels'])[LABEL] !== nonce ||
    ![
      'registry-fixture',
      'caddy-fixture',
      'registry',
      'caddy',
      'registry-original',
      'caddy-original',
      'seed',
      'term',
    ].some((suffix) => container.name === `/wbs-init-${nonce}-${suffix}`)
  )
    throw new InitRefusal('native-fixture-ownership-refused');
  return readIdentity(container.id);
}

async function docker(args: readonly string[], timeout = 30000): Promise<string> {
  const executable = Bun.which('docker');
  if (executable === null) throw new InitRefusal('native-fixture-docker-unavailable');
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'].includes(key),
    ),
  );
  environment['DOCKER_API_VERSION'] = '1.52';
  const child = Bun.spawn([executable, '--host=unix:///var/run/docker.sock', ...args], {
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, timeout);
  async function drain(stream: ReadableStream<Uint8Array>, retain: boolean): Promise<Uint8Array[]> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) return chunks;
        length += next.value.length;
        if (length > 4 * 1048576) {
          child.kill('SIGKILL');
          throw new InitRefusal('native-fixture-output-too-large');
        }
        if (retain) chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const [stdout, , status] = await Promise.all([
      drain(child.stdout, true),
      drain(child.stderr, false),
      child.exited,
    ]);
    if (status !== 0) throw new InitRefusal('native-fixture-command-refused');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)).trim();
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
  }
}

async function inspected(id: string): Promise<NativeContainer> {
  const raw: unknown = JSON.parse(await docker(['inspect', id]));
  if (!Array.isArray(raw) || raw.length !== 1)
    throw new InitRefusal('native-fixture-inspection-refused');
  return parseNativeContainer(raw[0]);
}

async function selectFixturePort(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => {
      if (cause) reject(cause);
      else resolve();
    });
  });
  if (address === null || typeof address === 'string')
    throw new InitRefusal('native-fixture-port-selection-failed');
  return String(address.port);
}

async function requireGone(process: SolverProcess): Promise<void> {
  try {
    const current = await observeSolverProcess(process.pid);
    if (current.startTime === process.startTime)
      throw new InitRefusal('native-fixture-process-retained');
  } catch (cause) {
    if (!(
      cause instanceof Error &&
      'code' in cause &&
      ['ENOENT', 'ESRCH'].includes(String(cause.code))
    ))
      throw cause;
  }
  const path = `/sys/fs/cgroup${process.cgroup}`;
  try {
    const events = await readFile(join(path, 'cgroup.events'), 'utf8');
    const members = await readFile(join(path, 'cgroup.procs'), 'utf8');
    if (!/^populated 0$/m.test(events) || members.trim() !== '')
      throw new InitRefusal('native-fixture-cgroup-retained');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
  }
}

function publishedPort(container: NativeContainer, kind: TargetKind): string {
  const bindings = readFields(container.ports)[kind === 'registry' ? '5000/tcp' : '8080/tcp'];
  if (!Array.isArray(bindings) || bindings.length !== 1)
    throw new InitRefusal('native-fixture-port-refused');
  const binding = readFields(bindings[0]);
  if (binding['HostIp'] !== '127.0.0.1' || !/^[0-9]+$/.test(readString(binding['HostPort'])))
    throw new InitRefusal('native-fixture-port-refused');
  return readString(binding['HostPort']);
}

async function routeNetwork(container: NativeContainer): Promise<string> {
  const route = await docker(['exec', container.id, 'cat', '/proc/net/route']);
  const defaults = route
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[1] === '00000000' && fields[7] === '00000000');
  if (defaults.length !== 1) throw new InitRefusal('native-fixture-default-route-ambiguous');
  const gateway = defaults[0][2];
  if (!/^[a-fA-F0-9]{8}$/.test(gateway)) throw new InitRefusal('native-fixture-route-invalid');
  const address = [6, 4, 2, 0]
    .map((offset) => parseInt(gateway.slice(offset, offset + 2), 16))
    .join('.');
  const matches = Object.values(container.networks)
    .map(readFields)
    .filter((endpoint) => endpoint['Gateway'] === address);
  if (matches.length !== 1) throw new InitRefusal('native-fixture-default-route-ambiguous');
  return readIdentity(matches[0]['NetworkID']);
}

async function probe(port: string, kind: TargetKind): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:${port}${kind === 'registry' ? '/v2/' : '/health'}`,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
      headers: { Connection: 'close', 'Accept-Encoding': 'identity' },
    },
  );
  if (
    response.status !== 200 ||
    (await response.text()) !== (kind === 'registry' ? '{}' : 'fixture-ready')
  )
    throw new InitRefusal('native-fixture-public-health-refused');
}

async function ready(port: string, kind: TargetKind): Promise<void> {
  const expires = performance.now() + 10000;
  for (;;) {
    try {
      await probe(port, kind);
      return;
    } catch {
      if (performance.now() + 100 >= expires)
        throw new InitRefusal('native-fixture-health-did-not-converge');
      await Bun.sleep(100);
    }
  }
}

async function cleanup(nonce: string): Promise<void> {
  const ids = (
    await docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', `label=${LABEL}=${nonce}`])
  )
    .split('\n')
    .filter((id) => id !== '');
  for (const id of ids) {
    const container = await inspected(readIdentity(id));
    verifyFixtureOwnership(container, nonce);
    await docker(['rm', '--force', '--volumes', id]);
  }
  for (const kind of ['network', 'volume']) {
    const names = (await docker([kind, 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`]))
      .split('\n')
      .filter((name) => name !== '');
    for (const name of names) {
      const raw: unknown = JSON.parse(await docker([kind, 'inspect', name]));
      if (
        !Array.isArray(raw) ||
        raw.length !== 1 ||
        readFields(readFields(raw[0])['Labels'])[LABEL] !== nonce
      )
        throw new InitRefusal('native-fixture-resource-ownership-refused');
      await docker([kind, 'rm', name]);
    }
    if ((await docker([kind, 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`])) !== '')
      throw new InitRefusal('native-fixture-resource-cleanup-unverified');
  }
  if ((await docker(['ps', '--all', '--quiet', '--filter', `label=${LABEL}=${nonce}`])) !== '')
    throw new InitRefusal('native-fixture-container-cleanup-unverified');
}

/** Explicit disposable native acceptance. Missing local immutable images/daemon/tools refuse; this never pulls. */
export async function runNativeInitAcceptance(): Promise<void> {
  if (process.argv.slice(2).length !== 0 || process.platform !== 'linux' || Bun.version !== '1.4.4')
    throw new InitRefusal('native-fixture-runtime-refused');
  const registryImage = process.env['EDGE_INIT_FIXTURE_REGISTRY_IMAGE'];
  const caddyImage = process.env['EDGE_INIT_FIXTURE_CADDY_IMAGE'];
  if (
    registryImage === undefined ||
    caddyImage === undefined ||
    !IMAGE.test(registryImage) ||
    !IMAGE.test(caddyImage)
  )
    throw new InitRefusal('native-fixture-local-image-pins-required');
  if (
    (await docker(['version', '--format', '{{.Server.APIVersion}}'])) !== '1.52' ||
    (await docker(['info', '--format', '{{.OSType}}'])) !== 'linux'
  )
    throw new InitRefusal('native-fixture-engine-refused');
  for (const image of [registryImage, caddyImage])
    if ((await docker(['image', 'inspect', '--format', '{{.Id}}', image])) !== image)
      throw new InitRefusal('native-fixture-image-not-present');
  const nonce = randomUUID().replaceAll('-', '');
  const prefix = `wbs-init-${nonce}`;
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const caddyDirectory = join(root, 'caddy');
  await mkdir(caddyDirectory);
  const config = ':8080 {\n\trespond /health "fixture-ready" 200\n}\n';
  await Bun.write(join(caddyDirectory, 'Caddyfile'), config);
  const networks = [0, 1, 2].map((index) => `${prefix}-net-${String(index)}`);
  const registryPort = await selectFixturePort();
  const caddyPort = await selectFixturePort();
  const volumes = ['registry', 'caddy-data', 'caddy-config'].map((name) => `${prefix}-${name}`);
  let summary: { stage: string; receiptDirectory: string; sha256: string } | undefined;
  let failureCode: 'native-fixture-proof-failed' | 'native-fixture-receipt-failed' | undefined;
  try {
    for (const network of networks)
      await docker(['network', 'create', '--label', `${LABEL}=${nonce}`, network]);
    for (const volume of volumes) {
      await docker(['volume', 'create', '--label', `${LABEL}=${nonce}`, volume]);
      await docker([
        'run',
        '--rm',
        '--pull=never',
        '--network=none',
        '--name',
        `${prefix}-seed`,
        '--label',
        `${LABEL}=${nonce}`,
        '--entrypoint=/bin/sh',
        '--mount',
        `type=volume,source=${volume},target=/seed`,
        caddyImage,
        '-c',
        'printf fixture-marker > /seed/fixture-marker',
      ]);
    }
    const shared = [
      '--detach',
      '--pull=never',
      '--label',
      `${LABEL}=${nonce}`,
      '--hostname',
      'preserved-fixture-hostname',
      '--restart',
      'unless-stopped',
      '--memory',
      '96m',
      '--cpus',
      '0.25',
      '--security-opt',
      'no-new-privileges',
      '--log-driver',
      'json-file',
      '--log-opt',
      'max-size=1m',
      '--network',
      networks[0],
    ];
    const registry = readIdentity(
      await docker([
        'run',
        ...shared,
        '--name',
        `${prefix}-registry-fixture`,
        '--network-alias',
        'registry-fixture',
        '--label',
        'com.docker.compose.service=registry',
        '--env',
        'REGISTRY_HTTP_ADDR=0.0.0.0:5000',
        '--env',
        'REGISTRY_STORAGE_DELETE_ENABLED=true',
        '--env',
        'EMPTY=',
        '--publish',
        `127.0.0.1:${registryPort}:5000`,
        '--mount',
        `type=volume,source=${volumes[0]},target=/var/lib/registry`,
        registryImage,
      ]),
    );
    const caddy = readIdentity(
      await docker([
        'run',
        ...shared,
        '--name',
        `${prefix}-caddy-fixture`,
        '--network-alias',
        'caddy-fixture',
        '--label',
        'com.docker.compose.service=caddy',
        '--env',
        'ORDERED=nondefault',
        '--env',
        'EMPTY=',
        '--publish',
        `127.0.0.1:${caddyPort}:8080`,
        '--mount',
        `type=bind,source=${caddyDirectory},target=/etc/caddy,readonly`,
        '--mount',
        `type=volume,source=${volumes[1]},target=/data`,
        '--mount',
        `type=volume,source=${volumes[2]},target=/config`,
        '--entrypoint=',
        caddyImage,
        'caddy',
        'run',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      ]),
    );
    for (const [index, network] of networks.slice(1).entries())
      await docker([
        'network',
        'connect',
        '--gw-priority',
        String(-index - 1),
        '--alias',
        `caddy-extra-${String(index)}`,
        network,
        caddy,
      ]);
    const engine = new EngineTransport(
      '/var/run/docker.sock',
      [registry, caddy],
      nonce,
      'owned-fixture',
    );
    const targets: [SelectedTarget, SelectedTarget] = [
      { kind: 'registry', original: await engine.inspect(registry, 10000) },
      { kind: 'caddy', original: await engine.inspect(caddy, 10000) },
    ];
    if (
      targets[1].original.config['Entrypoint'] !== null ||
      Object.keys(targets[1].original.networks).length !== 3
    )
      throw new InitRefusal('native-fixture-required-shape-absent');
    const processes = new Map<string, SolverProcess>();
    const ports = new Map<TargetKind, string>();
    const routes = new Map<TargetKind, string>();
    let caddyHash: string | undefined;
    for (const target of targets) {
      verifyFixtureOwnership(target.original, nonce);
      const pid = target.original.state['Pid'];
      if (typeof pid !== 'number') throw new InitRefusal('native-fixture-pid-invalid');
      processes.set(target.original.id, await observeSolverProcess(pid));
      ports.set(target.kind, publishedPort(target.original, target.kind));
      routes.set(target.kind, await routeNetwork(target.original));
      await ready(publishedPort(target.original, target.kind), target.kind);
    }
    const checkCaddy = async (id: string) => {
      const adapted: unknown = JSON.parse(await engine.execCaddy(id, 'adapt', 10000));
      const live: unknown = JSON.parse(await engine.execCaddy(id, 'live', 10000));
      const hash = fingerprint(adapted);
      if (
        hash !== fingerprint(live) ||
        (caddyHash !== undefined && caddyHash !== hash) ||
        (await readFile(join(caddyDirectory, 'Caddyfile'), 'utf8')) !== config
      )
        throw new InitRefusal('native-fixture-caddy-config-changed');
      caddyHash = hash;
    };
    await checkCaddy(caddy);
    const observer: HostObserver = {
      admit: async (deadline) => {
        deadline.allocate(1000);
        for (const raw of (await engine.inventory(10000)) as unknown[]) {
          const fields = readFields(raw);
          if (fields['Labels'] !== null && readFields(fields['Labels'])[LABEL] === nonce)
            verifyFixtureOwnership(
              await engine.inspectListed(readIdentity(fields['Id']), 10000),
              nonce,
            );
        }
      },
      original: async (_target, container) => {
        verifyFixtureOwnership(container, nonce);
        const pid = container.state['Pid'];
        if (
          typeof pid !== 'number' ||
          fingerprint(await observeSolverProcess(pid)) !== fingerprint(processes.get(container.id))
        )
          throw new InitRefusal('native-fixture-original-process-changed');
      },
      inert: async (_target, container) => {
        verifyFixtureOwnership(container, nonce);
        for (const network of Object.values(container.networks).map(readFields)) {
          const members = readFields(
            readFields(await engine.network(readIdentity(network['NetworkID']), 10000))[
              'Containers'
            ],
          );
          if (Object.hasOwn(members, container.id))
            throw new InitRefusal('native-fixture-created-network-active');
        }
      },
      stopped: async (target, container) => {
        verifyFixtureOwnership(container, nonce);
        if (container.state['Pid'] !== 0 || container.state['Running'] !== false)
          throw new InitRefusal('native-fixture-original-not-stopped');
        const process = processes.get(target.original.id);
        if (process === undefined) throw new InitRefusal('native-fixture-process-pin-absent');
        await requireGone(process);
        for (const endpoint of Object.values(container.networks).map(readFields)) {
          if (endpoint['EndpointID'] !== '')
            throw new InitRefusal('native-fixture-original-endpoint-retained');
          const members = readFields(
            readFields(await engine.network(readIdentity(endpoint['NetworkID']), 10000))[
              'Containers'
            ],
          );
          if (Object.hasOwn(members, container.id))
            throw new InitRefusal('native-fixture-original-network-membership-retained');
        }
      },
      running: async (target, container) => {
        verifyFixtureOwnership(container, nonce);
        if (
          (await docker(['exec', container.id, 'cat', '/proc/1/comm'])) !== 'docker-init' ||
          (await routeNetwork(container)) !== routes.get(target.kind) ||
          publishedPort(container, target.kind) !== ports.get(target.kind)
        )
          throw new InitRefusal('native-fixture-running-identity-changed');
        const marker =
          target.kind === 'registry' ? '/var/lib/registry/fixture-marker' : '/data/fixture-marker';
        if ((await docker(['exec', container.id, 'cat', marker])) !== 'fixture-marker')
          throw new InitRefusal('native-fixture-persistent-marker-changed');
        if (target.kind === 'caddy') await checkCaddy(container.id);
      },
      health: async (kind) => {
        const port = ports.get(kind);
        if (port === undefined) throw new InitRefusal('native-fixture-health-pin-absent');
        await ready(port, kind);
      },
      combined: async (deadline) => {
        for (const target of targets) {
          const raw: unknown = JSON.parse(
            await docker(['inspect', `${prefix}-${target.kind}-fixture`]),
          );
          if (!Array.isArray(raw) || raw.length !== 1)
            throw new InitRefusal('native-fixture-final-target-absent');
          const container = parseNativeContainer(raw[0]);
          verifyFixtureOwnership(container, nonce);
          compareCandidate(target.original, container);
          await observer.running(target, container, deadline);
          await observer.health(target.kind, container.id, deadline);
        }
      },
      absent: async (id) => {
        if (!(await engine.inspectAbsent(id, 10000)))
          throw new InitRefusal('native-fixture-original-removal-unverified');
      },
    };
    // Deliberate native preservation mismatch proves an inert candidate cannot stop a serving original.
    const mismatch = constructCandidate(targets[0].original);
    mismatch.Config = { ...mismatch.Config, Env: ['MISMATCH=1'] };
    const mismatched = await engine.create('registry', mismatch, 20000);
    let refused = false;
    try {
      compareCandidate(targets[0].original, await engine.inspect(mismatched, 10000));
    } catch (cause) {
      if (!(cause instanceof InitRefusal)) throw cause;
      refused = true;
    }
    if (
      !refused ||
      (await engine.inspect(registry, 10000)).state['Running'] !== true ||
      (await engine.inspect(mismatched, 10000)).state['Pid'] !== 0
    )
      throw new InitRefusal('native-fixture-inert-refusal-unproved');
    await probe(publishedPort(targets[0].original, 'registry'), 'registry');
    verifyFixtureOwnership(await engine.inspect(mismatched, 10000), nonce);
    await engine.remove(mismatched, 10000);
    const faults = [
      'alias-drift',
      'route-loss',
      'public-probe-failed',
      'restart-after-health',
      'create-ack-lost',
      'stop-ack-lost',
      'rename-ack-lost',
      'start-ack-lost',
    ] as const;
    for (const fault of faults) {
      const candidates: string[] = [];
      let candidateHealthRounds = 0;
      const removals: string[] = [];
      const effects = {
        inspect: (id: string, timeout: number) => engine.inspect(id, timeout),
        create: async (
          kind: TargetKind,
          request: ReturnType<typeof constructCandidate>,
          timeout: number,
        ) => {
          if (kind !== 'registry') throw new InitRefusal('native-fixture-fault-expanded-targets');
          const input = structuredClone(request);
          if (fault === 'alias-drift') {
            const [network] = Object.keys(input.NetworkingConfig.EndpointsConfig);
            const endpoint = readFields(input.NetworkingConfig.EndpointsConfig[network]);
            input.NetworkingConfig.EndpointsConfig[network] = {
              ...endpoint,
              Aliases: ['unexpected-fixture-alias'],
            };
          }
          const candidate = await engine.create(kind, input, timeout);
          candidates.push(candidate);
          if (fault === 'create-ack-lost')
            throw new InitRefusal('native-fixture-acknowledgement-lost');
          return candidate;
        },
        stop: async (id: string, timeout: number) => {
          await engine.stop(id, timeout);
          if (fault === 'stop-ack-lost')
            throw new InitRefusal('native-fixture-acknowledgement-lost');
        },
        rename: async (id: string, name: string, timeout: number) => {
          await engine.rename(id, name, timeout);
          if (fault === 'rename-ack-lost')
            throw new InitRefusal('native-fixture-acknowledgement-lost');
        },
        start: async (id: string, timeout: number) => {
          await engine.start(id, timeout);
          if (fault === 'route-loss') await docker(['network', 'disconnect', networks[0], id]);
          if (fault === 'start-ack-lost')
            throw new InitRefusal('native-fixture-acknowledgement-lost');
        },
        remove: async (id: string, timeout: number) => {
          removals.push(id);
          await engine.remove(id, timeout);
        },
      };
      const faultObserver: HostObserver = {
        ...observer,
        health: async (kind, id, deadline) => {
          if (id === candidates.at(0) && fault === 'public-probe-failed')
            await docker(['pause', id]);
          await observer.health(kind, id, deadline);
          if (
            id === candidates.at(0) &&
            fault === 'restart-after-health' &&
            ++candidateHealthRounds === 1
          )
            await docker(['restart', id]);
        },
      };
      const faultReceipts = await PrivateReceipts.create(join(root, `receipts-${fault}`), nonce);
      let failed = false;
      try {
        await runInitAdoption(
          { nonce, targets, namespace: 'owned-fixture' },
          effects,
          faultObserver,
          faultReceipts,
        );
      } catch (cause) {
        if (!(cause instanceof InitRefusal)) throw cause;
        failed = true;
      }
      const candidate = candidates.at(0);
      if (
        !failed ||
        removals.length !== 0 ||
        candidate === undefined ||
        (await engine.inspectAbsent(registry, 10000))
      )
        throw new InitRefusal('native-fixture-fault-retention-unproved');
      if (
        fault === 'alias-drift' &&
        (await engine.inspect(registry, 10000)).state['Running'] !== true
      )
        throw new InitRefusal('native-fixture-before-stop-retention-unproved');
      // Disposable fixture restoration is explicit test setup; production has no corresponding recovery effect.
      verifyFixtureOwnership(await engine.inspect(candidate, 10000), nonce);
      await docker(['rm', '--force', '--volumes', candidate]);
      const retained = await engine.inspect(registry, 10000);
      verifyFixtureOwnership(retained, nonce);
      if (retained.name !== `/${prefix}-registry-fixture`)
        await docker(['rename', registry, `${prefix}-registry-fixture`]);
      if (retained.state['Running'] === false) await docker(['start', registry]);
      targets[0].original = await engine.inspect(registry, 10000);
      const pid = targets[0].original.state['Pid'];
      if (typeof pid !== 'number') throw new InitRefusal('native-fixture-restored-pid-invalid');
      processes.set(registry, await observeSolverProcess(pid));
      ports.set('registry', publishedPort(targets[0].original, 'registry'));
      routes.set('registry', await routeNetwork(targets[0].original));
      await ready(publishedPort(targets[0].original, 'registry'), 'registry');
    }
    const receipts = await PrivateReceipts.create(join(root, 'receipts'), nonce);
    await runInitAdoption(
      { nonce, targets, namespace: 'owned-fixture' },
      engine,
      observer,
      receipts,
    );
    const term = readIdentity(
      await docker([
        'run',
        '--detach',
        '--pull=never',
        '--init',
        '--network=none',
        '--name',
        `${prefix}-term`,
        '--label',
        `${LABEL}=${nonce}`,
        '--entrypoint=/bin/sh',
        caddyImage,
        '-c',
        'trap "" TERM; while :; do sleep 1; done',
      ]),
    );
    const stubborn = await inspected(term);
    verifyFixtureOwnership(stubborn, nonce);
    await Bun.sleep(200);
    const stopEngine = new EngineTransport('/var/run/docker.sock', [term], nonce, 'owned-fixture');
    let uncertain = false;
    try {
      await stopEngine.stop(term, 250);
    } catch (cause) {
      if (!(cause instanceof InitRefusal)) throw cause;
      uncertain = true;
    }
    const retained = await stopEngine.inspect(term, 10000);
    if (
      !uncertain ||
      retained.state['Running'] !== true ||
      retained.state['Pid'] !== stubborn.state['Pid']
    )
      throw new InitRefusal('native-fixture-unbounded-stop-contract-unproved');
    const report = {
      version: 1,
      status: 'passed',
      nonce,
      checks: [
        'native-preservation',
        'three-network-default-route',
        'inert-candidate-refusal',
        'ordered-env',
        'null-entrypoint',
        'persistent-nonempty-storage',
        'caddy-adapt-live',
        'native-init',
        'full-health-before-removal',
        'stop-minus-one-client-uncertainty',
        ...faults,
      ],
      receiptDirectory: receipts.directory,
    };
    await writeFile(join(root, 'report.json'), JSON.stringify(report), { mode: 0o600, flag: 'wx' });
    summary = {
      stage: 'native-proof-passed',
      receiptDirectory: root,
      sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    };
  } catch {
    failureCode = 'native-fixture-proof-failed';
    const failure = { stage: 'native-proof-failed', nonce };
    try {
      await writeFile(join(root, 'failure.json'), JSON.stringify(failure), {
        mode: 0o600,
        flag: 'wx',
      });
      console.log(
        JSON.stringify({
          stage: failure.stage,
          receiptDirectory: root,
          sha256: fingerprint(failure),
        }),
      );
    } catch {
      failureCode = 'native-fixture-receipt-failed';
    }
  }
  try {
    await cleanup(nonce);
  } catch {
    throw new InitRefusal('native-fixture-cleanup-failed');
  }
  if (failureCode !== undefined) throw new InitRefusal(failureCode);
  if (summary === undefined) throw new InitRefusal('native-fixture-summary-absent');
  console.log(JSON.stringify(summary));
}

if (import.meta.main) {
  try {
    await runNativeInitAcceptance();
  } catch (cause) {
    console.error(
      cause instanceof InitRefusal ? cause.message : 'edge Init native acceptance refused',
    );
    process.exitCode = 1;
  }
}
