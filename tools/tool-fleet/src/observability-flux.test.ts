import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import {
  bindObservabilitySource,
  executeFluxRead,
  readFluxInput,
  validateFluxPacket,
} from './observability-flux';
import { fluxProjections, observeFluxReconciliation } from './observability-flux-observation';
import { prepareObservabilityRehearsal } from './observability-parity-rehearsal';
import type { ObservabilityResourceProjection } from './observability-preflight';

const root = join(import.meta.dir, '../../..');
const tools = '/tmp/puni-parity-tools';
let directory: string;
let packetRequest: unknown;
let packet: Awaited<ReturnType<typeof validateFluxPacket>>;
let source: {
  repositoryURL: string;
  artifactCommit: string;
  artifactRoot: string;
  graphRoot: string;
  identityFile: string;
  knownHostsFile: string;
  timeoutMs: number;
};
const previousPath = process.env['PATH'];
if (previousPath === undefined) throw new Error('Fixture PATH absent');
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (failure) {
    if (failure instanceof Error) return failure.message;
    throw failure;
  }
  throw new Error('Expected refusal but operation resolved');
}
function git(argv: string[], cwd: string) {
  const child = Bun.spawnSync(['git', ...argv], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'puni-flux-test-'));
  const request = {
    sourceRevision: git(['rev-parse', 'HEAD'], root),
    network: {
      api: ['172.31.100.1/32'],
      observer: ['172.31.100.2/32'],
      grafana: ['172.31.100.3/32'],
      s3: ['172.31.100.4/32'],
      alertDelivery: ['172.31.100.5/32'],
      publicProbes: ['172.31.100.6/32'],
    },
  };
  packetRequest = request;
  const packetPath = join(directory, 'packet');
  await prepareObservabilityRehearsal(root, tools, request, packetPath);
  packet = await validateFluxPacket(root, tools, request, packetPath);
  const repository = join(directory, 'published');
  await cp(packetPath, repository, { recursive: true });
  git(['init', '-q'], repository);
  git(['add', '.'], repository);
  git(
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'packet',
    ],
    repository,
  );
  const key = join(directory, 'identity');
  const keygen = Bun.spawnSync(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', key]);
  expect(keygen.exitCode).toBe(0);
  const knownHosts = join(directory, 'known_hosts');
  await writeFile(
    knownHosts,
    `fixture.invalid ${(await readFile(`${key}.pub`, 'utf8')).trim()}\n`,
    { mode: 0o600 },
  );
  const bin = join(directory, 'bin');
  await mkdir(bin);
  // The fixture replaces only remote SSH transport: real git fetch/upload-pack and blob reads remain.
  await writeFile(
    join(bin, 'ssh'),
    `#!/bin/sh\nfor required in '-F /dev/null' 'BatchMode=yes' 'IdentitiesOnly=yes' 'IdentityAgent=none' 'StrictHostKeyChecking=yes' 'GlobalKnownHostsFile=/dev/null' 'UserKnownHostsFile=' '-i ' 'git@fixture.invalid'; do\n case "$*" in *"$required"*) ;; *) exit 90;; esac\ndone\nexec git-upload-pack '${repository}'\n`,
    { mode: 0o700 },
  );
  process.env['PATH'] = `${bin}:${previousPath}`;
  source = {
    repositoryURL: 'ssh://git@fixture.invalid/packet',
    artifactCommit: git(['rev-parse', 'HEAD'], repository),
    artifactRoot: '.',
    graphRoot: './infra/clusters/platform/local',
    identityFile: key,
    knownHostsFile: knownHosts,
    timeoutMs: 30000,
  };
  await prepareObservation();
}, 30000);
afterAll(async () => {
  process.env['PATH'] = previousPath;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('binds actual fetched complete bytes and preserves distinct provenance without runtime certification', async () => {
  const bound = await bindObservabilitySource(packet, source, join(directory, 'binding.json'));
  expect(bound.artifactCommit).toBe(source.artifactCommit);
  expect(bound.sourceRevision).not.toBe(source.artifactCommit);
  expect(bound.artifactRoot).toBe('.');
  expect(bound.graphRoot).toBe('./infra/clusters/platform/local');
  expect(bound.bootstrap.source.name).toBe('puni-platform');
  expect(bound.bootstrap.root.name).toBe('puni-cluster');
  expect(bound.bootstrap.handoffExecuted).toBe(false);
  expect(bound.runtimeAcceptance).toBe(false);
  expect(JSON.parse(await readFile(join(directory, 'binding.json'), 'utf8'))).toEqual(bound);
});

test('exclusive receipt preserves first successful binding', async () => {
  const path = join(directory, 'exclusive.json');
  await bindObservabilitySource(packet, source, path);
  const first = await readFile(path, 'utf8');
  expect(await rejection(bindObservabilitySource(packet, source, path))).toMatch(
    'receipt-occupied',
  );
  expect(await readFile(path, 'utf8')).toBe(first);
});

for (const [field, value] of [
  ['artifactCommit', '0'.repeat(40)],
  ['artifactRoot', 'nested'],
  ['graphRoot', './infra/clusters/platform/production'],
  ['repositoryURL', 'https://PRIVATE-MARKER:credential@example.invalid/packet'],
] as const) {
  test(`refuses wrong source binding ${field}`, async () => {
    expect(
      await rejection(
        bindObservabilitySource(
          packet,
          { ...source, [field]: value },
          join(directory, `${field}.json`),
        ),
      ),
    ).toMatch(/source-|command-/);
  });
}

for (const [fault, expected] of [
  ['absent', 'input-absent'],
  ['directory', 'input-unreadable'],
  ['public', 'input-permissions'],
  ['unreadable', 'input-unreadable'],
  ['symlink', 'input-unreadable'],
  ['oversized', 'input-too-large'],
] as const) {
  test(`private input refuses ${fault} with safe category`, async () => {
    const path = join(directory, `PRIVATE-MARKER-${fault}`);
    if (fault === 'directory') await mkdir(path);
    else if (fault === 'symlink') await symlink(source.identityFile, path);
    else if (fault !== 'absent') {
      await writeFile(path, fault === 'oversized' ? '{}' + ' '.repeat(65535) : '{}', {
        mode: 0o600,
      });
      if (fault === 'public') await chmod(path, 0o644);
      if (fault === 'unreadable') await chmod(path, 0);
    }
    expect(await rejection(readFluxInput(path))).toMatch(expected);
  });
}

test('private input reads legitimate owner-only bounded JSON', async () => {
  const path = join(directory, 'request.json');
  await writeFile(path, '{"source":"fixture"}', { mode: 0o600 });
  expect(await readFluxInput(path)).toEqual({ source: 'fixture' });
});

let bound: Awaited<ReturnType<typeof bindObservabilitySource>>;
const identity = {
  labId: 'flux',
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  daemonId: 'fixture-daemon',
};
let observations: Record<string, unknown>;
async function prepareObservation() {
  bound = await bindObservabilitySource(packet, source, join(directory, 'observed-binding.json'));
  const state = join(directory, '.puni/fleet-labs/k3d/flux');
  const attempts = join(directory, '.puni/fleet-labs/k3d/.attempts/flux');
  await mkdir(state, { recursive: true, mode: 0o700 });
  await mkdir(attempts, { recursive: true, mode: 0o700 });
  await writeFile(
    join(attempts, `${identity.attemptId}.json`),
    JSON.stringify({ ...identity, schemaVersion: 1, state: 'ready' }),
    { mode: 0o600 },
  );
  const kubeconfig = join(state, 'platform.kubeconfig');
  await writeFile(kubeconfig, 'apiVersion: v1\nkind: Config\n', { mode: 0o600 });
  await writeFile(
    join(state, 'lab.json'),
    JSON.stringify({
      schemaVersion: 1,
      labId: 'flux',
      profile: 'platform',
      network: 'puni-flux',
      registry: { host: 'puni-flux-registry', hostPort: 5000 },
      httpPort: 8080,
      worktreeRoot: directory,
      worktreeRootIdentity: '1:1',
      solverRuntime: directory,
      clusters: [
        {
          name: 'puni-flux-platform',
          role: 'platform',
          clusterId: 'platform-local',
          context: 'k3d-puni-flux-platform',
          kubeconfig,
          apiPort: 6443,
        },
      ],
    }),
    { mode: 0o600 },
  );
  observations = readyObservations();
  healthy = structuredClone(observations);
}
function observationTarget() {
  return {
    ...identity,
    markerUID: 'marker-uid',
    sourceUID: 'source-uid',
    rootUID: 'root-uid',
    timeoutMs: 200,
  };
}
async function fixtureRead(argv: string[]) {
  await Promise.resolve();
  if (argv[0] === 'docker') return Buffer.from(String(observations['daemon']));
  if (argv.includes('configmap/puni-cluster-platform-local'))
    return Buffer.from(
      JSON.stringify({ identity: observations['marker'], labId: observations['labId'] }),
    );
  if (argv.includes('gitrepository.source.toolkit.fluxcd.io/puni-platform'))
    return Buffer.from(
      JSON.stringify({ source: observations['source'], details: observations['details'] }),
    );
  if (argv.some((part) => part.startsWith('kustomizations.')))
    return Buffer.from(
      JSON.stringify({ resources: observations['resources'], states: observations['states'] }),
    );
  throw new Error(`Unexpected fixture command ${argv.join(' ')}`);
}
test('observation refuses wrong exact lab marker before reconciliation reads', async () => {
  observations = structuredClone(healthy);
  observations['marker'] = { ...(observations['marker'] as object), marker: 'platform-production' };
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        observationTarget(),
        join(directory, 'observation.json'),
        fixtureRead,
      ),
    ),
  ).toMatch('target-mismatch');
});

let healthy: Record<string, unknown>;
type Resource = typeof ObservabilityResourceProjection.infer;
function readyObservations(): Record<string, unknown> {
  const revision = `sha1:${source.artifactCommit}`;
  const resources: Resource[] = [];
  function resource(kind: string, namespace: string, name: string, fields: Partial<Resource> = {}) {
    const observed = {
      kind,
      name,
      namespace,
      uid: `${kind}-${namespace}-${name}`,
      owner: 'observability',
      ownerNamespace: 'flux-system',
      generation: 1,
      observedGeneration: 1,
      ready: true,
      revision: '',
      chart: '',
      controllerEnabled: false,
      ownerUID: '',
      path: '',
      sourceName: '',
      sourceKind: '',
      sourceNamespace: '',
      releaseName: '',
      releaseNamespace: '',
      dependencies: [],
      ...fields,
    };
    resources.push(observed);
    return observed;
  }
  const paths: Record<string, string> = {
    target: 'target',
    controllers: 'networking',
    storage: 'storage/local',
    policy: 'policy',
    secrets: 'secrets/platform-local',
    certificates: 'certificates/platform/local',
    platform: 'registry/local',
    'observability-controllers': 'observability/rehearsal-controllers',
    observability: 'observability/rehearsal',
    alerts: 'alerts/local',
    backup: 'backup/local',
  };
  resource('Kustomization', 'flux-system', 'puni-cluster', {
    uid: 'root-uid',
    owner: '',
    ownerNamespace: '',
    revision,
    path: './infra/clusters/platform/local',
    sourceKind: 'GitRepository',
    sourceName: 'puni-platform',
    sourceNamespace: 'flux-system',
  });
  const dependencies: Record<string, string[]> = {
    target: [],
    controllers: ['target'],
    storage: ['controllers'],
    policy: ['controllers'],
    secrets: ['policy'],
    certificates: ['controllers', 'secrets'],
    platform: ['storage', 'secrets'],
    'observability-controllers': ['platform', 'certificates'],
    observability: ['platform', 'certificates', 'observability-controllers'],
    alerts: ['observability'],
    backup: ['alerts'],
  };
  for (const [name, path] of Object.entries(paths))
    resource('Kustomization', 'flux-system', name, {
      owner: 'puni-cluster',
      dependencies: dependencies[name].map((dependency) => ({
        name: dependency,
        namespace: 'flux-system',
      })),
      revision,
      path: `./infra/platform/${path}`,
      sourceKind: 'GitRepository',
      sourceName: 'puni-platform',
      sourceNamespace: 'flux-system',
    });
  const charts: Record<string, [string, string]> = {
    'eck-operator': ['eck-operator', '3.5.0'],
    'prometheus-controller': ['kube-prometheus-stack', '91.4.1'],
    'kube-prometheus-stack': ['kube-prometheus-stack', '91.4.1'],
    'otel-collector': ['opentelemetry-collector', '0.173.1'],
    elasticsearch: ['eck-elasticsearch', '0.20.0'],
    kibana: ['eck-kibana', '0.20.0'],
  };
  for (const namespace of ['observability', 'observability-dev']) {
    for (const name of namespace === 'observability'
      ? Object.keys(charts)
      : ['kube-prometheus-stack', 'elasticsearch', 'kibana']) {
      const [chart, version] = charts[name];
      resource('HelmRelease', namespace, name, {
        owner: name === 'prometheus-controller' ? 'observability-controllers' : 'observability',
        revision: version,
        chart: `./infra/platform/charts/${chart}-${version}.tgz`,
        sourceKind: 'GitRepository',
        sourceName: 'puni-platform',
        sourceNamespace: 'flux-system',
        releaseName: `${namespace}-${name}`,
        releaseNamespace: namespace,
      });
    }
    for (const [kind, name] of [
      ['StatefulSet', 'signal-collector'],
      ['StatefulSet', 'signal-gateway'],
      ['Deployment', 'signal-metrics'],
      ['Job', 'elastic-settings'],
      ['Job', 'kibana-objects'],
    ])
      resource(kind, namespace, name);
    for (const [kind, name, release] of [
      ['Elasticsearch', 'elasticsearch', 'elasticsearch'],
      ['Kibana', 'kibana', 'kibana'],
      ['Prometheus', 'kps-prometheus', 'kube-prometheus-stack'],
      ['Alertmanager', 'kps-alertmanager', 'kube-prometheus-stack'],
    ]) {
      const parent = resource(kind, namespace, name, {
        owner: `helm:${namespace}-${release}`,
        ownerNamespace: namespace,
        ...(kind === 'Prometheus' || kind === 'Alertmanager' ? { observedGeneration: 0 } : {}),
      });
      resource('StatefulSet', namespace, `${name}-child`, {
        owner: '',
        ownerNamespace: '',
        ownerUID: parent.uid,
      });
    }
  }
  for (const [kind, name, release] of [
    ['StatefulSet', 'elastic-operator', 'eck-operator'],
    ['Deployment', 'kps-operator', 'prometheus-controller'],
    ['DaemonSet', 'otel-collector-agent', 'otel-collector'],
    ['Deployment', 'kube-prometheus-stack-kube-state-metrics', 'kube-prometheus-stack'],
    ['DaemonSet', 'kube-prometheus-stack-prometheus-node-exporter', 'kube-prometheus-stack'],
  ])
    resource(kind, 'observability', name, {
      owner: `helm:observability-${release}`,
      ownerNamespace: 'observability',
    });
  return {
    daemon: 'fixture-daemon',
    labId: 'flux',
    marker: {
      name: 'puni-cluster-platform-local',
      namespace: 'kube-system',
      uid: 'marker-uid',
      marker: 'platform-local',
      immutable: true,
    },
    source: {
      name: 'puni-platform',
      namespace: 'flux-system',
      uid: 'source-uid',
      kind: 'GitRepository',
      revision,
      ready: true,
      generation: 1,
      observedGeneration: 1,
    },
    details: {
      digest: `sha256:${'a'.repeat(64)}`,
      url: source.repositoryURL,
      commit: source.artifactCommit,
      secretRef: 'puni-platform-auth',
      suspended: false,
      currentReady: true,
    },
    resources,
    states: resources.map((observed) => ({
      uid: observed.uid,
      suspended: false,
      deleting: false,
      currentReady: true,
      health: 'green',
      phase: 'Ready',
      available: 1,
      desired: 1,
      ready: 1,
      updated: 1,
      complete: true,
    })),
  };
}

test('observes exact source, all stages, deployed Helm history and ECK children without certifying ownership or runtime', async () => {
  observations = structuredClone(healthy);
  const receipt = await observeFluxReconciliation(
    directory,
    packet,
    bound,
    observationTarget(),
    join(directory, 'observed.json'),
    fixtureRead,
  );
  expect(receipt.status).toBe('observed');
  expect(receipt.source.digest).toBe(`sha256:${'a'.repeat(64)}`);
  expect(receipt.resources.filter((resource) => resource.kind === 'Kustomization')).toHaveLength(
    12,
  );
  expect(receipt.resources.filter((resource) => resource.kind === 'HelmRelease')).toHaveLength(9);
  expect(receipt.resourceOwnership).toBe('unproven');
  expect(receipt.capacityAdmission).toBe('unobserved');
  expect(receipt.runtimeAcceptance).toBe(false);
});

for (const [fault, change, reason] of [
  [
    'daemon',
    (snapshot: Record<string, unknown>) => {
      snapshot['daemon'] = 'foreign';
    },
    'target-daemon-mismatch',
  ],
  [
    'source-revision',
    (snapshot: Record<string, unknown>) => {
      Object.assign(snapshot['source'] as object, { revision: `sha1:${'b'.repeat(40)}` });
    },
    'source-unready-or-stale',
  ],
  [
    'source-generation',
    (snapshot: Record<string, unknown>) => {
      Object.assign(snapshot['source'] as object, { observedGeneration: 0 });
    },
    'source-unready-or-stale',
  ],
  [
    'source-url',
    (snapshot: Record<string, unknown>) => {
      Object.assign(snapshot['details'] as object, { url: 'ssh://git@foreign.invalid/packet' });
    },
    'source-observation-mismatch',
  ],
  [
    'source-condition',
    (snapshot: Record<string, unknown>) => {
      Object.assign(snapshot['details'] as object, { currentReady: false });
    },
    'source-unready-or-stale',
  ],
  [
    'root',
    (snapshot: Record<string, unknown>) => {
      (snapshot['resources'] as Resource[])[0].uid = 'foreign';
      (snapshot['states'] as { uid: string }[])[0].uid = 'foreign';
    },
    'root-uid-mismatch',
  ],
  [
    'stage',
    (snapshot: Record<string, unknown>) => {
      (snapshot['resources'] as Resource[])[1].revision = 'stale';
    },
    'stage-revision-or-path-mismatch',
  ],
  [
    'stage-suspended',
    (snapshot: Record<string, unknown>) => {
      (snapshot['states'] as { suspended: boolean }[])[1].suspended = true;
    },
    'resource-unready-or-stale',
  ],
  [
    'helm',
    (snapshot: Record<string, unknown>) => {
      const releases = snapshot['resources'] as Resource[];
      releases.find((entry) => entry.kind === 'HelmRelease')!.revision = 'attempted-version';
    },
    'helm-history-mismatch',
  ],
  [
    'helm-source',
    (snapshot: Record<string, unknown>) => {
      (snapshot['resources'] as Resource[]).find(
        (entry) => entry.kind === 'HelmRelease',
      )!.sourceName = 'foreign';
    },
    'reconciliation-owner-or-readiness-mismatch',
  ],
  [
    'eck',
    (snapshot: Record<string, unknown>) => {
      const custom = (snapshot['resources'] as Resource[]).find(
        (entry) => entry.kind === 'Elasticsearch',
      )!;
      (snapshot['states'] as { uid: string; health: string }[]).find(
        (state) => state.uid === custom.uid,
      )!.health = 'red';
    },
    'eck-unready',
  ],
  [
    'child',
    (snapshot: Record<string, unknown>) => {
      (snapshot['resources'] as Resource[]).find((entry) => entry.ownerUID !== '')!.ready = false;
    },
    'controller-child-unready',
  ],
  [
    'workload',
    (snapshot: Record<string, unknown>) => {
      (snapshot['resources'] as Resource[]).find(
        (entry) => entry.name === 'signal-collector',
      )!.ready = false;
    },
    'workload-unready',
  ],
] as const) {
  test(`reconciliation refuses ${fault} and preserves a sanitized immutable refusal receipt`, async () => {
    observations = structuredClone(healthy);
    change(observations);
    const path = join(directory, `fault-${fault}.json`);
    expect(
      await rejection(
        observeFluxReconciliation(directory, packet, bound, observationTarget(), path, fixtureRead),
      ),
    ).toMatch(reason);
    const receipt = JSON.parse(await readFile(path, 'utf8')) as { status: string; reason: string };
    expect(receipt).toMatchObject({ status: 'refused', reason });
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE-MARKER');
  });
}

test('CLI refuses malformed private input without leaking plaintext, paths or nested command errors', async () => {
  const path = join(directory, 'PRIVATE-MARKER-cli.json');
  await writeFile(path, '{PRIVATE-MARKER', { mode: 0o600 });
  const child = Bun.spawnSync(
    [
      'bun',
      'tools/tool-fleet/src/observability-flux-cli.ts',
      'bind',
      path,
      join(directory, 'cli.json'),
    ],
    {
      cwd: root,
      env: { ...process.env, PUNI_PARITY_TOOLS: tools },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(child.exitCode).toBe(1);
  expect(child.stdout.toString()).toBe('');
  expect(child.stderr.toString()).toBe('observability Flux: input-malformed\n');
  expect(child.stderr.toString()).not.toContain('PRIVATE-MARKER');
});

for (const [fault, edit, reason] of [
  [
    'extra',
    async (repository: string) => {
      await writeFile(join(repository, 'extra.txt'), 'unreviewed');
    },
    'source-file-closure',
  ],
  [
    'bytes',
    async (repository: string) => {
      const path = join(repository, 'infra/versions/toolchain.json');
      await writeFile(path, `${await readFile(path, 'utf8')}\n`);
    },
    'source-content-mismatch',
  ],
  [
    'symlink',
    async (repository: string) => {
      await symlink('rehearsal.json', join(repository, 'link'));
    },
    'source-tree-refused',
  ],
] as const) {
  test(`actual fetched artifact refuses ${fault}`, async () => {
    const repository = join(directory, 'published');
    try {
      await edit(repository);
      git(['add', '.'], repository);
      git(
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '-qm',
          fault,
        ],
        repository,
      );
      const artifactCommit = git(['rev-parse', 'HEAD'], repository);
      expect(
        await rejection(
          bindObservabilitySource(
            packet,
            { ...source, artifactCommit },
            join(directory, `artifact-${fault}.json`),
          ),
        ),
      ).toMatch(reason);
    } finally {
      git(['reset', '--hard', source.artifactCommit], repository);
    }
  });
}

for (const field of ['identityFile', 'knownHostsFile'] as const) {
  test(`authenticated fetch refuses malformed ${field} without exposing input`, async () => {
    const path = join(directory, `malformed-${field}`);
    await writeFile(path, 'PRIVATE-MARKER', { mode: 0o600 });
    expect(
      await rejection(
        bindObservabilitySource(
          packet,
          { ...source, [field]: path },
          join(directory, `bad-${field}.json`),
        ),
      ),
    ).toMatch('command-failed');
  });
}

test('read-only observation refuses a missing creation journal without manufacturing ownership', async () => {
  observations = structuredClone(healthy);
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        { ...observationTarget(), attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        join(directory, 'missing-journal.json'),
        fixtureRead,
      ),
    ),
  ).toMatch('observation-refused');
});

test('real subprocess timeout and failure diagnostics stay bounded and private', async () => {
  const started = Date.now();
  expect(
    await rejection(executeFluxRead(['bun', '-e', 'setInterval(() => {}, 1000)'], Date.now() + 50)),
  ).toMatch('deadline-expired');
  expect(Date.now() - started).toBeLessThan(1000);
  expect(
    await rejection(
      executeFluxRead(
        ['bun', '-e', 'console.error("PRIVATE-MARKER"); process.exit(2)'],
        Date.now() + 1000,
      ),
    ),
  ).toMatch('command-failed');
});

test('pinned kubectl projects real source digest, stale condition, deployed history and workload counts over read-only HTTP', async () => {
  const manifests: Record<string, unknown> = {
    source: {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: {
        name: 'puni-platform',
        namespace: 'flux-system',
        uid: 'source-uid',
        generation: 2,
      },
      spec: {
        url: source.repositoryURL,
        ref: { commit: source.artifactCommit },
        secretRef: { name: 'puni-platform-auth' },
      },
      status: {
        observedGeneration: 2,
        conditions: [{ type: 'Ready', status: 'True', observedGeneration: 1 }],
        artifact: { revision: `sha1:${source.artifactCommit}`, digest: `sha256:${'a'.repeat(64)}` },
      },
    },
    resources: {
      apiVersion: 'v1',
      kind: 'List',
      items: [
        {
          apiVersion: 'helm.toolkit.fluxcd.io/v2',
          kind: 'HelmRelease',
          metadata: {
            name: 'elasticsearch',
            namespace: 'observability',
            uid: 'helm-uid',
            generation: 1,
          },
          spec: {
            chart: {
              spec: {
                chart: './chart.tgz',
                sourceRef: {
                  kind: 'GitRepository',
                  namespace: 'flux-system',
                  name: 'puni-platform',
                },
              },
            },
          },
          status: {
            observedGeneration: 1,
            conditions: [{ type: 'Ready', status: 'True', observedGeneration: 1 }],
            lastAttemptedRevision: 'wrong',
            history: [
              {
                name: 'release',
                namespace: 'observability',
                status: 'deployed',
                chartVersion: '0.20.0',
              },
            ],
          },
        },
        {
          apiVersion: 'apps/v1',
          kind: 'StatefulSet',
          metadata: { name: 'child', namespace: 'observability', uid: 'child-uid', generation: 1 },
          spec: { replicas: 1 },
          status: { observedGeneration: 1, readyReplicas: 1, updatedReplicas: 0 },
        },
      ],
    },
  };
  const monitoring = ['observability', 'observability-dev'].flatMap((namespace) =>
    ['Prometheus', 'Alertmanager'].map((kind) => ({
      apiVersion: 'monitoring.coreos.com/v1',
      kind,
      metadata: {
        name: kind === 'Prometheus' ? 'kps-prometheus' : 'kps-alertmanager',
        namespace,
        uid: `${kind}-${namespace}-${kind === 'Prometheus' ? 'kps-prometheus' : 'kps-alertmanager'}`,
        generation: 1,
        annotations: {
          'meta.helm.sh/release-name': `${namespace}-kube-prometheus-stack`,
          'meta.helm.sh/release-namespace': namespace,
        },
      },
      spec: { replicas: 1 },
      status: {
        replicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        unavailableReplicas: 0,
        paused: false,
        conditions: ['Available', 'Reconciled'].map((condition) => ({
          type: condition,
          status: 'True',
          observedGeneration: 1,
          lastTransitionTime: '2026-10-26T00:00:00Z',
        })),
      },
    })),
  );
  (manifests['resources'] as { items: unknown[] }).items.push(...monitoring);
  const methods: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      methods.push(request.method);
      if (request.method !== 'GET') return new Response('writes forbidden', { status: 403 });
      const path = new URL(request.url).pathname;
      if (path === '/api')
        return Response.json({
          kind: 'APIVersions',
          versions: ['v1'],
          serverAddressByClientCIDRs: [],
        });
      if (path === '/apis')
        return Response.json({
          kind: 'APIGroupList',
          groups: [
            {
              name: 'monitoring.coreos.com',
              versions: [{ groupVersion: 'monitoring.coreos.com/v1', version: 'v1' }],
              preferredVersion: { groupVersion: 'monitoring.coreos.com/v1', version: 'v1' },
            },
            {
              name: 'helm.toolkit.fluxcd.io',
              versions: [{ groupVersion: 'helm.toolkit.fluxcd.io/v2', version: 'v2' }],
              preferredVersion: { groupVersion: 'helm.toolkit.fluxcd.io/v2', version: 'v2' },
            },
            {
              name: 'apps',
              versions: [{ groupVersion: 'apps/v1', version: 'v1' }],
              preferredVersion: { groupVersion: 'apps/v1', version: 'v1' },
            },
          ],
        });
      if (path === '/apis/helm.toolkit.fluxcd.io/v2')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'helm.toolkit.fluxcd.io/v2',
          resources: [
            {
              name: 'helmreleases',
              singularName: 'helmrelease',
              namespaced: true,
              kind: 'HelmRelease',
              verbs: ['get', 'list'],
            },
          ],
        });
      if (path === '/apis/monitoring.coreos.com/v1')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'monitoring.coreos.com/v1',
          resources: [
            {
              name: 'prometheuses',
              singularName: 'prometheus',
              namespaced: true,
              kind: 'Prometheus',
              verbs: ['get', 'list'],
            },
            {
              name: 'alertmanagers',
              singularName: 'alertmanager',
              namespaced: true,
              kind: 'Alertmanager',
              verbs: ['get', 'list'],
            },
          ],
        });
      if (path === '/apis/apps/v1')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'apps/v1',
          resources: [
            {
              name: 'statefulsets',
              singularName: 'statefulset',
              namespaced: true,
              kind: 'StatefulSet',
              verbs: ['get', 'list'],
            },
          ],
        });
      if (path === '/api/v1')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'v1',
          resources: [
            {
              name: 'configmaps',
              singularName: 'configmap',
              namespaced: true,
              kind: 'ConfigMap',
              verbs: ['get', 'list'],
            },
          ],
        });
      if (path.endsWith('/configmaps/source')) return Response.json(manifests['source']);
      if (path.endsWith('/configmaps')) return Response.json(manifests['resources']);
      return new Response('unexpected read', { status: 404 });
    },
  });
  try {
    const kubeconfig = join(directory, 'projection-kubeconfig');
    await writeFile(
      kubeconfig,
      '{"apiVersion":"v1","kind":"Config","clusters":[],"contexts":[],"users":[]}',
      { mode: 0o600 },
    );
    async function project(resource: string, projection: string) {
      const argv = [
        join(tools, 'kubectl'),
        `--server=http://127.0.0.1:${String(server.port)}`,
        '--kubeconfig',
        kubeconfig,
        '--cache-dir',
        join(directory, 'cache'),
        'get',
        resource,
        '-o',
        `go-template=${projection}`,
      ];
      const child = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe' });
      const timer = setTimeout(() => {
        child.kill();
      }, 3000);
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      if (exitCode !== 0) throw new Error(stderr);
      return JSON.parse(stdout) as unknown;
    }
    const observedSource = (await project('configmap/source', fluxProjections.source)) as {
      details: { digest: string; currentReady: boolean };
    };
    expect(observedSource.details.digest).toBe(`sha256:${'a'.repeat(64)}`);
    expect(observedSource.details.currentReady).toBe(false);
    const observedResources = (await project('configmaps', fluxProjections.resources)) as {
      resources: { revision: string; sourceKind: string }[];
      states: { currentReady: boolean; desired: number; ready: number; updated: number }[];
    };
    expect(observedResources.resources[0].revision).toBe('0.20.0');
    expect(observedResources.resources[0].sourceKind).toBe('GitRepository');
    expect(observedResources.states[0].currentReady).toBe(true);
    expect(observedResources.states[1]).toMatchObject({ desired: 1, ready: 1, updated: 0 });
    async function observeMonitoring(label: string) {
      const projected = (await project('configmaps', fluxProjections.resources)) as {
        resources: Resource[];
        states: { uid: string; currentReady: boolean }[];
      };
      observations = structuredClone(healthy);
      for (const custom of monitoring) {
        const resource = projected.resources.find(
          (resource) => resource.uid === custom.metadata.uid,
        )!;
        const status = projected.states.find((status) => status.uid === custom.metadata.uid)!;
        expect(resource.observedGeneration).toBe(0);
        const resources = observations['resources'] as Resource[];
        resources[resources.findIndex((entry) => entry.uid === resource.uid)] = resource;
        const states = observations['states'] as { uid: string; currentReady: boolean }[];
        states[states.findIndex((entry) => entry.uid === status.uid)] = status;
      }
      return {
        projected,
        operation: () =>
          observeFluxReconciliation(
            directory,
            packet,
            bound,
            { ...observationTarget(), timeoutMs: 500 },
            join(directory, `monitoring-${label}.json`),
            fixtureRead,
          ),
      };
    }
    const current = await observeMonitoring('current');
    expect(
      current.projected.states
        .filter((state) => monitoring.some((custom) => custom.metadata.uid === state.uid))
        .every((state) => state.currentReady),
    ).toBe(true);
    expect((await current.operation()).status).toBe('observed');
    for (const kind of ['Prometheus', 'Alertmanager']) {
      const custom = monitoring.find((custom) => custom.kind === kind)!;
      for (const conditionType of ['Available', 'Reconciled']) {
        const condition = custom.status.conditions.find(
          (condition) => condition.type === conditionType,
        )!;
        for (const fault of ['stale', 'unhealthy']) {
          condition.observedGeneration = fault === 'stale' ? 0 : 1;
          condition.status = fault === 'unhealthy' ? 'False' : 'True';
          // A fresh unrelated condition must never substitute for the unhealthy/stale relevant one.
          custom.status.conditions.push({
            type: 'Ready',
            status: 'True',
            observedGeneration: 1,
            lastTransitionTime: '2026-10-26T00:00:00Z',
          });
          const negative = await observeMonitoring(`${kind}-${conditionType}-${fault}`);
          expect(
            negative.projected.states.find((state) => state.uid === custom.metadata.uid)!
              .currentReady,
          ).toBe(false);
          expect(await rejection(negative.operation())).toMatch('resource-unready-or-stale');
          custom.status.conditions.pop();
          condition.observedGeneration = 1;
          condition.status = 'True';
        }
      }
    }
    expect(methods.every((method) => method === 'GET')).toBe(true);
  } finally {
    await server.stop(true);
  }
});

test('CLI binds a validated packet through the actual command path', async () => {
  const path = join(directory, 'cli-valid.json');
  await writeFile(
    path,
    JSON.stringify({ packetRequest, packetDirectory: join(directory, 'packet'), source }),
    { mode: 0o600 },
  );
  const child = Bun.spawnSync(
    [
      'bun',
      'tools/tool-fleet/src/observability-flux-cli.ts',
      'bind',
      path,
      join(directory, 'cli-positive.json'),
    ],
    {
      cwd: root,
      env: { ...process.env, PUNI_PARITY_TOOLS: tools },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30000,
    },
  );
  expect(child.exitCode).toBe(0);
  expect(child.stderr.toString()).toBe('');
  expect(JSON.parse(child.stdout.toString())).toMatchObject({
    artifactCommit: source.artifactCommit,
    runtimeAcceptance: false,
  });
});

test('receipt refuses an exposed parent directory', async () => {
  const exposed = join(directory, 'exposed');
  await mkdir(exposed, { mode: 0o755 });
  expect(
    await rejection(bindObservabilitySource(packet, source, join(exposed, 'receipt.json'))),
  ).toMatch('receipt-unwritable');
});

test('saved binding JSON cannot replace the actual fetched operation capability', async () => {
  observations = structuredClone(healthy);
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        structuredClone(bound),
        observationTarget(),
        join(directory, 'forged.json'),
        fixtureRead,
      ),
    ),
  ).toMatch('source-unbound');
});

test('actual FIFO input refuses without waiting for a writer', () => {
  const path = join(directory, 'request.fifo');
  const created = Bun.spawnSync(['mkfifo', '-m', '600', path]);
  expect(created.exitCode).toBe(0);
  const child = Bun.spawnSync(
    [
      'bun',
      'tools/tool-fleet/src/observability-flux-cli.ts',
      'bind',
      path,
      join(directory, 'fifo.json'),
    ],
    {
      cwd: root,
      env: { ...process.env, PUNI_PARITY_TOOLS: tools },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 1500,
    },
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toBe('observability Flux: input-unreadable\n');
});

test('real subprocess output overflow refuses instead of retaining unbounded bytes', async () => {
  expect(
    await rejection(
      executeFluxRead(
        ['bun', '-e', "process.stdout.write('x'.repeat(64*1024*1024+1))"],
        Date.now() + 3000,
      ),
    ),
  ).toMatch('command-output-too-large');
});

test('CLI hides private paths in required packet read failures', async () => {
  const requestPath = join(directory, 'private-path-request.json');
  await writeFile(
    requestPath,
    JSON.stringify({
      packetRequest,
      packetDirectory: join(directory, 'PRIVATE-MARKER-absent'),
      source,
    }),
    { mode: 0o600 },
  );
  const child = Bun.spawnSync(
    [
      'bun',
      'tools/tool-fleet/src/observability-flux-cli.ts',
      'bind',
      requestPath,
      join(directory, 'private-path.json'),
    ],
    {
      cwd: root,
      env: { ...process.env, PUNI_PARITY_TOOLS: tools },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30000,
    },
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).not.toContain('PRIVATE-MARKER');
  expect(child.stderr.toString()).toBe('observability Flux: validation-refused\n');
});

test('source digest replacement during observation refuses the completed snapshot', async () => {
  observations = structuredClone(healthy);
  let reads = 0;
  async function changing(argv: string[]) {
    if (argv.includes('gitrepository.source.toolkit.fluxcd.io/puni-platform') && ++reads === 2)
      Object.assign(observations['details'] as object, { digest: `sha256:${'c'.repeat(64)}` });
    return fixtureRead(argv);
  }
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        observationTarget(),
        join(directory, 'changed-source.json'),
        changing,
      ),
    ),
  ).toMatch('observation-changed');
});

test('resource replacement while waiting refuses the new UID', async () => {
  observations = structuredClone(healthy);
  Object.assign(observations['details'] as object, { currentReady: false });
  let reads = 0;
  async function changing(argv: string[]) {
    if (argv.some((part) => part.startsWith('kustomizations.')) && ++reads === 2) {
      const workload = (observations['resources'] as Resource[]).find(
        (resource) => resource.name === 'signal-collector',
      )!;
      const state = (observations['states'] as { uid: string }[]).find(
        (state) => state.uid === workload.uid,
      )!;
      workload.uid = 'replacement';
      state.uid = 'replacement';
    }
    return fixtureRead(argv);
  }
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        { ...observationTarget(), timeoutMs: 500 },
        join(directory, 'changed-resource.json'),
        changing,
      ),
    ),
  ).toMatch('resource-identity-changed');
});

test('caller mutation during authenticated fetch cannot rewrite repository attribution', async () => {
  const executable = join(directory, 'bin/ssh');
  const original = await readFile(executable, 'utf8');
  const started = join(directory, 'fetch-started');
  const release = join(directory, 'fetch-release');
  await writeFile(
    executable,
    original.replace(
      'exec git-upload-pack',
      `touch '${started}'\nwhile [ ! -f '${release}' ]; do sleep 0.01; done\nexec git-upload-pack`,
    ),
    { mode: 0o700 },
  );
  const request = { ...source };
  const operation = bindObservabilitySource(
    packet,
    request,
    join(directory, 'source-snapshot.json'),
  );
  try {
    const deadline = Date.now() + 3000;
    while (!(await Bun.file(started).exists())) {
      if (Date.now() >= deadline) throw new Error('Fixture fetch did not start');
      await Bun.sleep(10);
    }
    request.repositoryURL = 'ssh://git@unfetched.invalid/packet';
    await writeFile(release, 'continue');
    const snapshot = await operation;
    expect(snapshot.repositoryIdentitySHA256).toBe(bound.repositoryIdentitySHA256);
  } finally {
    await writeFile(release, 'continue');
    await writeFile(executable, original, { mode: 0o700 });
  }
});

test('caller mutation during target observation cannot substitute a foreign marker', async () => {
  observations = structuredClone(healthy);
  const request = observationTarget();
  async function changing(argv: string[]) {
    if (argv[0] === 'docker') {
      request.markerUID = 'foreign-marker';
      Object.assign(observations['marker'] as object, { uid: 'foreign-marker' });
    }
    return fixtureRead(argv);
  }
  const path = join(directory, 'target-snapshot.json');
  expect(
    await rejection(observeFluxReconciliation(directory, packet, bound, request, path, changing)),
  ).toMatch('target-mismatch');
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    target: { markerUID: 'marker-uid' },
  });
});

for (const fault of ['rename-and-replace', 'disappear', 'unready-parent-disappear'] as const) {
  test(`attributed controller child cannot ${fault} across retries`, async () => {
    observations = structuredClone(healthy);
    Object.assign(observations['details'] as object, { currentReady: false });
    let reads = 0;
    async function changing(argv: string[]) {
      if (argv.some((part) => part.startsWith('kustomizations.')) && ++reads === 2) {
        const resources = observations['resources'] as Resource[];
        const child = resources.find((resource) => resource.ownerUID !== '')!;
        const states = observations['states'] as { uid: string }[];
        const state = states.find((state) => state.uid === child.uid)!;
        if (fault === 'rename-and-replace') {
          child.name = 'replacement-child';
          child.uid = 'replacement-uid';
          state.uid = child.uid;
        } else {
          observations['resources'] = resources.filter((resource) => resource !== child);
          observations['states'] = states.filter((entry) => entry !== state);
          if (fault === 'unready-parent-disappear')
            resources.find((resource) => resource.uid === child.ownerUID)!.observedGeneration = 0;
        }
        Object.assign(observations['details'] as object, { currentReady: true });
      }
      return fixtureRead(argv);
    }
    expect(
      await rejection(
        observeFluxReconciliation(
          directory,
          packet,
          bound,
          { ...observationTarget(), timeoutMs: 500 },
          join(directory, `child-${fault}.json`),
          changing,
        ),
      ),
    ).toMatch('controller-child-identity-changed');
  });
}

test('an initially unready parent cannot replace its attributed child when ready', async () => {
  observations = structuredClone(healthy);
  const resources = observations['resources'] as Resource[];
  const child = resources.find((resource) => resource.ownerUID !== '')!;
  const parent = resources.find((resource) => resource.uid === child.ownerUID)!;
  parent.observedGeneration = 0;
  let reads = 0;
  async function changing(argv: string[]) {
    if (argv.some((part) => part.startsWith('kustomizations.')) && ++reads === 2) {
      const state = (observations['states'] as { uid: string }[]).find(
        (state) => state.uid === child.uid,
      )!;
      parent.observedGeneration = parent.generation;
      child.name = 'replacement-child';
      child.uid = 'replacement-uid';
      state.uid = child.uid;
    }
    return fixtureRead(argv);
  }
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        { ...observationTarget(), timeoutMs: 500 },
        join(directory, 'initially-unready-parent.json'),
        changing,
      ),
    ),
  ).toMatch('controller-child-identity-changed');
});

test('an initially absent controller child may first appear before attribution', async () => {
  observations = structuredClone(healthy);
  let reads = 0;
  async function appearing(argv: string[]) {
    if (argv.some((part) => part.startsWith('kustomizations.'))) {
      if (++reads === 1) {
        const resources = observations['resources'] as Resource[];
        const child = resources.find((resource) => resource.ownerUID !== '')!;
        observations['resources'] = resources.filter((resource) => resource !== child);
        observations['states'] = (observations['states'] as { uid: string }[]).filter(
          (state) => state.uid !== child.uid,
        );
      } else observations = structuredClone(healthy);
    }
    return fixtureRead(argv);
  }
  expect(
    (
      await observeFluxReconciliation(
        directory,
        packet,
        bound,
        { ...observationTarget(), timeoutMs: 500 },
        join(directory, 'first-child.json'),
        appearing,
      )
    ).status,
  ).toBe('observed');
});

test.each([
  'controller-stage-path',
  'controller-stage-owner',
  'controller-helm-owner',
  'controller-stage-unready',
  'controller-helm-unready',
])('controller barrier observation refuses %s', async (fault) => {
  observations = structuredClone(healthy);
  const resources = observations['resources'] as Resource[];
  const stage = resources.find(
    (resource) =>
      resource.kind === 'Kustomization' && resource.name === 'observability-controllers',
  )!;
  if (fault === 'controller-stage-path') stage.path = './infra/platform/observability/rehearsal';
  if (fault === 'controller-stage-owner') stage.owner = 'observability';
  if (fault === 'controller-stage-unready') stage.ready = false;
  if (fault === 'controller-helm-unready')
    resources.find(
      (resource) => resource.kind === 'HelmRelease' && resource.name === 'prometheus-controller',
    )!.ready = false;
  if (fault === 'controller-helm-owner')
    resources.find(
      (resource) => resource.kind === 'HelmRelease' && resource.name === 'prometheus-controller',
    )!.owner = 'observability';
  expect(
    await rejection(
      observeFluxReconciliation(
        directory,
        packet,
        bound,
        observationTarget(),
        join(directory, `${fault}.json`),
        fixtureRead,
      ),
    ),
  ).toBe(
    fault === 'controller-stage-path'
      ? 'stage-revision-or-path-mismatch'
      : 'reconciliation-owner-or-readiness-mismatch',
  );
});
