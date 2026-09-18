import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse } from 'yaml';

import { purposeCapabilities, readToolchain } from './contracts';
import {
  assertEncryptedSecrets,
  assertLockedWorkloadImages,
  assertRegistryTransport,
  assertRetainedClaims,
  assertSecretClosure,
  assertStagePlacement,
  assertTrustedPolicyScope,
  assertTrustedWorkloadImages,
  readPlatformManifests,
  readStageManifests,
  referencedSecrets,
} from './platform-manifests';
import { platformReleases } from './platform-releases';

const PlatformIdentity = type({
  apiVersion: "'v1'",
  kind: "'ConfigMap'",
  metadata: { name: "'puni-cluster-identity'", namespace: "'flux-system'" },
  // ConfigMap keys cannot contain `/`; the API server refused `puni.dev/cluster-id` on 2026-09-18.
  data: { 'cluster-id': 'string>0', '+': 'reject' },
  '+': 'reject',
});

// Proof: changing the Flux stage spec's unknown-key policy to delete admitted an `images`
// transform in the production validator on 2026-09-17.
const FluxStage = type({
  apiVersion: "'kustomize.toolkit.fluxcd.io/v1'",
  kind: "'Kustomization'",
  metadata: { name: 'string>0', namespace: "'flux-system'", '+': 'reject' },
  spec: {
    interval: 'string>0',
    path: 'string>0',
    prune: 'true',
    sourceRef: { kind: "'GitRepository'", name: "'puni-platform'", '+': 'reject' },
    kubeConfig: { secretRef: { name: 'string>0', '+': 'reject' }, '+': 'reject' },
    decryption: {
      provider: "'sops'",
      secretRef: { name: 'string>0', '+': 'reject' },
      '+': 'reject',
    },
    'dependsOn?': type({ name: 'string>0', '+': 'reject' }).array().atLeastLength(1),
    'wait?': 'true',
    'healthChecks?': type({
      apiVersion: "'v1'",
      kind: "'ConfigMap'",
      name: 'string>0',
      namespace: "'kube-system'",
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    'timeout?': 'string>0',
    '+': 'reject',
  },
  '+': 'reject',
});

// Proof: changing the HelmRelease spec's unknown-key policy to delete admitted a post-renderer
// that replaced Traefik's locked image in the production validator on 2026-09-17.
const HelmRelease = type({
  apiVersion: "'helm.toolkit.fluxcd.io/v2'",
  kind: "'HelmRelease'",
  metadata: { name: 'string>0', namespace: 'string>0', '+': 'reject' },
  spec: {
    interval: 'string>0',
    'dependsOn?': type({ name: 'string>0', '+': 'reject' }).array().atLeastLength(1),
    chart: {
      spec: {
        chart: 'string>0',
        version: 'string>0',
        sourceRef: {
          kind: "'GitRepository'",
          name: "'puni-platform'",
          namespace: "'flux-system'",
          '+': 'reject',
        },
        '+': 'reject',
      },
      '+': 'reject',
    },
    values: 'unknown',
    '+': 'reject',
  },
  '+': 'reject',
});

// Proof: changing the native Kustomization's unknown-key policy to delete admitted a patch that
// removed Traefik's locked digest in the production validator on 2026-09-17.
const NativeKustomization = type({
  apiVersion: "'kustomize.config.k8s.io/v1beta1'",
  kind: "'Kustomization'",
  resources: type('string>0').array(),
  '+': 'reject',
});

async function readYaml(path: string): Promise<unknown> {
  try {
    return parse(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read platform manifest ${path}`, { cause });
  }
}

const clusters = ['platform-local', 'platform-production', 'workers-local', 'workers-production'];
const clusterPaths = [
  ['platform', 'local'],
  ['platform', 'production'],
  ['workers', 'local'],
  ['workers', 'production'],
] as const;

const observabilityResources = (environment: string) => [
  '../eck',
  `../elastic/${environment}`,
  '../elastic/settings',
  '../kibana',
  '../prometheus',
  '../otel',
  'telemetry.yaml',
  'otlp-ingress.yaml',
];

const platformKustomizations: readonly (readonly [string, readonly string[]])[] = [
  ['target/kustomization.yaml', []],
  ['networking/kustomization.yaml', ['namespaces.yaml', 'cert-manager.yaml', 'traefik.yaml']],
  [
    'policy/kustomization.yaml',
    [
      'namespaces.yaml',
      'network-policy.yaml',
      'trusted-rbac.yaml',
      'trusted-images.yaml',
      'trusted-workloads.yaml',
    ],
  ],
  ['registry/base/kustomization.yaml', ['registry.yaml', 'network-policy.yaml']],
  ['registry/local/kustomization.yaml', ['../base', 'issuers.yaml']],
  ['registry/production/kustomization.yaml', ['../base', 'issuers.yaml']],
  ['storage/local/kustomization.yaml', ['storage-class.yaml']],
  ['storage/production/kustomization.yaml', ['hcloud-ccm.yaml', 'hcloud-csi.yaml']],
  ['observability/eck/kustomization.yaml', ['eck-operator.yaml']],
  ['observability/elastic/local/kustomization.yaml', ['elasticsearch.yaml']],
  ['observability/elastic/production/kustomization.yaml', ['elasticsearch.yaml']],
  ['observability/elastic/settings/kustomization.yaml', ['settings.yaml']],
  ['observability/kibana/kustomization.yaml', ['kibana.yaml']],
  [
    'observability/prometheus/kustomization.yaml',
    ['kube-prometheus-stack.yaml', 'blackbox-exporter.yaml'],
  ],
  ['observability/otel/kustomization.yaml', ['collector.yaml']],
  ['observability/local/kustomization.yaml', [...observabilityResources('local'), 'receiver.yaml']],
  ['observability/production/kustomization.yaml', observabilityResources('production')],
  ['telemetry/agent/kustomization.yaml', ['agent.yaml']],
  ['telemetry/local/kustomization.yaml', ['../agent', 'upstream.yaml']],
  ['telemetry/production/kustomization.yaml', ['../agent', 'upstream.yaml']],
  ['alerts/base/kustomization.yaml', ['rules.yaml', 'probes.yaml']],
  ['alerts/local/kustomization.yaml', ['../base']],
  ['alerts/production/kustomization.yaml', ['../base', 'public-probes.yaml']],
  ['backup/elastic/kustomization.yaml', ['snapshots.yaml']],
  ['backup/velero/local/kustomization.yaml', ['velero.yaml']],
  ['backup/velero/production/kustomization.yaml', ['velero.yaml']],
  // The SQLite backup ships with the WBS release (deploy/k8s/wbs/base/backup.yaml).
  ['backup/local/kustomization.yaml', ['../elastic', '../velero/local', 'object-store.yaml']],
  ['backup/production/kustomization.yaml', ['../elastic', '../velero/production']],
];

function requireNativeResources(
  path: string,
  source: unknown,
  expectedResources: readonly string[],
) {
  const kustomization = NativeKustomization(source);
  if (kustomization instanceof type.errors) {
    throw new Error(`${path} native Kustomization is invalid: ${kustomization.summary}`);
  }
  if (kustomization.resources.join('\n') !== expectedResources.join('\n')) {
    // Proof: removing this comparison made a substituted networking resource list resolve instead
    // of reject in the production validator on 2026-09-17.
    throw new Error(`${path} native Kustomization resources differ from the locked graph`);
  }
}

/**
 * Bind a cluster's SOPS directory: resources are only `*.sops.yaml` files, listed in
 * name order. Their encryption is checked with every other platform Secret.
 */
async function requireSecretResources(root: string, cluster: string): Promise<void> {
  const path = join(root, 'infra/platform/secrets', cluster, 'kustomization.yaml');
  const kustomization = NativeKustomization(await readYaml(path));
  if (kustomization instanceof type.errors) {
    throw new Error(`${path} native Kustomization is invalid: ${kustomization.summary}`);
  }
  const sorted = [...kustomization.resources].sort();
  // Proof: removing the file-name test made the non-SOPS-resource negative resolve on 2026-09-18.
  if (
    kustomization.resources.some((resource) => !/^[a-z0-9-]+\.sops\.yaml$/.test(resource)) ||
    sorted.join('\n') !== kustomization.resources.join('\n')
  ) {
    throw new Error(`${path} may list only sorted *.sops.yaml Secrets`);
  }
}

/**
 * The ordered Flux stages per cluster purpose. Workers nodes carry only control-plane and
 * execution capabilities, so their graph has no ingress, registry, Elasticsearch, Prometheus
 * or backup stage; an agent ships their telemetry to the platform cluster.
 */
const stageDependencies = {
  platform: {
    target: '',
    controllers: 'target',
    storage: 'controllers',
    policy: 'controllers',
    secrets: 'policy',
    platform: 'storage,secrets',
    observability: 'platform',
    // Rules and probes need the monitoring CRDs that the observability stage installs.
    alerts: 'observability',
    backup: 'alerts',
  },
  workers: {
    target: '',
    storage: 'target',
    policy: 'target',
    secrets: 'policy',
    telemetry: 'storage,secrets',
  },
} as const satisfies Record<'platform' | 'workers', Record<string, string>>;

function platformStagePath(stageName: string, cluster: string, environment: string): string {
  if (stageName === 'target') return './infra/platform/target';
  if (stageName === 'controllers') return './infra/platform/networking';
  if (stageName === 'storage') return `./infra/platform/storage/${environment}`;
  if (stageName === 'policy') return './infra/platform/policy';
  if (stageName === 'secrets') return `./infra/platform/secrets/${cluster}`;
  if (stageName === 'platform') return `./infra/platform/registry/${environment}`;
  if (stageName === 'observability') return `./infra/platform/observability/${environment}`;
  if (stageName === 'alerts') return `./infra/platform/alerts/${environment}`;
  if (stageName === 'telemetry') return `./infra/platform/telemetry/${environment}`;
  if (stageName === 'backup') return `./infra/platform/backup/${environment}`;
  throw new Error(`Unknown platform stage ${stageName}`);
}

/**
 * Validate the checked-in cluster identities and locked Flux platform graph.
 *
 * Every stage reconciles through its own cluster's kubeconfig with SOPS decryption, and the
 * first stage health-checks the bootstrap marker `kube-system/puni-cluster-<id>`, so a
 * kubeconfig for another cluster or a missing age key stops before any controller runs.
 */
export async function validatePlatform(root: string): Promise<{
  readonly clusters: readonly string[];
  readonly releases: readonly string[];
  readonly workloadImages: number;
  readonly secrets: number;
}> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  for (const [index, [cluster, environment]] of clusterPaths.entries()) {
    const expectedCluster = clusters[index];
    const clusterRoot = join(root, 'infra/clusters', cluster, environment);
    const clusterKustomizationPath = join(clusterRoot, 'kustomization.yaml');
    requireNativeResources(clusterKustomizationPath, await readYaml(clusterKustomizationPath), [
      'identity.yaml',
      ...Object.keys(stageDependencies[cluster]).map((stage) => `${stage}.yaml`),
    ]);
    const identity = PlatformIdentity(await readYaml(join(clusterRoot, 'identity.yaml')));
    if (identity instanceof type.errors) {
      throw new Error(`${expectedCluster} cluster identity is invalid: ${identity.summary}`);
    }
    if (identity.data['cluster-id'] !== expectedCluster) {
      // Proof: removing this guard made the substituted cluster-identity production negative
      // resolve instead of reject on 2026-09-17.
      throw new Error(`${expectedCluster} cluster identity does not match its overlay`);
    }
    await requireSecretResources(root, expectedCluster);

    const graphManifests = [];
    for (const [stageName, expectedDependencies] of Object.entries(stageDependencies[cluster])) {
      const stage = FluxStage(await readYaml(join(clusterRoot, `${stageName}.yaml`)));
      if (stage instanceof type.errors) {
        throw new Error(`${expectedCluster} Flux ${stageName} graph is invalid: ${stage.summary}`);
      }
      if (stage.metadata.name !== stageName) {
        throw new Error(`${expectedCluster} Flux stage name does not match ${stageName}`);
      }
      const expectedPath = platformStagePath(stageName, expectedCluster, environment);
      if (stage.spec.path !== expectedPath) {
        // Proof: removing this comparison made the changed-stage-path production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${expectedCluster} Flux ${stageName} stage uses the wrong platform path`);
      }
      if (stage.spec.kubeConfig.secretRef.name !== `${expectedCluster}-kubeconfig`) {
        // Proof: removing this guard made the cross-cluster-kubeconfig production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${expectedCluster} Flux graph uses the wrong cluster kubeconfig`);
      }
      if (stage.spec.decryption.secretRef.name !== 'sops-age') {
        // Proof: removing this guard made the missing-decryption-key production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${expectedCluster} SOPS decryption must use sops-age`);
      }
      const dependencies = (stage.spec.dependsOn ?? []).map(({ name }) => name).join(',');
      if (dependencies !== expectedDependencies) {
        throw new Error(`${expectedCluster} ${stageName} dependency order is invalid`);
      }
      const stageManifests = await readStageManifests(root, stage.spec.path);
      assertStagePlacement(
        expectedCluster,
        stageName,
        stageManifests,
        purposeCapabilities[cluster],
      );
      if (stageName !== 'secrets') graphManifests.push(...stageManifests);
      const markers = (stage.spec.healthChecks ?? []).map(({ name }) => name).join(',');
      const expectedMarkers = stageName === 'target' ? `puni-cluster-${expectedCluster}` : '';
      // Flux ignores healthChecks when wait is true, so the target stage must not wait.
      const waits = stage.spec.wait === true;
      if (markers !== expectedMarkers || waits === (stageName === 'target')) {
        // Proof: removing this comparison made both marker negatives resolve on 2026-09-18.
        throw new Error(`${expectedCluster} ${stageName} must gate on its own cluster marker`);
      }
    }
    await assertSecretClosure(root, expectedCluster, referencedSecrets(graphManifests));
  }

  for (const [relativePath, resources] of platformKustomizations) {
    const path = join(root, 'infra/platform', relativePath);
    requireNativeResources(path, await readYaml(path), resources);
  }

  const releaseNames: string[] = [];
  for (const release of platformReleases) {
    const releasePath = join(root, 'infra/platform', release.path);
    const parsed = HelmRelease(await readYaml(releasePath));
    if (parsed instanceof type.errors) {
      throw new Error(`${release.name} HelmRelease is invalid: ${parsed.summary}`);
    }
    if (parsed.metadata.name !== release.name) throw new Error(`${release.name} name is invalid`);
    if (parsed.spec.chart.spec.chart !== `./infra/platform/${release.chart}`) {
      // Proof: removing this guard made the upstream-name Traefik source negative resolve instead
      // of requiring the vendored archive on 2026-09-17.
      throw new Error(`${release.name} does not consume its vendored chart archive`);
    }
    const lock = toolchain.charts[release.lock];
    if (parsed.spec.chart.spec.version !== lock.version) {
      // Proof: removing this guard made the changed-chart-version production negative resolve
      // instead of reject on 2026-09-17.
      throw new Error(`${release.name} chart version differs from the toolchain lock`);
    }
    const chart = await readFile(join(root, 'infra/platform', release.chart));
    if (createHash('sha256').update(chart).digest('hex') !== lock.sha256) {
      // Proof: changing one byte of the vendored Traefik archive made the production platform
      // validator reject it on 2026-09-17.
      throw new Error(`${release.name} chart archive differs from the toolchain lock`);
    }
    const configuredReferences = release.imageReferences(parsed.spec.values);
    for (const image of lock.images) {
      if (configuredReferences[image.role] !== `${image.name}@${image.digest}`) {
        // Proof: moving the Traefik digest to ignored `image.unusedDigest` made the production
        // validator reject the missing effective value on 2026-09-17.
        // Proof: setting a CSI image tag to `v0` produced an invalid rendered reference before
        // the schema required the chart's tag suffix to remain empty on 2026-09-17.
        // Proof: substituting Traefik's repository while retaining its digest made the production
        // validator's repository negative fail on 2026-09-17.
        throw new Error(`${release.name} differs from the locked ${image.role} image reference`);
      }
    }
    if (!releaseNames.includes(release.name)) releaseNames.push(release.name);
  }

  const manifests = await readPlatformManifests(root);
  const workloadImages = assertLockedWorkloadImages(manifests, toolchain);
  const secrets = assertEncryptedSecrets(manifests);
  assertRegistryTransport(manifests);
  assertRetainedClaims(manifests);
  assertTrustedWorkloadImages(manifests);
  assertTrustedPolicyScope(manifests);

  const fluxInstall = await readFile(join(root, 'infra/platform/flux/install.yaml'));
  const fluxInstallSha256 = createHash('sha256').update(fluxInstall).digest('hex');
  if (fluxInstallSha256 !== toolchain.manifests.fluxInstall.sha256) {
    // Proof: removing this guard made the changed-Flux-install production negative resolve instead
    // of reject on 2026-09-17.
    throw new Error('Flux install manifest differs from the toolchain lock');
  }

  const platformPlaybook = await readFile(
    join(root, 'infra/ansible/playbooks/platform.yml'),
    'utf8',
  );
  if (
    !platformPlaybook.includes('server: https://kubernetes.default.svc:443') ||
    platformPlaybook.includes('--from-file=value.yaml=/etc/rancher/k3s/k3s.yaml') ||
    !platformPlaybook.includes('KUBECONFIG: /etc/rancher/k3s/k3s.yaml')
  ) {
    // Proof: restoring the raw node-local kubeconfig made the production validator's bootstrap
    // negative resolve before this controller-reachability guard was restored on 2026-09-17.
    throw new Error('Flux bootstrap must use a controller-reachable kubeconfig explicitly');
  }
  if (
    !platformPlaybook.includes("'puni-cluster-{{ puni_cluster_id }}'") ||
    !platformPlaybook.includes("combine({'immutable': true})")
  ) {
    // Proof: removing this guard made the production validator's bootstrap-marker negative
    // resolve on 2026-09-18.
    throw new Error('Flux bootstrap must create the immutable target-cluster marker');
  }
  return { clusters, releases: releaseNames, workloadImages, secrets };
}
