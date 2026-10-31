import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cliEnvironment } from './cli.fixture';
import type { DiscoveryCommand, DiscoveryResponse } from './discover';
import type { WorkloadSpec } from './observability-workload';

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

export async function fixture() {
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
    transportPath,
    server,
    bin,
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
    async run(
      requestPath = join(directory, 'request.json'),
      searchPath = `${bin}:${executablePath}`,
    ) {
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
            PATH: searchPath,
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

export function setupResourceSources(
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

export function projectFixturePod(pod: {
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
