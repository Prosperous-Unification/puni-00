import { type } from 'arktype';

import type { Toolchain } from './contracts';

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
  deployment: {
    kind: "'DaemonSet'",
    dnsPolicy: "'ClusterFirstWithHostNet'",
    '+': 'reject',
  },
  hostNetwork: 'true',
  updateStrategy: {
    type: "'RollingUpdate'",
    rollingUpdate: { maxUnavailable: 'number', maxSurge: 'number', '+': 'reject' },
    '+': 'reject',
  },
  nodeSelector: { 'puni.dev/capability-ingress': "'true'", '+': 'reject' },
  '+': 'reject',
});

const CertManagerValues = type({
  crds: { enabled: 'true', '+': 'reject' },
  image: ImageValues,
  webhook: { image: ImageValues, '+': 'reject' },
  cainjector: { image: ImageValues, '+': 'reject' },
  acmesolver: { image: ImageValues, '+': 'reject' },
  startupapicheck: { image: ImageValues, '+': 'reject' },
  '+': 'reject',
});

const HcloudCcmValues = type({
  image: { repository: 'string>0', tag: 'string>0', '+': 'reject' },
  '+': 'reject',
});

const HcloudCsiImage = type({ name: 'string>0', tag: "''", '+': 'reject' });
const HcloudCsiValues = type({
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
  resources: Resources,
  nodeSelector: ObservabilityNode,
  config: { containerRegistry: "'docker.elastic.co'", '+': 'reject' },
  '+': 'reject',
});

const ElasticContainer = type({
  name: "'elasticsearch'",
  env: Env,
  resources: Resources,
  '+': 'reject',
});
const ElasticsearchValues = type({
  fullnameOverride: "'elasticsearch'",
  version: 'string>0',
  image: 'string>0',
  secureSettings: type({ secretName: 'string>0', '+': 'reject' }).array(),
  volumeClaimDeletePolicy: "'DeleteOnScaledownOnly'",
  nodeSets: type({
    name: 'string>0',
    count: 'number.integer>0',
    // Elasticsearch settings cannot select a container image.
    config: 'Record<string, string | number | boolean>',
    podTemplate: {
      spec: {
        nodeSelector: ObservabilityNode,
        containers: ElasticContainer.array().exactlyLength(1),
        '+': 'reject',
      },
      '+': 'reject',
    },
    volumeClaimTemplates: type({
      metadata: { name: "'elasticsearch-data'", '+': 'reject' },
      spec: {
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
    prometheusConfigReloader: { image: HexShaImage, '+': 'reject' },
    admissionWebhooks: {
      deployment: { image: HexShaImage, '+': 'reject' },
      patch: { image: HexShaImage, '+': 'reject' },
      '+': 'reject',
    },
    resources: Resources,
    nodeSelector: ObservabilityNode,
    '+': 'reject',
  },
  prometheus: {
    prometheusSpec: {
      image: HexShaImage,
      retention: 'string>0',
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
    image: {
      registry: 'string>0',
      repository: 'string>0',
      tag: 'string>0',
      sha: /^sha256:[0-9a-f]{64}$/,
      '+': 'reject',
    },
    resources: Resources,
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
    resources: Resources,
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
  fullnameOverride: "'otel-collector'",
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
  ports: type({ '[string]': { enabled: 'boolean', '+': 'reject' } }),
  service: { enabled: 'true', '+': 'reject' },
  serviceMonitor: {
    enabled: 'true',
    metricsEndpoints: type({ port: "'metrics'", '+': 'reject' }).array().exactlyLength(1),
    '+': 'reject',
  },
  // Collector pipeline configuration; it cannot select a container image.
  alternateConfig: 'object',
  '+': 'reject',
});

const VeleroValues = type({
  image: ImageValues,
  upgradeCRDs: 'false',
  initContainers: type({
    name: "'velero-plugin-for-aws'",
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
    backupStorageLocation: 'object[]',
    '+': 'reject',
  },
  resources: Resources,
  nodeAgent: { resources: Resources, tolerations: TolerateAll, '+': 'reject' },
  metrics: { serviceMonitor: { enabled: 'true', '+': 'reject' }, '+': 'reject' },
  // Backup schedules select namespaces and volumes, never images.
  schedules: 'Record<string, object>',
  '+': 'reject',
});

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
  return elasticReferences('elasticsearch', parsed.version, parsed.image);
};

const veleroReferences = (values: unknown) => {
  const parsed = decode('velero', VeleroValues, values);
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
    path: 'networking/cert-manager.yaml',
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
    path: 'observability/elastic/local/elasticsearch.yaml',
    chart: 'charts/eck-elasticsearch-0.20.0.tgz',
    imageReferences: elasticsearchReferences,
  },
  {
    name: 'elasticsearch',
    lock: 'elasticsearch',
    path: 'observability/elastic/production/elasticsearch.yaml',
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
    imageReferences(values) {
      const parsed = decode('otel-collector', OtelValues, values);
      return {
        collector: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
      };
    },
  },
  {
    name: 'velero',
    lock: 'velero',
    path: 'backup/velero/local/velero.yaml',
    chart: 'charts/velero-12.2.0.tgz',
    imageReferences: veleroReferences,
  },
  {
    name: 'velero',
    lock: 'velero',
    path: 'backup/velero/production/velero.yaml',
    chart: 'charts/velero-12.2.0.tgz',
    imageReferences: veleroReferences,
  },
];
