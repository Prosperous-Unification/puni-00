import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

import { cliEnvironment } from './cli.fixture';
import type { DiscoveryCommand, DiscoveryResponse } from './discover';
import type { WorkloadSpec } from './observability-workload';

interface ReceiptView {
  candidateRevision: string;
  inventoryComplete: boolean;
  migrationReady: boolean;
  blockers: string[];
  observed: { source: { revision: string }; identity: { uid: string } };
  capacityDimensions: { memory: string; cpu: string; storage: string };
  capacity: {
    requiredMiB: number;
    requiredCPUMilli: number;
    additionalCandidateMiB: number;
    futureAllowanceFits: boolean;
  }[];
  storage: { requiredMiB: number };
  capturedAt: string;
  claimUIDs: string[];
}

const executablePath = (() => {
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('PATH is required');
  return path;
})();
const root = join(import.meta.dir, '../../..');
const revision = 'a'.repeat(40);
const deployed = 'b'.repeat(40);
const marker = 'synthetic-private-marker';
const encoded = Buffer.from(marker).toString('base64');

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'observability-preflight-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const snapshot = {
    contexts: 'reviewed-context\n',
    identity: {
      name: 'puni-cluster-platform-production',
      namespace: 'kube-system',
      uid: 'identity-uid',
      marker: 'platform-production',
      immutable: true,
    },
    resources: [
      {
        kind: 'Namespace',
        name: 'observability',
        namespace: '',
        uid: 'namespace-uid',
        owner: 'platform',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'Kustomization',
        name: 'observability',
        namespace: 'flux-system',
        uid: 'flux-uid',
        owner: 'root',
        ownerNamespace: 'flux-system',
        generation: 1,
        observedGeneration: 1,
        ready: true,
        revision: `main@sha1:${deployed}`,
        chart: '',
        controllerEnabled: false,
        ownerUID: '',
        path: '',
        sourceName: '',
        sourceKind: '',
        sourceNamespace: '',
        releaseName: '',
        releaseNamespace: '',
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'CustomResourceDefinition',
        name: 'elasticsearches.elasticsearch.k8s.elastic.co',
        namespace: '',
        uid: 'crd-uid',
        owner: 'controllers',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'HelmRelease',
        name: 'eck',
        namespace: 'observability',
        uid: 'eck-uid',
        owner: 'controllers',
        ownerNamespace: 'flux-system',
        generation: 1,
        observedGeneration: 1,
        ready: true,
        revision: '2.16.1',
        chart: 'eck-operator',
        controllerEnabled: true,
        ownerUID: '',
        path: '',
        sourceName: '',
        sourceKind: '',
        sourceNamespace: '',
        releaseName: '',
        releaseNamespace: '',
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'HelmRelease',
        name: 'prometheus',
        namespace: 'observability',
        uid: 'prometheus-uid',
        owner: 'controllers',
        ownerNamespace: 'flux-system',
        generation: 1,
        observedGeneration: 1,
        ready: true,
        revision: '75.3.7',
        chart: 'kube-prometheus-stack',
        controllerEnabled: true,
        ownerUID: '',
        path: '',
        sourceName: '',
        sourceKind: '',
        sourceNamespace: '',
        releaseName: '',
        releaseNamespace: '',
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'Deployment',
        name: 'eck-operator',
        namespace: 'observability',
        uid: 'eck-deployment-uid',
        owner: 'helm:eck',
        ownerNamespace: 'observability',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'Deployment',
        name: 'prometheus-operator',
        namespace: 'observability',
        uid: 'prometheus-deployment-uid',
        owner: 'helm:prometheus',
        ownerNamespace: 'observability',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'CustomResourceDefinition',
        name: 'prometheuses.monitoring.coreos.com',
        namespace: '',
        uid: 'prometheus-crd-uid',
        owner: 'controllers',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
      {
        kind: 'Deployment',
        name: 'new',
        namespace: 'observability',
        uid: 'new-deployment-uid',
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
        dependencies: [] as { name: string; namespace: string }[],
      },
    ],
    source: {
      kind: 'GitRepository',
      namespace: 'flux-system',
      generation: 1,
      observedGeneration: 1,
      name: 'puni-platform',
      uid: 'source-uid',
      revision: `main@sha1:${deployed}`,
      ready: true,
    },
    nodes: [
      {
        name: 'h3mon',
        uid: 'node-uid',
        machineID: 'machine-uid',
        labels: { 'puni.dev/capability-observability': 'true' },
        allocatable: '8Gi',
        allocatableCPU: '4',
        schedulable: true,
        pressure: 'clear',
        ready: true,
      },
    ],
    pods: [
      {
        uid: 'pod-uid',
        deleting: false,
        specOverride: undefined as unknown,
        containerNames: ['collector'],
        volumes: [] as NonNullable<(typeof WorkloadSpec.infer)['volumes']>,
        mounts: [] as NonNullable<
          (typeof WorkloadSpec.infer)['containers'][number]['volumeMounts']
        >,
        name: 'current',
        namespace: 'observability',
        node: 'h3mon',
        phase: 'Running',
        ready: true,
        restartableInit: false,
        requests: ['2Gi'],
        limits: ['2Gi'],
        cpuRequests: ['500m'],
        cpuLimits: ['500m'],
        initCPUs: [] as string[],
        initCPULimits: [] as string[],
        overheadCPU: '0',
        initRequests: [] as string[],
        initLimits: [] as string[],
        overhead: '0',
        ownerUID: 'new-deployment-uid',
        images: ['example.invalid/collector@sha256:abc'],
        imageIDs: ['sha256:abc'],
      },
    ],
    secrets: {
      name: 'query-client',
      namespace: 'observability',
      uid: 'secret-uid',
      keys: ['tls.crt', 'tls.key'],
    },
    claims: [
      {
        name: 'history',
        namespace: 'observability',
        uid: 'claim-uid',
        volume: 'pv-history',
        phase: 'Bound',
        storageClass: 'local-path',
        requested: '1Gi',
        capacity: '1Gi',
      },
    ],
    volumes: [
      {
        name: 'pv-history',
        uid: 'pv-uid',
        claimUID: 'claim-uid',
        policy: 'Retain',
        storageClass: 'local-path',
        path: '/var/lib/rancher/k3s/storage/pv-history',
        nodes: ['h3mon'],
      },
    ],
    storageClasses: [
      {
        name: 'local-path',
        provisioner: 'rancher.io/local-path',
        bindingMode: 'WaitForFirstConsumer',
      },
    ],
    docker: {
      filesystem: {
        state: 'observed',
        path: '/var/lib/rancher/k3s/storage',
        device: '8:1',
        availableBytes: 10737418240,
        totalBytes: 21474836480,
        claimPaths: [{ path: '/var/lib/rancher/k3s/storage/pv-history', device: '8:1' }],
      },
      machineID: 'machine-uid',
      containers: [
        {
          id: 'docker-id',
          name: 'legacy',
          memoryBytes: 1073741824,
          nanoCPUs: 500000000,
          cpuQuota: 0,
          cpuPeriod: 100000,
          running: true,
          image: 'legacy:1',
          imageID: 'sha256:legacy',
          project: 'reviewed-dev',
          mounts: [
            { source: '/etc/provisioning', target: '/etc/grafana/provisioning', readOnly: true },
          ],
          volumes: ['history-volume'],
        },
      ],
      volumes: [
        {
          name: 'history-volume',
          mountpoint: '/var/lib/docker/volumes/history-volume/_data',
          createdAt: '2026-10-01T00:00:00Z',
          project: 'reviewed-dev',
          device: '8:1',
          availableBytes: 10737418240,
        },
      ],
    },
  };
  for (const name of ['root', 'platform', 'controllers'])
    snapshot.resources.push({ ...snapshot.resources[1], name, uid: `kust-${name}`, owner: 'root' });
  setupResourceSources(snapshot.resources);
  const artifact =
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: new\n  namespace: observability\nspec:\n  replicas: 1\n  template:\n    spec:\n      nodeSelector:\n        puni.dev/capability-observability: "true"\n      containers:\n        - name: collector\n          image: example.invalid/collector@sha256:abc\n          securityContext:\n            readOnlyRootFilesystem: true\n          resources:\n            requests:\n              cpu: 500m\n              memory: 2Gi\n            limits:\n              cpu: 500m\n              memory: 2Gi\n';
  await writeFile(join(directory, 'candidate.yaml'), artifact);
  const request = {
    schemaVersion: 1,
    candidateRevision: revision,
    fleetId: 'platform',
    targetMarker: 'platform-production',
    identityUID: 'identity-uid',
    context: 'reviewed-context',
    controllerContext: 'reviewed-context',
    phase: 'cutover',
    resources: snapshot.resources.map(
      ({
        kind,
        name,
        namespace,
        uid,
        owner,
        ownerNamespace,
        ownerUID,
        path,
        revision: observedRevision,
      }) => ({
        kind,
        name,
        namespace,
        uid,
        owner,
        ownerNamespace,
        ownerUID,
        path,
        requiredRevision: observedRevision,
      }),
    ),
    source: {
      kind: 'GitRepository',
      namespace: 'flux-system',
      name: 'puni-platform',
      uid: 'source-uid',
      requiredRevision: `main@sha1:${deployed}`,
    },
    secrets: [
      {
        name: 'query-client',
        namespace: 'observability',
        uid: 'secret-uid',
        keys: ['tls.crt', 'tls.key'],
      },
    ],
    claims: [
      {
        name: 'history',
        namespace: 'observability',
        uid: 'claim-uid',
        volume: 'pv-history',
        volumeUID: 'pv-uid',
      },
    ],
    nodes: [
      {
        name: 'h3mon',
        uid: 'node-uid',
        machineID: 'machine-uid',
        reserveMiB: 128,
        reserveCPUMilli: 100,
        futureAdditionalCPUMilli: 500,
        futureAdditionalMiB: 4096,
      },
    ],
    candidate: [
      {
        kind: 'Deployment',
        instance: 'dev',
        namespace: 'observability',
        name: 'new',
        node: 'h3mon',
        memoryMiB: 2048,
        cpuMilli: 500,
        storageMiB: 0,
        ephemeralMiB: 0,
        claims: [] as { name: string; uid: string; volume: string; volumeUID: string }[],
        replicaUIDs: ['pod-uid'],
        artifactPath: join(directory, 'candidate.yaml'),
        artifactSHA256: createHash('sha256').update(artifact).digest('hex'),
      },
    ],
    docker: {
      host: 'h3mon',
      node: 'h3mon',
      retainedContainers: ['legacy'],
      retainedVolumes: ['history-volume'],
      volumePins: [
        {
          name: 'history-volume',
          createdAt: '2026-10-01T00:00:00Z',
          mountpoint: '/var/lib/docker/volumes/history-volume/_data',
          project: 'reviewed-dev',
        },
      ],
      pins: [
        { name: 'legacy', id: 'docker-id', imageID: 'sha256:legacy', project: 'reviewed-dev' },
      ],
    },
    storage: {
      node: 'h3mon',
      path: '/var/lib/rancher/k3s/storage',
      storageClass: 'local-path',
      provisioner: 'rancher.io/local-path',
      headroomMiB: 1024,
    },
    rollbackSHA256: '',
    rollbackOperationId: 'rollback-1',
    rollbackPath: join(directory, 'rollback.json'),
    maxAgeMs: 30000,
    timeoutMs: 2000,
  };
  await writeFile(
    request.rollbackPath,
    JSON.stringify({
      operationId: 'rollback-1',
      candidateRevision: revision,
      capturedAt: new Date().toISOString(),
      claimUIDs: ['claim-uid'],
      dockerVolumes: ['history-volume'],
    }),
    { mode: 0o600 },
  );
  request.rollbackSHA256 = createHash('sha256')
    .update(await readFile(request.rollbackPath))
    .digest('hex');
  await writeFile(join(directory, 'snapshot.json'), JSON.stringify(snapshot));
  await writeFile(
    join(bin, 'kubectl'),
    `#!/usr/bin/env bun\nconst s=await Bun.file((process.env['PREFLIGHT_SNAPSHOT']??${JSON.stringify(join(directory, 'snapshot.json'))})).json();const args=process.argv.slice(2);const output=(key)=>{if(s.failure===key){console.log(JSON.stringify(s[key]));console.error('${marker} ${encoded}');process.exit(42)}if(s.malformed===key){console.log('${marker} ${encoded}');process.exit(0)}console.log(JSON.stringify(s[key]))};if(args.includes('get-contexts')){process.stdout.write(s.contexts);process.exit(0)}const resource=args[args.indexOf('get')+1];if(resource==='pods')s.pods=s.pods.map(${projectFixturePod.toString()});if(resource==='configmap'&&(args[args.indexOf('get')+2]!=='puni-cluster-platform-production'||args[args.indexOf('-n')+1]!=='kube-system'||s.canonicalMissing)){console.log(JSON.stringify(s.declarativeIdentity??{}));process.exit(44)}const keys={'configmap':'identity','gitrepository':'source','nodes':'nodes','pods':'pods','secret':'secrets','persistentvolumeclaims':'claims','persistentvolumes':'volumes','storageclasses':'storageClasses'};if(!keys[resource]){const kinds=resource.startsWith('namespaces')?['Namespace','CustomResourceDefinition']:resource.startsWith('kustomizations')?['Kustomization']:['HelmRelease','Deployment','ReplicaSet','StatefulSet','Elasticsearch','Kibana'];s.resources=s.resources.filter(r=>kinds.includes(r.kind))}output(keys[resource]??'resources');\n`,
  );
  await writeFile(
    join(bin, 'ssh'),
    `#!/usr/bin/env bun\nconst s=await Bun.file((process.env['PREFLIGHT_SNAPSHOT']??${JSON.stringify(join(directory, 'snapshot.json'))})).json();console.log(JSON.stringify(s.docker));\n`,
  );
  await chmod(join(bin, 'kubectl'), 0o755);
  await chmod(join(bin, 'ssh'), 0o755);
  const transportPath = join(directory, 'transport.json');
  const hostsPath = join(directory, 'known_hosts');
  await writeFile(hostsPath, 'h3mon ssh-ed25519 synthetic-key\n', { mode: 0o600 });
  await writeFile(transportPath, JSON.stringify({ user: 'monitor', knownHostsFile: hostsPath }), {
    mode: 0o600,
  });
  // A real Unix socket exercises the existing SSH transport decoder.
  const server = Bun.listen({
    unix: join(directory, 'agent.sock'),
    socket: {
      data() {
        throw new Error('fixture agent must not receive bytes');
      },
    },
  });
  return {
    request,
    snapshot,
    directory,
    async direct(
      change: (command: DiscoveryCommand, response: DiscoveryResponse) => DiscoveryResponse,
      clock?: () => Date,
    ) {
      await writeFile(join(directory, 'snapshot.json'), JSON.stringify(snapshot));
      const { readSshTransport } = await import('./ssh-transport');
      const { runDiscoveryCommand } = await import('./discover');
      const { preflightObservability } = await import('./observability-preflight');
      try {
        const transport = await readSshTransport(
          transportPath,
          { SSH_AUTH_SOCK: join(directory, 'agent.sock') },
          ['h3mon'],
        );
        return await preflightObservability(request, {
          transport,
          now: clock,
          run: async (command) =>
            change(
              command,
              await runDiscoveryCommand({ ...command, executable: join(bin, command.executable) }),
            ),
        });
      } finally {
        server.stop(true);
      }
    },
    async run(requestPath = join(directory, 'request.json')) {
      await writeFile(join(directory, 'request.json'), JSON.stringify(request));
      await writeFile(join(directory, 'snapshot.json'), JSON.stringify(snapshot));
      const child = Bun.spawn(
        [
          process.execPath,
          join(root, 'tools/tool-fleet/src/observability-preflight-cli.ts'),
          '--request',
          requestPath,
          '--output',
          join(directory, 'receipt.json'),
          '--ssh-transport',
          transportPath,
        ],
        {
          cwd: root,
          env: {
            ...cliEnvironment(),
            PATH: `${bin}:${executablePath}`,
            PREFLIGHT_SNAPSHOT: join(directory, 'snapshot.json'),
            SSH_AUTH_SOCK: join(directory, 'agent.sock'),
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const deadline = setTimeout(() => {
        child.kill();
      }, 10_000);
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(deadline);
      server.stop(true);
      return { exitCode, stdout, stderr };
    },
  };
}

async function injectFault(
  fault: (setup: Awaited<ReturnType<typeof fixture>>) => void | Promise<void>,
  setup: Awaited<ReturnType<typeof fixture>>,
): Promise<void> {
  await fault(setup);
}
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  }
  return 'fulfilled-without-refusal';
}

it('authorized inventory binds the reviewed revision without replacing the observed Flux revision', async () => {
  const setup = await fixture();
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.candidateRevision).toBe(revision);
  expect(receipt.observed.source.revision).toContain(deployed);
  expect(receipt.inventoryComplete).toBe(true);
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.capacityDimensions).toEqual({
    memory: 'assessed',
    cpu: 'assessed',
    storage: 'assessed',
  });
  expect(receipt.capacity[0].requiredCPUMilli).toBe(1100);
  expect(receipt.storage.requiredMiB).toBe(1024);
  expect(receipt.capacity[0].requiredMiB).toBe(3200);
  expect(receipt.capacity[0].futureAllowanceFits).toBe(true);
});

for (const [name, fault, diagnostic] of [
  [
    'SSH success cannot replace denied Kubernetes read',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      Object.assign(s.snapshot, { failure: 'identity' });
    },
    'command-failed',
  ],
  [
    'unready dependency refuses migration',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].ready = false;
    },
    'dependency-unready',
  ],
  [
    'unknown owner refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[0].owner = '';
    },
    'ownership-mismatch',
  ],
  [
    'wrong cluster marker refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.identity.marker = 'platform';
    },
    'target-mismatch',
  ],
  [
    'wrong UID refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[0].uid = 'foreign';
    },
    'ownership-mismatch',
  ],
  [
    'source revision drift refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.source.revision = 'main@sha1:foreign';
    },
    'source-mismatch',
  ],
  [
    'candidate plus retained stack exceeds capacity',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].allocatable = '3Gi';
    },
    'capacity-exceeded',
  ],
  [
    'unbounded Docker memory refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.containers[0].memoryBytes = 0;
    },
    'docker-unbounded',
  ],
  [
    'missing retained claim refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.claims = [];
    },
    'retained-claim-mismatch',
  ],
  [
    'wrong retained PV policy refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.volumes[0].policy = 'Delete';
    },
    'retained-claim-mismatch',
  ],
  [
    'missing required Secret key refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.secrets.keys = ['tls.crt'];
    },
    'secret-mismatch',
  ],
  [
    'missing context refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.contexts = '';
    },
    'context-unavailable',
  ],
  [
    'stale rollback receipt refuses',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      const path = s.request.rollbackPath;
      const receipt = JSON.parse(await readFile(path, 'utf8')) as ReceiptView;
      receipt.capturedAt = '2020-01-01';
      await writeFile(path, JSON.stringify(receipt));
    },
    'rollback-stale',
  ],
  [
    'missing rollback receipt refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.rollbackPath += '-absent';
    },
    'rollback-missing',
  ],
  [
    'unreadable rollback receipt differs',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.rollbackPath = join(s.directory, 'unreadable');
      await mkdir(s.request.rollbackPath);
    },
    'rollback-unreadable',
  ],
  [
    'malformed rollback receipt differs',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await writeFile(s.request.rollbackPath, '{bad');
    },
    'rollback-malformed',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toStartWith('observability preflight: ');
    expect(response.stderr).toContain(diagnostic);
    expect(response.stdout).toBe('');
  });
}

for (const mode of ['failure', 'malformed'] as const) {
  it(`Secret ${mode} diagnostics never expose plaintext or encoded private markers`, async () => {
    const setup = await fixture();
    Object.assign(setup.snapshot, { [mode]: 'secrets' });
    // Failed stdout deliberately contains the same fake sensitive fields as a kubectl template panic.
    Object.assign(setup.snapshot.secrets, { leaked: `${marker} ${encoded}` });
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toStartWith('observability preflight: ');
    expect(response.stderr).toContain(
      mode === 'failure' ? 'command-failed' : 'projection-malformed',
    );
    expect(response.stdout + response.stderr).not.toContain(marker);
    expect(response.stdout + response.stderr).not.toContain(encoded);
  });
}

it('first inventory returns observed UIDs while migration remains blocked without reviewed pins', async () => {
  const setup = await fixture();
  setup.request.phase = 'inventory';
  setup.request.identityUID = '';
  setup.request.resources = [];
  setup.request.nodes = [];
  setup.request.candidate = [];
  setup.request.claims = [];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.inventoryComplete).toBe(true);
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('review-required');
  expect(receipt.observed.identity.uid).toBe('identity-uid');
});

for (const [name, fault, diagnostic] of [
  [
    'empty reviewed pins refuse readiness',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.resources = [];
    },
    'review-pins-required',
  ],
  [
    'candidate artifact drift refuses',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await writeFile(s.request.candidate[0].artifactPath, 'changed');
    },
    'candidate-digest-mismatch',
  ],
  [
    'tiny caller cost cannot override rendered workload requests',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].memoryMiB = 1;
    },
    'candidate-budget-mismatch',
  ],
  [
    'duplicate selected workload refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate.push({ ...s.request.candidate[0] });
    },
    'duplicate-selection',
  ],
  [
    'unready current node refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].ready = false;
    },
    'node-mismatch',
  ],
  [
    'missing candidate node pin refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].node = 'absent';
    },
    'candidate-binding-mismatch',
  ],
  [
    'wrong Docker machine identity refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.machineID = 'foreign';
    },
    'docker-node-mismatch',
  ],
  [
    'missing retained Docker volume refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.volumes = [];
    },
    'docker-retention-mismatch',
  ],
  [
    'stale generation refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].observedGeneration = 0;
    },
    'dependency-unready',
  ],
  [
    'unready controller without revision refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[2].ready = false;
    },
    'dependency-unready',
  ],
  [
    'wrong rollback ownership refuses',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      const receipt = JSON.parse(await readFile(s.request.rollbackPath, 'utf8')) as ReceiptView;
      receipt.claimUIDs = [];
      await writeFile(s.request.rollbackPath, JSON.stringify(receipt));
    },
    'rollback-mismatch',
  ],
  [
    'rollback group readable refuses',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await chmod(s.request.rollbackPath, 0o640);
    },
    'rollback-permissions',
  ],
  [
    'occupied output preserves prior receipt',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await writeFile(join(s.directory, 'receipt.json'), 'preserved');
    },
    'receipt-create-failed',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
    expect(response.stdout).toBe('');
    if (name === 'occupied output preserves prior receipt')
      expect(await readFile(join(setup.directory, 'receipt.json'), 'utf8')).toBe('preserved');
  });
}

for (const [name, fault, diagnostic] of [
  [
    'duplicate cluster controller refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources.push({
        ...s.snapshot.resources[3],
        name: 'second-eck',
        uid: 'second-eck-uid',
      });
    },
    'controller-owner-conflict',
  ],
  [
    'unreviewed controller refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.resources = s.request.resources.filter((r) => r.name !== 'eck');
    },
    'controller-owner-unreviewed',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

for (const [name, change, diagnostic] of [
  [
    'stale capacity refuses',
    (command: DiscoveryCommand, response: DiscoveryResponse) =>
      command.arguments.includes('nodes')
        ? { ...response, observedAt: '2020-01-01T00:00:00Z' }
        : response,
    'source-stale',
  ],
  [
    'custom runner cannot bypass failed JSON status',
    (_command: DiscoveryCommand, response: DiscoveryResponse) => ({ ...response, exitCode: 42 }),
    'command-failed',
  ],
  [
    'future observation refuses',
    (_command: DiscoveryCommand, response: DiscoveryResponse) => ({
      ...response,
      observedAt: '2999-01-01T00:00:00Z',
    }),
    'source-stale',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    expect(await rejection(setup.direct(change))).toContain(diagnostic);
  });
}

it('existing observed pod is not charged twice for candidate coexistence', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].name = 'new-hash-pod';
  setup.snapshot.pods[0].requests = ['2Gi'];
  setup.snapshot.pods[0].limits = ['2Gi'];
  setup.snapshot.pods[0].cpuRequests = ['500m'];
  setup.request.candidate[0].replicaUIDs = ['pod-uid'];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.capacity[0].requiredMiB).toBe(3200);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(0);
});

it('foreign existing pod cannot suppress candidate capacity', async () => {
  const setup = await fixture();
  setup.request.candidate[0].replicaUIDs = ['foreign-uid'];
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: replica-pin-mismatch');
});

for (const [name, fault, diagnostic] of [
  [
    'foreign pod controller cannot suppress candidate capacity',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].name = 'new-hash';
      s.snapshot.pods[0].requests = ['2Gi'];
      s.snapshot.pods[0].ownerUID = 'foreign';
      s.request.candidate[0].replicaUIDs = ['pod-uid'];
    },
    'replica-pin-mismatch',
  ],
  [
    'unknown retained Docker ownership refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.containers[0].project = '';
    },
    'docker-ownership-mismatch',
  ],
  [
    'changed retained Docker identity refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.containers[0].id = 'foreign';
    },
    'docker-ownership-mismatch',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('absent selected candidate cannot certify migration despite complete inventory', async () => {
  const setup = await fixture();
  setup.snapshot.resources = setup.snapshot.resources.filter((r) => r.name !== 'new');
  setup.request.resources = setup.request.resources.filter((r) => r.name !== 'new');
  setup.request.candidate[0].replicaUIDs = [];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.inventoryComplete).toBe(true);
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-unobserved');
});

it('successful Secret projection with unexpected private fields refuses without exposing the body', async () => {
  const setup = await fixture();
  Object.assign(setup.snapshot.secrets, { private: `${marker} ${encoded}` });
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: projection-malformed');
  expect(response.stdout + response.stderr).not.toContain(marker);
  expect(response.stdout + response.stderr).not.toContain(encoded);
});

it('unsupported selected workload kind refuses instead of omitting its cost', async () => {
  const setup = await fixture();
  const candidate = setup.request.candidate[0];
  const source = (await readFile(candidate.artifactPath, 'utf8')).replace(
    'kind: Deployment',
    'kind: Job',
  );
  candidate.artifactSHA256 = createHash('sha256').update(source).digest('hex');
  await writeFile(candidate.artifactPath, source);
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: projection-malformed');
});

for (const [name, fault, diagnostic] of [
  [
    'CPU coexistence deficit refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].allocatableCPU = '1';
    },
    'cpu-capacity-exceeded',
  ],
  [
    'unknown node CPU refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].allocatableCPU = '';
    },
    'cpu-unknown',
  ],
  [
    'unbounded retained Docker CPU refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.containers[0].nanoCPUs = 0;
    },
    'docker-cpu-unbounded',
  ],
  [
    'unknown current workload CPU refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].cpuLimits = [''];
    },
    'cpu-unknown',
  ],
  [
    'tiny declared CPU cannot override source artifact',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].cpuMilli = 1;
    },
    'candidate-cpu-mismatch',
  ],
  [
    'filesystem free-space deficit refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.filesystem.availableBytes = 1;
    },
    'storage-capacity-exceeded',
  ],
  [
    'unknown external storage binding refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.storage.path = '';
    },
    'storage-binding-required',
  ],
  [
    'wrong PVC capacity refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.claims[0].capacity = '512Mi';
    },
    'storage-claim-capacity-mismatch',
  ],
  [
    'wrong PV filesystem device refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.filesystem.claimPaths[0].device = '8:2';
    },
    'storage-filesystem-mismatch',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('normal Kubernetes CPU overcommit does not create an artificial request deficit', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].cpuLimits = ['100'];
  await rewriteCandidate(setup, (source) =>
    source.replace('limits:\n              cpu: 500m', 'limits:\n              cpu: "100"'),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.capacity[0].requiredCPUMilli).toBe(1100);
});

it('new PVC demand is derived from the selected artifact and charged against free storage once', async () => {
  const setup = await fixture();
  await bindSelectedPVC(setup);
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.storage.requiredMiB).toBe(1024);
  expect(receipt.migrationReady).toBe(true);
});

it('real fixed SSH projection reads only safe Docker fields and bounded filesystem metadata', async () => {
  const { buildObservabilityDockerCommand } = await import('./observability-preflight');
  const directory = await mkdtemp(join(tmpdir(), 'preflight-docker-projection-'));
  const binary = join(directory, 'docker');
  await writeFile(
    binary,
    `#!/usr/bin/env bun\nconst args=process.argv.slice(2);if(args[0]==='ps')console.log('synthetic-id');else if(args[0]==='inspect'){if(!args.includes('--format')||args[2].includes('.Env'))process.exit(2);console.log(JSON.stringify({id:'synthetic-id',name:'/synthetic',memoryBytes:1024,nanoCPUs:100000000,cpuQuota:0,cpuPeriod:100000,running:true,image:'synthetic:1',imageID:'sha256:synthetic',project:null,mounts:[],volumes:[{type:'volume',name:'synthetic-volume'}]}))}else if(args[1]==='ls')console.log('synthetic-volume');else if(args[1]==='inspect')console.log(JSON.stringify({name:'synthetic-volume',createdAt:'2026-10-01T00:00:00Z',project:null,mountpoint:${JSON.stringify(directory)}}));else process.exit(3);\n`,
  );
  await chmod(binary, 0o755);
  const command = buildObservabilityDockerCommand(
    {
      user: 'monitor',
      knownHostsFile: '/reviewed/known_hosts',
      agentSocket: '/reviewed/agent.sock',
    },
    'h3mon',
    2000,
    { path: directory, claimPaths: [directory] },
  );
  const remote = command.arguments.at(-1);
  if (remote === undefined) throw new Error('missing remote command');
  const child = Bun.spawn(['bash', '-c', remote], {
    env: { ...process.env, PATH: `${directory}:${executablePath}` },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe('');
  const snapshot = JSON.parse(stdout) as {
    filesystem: {
      state: string;
      availableBytes: number;
      device: string;
      claimPaths: { device: string }[];
    };
    containers: { project: string }[];
  };
  expect(snapshot.filesystem.state).toBe('observed');
  expect(snapshot.filesystem.availableBytes).toBeGreaterThan(0);
  expect(snapshot.filesystem.claimPaths[0].device).toBe(snapshot.filesystem.device);
  expect(snapshot.containers[0].project).toBe('');
});

it('deduplicates a real Pod to ReplicaSet to Deployment owner chain', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].name = 'new-hash-pod';
  setup.snapshot.pods[0].requests = ['2Gi'];
  setup.snapshot.pods[0].limits = ['2Gi'];
  setup.snapshot.pods[0].cpuRequests = ['500m'];
  setup.snapshot.pods[0].ownerUID = 'replicaset-uid';
  setup.request.candidate[0].replicaUIDs = ['pod-uid'];
  setup.snapshot.resources.push({
    ...setup.snapshot.resources[8],
    kind: 'ReplicaSet',
    name: 'new-hash',
    uid: 'replicaset-uid',
    owner: '',
    ownerNamespace: '',
    ownerUID: 'new-deployment-uid',
  });
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(0);
});

it('resolves StatefulSet ownership through its actual ECK Elasticsearch controller UID', async () => {
  const setup = await fixture();
  const stateful = {
    ...setup.snapshot.resources[8],
    kind: 'StatefulSet',
    name: 'elastic-es-default',
    uid: 'stateful-uid',
    owner: '',
    ownerNamespace: '',
    ownerUID: 'elastic-uid',
  };
  setup.snapshot.resources.push(stateful, {
    ...setup.snapshot.resources[8],
    kind: 'Elasticsearch',
    name: 'elastic',
    uid: 'elastic-uid',
    owner: 'helm:elastic',
    ownerNamespace: 'observability',
  });
  setup.request.resources.push({
    kind: 'StatefulSet',
    name: stateful.name,
    namespace: stateful.namespace,
    uid: stateful.uid,
    owner: 'helm:elastic',
    ownerNamespace: 'observability',
    ownerUID: 'elastic-uid',
    path: '',
    requiredRevision: '',
  });
  const release = {
    ...setup.snapshot.resources[3],
    name: 'elastic',
    uid: 'elastic-release-uid',
    owner: 'observability',
    chart: '',
    controllerEnabled: false,
    releaseName: 'elastic',
    releaseNamespace: 'observability',
    revision: '9.3.8',
  };
  setup.snapshot.resources.push(release);
  setup.request.resources.push({
    kind: release.kind,
    name: release.name,
    namespace: release.namespace,
    uid: release.uid,
    owner: release.owner,
    ownerNamespace: release.ownerNamespace,
    ownerUID: release.ownerUID,
    path: release.path,
    requiredRevision: release.revision,
  });
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
});

it('broken ECK owner chain refuses reviewed ownership', async () => {
  const setup = await fixture();
  setup.snapshot.resources[8].owner = '';
  setup.snapshot.resources[8].ownerNamespace = '';
  setup.snapshot.resources[8].ownerUID = 'absent-cr-uid';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: ownership-mismatch');
});

for (const [name, fault, diagnostic] of [
  [
    'unbounded freshness budget refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.maxAgeMs = 60001;
    },
    'unbounded-request',
  ],
  [
    'unknown memory quantity refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].allocatable = 'unknown';
    },
    'memory-unknown',
  ],
  [
    'unknown CPU array alignment refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].cpuLimits = [];
    },
    'cpu-unknown',
  ],
  [
    'candidate namespace requires a reviewed UID pin',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.resources = s.request.resources.filter((r) => r.kind !== 'Namespace');
    },
    'namespace-pin-required',
  ],
  [
    'unreviewed relevant CRD refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.resources = s.request.resources.filter(
        (r) => r.kind !== 'CustomResourceDefinition',
      );
    },
    'controller-owner-unreviewed',
  ],
  [
    'unbound storage class refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.storage.storageClass = 'unknown';
    },
    'storage-binding-mismatch',
  ],
  [
    'missing retained volume attachment refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.docker.containers[0].volumes = [];
    },
    'docker-retention-mismatch',
  ],
  [
    'capacity node scope cannot omit coexistence',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.storage.node = 'other';
    },
    'capacity-scope-mismatch',
  ],
  [
    'declared storage cost cannot replace selected artifact',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].storageMiB = 1;
    },
    'candidate-storage-mismatch',
  ],
  [
    'unreadable candidate artifact refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].artifactPath = s.directory;
    },
    'candidate-unreadable',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

for (const [name, filename, content, diagnostic] of [
  ['missing reviewed request differs', 'absent.json', undefined, 'request-missing'],
  ['unreadable reviewed request differs', '', undefined, 'request-unreadable'],
  ['malformed reviewed request differs', 'malformed.json', '{malformed', 'request-malformed'],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    const path = join(setup.directory, filename);
    if (content !== undefined) await writeFile(path, content);
    const response = await setup.run(path);
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

async function rewriteCandidate(
  setup: Awaited<ReturnType<typeof fixture>>,
  change: (source: string) => string,
): Promise<void> {
  const candidate = setup.request.candidate[0];
  const source = change(await readFile(candidate.artifactPath, 'utf8'));
  candidate.artifactSHA256 = createHash('sha256').update(source).digest('hex');
  await writeFile(candidate.artifactPath, source);
}

for (const [name, change, diagnostic] of [
  ['malformed candidate YAML refuses', () => 'kind: [broken', 'candidate-malformed'],
  [
    'unbound candidate hostPath refuses',
    (source: string) =>
      source.replace(
        '      containers:',
        '      volumes:\n        - name: history\n          hostPath:\n            path: /retained-history\n      containers:',
      ),
    'workload-volume-unsupported',
  ],
  [
    'retained history cannot be writable-mounted by the new runtime',
    (source: string) =>
      source.replace(
        '      containers:',
        '      volumes:\n        - name: history\n          persistentVolumeClaim:\n            claimName: history\n      containers:',
      ),
    'retained-store-dual-mount',
  ],
  [
    'missing candidate PVC source cannot be costed as empty storage',
    (source: string) =>
      source.replace(
        '      containers:',
        '      volumes:\n        - name: missing\n          persistentVolumeClaim:\n            claimName: missing\n      containers:',
      ),
    'candidate-storage-unknown',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await rewriteCandidate(setup, change);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('mutating the caller request during observation cannot rewrite the bound revision', async () => {
  const setup = await fixture();
  let changed = false;
  const receipt = await setup
    .direct((_command, response) => {
      if (!changed) {
        setup.request.candidateRevision = 'c'.repeat(40);
        changed = true;
      }
      return response;
    })
    .catch(() => ({ candidateRevision: 'changed-or-refused' }));
  expect(receipt.candidateRevision).toBe(revision);
});

it('inventory cannot finish after its aggregate freshness window', async () => {
  const setup = await fixture();
  const started = Date.now();
  let calls = 0;
  const clock = () => new Date(started + calls++ * 1000);
  setup.request.maxAgeMs = 8000;
  expect(
    await rejection(
      setup.direct(
        (_command, response) => ({
          ...response,
          observedAt: new Date(started + (calls - 1) * 1000).toISOString(),
        }),
        clock,
      ),
    ),
  ).toContain('inventory-stale');
});

it('recreated retained Docker volume refuses its changed immutable receipt identity', async () => {
  const setup = await fixture();
  setup.snapshot.docker.volumes[0].createdAt = '2026-10-26T00:00:00Z';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: docker-volume-ownership-mismatch');
});

it('changed rollback bytes refuse the reviewed receipt digest', async () => {
  const setup = await fixture();
  setup.request.rollbackSHA256 = 'f'.repeat(64);
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: rollback-digest-mismatch');
});

it('StatefulSet template storage demand requires its exact selected storage class', async () => {
  const setup = await fixture();
  setup.request.candidate[0].kind = 'StatefulSet';
  setup.request.candidate[0].storageMiB = 512;
  await rewriteCandidate(setup, (source) =>
    source
      .replace('kind: Deployment', 'kind: StatefulSet')
      .replace(
        '  replicas: 1',
        '  replicas: 1\n  volumeClaimTemplates:\n    - metadata:\n        name: store\n      spec:\n        storageClassName: unbound\n        resources:\n          requests:\n            storage: 512Mi',
      ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: candidate-storage-unknown');
});

it('required command absence refuses with a safe transport failure category', async () => {
  const { unlink } = await import('node:fs/promises');
  const setup = await fixture();
  await unlink(join(setup.directory, 'bin/kubectl'));
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: command-unavailable-or-timeout');
});

it('source CPU overcommit is admitted by requests while preserving finite limit evidence', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace('limits:\n              cpu: 500m', 'limits:\n              cpu: "100"'),
  );
  setup.snapshot.pods[0].cpuLimits = ['100'];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.capacity[0].requiredCPUMilli).toBe(1100);
});

it('separate instances cannot share their selected namespace', async () => {
  const setup = await fixture();
  setup.request.candidate.push({
    ...setup.request.candidate[0],
    instance: 'production',
    name: 'other',
  });
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: instance-namespace-conflict');
});

for (const [name, field, diagnostic] of [
  ['overflowing memory quantity refuses', 'allocatable', 'memory-unknown'],
  ['overflowing CPU quantity refuses', 'allocatableCPU', 'cpu-unknown'],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    setup.snapshot.nodes[0][field] = '9'.repeat(400);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('transport errors cannot forward credential-bearing input or error causes', async () => {
  const setup = await fixture();
  await writeFile(
    join(setup.directory, 'transport.json'),
    JSON.stringify({
      user: `${marker}:${encoded}`,
      knownHostsFile: join(setup.directory, 'known_hosts'),
    }),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).not.toContain(marker);
  expect(response.stderr).not.toContain(encoded);
  expect(response.stderr.trim()).toBe('observability preflight: required-input-unavailable');
});

it('new PVC absent from the observed target remains a migration blocker', async () => {
  const setup = await fixture();
  await rewriteCandidate(
    setup,
    (source) =>
      source.replace(
        '      containers:',
        '      volumes:\n        - name: new-storage\n          persistentVolumeClaim:\n            claimName: new-storage\n      containers:',
      ) +
      '---\nkind: PersistentVolumeClaim\nmetadata:\n  name: new-storage\n  namespace: observability\nspec:\n  storageClassName: local-path\n  resources:\n    requests:\n      storage: 512Mi\n',
  );
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '          securityContext:',
      '          volumeMounts:\n            - name: new-storage\n              mountPath: /state\n          securityContext:',
    ),
  );
  setup.request.candidate[0].storageMiB = 512;
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.inventoryComplete).toBe(true);
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-storage-unready-or-unreviewed');
});

for (const [name, fault, diagnostic] of [
  [
    'unused selected PVC pins refuse',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.request.candidate[0].claims = [
        { name: 'unused', uid: 'uid', volume: 'pv', volumeUID: 'pv-uid' },
      ];
    },
    'candidate-storage-pin-unused',
  ],
  [
    'cordoned target node refuses admission',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].schedulable = false;
    },
    'node-mismatch',
  ],
  [
    'unknown or active node pressure refuses admission',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].pressure = 'unknown-or-pressured';
    },
    'node-mismatch',
  ],
  [
    'unsupported restartable init resource shape refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].restartableInit = true;
      s.snapshot.pods[0].initRequests = ['128Mi'];
      s.snapshot.pods[0].initLimits = ['128Mi'];
      s.snapshot.pods[0].initCPUs = ['100m'];
      s.snapshot.pods[0].initCPULimits = ['100m'];
    },
    'workload-shape-unsupported',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('source restartable init accounting is refused instead of underestimated', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      initContainers:\n        - name: sidecar\n          restartPolicy: Always\n          image: synthetic:1\n          securityContext:\n            readOnlyRootFilesystem: true\n          resources:\n            requests:\n              memory: 128Mi\n              cpu: 100m\n            limits:\n              memory: 128Mi\n              cpu: 100m\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: workload-shape-unsupported');
});

it('missing candidate artifact differs from unreadable candidate state', async () => {
  const setup = await fixture();
  setup.request.candidate[0].artifactPath += '-missing';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: candidate-missing');
});

async function bindSelectedPVC(setup: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  const candidate = setup.request.candidate[0];
  let source = await readFile(candidate.artifactPath, 'utf8');
  source = source.replace(
    '      containers:',
    '      volumes:\n        - name: new-storage\n          persistentVolumeClaim:\n            claimName: new-storage\n      containers:',
  );
  source +=
    '---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: new-storage\n  namespace: observability\nspec:\n  storageClassName: local-path\n  resources:\n    requests:\n      storage: 512Mi\n';
  candidate.claims = [
    { name: 'new-storage', uid: 'new-claim-uid', volume: 'new-pv', volumeUID: 'new-pv-uid' },
  ];
  setup.snapshot.claims.push({
    ...setup.snapshot.claims[0],
    name: 'new-storage',
    uid: 'new-claim-uid',
    volume: 'new-pv',
    requested: '512Mi',
    capacity: '512Mi',
  });
  setup.snapshot.volumes.push({
    ...setup.snapshot.volumes[0],
    name: 'new-pv',
    uid: 'new-pv-uid',
    claimUID: 'new-claim-uid',
    path: '/var/lib/rancher/k3s/storage/new-pv',
  });
  setup.snapshot.docker.filesystem.claimPaths.push({
    path: '/var/lib/rancher/k3s/storage/new-pv',
    device: '8:1',
  });
  source = source.replace(
    '          securityContext:',
    '          volumeMounts:\n            - name: new-storage\n              mountPath: /state\n          securityContext:',
  );
  setup.snapshot.pods[0].volumes = [
    { name: 'new-storage', persistentVolumeClaim: { claimName: 'new-storage' } },
  ];
  setup.snapshot.pods[0].mounts = [{ name: 'new-storage', mountPath: '/state' }];
  candidate.storageMiB = 512;
  candidate.artifactSHA256 = createHash('sha256').update(source).digest('hex');
  await writeFile(candidate.artifactPath, source);
}

it('selected new PVC must bind the observed local filesystem device', async () => {
  const setup = await fixture();
  await bindSelectedPVC(setup);
  setup.snapshot.docker.filesystem.claimPaths[1].device = 'foreign-device';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: storage-filesystem-mismatch');
});

it('every selected candidate node must have current capacity evidence', async () => {
  const setup = await fixture();
  setup.request.candidate[0].node = 'other';
  setup.snapshot.nodes.push({
    ...setup.snapshot.nodes[0],
    name: 'other',
    uid: 'other-node-uid',
    machineID: 'other-machine',
    labels: { 'puni.dev/capability-observability': 'other' },
  });
  await rewriteCandidate(setup, (source) =>
    source.replace(
      'puni.dev/capability-observability: "true"',
      'puni.dev/capability-observability: "other"',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: capacity-scope-mismatch');
});

it('cutover assessment cannot age past freshness after inventory reads complete', async () => {
  const setup = await fixture();
  const started = Date.now();
  let readComplete = false;
  let afterRead = 0;
  expect(
    await rejection(
      setup.direct(
        (command, response) => {
          if (command.executable === 'ssh') readComplete = true;
          return { ...response, observedAt: new Date(started).toISOString() };
        },
        () => new Date(started + (readComplete && ++afterRead >= 4 ? 60000 : 0)),
      ),
    ),
  ).toContain('inventory-stale');
});

it('cyclic controller UID ownership refuses without traversing indefinitely', async () => {
  const setup = await fixture();
  Object.assign(setup.snapshot.resources[8], {
    owner: '',
    ownerNamespace: '',
    ownerUID: 'cycle-uid',
  });
  setup.snapshot.resources.push({
    ...setup.snapshot.resources[8],
    kind: 'Elasticsearch',
    name: 'cycle',
    uid: 'cycle-uid',
    ownerUID: 'new-deployment-uid',
  });
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: ownership-mismatch');
});

it('CLI rejects unreviewed argument shapes before reading any target', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      join(root, 'tools/tool-fleet/src/observability-preflight-cli.ts'),
      '--unexpected',
    ],
    { env: cliEnvironment(), stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(1);
  expect(stdout).toBe('');
  expect(stderr.trim()).toBe(
    'observability preflight: usage: --request <path> --output <new-path> --ssh-transport <path>',
  );
});

it('common nodeSelector placement does not require a scheduler-bypassing nodeName', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      'nodeName: h3mon',
      'nodeSelector:\n        puni.dev/capability-observability: "true"',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
});

it('actual common blackbox Deployment selector and owned scheduled ReplicaSet pod admit prerequisites', async () => {
  const setup = await fixture();
  const commonSource = await readFile(
    join(root, 'infra/platform/observability/prometheus/blackbox-exporter.yaml'),
    'utf8',
  );
  const documents = parseAllDocuments(commonSource).map(
    (document) =>
      document.toJSON() as {
        kind: string;
        metadata: { name: string };
        spec: { template: { spec: { containers: { image: string }[] } } };
      },
  );
  const workload = documents.find((document) => document.kind === 'Deployment');
  if (workload === undefined) throw new Error('required common blackbox Deployment missing');
  const candidate = setup.request.candidate[0];
  candidate.name = workload.metadata.name;
  candidate.memoryMiB = 64;
  candidate.cpuMilli = 10;
  const source = commonSource;
  candidate.artifactSHA256 = createHash('sha256').update(source).digest('hex');
  await writeFile(candidate.artifactPath, source);
  setup.snapshot.resources[8].name = workload.metadata.name;
  const pin = setup.request.resources.find((resource) => resource.uid === 'new-deployment-uid');
  if (pin === undefined) throw new Error('fixture deployment pin missing');
  pin.name = workload.metadata.name;
  setup.snapshot.resources.push({
    ...setup.snapshot.resources[8],
    kind: 'ReplicaSet',
    name: 'blackbox-hash',
    uid: 'blackbox-rs-uid',
    owner: '',
    ownerNamespace: '',
    ownerUID: 'new-deployment-uid',
  });
  setup.snapshot.pods[0].name = `${workload.metadata.name}-hash-pod`;
  setup.snapshot.pods[0].ownerUID = 'blackbox-rs-uid';
  setup.snapshot.pods[0].images = [workload.spec.template.spec.containers[0].image];
  setup.snapshot.pods[0].imageIDs = [
    `docker-pullable://${workload.spec.template.spec.containers[0].image}`,
  ];
  setup.snapshot.pods[0].containerNames = ['blackbox-exporter'];
  setup.snapshot.pods[0].volumes = [{ name: 'config', configMap: { name: 'blackbox-exporter' } }];
  setup.snapshot.pods[0].mounts = [{ name: 'config', mountPath: '/config', readOnly: true }];
  candidate.replicaUIDs = ['pod-uid'];
  setup.snapshot.pods[0].requests = ['16Mi'];
  setup.snapshot.pods[0].limits = ['64Mi'];
  setup.snapshot.pods[0].cpuRequests = ['10m'];
  setup.snapshot.pods[0].cpuLimits = ['200m'];
  setup.snapshot.pods[0].initRequests = [];
  setup.snapshot.pods[0].initLimits = [];
  setup.snapshot.pods[0].initCPUs = [];
  setup.snapshot.pods[0].initCPULimits = [];
  const spec = projectFixturePod(setup.snapshot.pods[0]).spec as typeof WorkloadSpec.infer;
  spec.automountServiceAccountToken = false;
  setup.snapshot.pods[0].specOverride = spec;
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
});

for (const [name, fault, diagnostic] of [
  [
    'source selector must match actual node labels',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.nodes[0].labels['puni.dev/capability-observability'] = 'false';
    },
    'candidate-placement-mismatch',
  ],
  [
    'unconstrained source placement cannot become observed node evidence',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await rewriteCandidate(s, (source) =>
        source.replace(
          '      nodeSelector:\n        puni.dev/capability-observability: "true"\n',
          '',
        ),
      );
    },
    'candidate-placement-unknown',
  ],
  [
    'source emptyDir without sizeLimit remains a concrete blocker',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await rewriteCandidate(s, (source) =>
        source.replace(
          '      containers:',
          '      volumes:\n        - name: scratch\n          emptyDir: {}\n      containers:',
        ),
      );
    },
    'candidate-emptydir-unbounded',
  ],
  [
    'unbounded writable source filesystem refuses',
    async (s: Awaited<ReturnType<typeof fixture>>) => {
      await rewriteCandidate(s, (source) =>
        source.replace(
          '          securityContext:\n            readOnlyRootFilesystem: true\n',
          '',
        ),
      );
    },
    'candidate-ephemeral-unbounded',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('bounded disk emptyDir demand is source-bound and charged to observed free capacity', async () => {
  const setup = await fixture();
  setup.request.candidate[0].ephemeralMiB = 64;
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      volumes:\n        - name: scratch\n          emptyDir:\n            sizeLimit: 64Mi\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.storage.requiredMiB).toBe(1088);
  expect(receipt.migrationReady).toBe(false);
});

it('bounded memory emptyDir demand is charged to memory rather than disk', async () => {
  const setup = await fixture();
  setup.request.candidate[0].memoryMiB = 3072;
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      volumes:\n        - name: scratch\n          emptyDir:\n            medium: Memory\n            sizeLimit: 3Gi\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.capacity[0].requiredMiB).toBe(6272);
  expect(receipt.storage.requiredMiB).toBe(1024);
});

it('small caller ephemeral allowance cannot replace bounded source scratch demand', async () => {
  const setup = await fixture();
  setup.request.candidate[0].ephemeralMiB = 1;
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      volumes:\n        - name: scratch\n          emptyDir:\n            sizeLimit: 64Mi\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: candidate-ephemeral-mismatch');
});

it('nodeName cannot bypass WaitForFirstConsumer for a selected new PVC', async () => {
  const setup = await fixture();
  await bindSelectedPVC(setup);
  await rewriteCandidate(setup, (source) =>
    source.replace(
      'nodeSelector:\n        puni.dev/capability-observability: "true"',
      'nodeName: h3mon',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe(
    'observability preflight: candidate-placement-bypasses-scheduler',
  );
});

it('owned pod scheduled elsewhere cannot certify selected placement', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].node = 'other';
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
});

it('required node affinity validates its In expression against the observed node', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      'nodeSelector:\n        puni.dev/capability-observability: "true"',
      'affinity:\n        nodeAffinity:\n          requiredDuringSchedulingIgnoredDuringExecution:\n            nodeSelectorTerms:\n              - matchExpressions:\n                  - key: puni.dev/capability-observability\n                    operator: In\n                    values: ["true"]',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
});

it('unknown required affinity semantics refuse instead of guessing placement', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      'nodeSelector:\n        puni.dev/capability-observability: "true"',
      'affinity:\n        nodeAffinity:\n          requiredDuringSchedulingIgnoredDuringExecution:\n            nodeSelectorTerms:\n              - matchExpressions:\n                  - key: puni.dev/capability-observability\n                    operator: NotIn\n                    values: ["true"]',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr.trim()).toBe('observability preflight: candidate-placement-unsupported');
});

it('soft anti-affinity does not invent a hard admission restriction', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      affinity:\n        podAntiAffinity:\n          preferredDuringSchedulingIgnoredDuringExecution: []\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
});

it('bounded container ephemeral allowance covers shared scratch without charging the bytes twice', async () => {
  const setup = await fixture();
  setup.request.candidate[0].ephemeralMiB = 128;
  await rewriteCandidate(setup, (source) =>
    source
      .replace(
        '      containers:',
        '      volumes:\n        - name: scratch\n          emptyDir:\n            sizeLimit: 64Mi\n      containers:',
      )
      .replace(
        '            limits:\n',
        '            limits:\n              ephemeral-storage: 128Mi\n',
      ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.storage.requiredMiB).toBe(1152);
});

for (const [name, change, diagnostic] of [
  [
    'unsupported scratch medium refuses a guessed storage dimension',
    (source: string) =>
      source.replace(
        '      containers:',
        '      volumes:\n        - name: scratch\n          emptyDir:\n            medium: HugePages\n            sizeLimit: 64Mi\n      containers:',
      ),
    'candidate-emptydir-unbounded',
  ],
  [
    'zero ephemeral limit cannot mean a bounded writable allowance',
    (source: string) =>
      source.replace(
        '            limits:\n',
        '            limits:\n              ephemeral-storage: "0"\n',
      ),
    'candidate-ephemeral-unbounded',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await rewriteCandidate(setup, change);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('an unready owned pod remains a blocker despite a Ready controller', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].ready = false;
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-placement-unobserved-or-unready');
});

for (const [name, fault] of [
  [
    'unknown current memory bounds refuse',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].limits = ['1Gi', '4Gi'];
    },
  ],
  [
    'unbounded current memory limit refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.pods[0].limits = ['0'];
    },
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe('observability preflight: memory-unknown');
  });
}

function setupResourceSources(
  resources: {
    kind: string;
    name: string;
    namespace: string;
    path: string;
    sourceName: string;
    sourceKind: string;
    sourceNamespace: string;
    releaseName: string;
    releaseNamespace: string;
  }[],
): void {
  for (const resource of resources) {
    if (['Kustomization', 'HelmRelease'].includes(resource.kind)) {
      if (resource.kind === 'Kustomization')
        resource.path = './infra/platform/observability/production';
      resource.sourceName = 'puni-platform';
      resource.sourceKind = 'GitRepository';
      resource.sourceNamespace = 'flux-system';
    }
    if (resource.kind === 'HelmRelease') {
      resource.releaseName = resource.name;
      resource.releaseNamespace = resource.namespace;
    }
  }
}

for (const [name, fault, diagnostic] of [
  [
    'changed controller owner UID refuses despite unchanged labels',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[8].ownerUID = 'foreign-controller-uid';
    },
    'ownership-mismatch',
  ],
  [
    'observed Flux sourceRef cannot drift from the pinned Git source',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].sourceName = 'foreign-source';
    },
    'source-mismatch',
  ],
  [
    'observed Flux path cannot drift from the reviewed graph',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].path = './foreign/path';
    },
    'source-mismatch',
  ],
  [
    'actual Flux dependency absent from inventory refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].dependencies = [
        { name: 'absent-platform', namespace: 'flux-system' },
      ];
    },
    'dependency-unready',
  ],
  [
    'actual Flux dependency cannot be omitted from reviewed UID pins',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].dependencies = [{ name: 'new-platform', namespace: 'flux-system' }];
      s.snapshot.resources.push({
        ...s.snapshot.resources[1],
        name: 'new-platform',
        uid: 'platform-dep-uid',
        dependencies: [],
      });
    },
    'dependency-unreviewed',
  ],
  [
    'cyclic Flux dependency graph refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].dependencies = [{ name: 'observability', namespace: 'flux-system' }];
    },
    'dependency-cycle',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr.trim()).toBe(`observability preflight: ${diagnostic}`);
  });
}

it('fix1 mutable canonical target cannot be replaced by matching declarative identity', async () => {
  const setup = await fixture();
  setup.snapshot.identity.immutable = false;
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('target-mismatch');
});

it('fix1 omitted actual Flux owner refuses even when caller selects other ready resources', async () => {
  const setup = await fixture();
  setup.request.resources = setup.request.resources.filter((pin) => pin.kind !== 'Kustomization');
  setup.snapshot.resources[1].ready = false;
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('flux-owner-unreviewed');
});

it('fix1 empty applied revision cannot bypass a revision-bearing prerequisite', async () => {
  const setup = await fixture();
  setup.request.resources[1].requiredRevision = '';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('revision-pin-required');
});

it('fix1 old named pod resources cannot establish the selected candidate readiness', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].requests = ['1Gi'];
  setup.snapshot.pods[0].limits = ['1Gi'];
  setup.snapshot.pods[0].cpuRequests = ['250m'];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
});

function projectFixturePod(pod: {
  uid: string;
  name: string;
  namespace: string;
  node: string;
  phase: string;
  ready: boolean;
  ownerUID: string;
  imageIDs: string[];
  images: string[];
  requests: string[];
  limits: string[];
  cpuRequests: string[];
  cpuLimits: string[];
  initRequests: string[];
  initLimits: string[];
  initCPUs: string[];
  initCPULimits: string[];
  overhead: string;
  overheadCPU: string;
  deleting?: boolean;
  specOverride?: unknown;
  containerNames?: string[];
  mounts?: unknown[];
  volumes?: unknown[];
  restartableInit?: boolean;
}) {
  const containers = pod.requests.map((memory, index) => ({
    name: pod.containerNames?.[index] ?? 'collector',
    image: pod.images[index] ?? '',
    resources: {
      requests: { memory, cpu: pod.cpuRequests[index] ?? '' },
      limits: { memory: pod.limits[index] ?? '', cpu: pod.cpuLimits[index] ?? '' },
    },
    securityContext: { readOnlyRootFilesystem: true },
    volumeMounts: pod.mounts ?? [],
  }));
  const initContainers = pod.initRequests.map((memory, index) => ({
    name: `init-${String(index)}`,
    image: 'synthetic:init',
    resources: {
      requests: { memory, cpu: pod.initCPUs[index] ?? '' },
      limits: { memory: pod.initLimits[index] ?? '', cpu: pod.initCPULimits[index] ?? '' },
    },
    securityContext: { readOnlyRootFilesystem: true },
    ...(pod.restartableInit ? { restartPolicy: 'Always' } : {}),
  }));
  return {
    uid: pod.uid,
    name: pod.name,
    namespace: pod.namespace,
    node: pod.node,
    phase: pod.phase,
    ready: pod.ready,
    deleting: pod.deleting ?? false,
    ownerUID: pod.ownerUID,
    imageIDs: pod.imageIDs,
    spec: pod.specOverride ?? {
      containers,
      initContainers,
      volumes: pod.volumes ?? [],
      overhead: { memory: pod.overhead, cpu: pod.overheadCPU },
    },
  };
}

async function prepareFixReplicas(
  setup: Awaited<ReturnType<typeof fixture>>,
  count = 2,
): Promise<void> {
  await rewriteCandidate(setup, (source) =>
    source
      .replace('replicas: 1', `replicas: ${String(count)}`)
      .replaceAll('memory: 2Gi', 'memory: 1Gi')
      .replace('requests:\n              cpu: 500m', 'requests:\n              cpu: 250m'),
  );
  setup.request.candidate[0].memoryMiB = count * 1024;
  setup.request.candidate[0].cpuMilli = count * 250;
  const pod = setup.snapshot.pods[0];
  pod.requests = ['1Gi'];
  pod.limits = ['1Gi'];
  pod.cpuRequests = ['250m'];
  pod.name = 'new-first';
  for (let index = 1; index < count; index += 1)
    setup.snapshot.pods.push({
      ...structuredClone(pod),
      uid: `pod-${String(index)}`,
      name: `new-${String(index)}`,
    });
  setup.request.candidate[0].replicaUIDs = setup.snapshot.pods.map((replica) => replica.uid);
  setup.snapshot.nodes[0].allocatable = '4Gi';
}

it('fix1 two complete owned replicas fit without duplicate candidate charges', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.capacity[0].requiredMiB).toBe(3200);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(0);
});

it('fix1 partial replicas retain current cost and reserve only the missing replica', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.snapshot.pods.pop();
  setup.request.candidate[0].replicaUIDs = ['pod-uid'];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.capacity[0].requiredMiB).toBe(3200);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(1024);
  expect(receipt.blockers).toContain('candidate-replica-count-mismatch');
});

it('fix1 omitted active replica UID cannot certify the complete observed set', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.request.candidate[0].replicaUIDs.pop();
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-replicas-unreviewed');
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(0);
});

it('fix1 foreign replica UID cannot suppress a missing owned replica', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.request.candidate[0].replicaUIDs[1] = 'foreign-uid';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('replica-pin-mismatch');
});

it('fix1 old-template replica remains charged alongside its required replacement', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.snapshot.pods[1].requests = ['512Mi'];
  setup.snapshot.pods[1].limits = ['512Mi'];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.capacity[0].requiredMiB).toBe(3712);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(1024);
  expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
});

it('fix1 terminating replica cannot disappear or satisfy a replacement slot', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.snapshot.pods[1].deleting = true;
  setup.snapshot.pods[1].phase = 'Succeeded';
  setup.snapshot.nodes[0].allocatable = '6Gi';
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.capacity[0].requiredMiB).toBe(4224);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(1024);
});

it('fix1 generic ephemeral storage is refused rather than silently costed at zero', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      volumes:\n        - name: unbounded-storage\n          ephemeral:\n            volumeClaimTemplate:\n              spec:\n                resources:\n                  requests:\n                    storage: 20Gi\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('workload-volume-unsupported');
});

it('fix1 explicit source overhead cannot vanish from declared resource cost', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      overhead:\n        memory: 1Gi\n        cpu: 250m\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('candidate-budget-mismatch');
});

it('fix1 supported overhead is shared by source and observed replica accounting', async () => {
  const setup = await fixture();
  setup.request.candidate[0].memoryMiB = 3072;
  setup.request.candidate[0].cpuMilli = 750;
  setup.snapshot.pods[0].overhead = '1Gi';
  setup.snapshot.pods[0].overheadCPU = '250m';
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      overhead:\n        memory: 1Gi\n        cpu: 250m\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.capacity[0].requiredMiB).toBe(4224);
  expect(receipt.capacity[0].requiredCPUMilli).toBe(1350);
});

async function prepareFixClaim(setup: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  await bindSelectedPVC(setup);
}

it('fix1 an existing matching claim is accounted by identity rather than a pod-wide exemption', async () => {
  const setup = await fixture();
  await prepareFixClaim(setup);
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.storage.requiredMiB).toBe(1024);
});

it('fix1 old claim mount cannot certify the source claim even when both claims exist', async () => {
  const setup = await fixture();
  await prepareFixClaim(setup);
  setup.snapshot.pods[0].mounts = [];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(2048);
});

it('fix1 omitted claim identity remains charged and blocks readiness independently of replica pins', async () => {
  const setup = await fixture();
  await prepareFixClaim(setup);
  setup.request.candidate[0].claims = [];
  const response = await setup.run();
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(false);
  expect(receipt.storage.requiredMiB).toBe(1536);
  expect(receipt.blockers).toContain('candidate-storage-unready-or-unreviewed');
});

async function prepareFixServiceAccount(setup: Awaited<ReturnType<typeof fixture>>) {
  await rewriteCandidate(setup, (source) =>
    source.replace('      containers:', '      serviceAccountName: discovery\n      containers:'),
  );
  const spec = projectFixturePod(setup.snapshot.pods[0]).spec as typeof WorkloadSpec.infer;
  spec.serviceAccountName = 'discovery';
  spec.automountServiceAccountToken = true;
  spec.volumes = [
    {
      name: 'kube-api-access-abc12',
      projected: {
        defaultMode: 420,
        sources: [
          { serviceAccountToken: { path: 'token', expirationSeconds: 3607 } },
          { configMap: { name: 'kube-root-ca.crt', items: [{ key: 'ca.crt', path: 'ca.crt' }] } },
          {
            downwardAPI: {
              items: [{ path: 'namespace', fieldRef: { fieldPath: 'metadata.namespace' } }],
            },
          },
        ],
      },
    },
  ];
  spec.containers[0].volumeMounts = [
    {
      name: 'kube-api-access-abc12',
      mountPath: '/var/run/secrets/kubernetes.io/serviceaccount',
      readOnly: true,
    },
  ];
  setup.snapshot.pods[0].specOverride = spec;
  return spec;
}

it('fix1 standard admission-added service-account projection is supported without reading token contents', async () => {
  const setup = await fixture();
  await prepareFixServiceAccount(setup);
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
});

for (const [name, change] of [
  [
    'fix1 altered admission projection source is not omitted',
    (spec: typeof WorkloadSpec.infer) => {
      const source = spec.volumes?.[0].projected?.sources[1].configMap;
      if (source === undefined) throw new Error('fixture projection missing');
      source.name = 'foreign-ca';
    },
  ],
  [
    'fix1 altered admission mount is not omitted',
    (spec: typeof WorkloadSpec.infer) => {
      const mount = spec.containers[0].volumeMounts?.[0];
      if (mount === undefined) throw new Error('fixture mount missing');
      mount.mountPath = '/other/path';
    },
  ],
  [
    'fix1 extra admission mount is not omitted',
    (spec: typeof WorkloadSpec.infer) => {
      spec.containers[0].volumeMounts?.push({
        name: 'kube-api-access-abc12',
        mountPath: '/other/path',
        readOnly: true,
      });
    },
  ],
  [
    'fix1 service-account identity cannot be normalized into the source account',
    (spec: typeof WorkloadSpec.infer) => {
      spec.serviceAccountName = 'foreign-account';
    },
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    const spec = await prepareFixServiceAccount(setup);
    change(spec);
    const response = await setup.run();
    expect(response.exitCode).toBe(0);
    const receipt = JSON.parse(
      await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
    ) as ReceiptView;
    expect(receipt.migrationReady).toBe(false);
    expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
  });
}

for (const [name, fault, diagnostic] of [
  [
    'fix1 canonical marker wrong name refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.identity.name = 'puni-cluster-identity';
    },
    'target-mismatch',
  ],
  [
    'fix1 canonical marker wrong namespace refuses',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.identity.namespace = 'flux-system';
    },
    'target-mismatch',
  ],
  [
    'fix1 canonical marker missing cannot fall back to declarative configuration',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      Object.assign(s.snapshot, {
        canonicalMissing: true,
        declarativeIdentity: {
          ...s.snapshot.identity,
          name: 'puni-cluster-identity',
          namespace: 'flux-system',
          immutable: false,
        },
      });
    },
    'command-failed',
  ],
  [
    'fix1 full Flux source kind is bound',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].sourceKind = 'OCIRepository';
    },
    'source-mismatch',
  ],
  [
    'fix1 full Flux source namespace is bound',
    (s: Awaited<ReturnType<typeof fixture>>) => {
      s.snapshot.resources[1].sourceNamespace = 'foreign-namespace';
    },
    'source-mismatch',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await injectFault(fault, setup);
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr).toContain(diagnostic);
  });
}

it('fix1 shared prerequisite may retain its independently reviewed earlier revision', async () => {
  const setup = await fixture();
  const prerequisite = setup.snapshot.resources.find(
    (resource) => resource.name === 'platform' && resource.kind === 'Kustomization',
  );
  const pin = setup.request.resources.find((resource) => resource.uid === prerequisite?.uid);
  if (prerequisite === undefined || pin === undefined)
    throw new Error('fixture prerequisite missing');
  prerequisite.revision = `main@sha1:${'c'.repeat(40)}`;
  pin.requiredRevision = prerequisite.revision;
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.candidateRevision).toBe(revision);
});

for (const [name, addition, diagnostic] of [
  [
    'fix1 source CSI is explicitly refused',
    '      volumes:\n        - name: csi-demand\n          csi:\n            driver: example.invalid\n',
    'workload-volume-unsupported',
  ],
  [
    'fix1 source runtime class is explicitly refused',
    '      runtimeClassName: unknown-runtime\n',
    'workload-shape-unsupported',
  ],
  [
    'fix1 source pod-level resources are explicitly refused',
    '      resources:\n        requests:\n          memory: 20Gi\n',
    'workload-shape-unsupported',
  ],
  [
    'fix1 source missing volume variant is explicitly refused',
    '      volumes:\n        - name: missing-kind\n',
    'workload-volume-unsupported',
  ],
  [
    'fix1 source multiple volume variants are explicitly refused',
    '      volumes:\n        - name: two-kinds\n          configMap:\n            name: public-config\n          secret:\n            secretName: secret-reference-only\n',
    'workload-volume-unsupported',
  ],
  [
    'fix1 source duplicate volume names are explicitly refused',
    '      volumes:\n        - name: duplicate\n          configMap:\n            name: one\n        - name: duplicate\n          configMap:\n            name: two\n',
    'workload-volume-unsupported',
  ],
  [
    'fix1 source malformed projection variants are explicitly refused',
    '      volumes:\n        - name: projected\n          projected:\n            sources:\n              - configMap:\n                  name: one\n                secret:\n                  name: two\n',
    'workload-volume-unsupported',
  ],
  [
    'fix1 source resource-field projection is explicitly refused',
    '      volumes:\n        - name: projected\n          projected:\n            sources:\n              - downwardAPI:\n                  items:\n                    - path: memory\n                      resourceFieldRef:\n                        resource: limits.memory\n',
    'workload-volume-unsupported',
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    await rewriteCandidate(setup, (source) =>
      source.replace('      containers:', addition + '      containers:'),
    );
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr).toContain(diagnostic);
  });
}

it('fix1 unknown mount reference is explicitly refused', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '          image:',
      '          volumeMounts:\n            - name: absent-volume\n              mountPath: /scratch\n          image:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('workload-mount-unknown');
});

it('fix1 duplicate named containers are explicitly refused', async () => {
  const setup = await fixture();
  const spec = projectFixturePod(setup.snapshot.pods[0]).spec as typeof WorkloadSpec.infer;
  spec.containers.push(structuredClone(spec.containers[0]));
  setup.snapshot.pods[0].specOverride = spec;
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('workload-container-duplicate');
});

it('fix1 duplicate observed physical UID cannot count as two replicas', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  setup.snapshot.pods[1].uid = setup.snapshot.pods[0].uid;
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('replica-state-unknown');
});

for (const [name, change] of [
  [
    'fix1 named container identity must match source',
    (spec: typeof WorkloadSpec.infer) => {
      spec.containers[0].name = 'old-container';
    },
  ],
  [
    'fix1 named init resources must match source',
    (spec: typeof WorkloadSpec.infer) => {
      spec.initContainers = [{ ...structuredClone(spec.containers[0]), name: 'old-init' }];
    },
  ],
] as const) {
  it(name, async () => {
    const setup = await fixture();
    const spec = projectFixturePod(setup.snapshot.pods[0]).spec as typeof WorkloadSpec.infer;
    change(spec);
    setup.snapshot.pods[0].specOverride = spec;
    const response = await setup.run();
    expect(response.exitCode).toBe(0);
    const receipt = JSON.parse(
      await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
    ) as ReceiptView;
    expect(receipt.migrationReady).toBe(false);
    expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
  });
}

it('fix1 source claim must be mounted by a named container', async () => {
  const setup = await fixture();
  await prepareFixClaim(setup);
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '          volumeMounts:\n            - name: new-storage\n              mountPath: /state\n',
      '',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('workload-claim-unmounted');
});

it('fix1 source CPU overhead cannot vanish independently of memory', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace('      containers:', '      overhead:\n        cpu: 250m\n      containers:'),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('candidate-cpu-mismatch');
});

it('fix1 StatefulSet replicas bind exact source ordinal identities', async () => {
  const setup = await fixture();
  await prepareFixReplicas(setup);
  await rewriteCandidate(setup, (source) =>
    source.replace('kind: Deployment', 'kind: StatefulSet'),
  );
  setup.request.candidate[0].kind = 'StatefulSet';
  const resource = setup.snapshot.resources.find((entry) => entry.uid === 'new-deployment-uid');
  const pin = setup.request.resources.find((entry) => entry.uid === 'new-deployment-uid');
  if (resource === undefined || pin === undefined) throw new Error('fixture controller missing');
  resource.kind = 'StatefulSet';
  pin.kind = 'StatefulSet';
  setup.snapshot.pods.forEach((pod, index) => {
    pod.name = `new-${String(index)}`;
  });
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
  expect(receipt.capacity[0].additionalCandidateMiB).toBe(0);
});

it('fix1 observed CPU limit must remain finite and cover its request', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].cpuLimits = ['0'];
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('cpu-unknown');
});

it('fix1 source claim pins cannot repeat the same claim identity', async () => {
  const setup = await fixture();
  await prepareFixClaim(setup);
  setup.request.candidate[0].claims.push(structuredClone(setup.request.candidate[0].claims[0]));
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('candidate-storage-pin-unused');
});

it('fix1 missing actual UID parent cannot be replaced by matching ownership labels', async () => {
  const setup = await fixture();
  const resource = setup.snapshot.resources.find((entry) => entry.uid === 'new-deployment-uid');
  const pin = setup.request.resources.find((entry) => entry.uid === 'new-deployment-uid');
  if (resource === undefined || pin === undefined) throw new Error('fixture controller missing');
  resource.ownerUID = 'absent-parent';
  pin.ownerUID = 'absent-parent';
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('flux-owner-unreviewed');
});

it('fix1 zero emptyDir size cannot become bounded zero-cost demand', async () => {
  const setup = await fixture();
  await rewriteCandidate(setup, (source) =>
    source.replace(
      '      containers:',
      '      volumes:\n        - name: scratch\n          emptyDir:\n            sizeLimit: "0"\n      containers:',
    ),
  );
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('candidate-emptydir-unbounded');
});

for (const length of [1, 3]) {
  it(`fix2 populated-label actual owner UID cycle of length ${String(length)} refuses`, async () => {
    const setup = await fixture();
    const first = setup.snapshot.resources.find((entry) => entry.uid === 'new-deployment-uid');
    const pin = setup.request.resources.find((entry) => entry.uid === first?.uid);
    if (first === undefined || pin === undefined) throw new Error('fixture workload missing');
    let parent = first;
    for (let index = 1; index < length; index += 1) {
      const next = {
        ...first,
        name: `cycle-${String(index)}`,
        uid: `cycle-${String(index)}`,
        ownerUID: '',
      };
      setup.snapshot.resources.push(next);
      parent.ownerUID = next.uid;
      parent = next;
    }
    parent.ownerUID = first.uid;
    pin.ownerUID = first.ownerUID;
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr).toContain('ownership-cycle');
  });
}

function prepareFixHelmDependency(setup: Awaited<ReturnType<typeof fixture>>) {
  const release = setup.snapshot.resources.find((entry) => entry.kind === 'HelmRelease');
  if (release === undefined) throw new Error('fixture Helm release missing');
  const dependency = {
    ...release,
    name: 'shared-helm-prerequisite',
    uid: 'shared-helm-uid',
    chart: 'shared-chart',
    controllerEnabled: false,
    releaseName: 'shared-helm',
    dependencies: [] as { name: string; namespace: string }[],
    revision: '1.2.3',
  };
  setup.snapshot.resources.push(dependency);
  release.dependencies = [{ name: dependency.name, namespace: dependency.namespace }];
  const {
    kind,
    name,
    namespace,
    uid,
    owner,
    ownerNamespace,
    ownerUID,
    path,
    revision: requiredRevision,
  } = dependency;
  setup.request.resources.push({
    kind,
    name,
    namespace,
    uid,
    owner,
    ownerNamespace,
    ownerUID,
    path,
    requiredRevision,
  });
  return { release, dependency };
}

for (const fault of [
  'missing',
  'unreviewed',
  'unready',
  'cycle',
  'revision',
  'blank-revision',
  'identity',
] as const) {
  it(`fix2 HelmRelease recursive dependency ${fault} refuses`, async () => {
    const setup = await fixture();
    const { release, dependency } = prepareFixHelmDependency(setup);
    if (fault === 'missing') {
      setup.snapshot.resources = setup.snapshot.resources.filter(
        (entry) => entry.uid !== dependency.uid,
      );
      setup.request.resources = setup.request.resources.filter(
        (entry) => entry.uid !== dependency.uid,
      );
    }
    if (fault === 'unreviewed')
      setup.request.resources = setup.request.resources.filter(
        (entry) => entry.uid !== dependency.uid,
      );
    if (fault === 'unready') dependency.ready = false;
    if (fault === 'cycle')
      dependency.dependencies = [{ name: release.name, namespace: release.namespace }];
    if (fault === 'revision') dependency.revision = '1.2.4';
    if (fault === 'blank-revision') {
      const pin = setup.request.resources.find((entry) => entry.uid === dependency.uid);
      if (pin === undefined) throw new Error('fixture pin missing');
      pin.requiredRevision = '';
    }
    if (fault === 'identity') release.dependencies[0].namespace = 'other-namespace';
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr).toContain(
      fault === 'cycle'
        ? 'dependency-cycle'
        : fault === 'unreviewed'
          ? 'dependency-unreviewed'
          : fault === 'blank-revision'
            ? 'revision-pin-required'
            : 'dependency-unready',
    );
  });
}

it('fix2 HelmRelease prerequisite keeps its independently reviewed earlier chart revision', async () => {
  const setup = await fixture();
  prepareFixHelmDependency(setup);
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
});

for (const selected of [false, true]) {
  it(`fix2 ${selected ? 'selected' : 'unrelated'} other-node unsupported pod stays outside admitted cost scope`, async () => {
    const setup = await fixture();
    const pod = structuredClone(setup.snapshot.pods[0]);
    pod.node = 'unselected-node';
    pod.limits = ['0'];
    pod.specOverride = { ...projectFixturePod(pod).spec, unsupported: true };
    if (selected) setup.snapshot.pods[0] = pod;
    else {
      pod.uid = 'unrelated-pod';
      pod.ownerUID = 'unrelated-controller';
      setup.snapshot.pods.push(pod);
    }
    const response = await setup.run();
    expect(response.stderr).toBe('');
    expect(response.exitCode).toBe(0);
    const receipt = JSON.parse(
      await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
    ) as ReceiptView & { observed: { pods: { uid: string }[] } };
    expect(receipt.observed.pods).toHaveLength(selected ? 1 : 2);
    expect(receipt.migrationReady).toBe(!selected);
    if (selected) expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
  });
}

it('fix2 selected-node unknown workload costs still refuse', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].limits = ['0'];
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('memory-unknown');
});

async function writeFixSpec(
  setup: Awaited<ReturnType<typeof fixture>>,
  spec: typeof WorkloadSpec.infer,
) {
  await rewriteCandidate(setup, () =>
    JSON.stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'new', namespace: 'observability' },
      spec: {
        replicas: 1,
        template: {
          spec: { ...spec, nodeSelector: { 'puni.dev/capability-observability': 'true' } },
        },
      },
    }),
  );
}
for (const side of ['source', 'observed'] as const)
  for (const file of ['ca', 'namespace'] as const) {
    it(`fix2 ${side} service-account ${file} file mode zero is not normalized away`, async () => {
      const setup = await fixture();
      const observed = await prepareFixServiceAccount(setup);
      const source = structuredClone(observed);
      const selected = side === 'source' ? source : observed;
      const projection = selected.volumes?.[0].projected;
      const entry =
        file === 'ca'
          ? projection?.sources[1].configMap?.items?.[0]
          : projection?.sources[2].downwardAPI?.items[0];
      if (entry === undefined) throw new Error('fixture projection file missing');
      Object.assign(entry, { mode: 0 });
      await writeFixSpec(setup, source);
      const response = await setup.run();
      expect(response.stderr).toBe('');
      expect(response.exitCode).toBe(0);
      const receipt = JSON.parse(
        await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
      ) as ReceiptView;
      expect(receipt.migrationReady).toBe(false);
      expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
    });
  }

for (const field of ['sourceKind', 'sourceNamespace', 'sourceName'] as const) {
  it(`fix2 actual Helm chart ${field} cannot drift from the reviewed Git source`, async () => {
    const setup = await fixture();
    const { dependency } = prepareFixHelmDependency(setup);
    dependency[field] = 'foreign-source';
    const response = await setup.run();
    expect(response.exitCode).toBe(1);
    expect(response.stderr).toContain('source-mismatch');
  });
}

it('fix2 explicit standard file modes remain eligible for the admission exception', async () => {
  const setup = await fixture();
  const observed = await prepareFixServiceAccount(setup);
  const source = structuredClone(observed);
  const projection = source.volumes?.[0].projected;
  const ca = projection?.sources[1].configMap?.items?.[0];
  const namespace = projection?.sources[2].downwardAPI?.items[0];
  if (ca === undefined || namespace === undefined) throw new Error('fixture files missing');
  ca.mode = 420;
  namespace.mode = 420;
  await writeFixSpec(setup, source);
  const response = await setup.run();
  expect(response.stderr).toBe('');
  expect(response.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
  ) as ReceiptView;
  expect(receipt.migrationReady).toBe(true);
});

for (const kind of ['secret', 'configMap', 'downwardAPI'] as const) {
  it(`fix2 explicit projected ${kind} file modes remain part of workload identity`, async () => {
    const setup = await fixture();
    const observed = await prepareFixServiceAccount(setup);
    const source = structuredClone(observed);
    const mode = 0;
    const items = [{ key: 'reference-key', path: 'reference-path', mode }];
    const sourceEntry =
      kind === 'downwardAPI'
        ? {
            downwardAPI: {
              items: [{ path: 'namespace', fieldRef: { fieldPath: 'metadata.namespace' }, mode }],
            },
          }
        : { [kind]: { name: 'reference-only', items } };
    source.volumes = [{ name: 'explicit-projection', projected: { sources: [sourceEntry] } }];
    observed.volumes = structuredClone(source.volumes);
    const entry = observed.volumes[0].projected?.sources[0];
    const file =
      kind === 'downwardAPI'
        ? entry?.downwardAPI?.items[0]
        : kind === 'secret'
          ? entry?.secret?.items?.[0]
          : entry?.configMap?.items?.[0];
    if (file === undefined) throw new Error('fixture projected file missing');
    file.mode = 420;
    source.containers[0].volumeMounts = [
      { name: 'explicit-projection', mountPath: '/references', readOnly: true },
    ];
    observed.containers[0].volumeMounts = structuredClone(source.containers[0].volumeMounts);
    await writeFixSpec(setup, source);
    const response = await setup.run();
    expect(response.stderr).toBe('');
    expect(response.exitCode).toBe(0);
    const receipt = JSON.parse(
      await readFile(join(setup.directory, 'receipt.json'), 'utf8'),
    ) as ReceiptView;
    expect(receipt.migrationReady).toBe(false);
    expect(receipt.blockers).toContain('candidate-replica-template-mismatch');
  });
}

it('fix2 selected-node unsupported workload costs still refuse', async () => {
  const setup = await fixture();
  setup.snapshot.pods[0].specOverride = {
    ...projectFixturePod(setup.snapshot.pods[0]).spec,
    unsupported: true,
  };
  const response = await setup.run();
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('workload-shape-unsupported');
});

for (const side of ['source', 'observed'] as const)
  for (const mode of [-1, 512]) {
    it(`fix2 ${side} projected file mode ${String(mode)} is malformed`, async () => {
      const setup = await fixture();
      const observed = await prepareFixServiceAccount(setup);
      const source = structuredClone(observed);
      const entry = (side === 'source' ? source : observed).volumes?.[0].projected?.sources[1]
        .configMap?.items?.[0];
      if (entry === undefined) throw new Error('fixture CA file missing');
      entry.mode = mode;
      await writeFixSpec(setup, source);
      const response = await setup.run();
      expect(response.exitCode).toBe(1);
      expect(response.stderr).toContain('projection-malformed');
    });
  }
