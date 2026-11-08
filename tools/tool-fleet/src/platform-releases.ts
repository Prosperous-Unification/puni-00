import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { Toolchain } from './contracts';
import { readCPUMilli, readMemoryMiB } from './observability-capacity';
// Proof: Task31 CI fix1 restoring the generated-capacity import reproduced all five fresh projection CLI initialization failures.
import { assertCandidatePodResources, assertPodResources } from './observability-pod-resources';

/** Standard source envelope; postRenderers require separate exact contextual validation. */
export const PlatformHelmRelease = type({
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
    'postRenderers?': 'unknown',
    '+': 'reject',
  },
  '+': 'reject',
});

type ChartLockName = keyof Toolchain['charts'];

/**
 * One HelmRelease file bound to a vendored chart archive and its chart lock.
 *
 * Each release decodes its complete values shape with unknown keys rejected at
 * every modeled object boundary, so any new chart branch that could select an
 * image is a review event rather than silently ignored input.
 */
export interface PlatformRelease {
  readonly name: string;
  readonly lock: ChartLockName;
  readonly path: string;
  readonly chart: string;
  /** Effective image reference per locked image role, decoded from the release values. */
  readonly imageReferences: (values: unknown) => Readonly<Record<string, string>>;
}

function decode<T>(release: string, schema: (input: unknown) => T | type.errors, values: unknown) {
  const parsed = schema(values);
  if (parsed instanceof type.errors)
    throw new Error(`${release} values are invalid: ${parsed.summary}`);
  return parsed;
}

function imageReference(repository: string, tag: string, digest: string): string {
  return `${repository}:${tag}@${digest}`;
}

const Quantity = type('string>0 | number');
const Resources = type({
  requests: { cpu: Quantity, memory: Quantity, '+': 'reject' },
  limits: { cpu: Quantity, memory: Quantity, '+': 'reject' },
  '+': 'reject',
});
// Proof: optionalizing ephemeral-storage let both missing ECK/operator bounds pass validatePlatform; platform.test.ts selected provider input negatives failed.
const DiskResources = type({
  requests: { cpu: Quantity, memory: Quantity, 'ephemeral-storage': Quantity, '+': 'reject' },
  limits: { cpu: Quantity, memory: Quantity, 'ephemeral-storage': Quantity, '+': 'reject' },
  '+': 'reject',
});
/** Historical release decoding validates supplied quantities without requiring candidate budgets. */
const StructuralQuantities = type({
  'cpu?': Quantity,
  'memory?': Quantity,
  'ephemeral-storage?': Quantity,
  '+': 'reject',
});
// Proof: Task25c3c resource-unknown-keys widening admitted foreign resource branches in structural image decoding.
const StructuralResources = type({
  'requests?': StructuralQuantities.or('null'),
  'limits?': StructuralQuantities.or('null'),
  '+': 'reject',
})
  // Proof: Task25c3c historical-null removal broke historical absent/null image-reference controls.
  .or('null')
  .narrow((resources) => {
    // Proof: Task25c3c resource-array bypass admitted outer resource arrays in both release decoders.
    if (Array.isArray(resources)) return false;
    // Proof: Task25c3c shared-resource-validation substitution admitted malformed/negative requests and contradictions in current/structural callers.
    if (resources !== null)
      assertPodResources({
        ...(resources.requests == null ? {} : { requests: resources.requests }),
        ...(resources.limits == null ? {} : { limits: resources.limits }),
      });
    return true;
  });
function refuseNetworking(reason: string): never {
  throw new Error(`networking candidate ${reason}`);
}
// Proof: Task25c3c scratch-reader removal admitted malformed and negative supplied scratch quantities.
const ScratchQuantity = Quantity.or('null').narrow((quantity) => {
  if (quantity !== null) readMemoryMiB(String(quantity), refuseNetworking);
  return true;
});
// Proof: Task25c3c scratch-array and scratch-unknown-keys bypasses admitted array and foreign-medium emptyDirs.
const Scratch = type({ 'sizeLimit?': ScratchQuantity, '+': 'reject' }).narrow(
  (scratch) => !Array.isArray(scratch),
);
// Proof: Task25c3c tmp-volume-array bypass admitted an array in structural Traefik decoding.
const TemporaryVolume = type({ 'emptyDir?': Scratch, '+': 'reject' }).narrow(
  (volume) => !Array.isArray(volume),
);
// Proof: Task25c3c persistence-array bypass admitted an array; disabled-persistence widening accepted enabled persistence through validatePlatform.
const Persistence = type({ 'enabled?': 'false', 'emptyDir?': Scratch, '+': 'reject' }).narrow(
  (persistence) => !Array.isArray(persistence),
);
const ObservabilityNode = type({ 'puni.dev/capability-observability': "'true'", '+': 'reject' });
const TolerateAll = type({ operator: "'Exists'", '+': 'reject' }).array().exactlyLength(1);
const Env = type({ name: 'string>0', value: 'string', '+': 'reject' }).array();

const ImageValues = type({
  repository: 'string>0',
  tag: 'string>0',
  digest: 'string>0',
  '+': 'reject',
});

// Proof: changing Traefik's top-level unknown-key policy to delete admitted the operative
// `oci_meta` image override in the production validator on 2026-09-17.
const TraefikValues = type({
  image: {
    registry: 'string>0',
    repository: 'string>0',
    tag: 'string>0',
    digest: 'string>0',
    '+': 'reject',
  },
  versionOverride: 'string>0',
  'resources?': StructuralResources,
  'persistence?': Persistence,
  deployment: {
    kind: "'DaemonSet'",
    dnsPolicy: "'ClusterFirstWithHostNet'",
    'tmpVolume?': TemporaryVolume,
    '+': 'reject',
  },
  hostNetwork: 'true',
  updateStrategy: {
    type: "'RollingUpdate'",
    rollingUpdate: { maxUnavailable: 'number', maxSurge: 'number', '+': 'reject' },
    '+': 'reject',
  },
  nodeSelector: { 'puni.dev/capability-ingress': "'true'", '+': 'reject' },
  // The chart defaults the entry points to 8000 and 8443, which on the host network is where
  // Traefik would listen. Binding 80 as UID 65532 needs the ingress-node sysctl in the base
  // role's `k3s-sysctl.conf.j2`. ServiceLB is disabled, so the chart's default LoadBalancer
  // Service would stay pending; the type lives under `service.spec`, because the chart's
  // values schema accepts and ignores an unknown `service.type`.
  // Proof: with `port: '80'` loosened to `number`, platform.test.ts `rejects Traefik host
  // ports other than 80 and 443` resolved for the 8000 fault on 2026-10-06.
  ports: {
    web: {
      port: '80',
      http: {
        redirections: {
          entryPoint: { to: "'websecure'", scheme: "'https'", permanent: 'true', '+': 'reject' },
          '+': 'reject',
        },
        '+': 'reject',
      },
      '+': 'reject',
    },
    websecure: { port: '443', '+': 'reject' },
    '+': 'reject',
  },
  service: { spec: { type: "'ClusterIP'", '+': 'reject' }, '+': 'reject' },
  '+': 'reject',
});

const CertManagerValues = type({
  crds: { enabled: 'true', '+': 'reject' },
  'resources?': StructuralResources,
  image: ImageValues,
  webhook: { image: ImageValues, 'resources?': StructuralResources, '+': 'reject' },
  cainjector: { image: ImageValues, 'resources?': StructuralResources, '+': 'reject' },
  acmesolver: { image: ImageValues, '+': 'reject' },
  startupapicheck: { image: ImageValues, 'resources?': StructuralResources, '+': 'reject' },
  '+': 'reject',
});

/** Require current shared networking budgets separately from historical image decoding.
 * Throws for incomplete maps, nonpositive limits/scratch or invalid supplied quantities.
 * Shared resource validation owns request/limit arithmetic; these are policy inputs, not runtime observations.
 */
export function assertNetworkingCandidate(release: string, values: unknown): void {
  if (release !== 'cert-manager' && release !== 'traefik') return;
  const requireResources = (input: unknown) => {
    // Proof: Task25c3c candidate-call/required-container omissions lost each production missing-map refusal.
    const resources = decode('networking candidate', DiskResources, input);
    // Proof: Task25c3c shared-resource-validation bypass lost request/limit and supplied-quantity refusals.
    assertPodResources(resources);
    for (const dimension of ['cpu', 'memory', 'ephemeral-storage'] as const) {
      const read = dimension === 'cpu' ? readCPUMilli : readMemoryMiB;
      // Proof: Task25c3c positive-limits bypass admitted zero CPU/memory/ephemeral limits with zero requests.
      if (read(String(resources.limits[dimension]), refuseNetworking) <= 0)
        refuseNetworking(`${release} ${dimension} limit must be positive`);
    }
  };
  if (release === 'cert-manager') {
    const parsed = decode(release, CertManagerValues, values);
    // Proof: Task25c3c required-controller/cainjector/webhook/startupapicheck omissions each lost its missing-map negative.
    for (const resources of [
      parsed.resources,
      parsed.cainjector.resources,
      parsed.webhook.resources,
      parsed.startupapicheck.resources,
    ])
      requireResources(resources);
  } else {
    const parsed = decode(release, TraefikValues, values);
    // Proof: Task25c3c required-traefik omission lost the production missing-map negative.
    requireResources(parsed.resources);
    // Proof: Task25c3c required-scratch omission lost both missing sizeLimit negatives.
    const scratch = decode(
      'networking candidate',
      type({
        persistence: { enabled: 'false', emptyDir: { sizeLimit: Quantity } },
        deployment: { tmpVolume: { emptyDir: { sizeLimit: Quantity } } },
      }),
      parsed,
    );
    for (const quantity of [
      scratch.persistence.emptyDir.sizeLimit,
      scratch.deployment.tmpVolume.emptyDir.sizeLimit,
    ])
      // Proof: Task25c3c positive-scratch bypass admitted zero data/tmp sizeLimits.
      if (readMemoryMiB(String(quantity), refuseNetworking) <= 0)
        refuseNetworking('Traefik scratch size must be positive');
  }
}

const HcloudCcmValues = type({
  image: { repository: 'string>0', tag: 'string>0', '+': 'reject' },
  '+': 'reject',
});

const HcloudCsiImage = type({ name: 'string>0', tag: "''", '+': 'reject' });
const HcloudCsiValues = type({
  // Proof: loosening this tuple to `object[]` made the chart-rendered storage-class negative in
  // platform.test.ts accept a production graph without puni-retain (2026-09-18).
  storageClasses: type([
    {
      name: "'hcloud-volumes'",
      defaultStorageClass: 'true',
      reclaimPolicy: "'Delete'",
      '+': 'reject',
    },
    {
      name: "'puni-retain'",
      defaultStorageClass: 'false',
      reclaimPolicy: "'Retain'",
      '+': 'reject',
    },
  ]),
  controller: {
    image: {
      csiAttacher: HcloudCsiImage,
      csiResizer: HcloudCsiImage,
      csiProvisioner: HcloudCsiImage,
      livenessProbe: HcloudCsiImage,
      hcloudCSIDriver: HcloudCsiImage,
      '+': 'reject',
    },
    '+': 'reject',
  },
  node: {
    image: {
      csiNodeDriverRegistrar: HcloudCsiImage,
      livenessProbe: HcloudCsiImage,
      hcloudCSIDriver: HcloudCsiImage,
      '+': 'reject',
    },
    '+': 'reject',
  },
  '+': 'reject',
});

const EckOperatorValues = type({
  image: ImageValues,
  resources: DiskResources,
  nodeSelector: ObservabilityNode,
  config: { containerRegistry: "'docker.elastic.co'", '+': 'reject' },
  '+': 'reject',
});

const ElasticContainer = type({
  name: "'elasticsearch'",
  env: Env,
  resources: Resources,
  volumeMounts: type([
    {
      name: "'s3-trust'",
      mountPath: "'/usr/share/elasticsearch/config/s3-trust'",
      readOnly: 'true',
      '+': 'reject',
    },
    {
      name: "'s3-trust'",
      mountPath: "'/usr/share/elasticsearch/config/jvm.options.d/s3.options'",
      subPath: "'s3.options'",
      readOnly: 'true',
      '+': 'reject',
    },
  ]),
  '+': 'reject',
});
const ElasticsearchValues = type({
  fullnameOverride: "'elasticsearch'",
  version: 'string>0',
  image: 'string>0',
  // Proof: widening the projected access key admitted ca.crt into the keystore (platform.test.ts).
  secureSettings: type({
    secretName: "'elastic-s3-credentials'",
    entries: type([
      { key: "'s3.client.default.access_key'", '+': 'reject' },
      { key: "'s3.client.default.secret_key'", '+': 'reject' },
    ]),
    '+': 'reject',
  })
    .array()
    .exactlyLength(1),
  volumeClaimDeletePolicy: "'DeleteOnScaledownOnly'",
  nodeSets: type({
    name: 'string>0',
    count: 'number.integer>0',
    // Elasticsearch settings cannot select a container image.
    config: {
      'node.store.allow_mmap': 'false',
      's3.client.default.endpoint': 'string>0',
      // Proof: widening this field admitted the plaintext snapshot mutation (platform.test.ts).
      's3.client.default.protocol': "'https'",
      's3.client.default.path_style_access': 'true',
      '+': 'reject',
    },
    podTemplate: {
      spec: {
        nodeSelector: ObservabilityNode,
        securityContext: {
          runAsUser: '1000',
          runAsGroup: '1000',
          fsGroup: '1000',
          runAsNonRoot: 'true',
          '+': 'reject',
        },
        containers: ElasticContainer.array().exactlyLength(1),
        initContainers: type({
          name: "'prepare-s3-trust'",
          // Proof: optional fields or widened quantities admitted absent/incomplete/zero/negative init bounds (platform.test.ts).
          resources: {
            requests: { cpu: "'100m'", memory: "'128Mi'", '+': 'reject' },
            limits: { cpu: "'500m'", memory: "'256Mi'", '+': 'reject' },
            '+': 'reject',
          },
          image: 'string>0',
          command: type(["'bash'", "'-ec'", 'string>0']),
          env: type({ name: "'S3_TRUST_MODE'", value: "'system-roots'", '+': 'reject' })
            .array()
            .exactlyLength(1),
          volumeMounts: type([
            {
              name: "'s3-trust'",
              mountPath: "'/usr/share/elasticsearch/config/s3-trust'",
              '+': 'reject',
            },
            {
              name: "'s3-credentials'",
              mountPath: "'/s3-credentials'",
              readOnly: 'true',
              '+': 'reject',
            },
          ]),
          '+': 'reject',
        })
          .array()
          .exactlyLength(1),
        volumes: type([
          { name: "'s3-trust'", emptyDir: { '+': 'reject' }, '+': 'reject' },
          {
            name: "'s3-credentials'",
            secret: { secretName: "'elastic-s3-credentials'", defaultMode: '292', '+': 'reject' },
            '+': 'reject',
          },
        ]),
        '+': 'reject',
      },
      '+': 'reject',
    },
    volumeClaimTemplates: type({
      metadata: { name: "'elasticsearch-data'", '+': 'reject' },
      spec: {
        storageClassName: "'puni-retain'",
        accessModes: type(["'ReadWriteOnce'"]),
        resources: { requests: { storage: 'string>0', '+': 'reject' }, '+': 'reject' },
        '+': 'reject',
      },
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    '+': 'reject',
  })
    .array()
    .atLeastLength(1),
  '+': 'reject',
});

const KibanaValues = type({
  fullnameOverride: "'kibana'",
  version: 'string>0',
  image: 'string>0',
  count: 'number.integer>0',
  elasticsearchRef: { name: "'elasticsearch'", '+': 'reject' },
  podTemplate: {
    spec: {
      nodeSelector: ObservabilityNode,
      containers: type({ name: "'kibana'", env: Env, resources: Resources, '+': 'reject' })
        .array()
        .exactlyLength(1),
      '+': 'reject',
    },
    '+': 'reject',
  },
  '+': 'reject',
});

const HexShaImage = type({
  registry: 'string>0',
  repository: 'string>0',
  tag: 'string>0',
  sha: /^[0-9a-f]{64}$/,
  '+': 'reject',
});
const Enabled = type({ enabled: 'boolean', '+': 'reject' });
const KubePrometheusStackValues = type({
  fullnameOverride: "'kps'",
  // `crds.upgradeJob` would run unpinned busybox:latest and kubectl images.
  // Proof: changing this object's unknown-key policy to delete admitted `upgradeJob` in the
  // production validator on 2026-09-18.
  crds: { enabled: 'true', '+': 'reject' },
  grafana: { enabled: 'false', '+': 'reject' },
  windowsMonitoring: { enabled: 'false', '+': 'reject' },
  thanosRuler: { enabled: 'false', '+': 'reject' },
  kubeEtcd: Enabled,
  kubeControllerManager: Enabled,
  kubeScheduler: Enabled,
  kubeProxy: Enabled,
  defaultRules: { create: 'boolean', rules: 'Record<string, boolean>', '+': 'reject' },
  prometheusOperator: {
    image: HexShaImage,
    // Proof: optionalizing resources admitted the missing reloader input through validatePlatform (selected provider input negative).
    prometheusConfigReloader: { image: HexShaImage, resources: Resources, '+': 'reject' },
    admissionWebhooks: {
      deployment: { image: HexShaImage, '+': 'reject' },
      // Proof: optionalizing resources admitted the missing webhook input through validatePlatform (selected provider input negative).
      patch: { image: HexShaImage, resources: DiskResources, '+': 'reject' },
      '+': 'reject',
    },
    resources: DiskResources,
    nodeSelector: ObservabilityNode,
    '+': 'reject',
  },
  prometheus: {
    prometheusSpec: {
      image: HexShaImage,
      retention: 'string>0',
      enableRemoteWriteReceiver: 'true',
      retentionSize: 'string>0',
      serviceMonitorSelectorNilUsesHelmValues: 'false',
      podMonitorSelectorNilUsesHelmValues: 'false',
      probeSelectorNilUsesHelmValues: 'false',
      ruleSelectorNilUsesHelmValues: 'false',
      resources: Resources,
      nodeSelector: ObservabilityNode,
      storageSpec: {
        volumeClaimTemplate: {
          spec: {
            storageClassName: "'puni-retain'",
            accessModes: type(["'ReadWriteOnce'"]),
            resources: { requests: { storage: 'string>0', '+': 'reject' }, '+': 'reject' },
            '+': 'reject',
          },
          '+': 'reject',
        },
        '+': 'reject',
      },
      '+': 'reject',
    },
    '+': 'reject',
  },
  alertmanager: {
    alertmanagerSpec: {
      image: HexShaImage,
      configSecret: "'alertmanager-puni'",
      resources: Resources,
      nodeSelector: ObservabilityNode,
      '+': 'reject',
    },
    '+': 'reject',
  },
  'kube-state-metrics': {
    // Proof: changing the label to platform-production failed the production wrong-cluster
    // relabeling negative in platform.test.ts on 2026-10-14.
    prometheus: {
      monitor: {
        metricRelabelings: type([
          {
            targetLabel: "'puni_cluster'",
            replacement: "'platform-local'",
            action: "'replace'",
            '+': 'reject',
          },
        ]),
        '+': 'reject',
      },
      '+': 'reject',
    },
    image: {
      registry: 'string>0',
      repository: 'string>0',
      tag: 'string>0',
      sha: /^sha256:[0-9a-f]{64}$/,
      '+': 'reject',
    },
    // Proof: Task25c3f historical-boundary restoration of required maps rejected valid absent/null historical KPS input.
    'resources?': StructuralResources,
    '+': 'reject',
  },
  'prometheus-node-exporter': {
    image: {
      registry: 'string>0',
      repository: 'string>0',
      tag: 'string>0',
      distroless: 'false',
      digest: 'string>0',
      '+': 'reject',
    },
    service: { port: '9101', targetPort: '9101', '+': 'reject' },
    'resources?': StructuralResources,
    tolerations: TolerateAll,
    '+': 'reject',
  },
  '+': 'reject',
});

function hexShaReference(image: typeof HexShaImage.infer): string {
  return `${image.registry}/${image.repository}:${image.tag}@sha256:${image.sha}`;
}

const HostPathVolume = type({
  name: 'string>0',
  hostPath: { path: 'string>0', type: "'Directory' | 'DirectoryOrCreate'", '+': 'reject' },
  '+': 'reject',
});
const SecretVolume = type({
  name: 'string>0',
  secret: { secretName: 'string>0', '+': 'reject' },
  '+': 'reject',
});
const OtelValues = type({
  fullnameOverride: "'otel-collector' | 'otel-agent'",
  mode: "'daemonset'",
  image: ImageValues,
  command: { name: "'otelcol-contrib'", '+': 'reject' },
  securityContext: {
    runAsUser: 'number',
    runAsGroup: 'number',
    allowPrivilegeEscalation: 'false',
    readOnlyRootFilesystem: 'true',
    capabilities: { drop: type(["'ALL'"]), add: type(["'DAC_READ_SEARCH'"]), '+': 'reject' },
    '+': 'reject',
  },
  tolerations: TolerateAll,
  resources: Resources,
  // Environment sources cannot select an image.
  extraEnvs: type({ name: 'string>0', valueFrom: 'object', '+': 'reject' }).array(),
  // Only host directories and secrets: an `image` volume would be an unlocked image reference.
  // Proof: widening this to any object admitted an image volume on 2026-09-18.
  extraVolumes: HostPathVolume.or(SecretVolume).array(),
  extraVolumeMounts: type({
    name: 'string>0',
    mountPath: 'string>0',
    'readOnly?': 'boolean',
    '+': 'reject',
  }).array(),
  // The chart renders a hostPort for every OTLP port unless it is 0, and those ports would be
  // reachable from outside the cluster on every node.
  // Proof: dropping `hostPort: 0` from the collector values rendered hostPort 4317/4318, and the
  // production validator's host-port negative rejected it on 2026-09-18.
  ports: {
    otlp: { enabled: 'boolean', hostPort: '0', '+': 'reject' },
    'otlp-mtls?': {
      enabled: 'true',
      containerPort: '14317',
      servicePort: '14317',
      protocol: "'TCP'",
      hostPort: '0',
      '+': 'reject',
    },
    'otlp-http': { enabled: 'boolean', hostPort: '0', '+': 'reject' },
    'jaeger-compact': { enabled: 'false', '+': 'reject' },
    'jaeger-thrift': { enabled: 'false', '+': 'reject' },
    'jaeger-grpc': { enabled: 'false', '+': 'reject' },
    zipkin: { enabled: 'false', '+': 'reject' },
    metrics: { enabled: 'true', '+': 'reject' },
    '+': 'reject',
  },
  service: { enabled: 'boolean', '+': 'reject' },
  'serviceMonitor?': {
    enabled: 'true',
    metricsEndpoints: type({ port: "'metrics'", '+': 'reject' }).array().exactlyLength(1),
    '+': 'reject',
  },
  // Collector pipeline configuration; it cannot select a container image.
  alternateConfig: 'object',
  '+': 'reject',
});

/** Retained collector history may predate disk policy; worker agent keeps OtelValues unchanged. */
const CollectorValues = OtelValues.omit('resources').merge({
  fullnameOverride: "'otel-collector'",
  // Proof: Task66 collector-history required-map fault rejected valid absent/null retained resource maps.
  'resources?': StructuralResources,
});

// Proof: widening the endpoint or deleting unknown keys admitted HTTP and insecureSkipTLSVerify.
const VeleroConfig = type({
  region: 'string>0',
  s3ForcePathStyle: "'true'",
  s3Url: /^https:\/\/[^\s]+$/,
  '+': 'reject',
});
const VeleroLocation = type({
  name: "'default'",
  provider: "'aws'",
  bucket: "'puni-velero'",
  default: 'true',
  config: VeleroConfig,
  '+': 'reject',
});
// Proof: Task66 supplied-scratch-reader bypass admitted malformed historical node-agent scratch.
const NodeAgentScratchQuantity = Quantity.narrow((quantity) => {
  readMemoryMiB(String(quantity), (reason) => {
    throw new Error('Velero scratch ' + reason);
  });
  return true;
});
const VeleroValues = type({
  image: ImageValues,
  upgradeCRDs: 'false',
  initContainers: type({
    name: "'velero-plugin-for-aws'",
    'resources?': StructuralResources,
    image: 'string>0',
    volumeMounts: type({ mountPath: "'/target'", name: "'plugins'", '+': 'reject' })
      .array()
      .exactlyLength(1),
    '+': 'reject',
  })
    .array()
    .exactlyLength(1),
  credentials: { useSecret: 'true', existingSecret: "'velero-credentials'", '+': 'reject' },
  snapshotsEnabled: 'false',
  deployNodeAgent: 'true',
  configuration: {
    uploaderType: "'kopia'",
    defaultVolumesToFsBackup: 'false',
    // Storage locations name buckets and endpoints only.
    backupStorageLocation: VeleroLocation.array().atMostLength(1),
    '+': 'reject',
  },
  'resources?': StructuralResources,
  nodeAgent: {
    // Proof: Task66 node-history required-map fault rejected valid absent/null historical node-agent maps.
    'resources?': StructuralResources,
    tolerations: TolerateAll,
    // Proof: Task66 scratch-switch widening admitted a true supplied switch in historical image decoding.
    'useScratchEmptyDir?': 'false',
    // Proof: Task66 scratch-volume schema widening admitted duplicate scratch and foreign medium through assertVeleroCandidate.
    'extraVolumes?': type({
      name: "'scratch'",
      emptyDir: { sizeLimit: NodeAgentScratchQuantity, '+': 'reject' },
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    // Proof: Task66 scratch-mount schema widening admitted duplicate/wrong-path/read-only mounts through assertVeleroCandidate.
    'extraVolumeMounts?': type({
      name: "'scratch'",
      mountPath: "'/scratch'",
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    '+': 'reject',
  },
  metrics: { serviceMonitor: { enabled: 'true', '+': 'reject' }, '+': 'reject' },
  // Proof: widening kind admitted a Deployment through extraObjects (platform.test.ts).
  'extraObjects?': type({
    apiVersion: "'velero.io/v1'",
    kind: "'BackupStorageLocation'",
    metadata: { name: "'default'", namespace: "'puni-backup'", '+': 'reject' },
    spec: {
      provider: "'aws'",
      default: 'true',
      objectStorage: {
        bucket: "'puni-velero'",
        caCertRef: { name: "'object-store-ca'", key: "'ca.crt'", '+': 'reject' },
        '+': 'reject',
      },
      config: VeleroConfig,
      '+': 'reject',
    },
    '+': 'reject',
  })
    .array()
    .exactlyLength(1),
  // Backup schedules select namespaces and volumes, never images.
  schedules: 'Record<string, object>',
  '+': 'reject',
});

/** Require current Velero server/plugin/node-agent budgets and the existing capped scratch without authorizing historical image inventory.
 * CPU/memory requests may be zero; limits and all retained ephemeral requests must be positive.
 */
export function assertVeleroCandidate(values: unknown): void {
  const parsed = decode('velero', VeleroValues, values);
  const refuse = (reason: string): never => {
    throw new Error(`Velero candidate ${reason}`);
  };
  // Proof: Task25c3d candidate-server/plugin omissions each admitted its absent current resource map.
  for (const input of [parsed.resources, parsed.initContainers[0].resources]) {
    const resources = decode('Velero candidate', DiskResources, input);
    // Proof: Task25c3d shared-quantities dependency removal admitted request/limit contradictions.
    assertPodResources(resources);
    for (const dimension of ['cpu', 'memory', 'ephemeral-storage'] as const) {
      const read = dimension === 'cpu' ? readCPUMilli : readMemoryMiB;
      // Proof: Task25c3d positive-limits widening admitted zero CPU/memory/disk limits.
      if (read(String(resources.limits[dimension]), refuse) <= 0)
        refuse(`${dimension} limit must be positive`);
    }
    // Proof: Task25c3d positive-request widening admitted zero new ephemeral requests.
    if (readMemoryMiB(String(resources.requests['ephemeral-storage']), refuse) <= 0)
      refuse('ephemeral request must be positive');
  }
  // Proof: Task66 node-candidate bypass admitted absent current node-agent resources through assertVeleroCandidate.
  const nodeResources = assertCandidatePodResources(parsed.nodeAgent.resources);
  // Proof: Task66 node-positive bypass admitted zero node-agent disk requests through assertVeleroCandidate.
  if (readMemoryMiB(String(nodeResources.requests['ephemeral-storage']), refuse) <= 0)
    refuse('node-agent ephemeral request must be positive');
  // Proof: Task66 scratch-presence bypass admitted absent node-agent scratch through assertVeleroCandidate.
  if (
    parsed.nodeAgent.useScratchEmptyDir !== false ||
    parsed.nodeAgent.extraVolumes === undefined ||
    parsed.nodeAgent.extraVolumeMounts === undefined
  )
    return refuse('node-agent scratch incomplete');
  // Proof: Task66 scratch-size dependency bypass admitted zero node-agent scratch through assertVeleroCandidate.
  if (readMemoryMiB(String(parsed.nodeAgent.extraVolumes[0].emptyDir.sizeLimit), refuse) <= 0)
    refuse('node-agent scratch must be positive');
}

function elasticReferences(release: string, version: string, image: string) {
  const tag = /:([^:@]+)@/.exec(image)?.[1];
  if (tag !== version) {
    // Proof: removing this comparison made the changed-version negative resolve on 2026-09-18.
    throw new Error(`${release} version ${version} differs from its image tag ${String(tag)}`);
  }
  return { node: image };
}

const hcloudCsiReferences = (values: unknown) => {
  const parsed = decode('hcloud-csi', HcloudCsiValues, values);
  const controllerLiveness = parsed.controller.image.livenessProbe.name;
  if (controllerLiveness !== parsed.node.image.livenessProbe.name) {
    throw new Error('hcloud-csi liveness probe digests differ between controller and node');
  }
  const controllerDriver = parsed.controller.image.hcloudCSIDriver.name;
  if (controllerDriver !== parsed.node.image.hcloudCSIDriver.name) {
    throw new Error('hcloud-csi driver digests differ between controller and node');
  }
  return {
    controller: controllerDriver,
    csiAttacher: parsed.controller.image.csiAttacher.name,
    csiResizer: parsed.controller.image.csiResizer.name,
    csiProvisioner: parsed.controller.image.csiProvisioner.name,
    livenessProbe: controllerLiveness,
    csiNodeDriverRegistrar: parsed.node.image.csiNodeDriverRegistrar.name,
  };
};

const elasticsearchReferences = (values: unknown) => {
  const parsed = decode('elasticsearch', ElasticsearchValues, values);
  for (const node of parsed.nodeSets) {
    // Proof: removing this pin accepted an init with private-CA validation disabled (platform.test.ts).
    if (
      createHash('sha256')
        .update(JSON.stringify(node.podTemplate.spec.initContainers[0].command))
        .digest('hex') !== '691658bb7c580b458ff990834f7a05a3edb95c3c3cc2d80cf6517f3d72d38c8f'
    )
      throw new Error('Elasticsearch trust executable differs');
    // Proof: removing this guard accepted an unpinned trust-init image (platform.test.ts).
    if (node.podTemplate.spec.initContainers[0].image !== parsed.image)
      throw new Error('Elasticsearch trust init image differs from its pinned node image');
  }
  return elasticReferences('elasticsearch', parsed.version, parsed.image);
};

const otelReferences = (values: unknown) => {
  // Proof: Task66 historical-collector routing fault rejected valid absent/null retained resource maps.
  const parsed = type({ fullnameOverride: "'otel-collector'" }).allows(values)
    ? decode('otel-collector', CollectorValues, values)
    : decode('otel-collector', OtelValues, values);
  return {
    collector: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
  };
};

/** Decode both registered Velero releases through the same strict image/value boundary. */
export const readVeleroImageReferences = (values: unknown) => {
  const parsed = decode('velero', VeleroValues, values);
  // Proof: removing this guard admitted two effective default BSLs (platform.test.ts).
  if (parsed.configuration.backupStorageLocation.length + (parsed.extraObjects?.length ?? 0) !== 1)
    throw new Error('Velero requires exactly one default backup storage location');
  return {
    server: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
    pluginAws: parsed.initContainers[0].image,
  };
};

/** Every HelmRelease in the platform graph, in validation order. */
export const platformReleases: readonly PlatformRelease[] = [
  {
    name: 'cert-manager',
    lock: 'certManager',
    path: 'networking/cert-manager/release.yaml',
    chart: 'charts/cert-manager-v1.21.2.tgz',
    imageReferences(values) {
      const parsed = decode('cert-manager', CertManagerValues, values);
      return {
        controller: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
        webhook: imageReference(
          parsed.webhook.image.repository,
          parsed.webhook.image.tag,
          parsed.webhook.image.digest,
        ),
        caInjector: imageReference(
          parsed.cainjector.image.repository,
          parsed.cainjector.image.tag,
          parsed.cainjector.image.digest,
        ),
        acmeSolver: imageReference(
          parsed.acmesolver.image.repository,
          parsed.acmesolver.image.tag,
          parsed.acmesolver.image.digest,
        ),
        startupApiCheck: imageReference(
          parsed.startupapicheck.image.repository,
          parsed.startupapicheck.image.tag,
          parsed.startupapicheck.image.digest,
        ),
      };
    },
  },
  {
    name: 'hcloud-ccm',
    lock: 'hcloudCcm',
    path: 'storage/production/hcloud-ccm.yaml',
    chart: 'charts/hcloud-cloud-controller-manager-1.37.0.tgz',
    imageReferences(values) {
      const parsed = decode('hcloud-ccm', HcloudCcmValues, values);
      return { controller: `${parsed.image.repository}:${parsed.image.tag}` };
    },
  },
  {
    name: 'hcloud-csi',
    lock: 'hcloudCsi',
    path: 'storage/production/hcloud-csi.yaml',
    chart: 'charts/hcloud-csi-2.23.0.tgz',
    imageReferences: hcloudCsiReferences,
  },
  {
    name: 'traefik',
    lock: 'traefik',
    path: 'networking/traefik.yaml',
    chart: 'charts/traefik-41.6.0.tgz',
    imageReferences(values) {
      const parsed = decode('traefik', TraefikValues, values);
      return {
        controller: imageReference(
          `${parsed.image.registry}/${parsed.image.repository}`,
          parsed.image.tag,
          parsed.image.digest,
        ),
      };
    },
  },
  {
    name: 'eck-operator',
    lock: 'eckOperator',
    path: 'observability/eck/eck-operator.yaml',
    chart: 'charts/eck-operator-3.5.0.tgz',
    imageReferences(values) {
      const parsed = decode('eck-operator', EckOperatorValues, values);
      return {
        operator: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
      };
    },
  },
  {
    name: 'elasticsearch',
    lock: 'elasticsearch',
    path: 'observability/elastic/base/elasticsearch.yaml',
    chart: 'charts/eck-elasticsearch-0.20.0.tgz',
    imageReferences: elasticsearchReferences,
  },

  {
    name: 'kibana',
    lock: 'kibana',
    path: 'observability/kibana/kibana.yaml',
    chart: 'charts/eck-kibana-0.20.0.tgz',
    imageReferences(values) {
      const parsed = decode('kibana', KibanaValues, values);
      return elasticReferences('kibana', parsed.version, parsed.image);
    },
  },
  {
    name: 'kube-prometheus-stack',
    lock: 'kubePrometheusStack',
    path: 'observability/prometheus/kube-prometheus-stack.yaml',
    chart: 'charts/kube-prometheus-stack-91.4.1.tgz',
    imageReferences(values) {
      const parsed = decode('kube-prometheus-stack', KubePrometheusStackValues, values);
      const operator = parsed.prometheusOperator;
      const stateMetrics = parsed['kube-state-metrics'].image;
      const nodeExporter = parsed['prometheus-node-exporter'].image;
      return {
        operator: hexShaReference(operator.image),
        configReloader: hexShaReference(operator.prometheusConfigReloader.image),
        admissionWebhook: hexShaReference(operator.admissionWebhooks.deployment.image),
        admissionWebhookCertgen: hexShaReference(operator.admissionWebhooks.patch.image),
        prometheus: hexShaReference(parsed.prometheus.prometheusSpec.image),
        alertmanager: hexShaReference(parsed.alertmanager.alertmanagerSpec.image),
        kubeStateMetrics: `${stateMetrics.registry}/${stateMetrics.repository}:${stateMetrics.tag}@${stateMetrics.sha}`,
        nodeExporter: `${nodeExporter.registry}/${nodeExporter.repository}:${nodeExporter.tag}@${nodeExporter.digest}`,
      };
    },
  },
  {
    name: 'otel-collector',
    lock: 'opentelemetryCollector',
    path: 'observability/otel/collector.yaml',
    chart: 'charts/opentelemetry-collector-0.173.1.tgz',
    imageReferences: otelReferences,
  },
  {
    name: 'otel-agent',
    lock: 'opentelemetryCollector',
    path: 'telemetry/agent/agent.yaml',
    chart: 'charts/opentelemetry-collector-0.173.1.tgz',
    imageReferences: otelReferences,
  },
  {
    name: 'velero',
    lock: 'velero',
    path: 'backup/velero/local/velero.yaml',
    chart: 'charts/velero-12.2.0.tgz',
    imageReferences: readVeleroImageReferences,
  },
  {
    name: 'velero',
    lock: 'velero',
    path: 'backup/velero/production/velero.yaml',
    chart: 'charts/velero-12.2.0.tgz',
    imageReferences: readVeleroImageReferences,
  },
];

/** Current exporters and the retained collector require explicit bounds; valid missing historical maps stay image-readable. */
export function assertCommonHelmResources(release: string, values: unknown): void {
  if (release === 'otel-collector') {
    const parsed = decode(release, CollectorValues, values);
    // Proof: Task66 collector-candidate bypass admitted missing disk policy through validatePlatform.
    const resources = assertCandidatePodResources(parsed.resources);
    // Proof: Task66 collector-positive bypass admitted zero disk requests through assertCommonHelmResources.
    if (
      readMemoryMiB(String(resources.requests['ephemeral-storage']), (reason) => {
        throw new Error(reason);
      }) <= 0
    )
      throw new Error('common candidate collector ephemeral request must be positive');
    return;
  }
  if (release !== 'kube-prometheus-stack') return;
  const parsed = decode(release, KubePrometheusStackValues, values);
  for (const resources of [
    parsed['kube-state-metrics'].resources,
    parsed['prometheus-node-exporter'].resources,
  ])
    assertCandidatePodResources(resources);
}
