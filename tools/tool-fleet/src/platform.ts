import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse, parseDocument, stringify } from 'yaml';

import { purposeCapabilities, readToolchain } from './contracts';
import { assertObservability } from './observability';
import { assertReceiverCandidate } from './observability-receiver';
import { assertBackupTransport } from './platform-backup-tls';
import { assertCommonNativeResources } from './platform-common-resources';
import {
  assertEncryptedSecrets,
  assertLockedWorkloadImages,
  assertRegistryTransport,
  assertRetainedClaims,
  assertSecretClosure,
  assertStagePlacement,
  assertTenantIsolation,
  assertTrustedPolicyScope,
  assertTrustedWorkloadImages,
  readPlatformManifests,
  readStageManifests,
  referencedSecrets,
} from './platform-manifests';
import { assertOtlpTransport } from './platform-otlp';
import {
  assertCommonHelmResources,
  assertNetworkingCandidate,
  assertVeleroCandidate,
  PlatformHelmRelease,
  platformReleases,
} from './platform-releases';
import { readVeleroPatch } from './platform-velero-patch';

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
    'healthCheckExprs?': type({
      apiVersion: "'cert-manager.io/v1'",
      kind: "'Certificate'",
      failed: 'string>0',
      current: 'string>0',
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    'timeout?': 'string>0',
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
  'patches?': 'object[]',
  // A generator may only turn files beside the kustomization into one hash-named ConfigMap: no
  // literals, behaviour or options, so the name hash that makes a Job rerun cannot be disabled.
  // Proof: changing this generator's unknown-key policy to delete made "rejects a generator that
  // disables the content hash a Job rerun depends on" resolve instead of reject on 2026-10-11.
  'configMapGenerator?': type({
    name: 'string>0',
    namespace: 'string>0',
    files: type('string>0').array(),
    '+': 'reject',
  }).array(),
  '+': 'reject',
});

/** The ConfigMaps a native kustomization generates: name, namespace and source files. */
type ConfigMapGenerators = readonly {
  readonly name: string;
  readonly namespace: string;
  readonly files: readonly string[];
}[];

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

const observabilityResources = (_environment: string) => [
  '../base',
  'telemetry.yaml',
  'otlp-ingress.yaml',
];
const signalGenerators = [
  {
    name: 'signal-configuration',
    namespace: 'observability',
    files: [
      'collector.yaml',
      'gateway.yaml',
      'retention.json',
      'logs-policy.json',
      'logs-template.json',
      'traces-policy.json',
      'traces-template.json',
      'metrics-policy.json',
      'metrics-template.json',
      'apply.js',
    ],
  },
];

const platformKustomizations: readonly (readonly [
  string,
  readonly string[],
  ConfigMapGenerators?,
])[] = [
  ['target/kustomization.yaml', []],
  [
    'certificates/controllers/kustomization.yaml',
    ['namespace.yaml', '../../networking/cert-manager'],
  ],
  ...(['platform', 'workers'] as const).flatMap((purpose) =>
    (['local', 'production'] as const).map(
      (environment) =>
        [
          `certificates/${purpose}/${environment}/kustomization.yaml`,
          ['certificate.yaml'],
        ] as const,
    ),
  ),
  ['networking/kustomization.yaml', ['namespaces.yaml', 'cert-manager', 'traefik.yaml']],
  // Proof: omitting this entry made the cert-manager base omission negative resolve.
  ['networking/cert-manager/kustomization.yaml', ['release.yaml']],
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
  // Proof: dropping this entry made the diverging production-existing-hosts negative in
  // platform.test.ts resolve instead of reject on 2026-10-07.
  ['storage/production-existing-hosts/kustomization.yaml', ['../local']],
  ['observability/eck/kustomization.yaml', ['eck-operator.yaml']],
  ['observability/elastic/base/kustomization.yaml', ['elasticsearch.yaml']],
  [
    'observability/base/kustomization.yaml',
    [
      '../eck',
      '../elastic/base',
      '../elastic/settings',
      '../kibana',
      '../prometheus',
      '../otel',
      'signals.yaml',
      'metrics.yaml',
    ],
  ],
  [
    'observability/elastic/settings/kustomization.yaml',
    ['settings.yaml'],
    [
      {
        name: 'elastic-failure-fields',
        namespace: 'observability',
        files: ['failure-fields.json'],
      },
    ],
  ],
  ['observability/kibana/kustomization.yaml', ['kibana.yaml', 'objects']],
  [
    'observability/kibana/objects/kustomization.yaml',
    ['job.yaml'],
    [{ name: 'kibana-objects', namespace: 'observability', files: ['apply.sh', 'objects.ndjson'] }],
  ],
  [
    'observability/prometheus/kustomization.yaml',
    ['kube-prometheus-stack.yaml', 'blackbox-exporter.yaml'],
  ],
  ['observability/otel/kustomization.yaml', ['collector.yaml']],
  [
    'observability/local/kustomization.yaml',
    [...observabilityResources('local'), 'receiver.yaml'],
    signalGenerators,
  ],
  [
    'observability/production/kustomization.yaml',
    observabilityResources('production'),
    signalGenerators,
  ],
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
  expectedGenerators: ConfigMapGenerators = [],
  expectedPatches?: readonly object[],
) {
  const kustomization = NativeKustomization(source);
  if (kustomization instanceof type.errors) {
    throw new Error(`${path} native Kustomization is invalid: ${kustomization.summary}`);
  }
  if (JSON.stringify(kustomization.patches) !== JSON.stringify(expectedPatches)) {
    // Proof: removing this comparison admitted wrong-cluster production patches and the
    // unrelated networking patch in platform.test.ts on 2026-10-14.
    throw new Error(`${path} native Kustomization patches differ from the locked graph`);
  }
  if (kustomization.resources.join('\n') !== expectedResources.join('\n')) {
    // Proof: removing this comparison made a substituted networking resource list resolve instead
    // of reject in the production validator on 2026-09-17.
    throw new Error(`${path} native Kustomization resources differ from the locked graph`);
  }
  if (
    JSON.stringify(kustomization.configMapGenerator ?? []) !== JSON.stringify(expectedGenerators)
  ) {
    // Proof: removing this comparison made "rejects a generated ConfigMap outside the locked
    // graph" resolve instead of reject on 2026-10-11.
    throw new Error(`${path} native Kustomization generators differ from the locked graph`);
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
    certificates: 'controllers,secrets',
    platform: 'storage,secrets',
    observability: 'platform,certificates',
    // Rules and probes need the monitoring CRDs that the observability stage installs.
    alerts: 'observability',
    backup: 'alerts',
  },
  workers: {
    target: '',
    controllers: 'target',
    storage: 'target',
    policy: 'target',
    secrets: 'policy',
    certificates: 'controllers,secrets',
    telemetry: 'storage,secrets,certificates',
  },
} as const satisfies Record<'platform' | 'workers', Record<string, string>>;

/**
 * The Flux path each stage of a cluster must reconcile. `platform-production` runs on the
 * adopted h4claw and h3mon hosts, whose kubelets have no external cloud provider and whose node
 * names differ from the Hetzner server names, so its storage stage is the node-local
 * `production-existing-hosts` overlay (`puni-retain` on local-path, Retain) until the hcloud
 * storage packet (WBS 070.8) moves it; `workers-production` keeps the hcloud overlay.
 */
function platformStagePath(stageName: string, cluster: string, environment: string): string {
  if (stageName === 'target') return './infra/platform/target';
  if (stageName === 'controllers')
    return cluster.startsWith('workers-')
      ? './infra/platform/certificates/controllers'
      : './infra/platform/networking';
  if (stageName === 'certificates')
    return `./infra/platform/certificates/${cluster.startsWith('workers-') ? 'workers' : 'platform'}/${environment}`;
  // Proof: matching no cluster here made the platform-production hcloud-storage negative in
  // platform.test.ts resolve instead of reject on 2026-10-07.
  if (stageName === 'storage' && cluster === 'platform-production') {
    return './infra/platform/storage/production-existing-hosts';
  }
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
  await assertOtlpTransport(root);
  await assertObservability(root);
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
      // Proof: bypassing this comparison made the missing-certificate-dependency negative
      // resolve in platform.test.ts on 2026-10-15.
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

  for (const [relativePath, resources, generators] of platformKustomizations) {
    const path = join(root, 'infra/platform', relativePath);
    let expectedPatches: readonly object[] | undefined;
    if (relativePath === 'observability/production/kustomization.yaml') {
      expectedPatches = [
        {
          target: { kind: 'HelmRelease', name: 'kube-prometheus-stack' },
          patch:
            '- op: replace\n  path: /spec/values/kube-state-metrics/prometheus/monitor/metricRelabelings/0/replacement\n  value: platform-production',
        },
      ];
    }
    if (relativePath === 'observability/local/kustomization.yaml') {
      expectedPatches = [
        {
          target: { kind: 'HelmRelease', name: 'elasticsearch' },
          patch: stringify(
            [
              [
                '/spec/values/nodeSets/0/config/s3.client.default.endpoint',
                'object-store.puni-backup.svc:9000',
              ],
              ['/spec/values/nodeSets/0/config/s3.client.default.protocol', 'https'],
              [
                '/spec/values/nodeSets/0/podTemplate/spec/initContainers/0/env/0/value',
                'system-roots-plus-ca',
              ],
              [
                '/spec/values/nodeSets/0/podTemplate/spec/containers/0/env/0/value',
                '-Xms1g -Xmx1g',
              ],
              [
                '/spec/values/nodeSets/0/podTemplate/spec/containers/0/resources/requests/memory',
                '2Gi',
              ],
              [
                '/spec/values/nodeSets/0/podTemplate/spec/containers/0/resources/limits/memory',
                '2Gi',
              ],
              [
                '/spec/values/nodeSets/0/volumeClaimTemplates/0/spec/resources/requests/storage',
                '10Gi',
              ],
            ].map(([path, value]) => ({ op: 'replace', path, value })),
          ),
        },
      ];
    }
    if (relativePath === 'alerts/production/kustomization.yaml') {
      const rules = parseDocument(
        await readFile(join(root, 'infra/platform/alerts/base/rules.yaml'), 'utf8'),
      );
      const expression: unknown = rules.getIn(['spec', 'groups', 3, 'rules', 1, 'expr']);
      if (typeof expression !== 'string')
        throw new Error('Snapshot freshness expression is absent');
      expectedPatches = [
        {
          target: { kind: 'PrometheusRule', name: 'puni-platform' },
          patch: stringify([
            {
              op: 'replace',
              path: '/spec/groups/3/rules/0/expr',
              value:
                'absent(system_memory_usage_bytes{puni_cluster="workers-production",k8s_namespace_name="observability"})',
            },
            {
              op: 'replace',
              path: '/spec/groups/3/rules/1/expr',
              value: expression.replaceAll('platform-local', 'platform-production'),
            },
          ]),
        },
      ];
    }
    const source = NativeKustomization(await readYaml(path));
    if (source instanceof type.errors)
      throw new Error(`${path} native Kustomization is invalid: ${source.summary}`);
    // Compare parsed patch operations so YAML wrapping does not change the contract.
    const normalizePatches = (patches: readonly object[] | undefined) =>
      patches?.map((patch) => {
        const decoded = type({ target: 'object', patch: 'string', '+': 'reject' })(patch);
        if (decoded instanceof type.errors)
          throw new Error(`${path} native Kustomization patches are invalid`);
        const operations: unknown = parse(decoded.patch);
        return { target: decoded.target, patch: operations };
      });
    requireNativeResources(
      path,
      {
        ...source,
        ...(source.patches === undefined ? {} : { patches: normalizePatches(source.patches) }),
      },
      resources,
      generators,
      normalizePatches(expectedPatches),
    );
  }

  const releaseNames: string[] = [];
  for (const release of platformReleases) {
    const releasePath = join(root, 'infra/platform', release.path);
    const parsed = PlatformHelmRelease(await readYaml(releasePath));
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
    // Proof: Task25c3c candidate-call removal made all five missing maps and both missing scratch bounds pass validatePlatform.
    assertNetworkingCandidate(release.name, parsed.spec.values);
    // Proof: Task25c3f helm-call omission admitted both missing current exporter maps.
    assertCommonHelmResources(release.name, parsed.spec.values);
    if (release.name === 'velero') {
      // Proof: Task25c3d candidate-call omission admitted both missing current maps.
      assertVeleroCandidate(parsed.spec.values);
      // Proof: Task25c3d platform-patch-call omission admitted the foreign volume precondition.
      readVeleroPatch(parsed.spec.postRenderers);
      // Proof: Task25c3d postrenderer-context removal admitted the existing Traefik image-replacement policy.
    } else if (Object.hasOwn(parsed.spec, 'postRenderers')) {
      throw new Error(`${release.name} HelmRelease postRenderers must be removed`);
    }
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
  // Proof: Task25c3f native-call omission admitted missing registry maps through validatePlatform.
  assertCommonNativeResources(manifests);
  // Proof: Task40 current-caller omission accepted absent receiver ephemeral policy through validatePlatform.
  assertReceiverCandidate(manifests);
  const workloadImages = assertLockedWorkloadImages(manifests, toolchain);
  const secrets = assertEncryptedSecrets(manifests);
  assertRegistryTransport(manifests);
  assertBackupTransport(manifests);
  assertRetainedClaims(manifests);
  assertTrustedWorkloadImages(manifests);
  assertTrustedPolicyScope(manifests);
  assertTenantIsolation(manifests);

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
