import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { isNode, parseAllDocuments, parseDocument, stringify } from 'yaml';

import { assertObservabilityAssemblyResources } from './observability-composition';
import {
  observabilityClusterKinds,
  ObservabilityResourceAPI,
  requireObservabilityProjectionReferences,
} from './observability-projection-render';
import inventory from './observability-projection-resources.json';
import { assertRetainedReaderConfiguration } from './observability-reader';
import { renderObservabilityReleases } from './observability-render';
import { createObservabilitySource, type ObservabilitySource } from './observability-source';
import {
  createObservabilityDiscovery,
  createObservabilityNetworkPolicies,
  encodeObservabilitySource,
} from './observability-source-network';
import { assertObservabilitySelfScrapes } from './observability-source-scrapes';

// Proof: removing the API union made all five independent kind/API negatives accept foreign/v1 in observability-source-render.test.ts.
const API = ObservabilityResourceAPI.or({
  apiVersion: "'elasticsearch.k8s.elastic.co/v1'",
  kind: "'Elasticsearch'",
})
  .or({ apiVersion: "'kibana.k8s.elastic.co/v1'", kind: "'Kibana'" })
  .or({ apiVersion: "'networking.k8s.io/v1'", kind: "'NetworkPolicy'" })
  .or({ apiVersion: "'monitoring.coreos.com/v1'", kind: "'Probe'" })
  .or({ apiVersion: "'batch/v1'", kind: "'CronJob'" });
const Resource = type({ metadata: { name: 'string>0', 'namespace?': 'string>0' } }).and(API);
const List = type({ apiVersion: "'v1'", kind: "'List'", items: 'unknown[]', '+': 'reject' });
const Map = type('Record<string,unknown>');
export type ObservabilitySourceIndex = Record<string, Record<string, Record<string, unknown>>>;
function flatten(input: unknown): unknown[] {
  const identity = type({ kind: 'string' }).assert(input);
  return identity.kind === 'List' ? List.assert(input).items.flatMap(flatten) : [input];
}
/** Independently reviewed API identities and namespace-qualified resources; unknown APIs never borrow an allowed basename. */
export function indexObservabilitySource(
  rendered: Record<string, string>,
): ObservabilitySourceIndex {
  const indexed: ObservabilitySourceIndex = {};
  const global = new Set<string>();
  for (const [owner, source] of Object.entries(rendered)) {
    const resources: Record<string, Record<string, unknown>> = {};
    const documents = parseAllDocuments(source).flatMap((document) => {
      // Proof: removing YAML-error refusal admitted duplicate kind keys in the full index negative.
      if (document.errors.length) throw new Error('Observability source malformed rendered YAML');
      const manifest: unknown = document.toJSON();
      return manifest === null ? [] : flatten(manifest);
    });
    for (const manifest of documents) {
      const identity = Resource.assert(manifest);
      const namespace =
        identity.metadata.namespace ??
        (observabilityClusterKinds.has(identity.kind) ? '_' : owner.split('/')[0]);
      const key = `${identity.kind}:${namespace}:${identity.metadata.name}`;
      // Proof: removing global identity uniqueness admitted duplicate resources in the full source closure negative.
      if (global.has(key)) throw new Error('Observability source duplicate resource');
      global.add(key);
      resources[key] = Map.assert(manifest);
    }
    indexed[owner] = resources;
  }
  return indexed;
}
/** The assembly's draft flags remain immutable; the full source packet is separately regenerated before external consumption. */
export async function assertObservabilitySource(
  root: string,
  source: ObservabilitySource,
): Promise<void> {
  const expected = await createObservabilitySource(root, {
    ...source.assembly.request,
    network: source.network,
  });
  // Proof: removing regeneration equality admitted a changed activation flag before rendering in the altered-candidate negative.
  if (!isDeepStrictEqual(source, expected))
    throw new Error('Observability source packet differs from contract');
}
/** All nine pinned releases and all native/security resources, without any API-server contact or ownership adoption. */
export async function renderObservabilitySource(
  root: string,
  tools: string,
  source: ObservabilitySource,
): Promise<Record<string, string>> {
  await assertObservabilitySource(root, source);
  const rendered = await renderObservabilityReleases(root, tools, source.releases);
  for (const instance of source.instances) {
    rendered[`${instance.namespace}/native`] = instance.native;
    rendered[`${instance.namespace}/security`] = instance.security;
  }
  return rendered;
}
function requireEqual(actual: unknown, expected: unknown, category: string) {
  // Proof: disabling equality made 16 independent policy negatives accept selector/deny/claim/role/retention/S3/security faults; category-specific removal admitted missing CRD and extra owner negatives in observability-source-render.test.ts.
  if (!isDeepStrictEqual(actual, expected))
    throw new Error(`Observability source ${category} differs`);
}
function requirePath(
  manifest: unknown,
  path: (string | number)[],
  expected: unknown,
  category: string,
) {
  const node = parseDocument(stringify(manifest)).getIn(path);
  const actual: unknown = isNode(node) ? node.toJSON() : node;
  requireEqual(actual, expected, category);
}
/** Full source checks certify desired policy only. Material, admission, claims, handover, stored signals and live activation remain separately unverified. */
export function assertRenderedObservabilitySource(
  source: ObservabilitySource,
  rendered: Record<string, string>,
) {
  const indexed = indexObservabilitySource(rendered);
  const owners = [
    ...source.releases.map((release) => release.owner),
    ...source.instances.flatMap((instance) => [
      `${instance.namespace}/native`,
      `${instance.namespace}/security`,
    ]),
  ].sort();
  requireEqual(Object.keys(rendered).sort(), owners, 'owner closure');
  const chartInventory: Record<string, string[]> = structuredClone(inventory);
  chartInventory['observability/kube-prometheus-stack'] = chartInventory[
    'observability/kube-prometheus-stack'
  ].filter(
    (identity) =>
      !['ClusterRole:_:kps-prometheus', 'ClusterRoleBinding:_:kps-prometheus'].includes(identity),
  );
  for (const instance of source.instances) {
    chartInventory[`${instance.namespace}/elasticsearch`] = [
      `Elasticsearch:${instance.namespace}:elasticsearch`,
    ];
    chartInventory[`${instance.namespace}/kibana`] = [`Kibana:${instance.namespace}:kibana`];
  }
  for (const [owner, identities] of Object.entries(chartInventory))
    requireEqual(Object.keys(indexed[owner]).sort(), identities.sort(), 'resource closure');
  requireObservabilityProjectionReferences(source.assembly.projection, indexed);
  for (const instance of source.instances) {
    const namespace = instance.namespace;
    requireEqual(
      instance.authority.healthQuery,
      {
        cluster: [],
        indices: [
          {
            names: [`logs-*.otel-${instance.environment}`, `traces-*.otel-${instance.environment}`],
            privileges: ['read'],
          },
        ],
      },
      'readonly query role',
    );
    requireEqual(
      instance.authority.metricsQuery,
      {
        paths: ['/api/v1/query', '/api/v1/query_range'],
        methods: ['GET', 'POST'],
        mutations: false,
        credentialReuse: false,
      },
      'metrics query authority',
    );
    requireEqual(
      instance.authority.ingest,
      {
        cluster: [],
        indices: [
          {
            names: [
              `logs-*.otel-${instance.environment}`,
              `traces-*.otel-${instance.environment}`,
              `metrics-*.otel-${instance.environment}`,
            ],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
        username: 'signal-ingest',
        role: 'signal-ingest-writer',
        nodeDiscovery: false,
      },
      'minimal ingest role',
    );

    assertObservabilityAssemblyResources(rendered[`${namespace}/native`], namespace);
    const native = indexed[`${namespace}/native`];
    requireEqual(
      native,
      indexObservabilitySource({ [`${namespace}/native`]: instance.native })[`${namespace}/native`],
      'native policy',
    );
    assertObservabilitySelfScrapes(
      namespace,
      indexed[`${namespace}/kube-prometheus-stack`],
      indexed[`${namespace}/security`],
    );
    const security = encodeObservabilitySource([
      ...createObservabilityDiscovery(namespace),
      ...createObservabilityNetworkPolicies(namespace, source.network, source.enrolled),
    ]);
    requireEqual(
      indexed[`${namespace}/security`],
      indexObservabilitySource({ [`${namespace}/security`]: security })[`${namespace}/security`],
      'network and discovery policy',
    );
    const prom =
      indexed[`${namespace}/kube-prometheus-stack`][`Prometheus:${namespace}:kps-prometheus`];
    for (const family of ['serviceMonitor', 'podMonitor', 'probe', 'rule', 'scrapeConfig']) {
      requirePath(
        prom,
        ['spec', `${family}Selector`],
        { matchLabels: { 'puni.dev/telemetry-instance': instance.environment } },
        'selector',
      );
      requirePath(
        prom,
        ['spec', `${family}NamespaceSelector`],
        { matchLabels: { 'kubernetes.io/metadata.name': namespace } },
        'namespace selector',
      );
    }
    requirePath(
      prom,
      ['spec', 'ignoreNamespaceSelectors'],
      instance.environment === 'dev' ? true : undefined,
      'target bounds',
    );
    requirePath(prom, ['spec', 'retention'], '15d', 'retention');
    requirePath(prom, ['spec', 'retentionSize'], '8GB', 'retention');
    const am =
      indexed[`${namespace}/kube-prometheus-stack`][`Alertmanager:${namespace}:kps-alertmanager`];
    requirePath(
      am,
      ['spec', 'storage'],
      {
        volumeClaimTemplate: {
          spec: {
            storageClassName: 'puni-retain',
            accessModes: ['ReadWriteOnce'],
            resources: { requests: { storage: '1Gi' } },
          },
        },
      },
      'Alertmanager persistence',
    );
    requirePath(
      am,
      ['spec', 'persistentVolumeClaimRetentionPolicy'],
      { whenDeleted: 'Retain', whenScaled: 'Retain' },
      'Alertmanager retention',
    );
    const es = indexed[`${namespace}/elasticsearch`][`Elasticsearch:${namespace}:elasticsearch`];
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'config', 's3.client.default.protocol'],
      'https',
      'verified S3 protocol',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'config', 's3.client.default.endpoint'],
      source.assembly.request.placement === 'local'
        ? 'object-store.puni-backup.svc:9000'
        : 'hel1.your-objectstorage.com',
      'S3 endpoint',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'initContainers', 0, 'env'],
      [
        {
          name: 'S3_TRUST_MODE',
          value:
            source.assembly.request.placement === 'local' ? 'system-roots-plus-ca' : 'system-roots',
        },
      ],
      'S3 trust mode',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'initContainers', 0, 'resources'],
      { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } },
      'S3 measured init bound',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes', 0, 'emptyDir'],
      { sizeLimit: '16Mi' },
      'trust scratch bound',
    );
    for (const bound of ['requests', 'limits']) {
      requirePath(
        es,
        [
          'spec',
          'nodeSets',
          0,
          'podTemplate',
          'spec',
          'containers',
          0,
          'resources',
          bound,
          'memory',
        ],
        instance.policy === 'retained-production' ? '4Gi' : '2Gi',
        'Elastic memory bound',
      );
      requirePath(
        es,
        [
          'spec',
          'nodeSets',
          0,
          'podTemplate',
          'spec',
          'containers',
          0,
          'resources',
          bound,
          'ephemeral-storage',
        ],
        '1Gi',
        'Elastic scratch bound',
      );
    }

    // Proof: skipping this equality admitted escalation/capability/missing-context faults and the same weakened ES policy in both placement parity inputs.
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'containers', 0, 'securityContext'],
      { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } },
      'Elasticsearch container security',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'securityContext'],
      {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      'Elasticsearch security',
    );
    requirePath(
      es,
      ['spec', 'nodeSets', 0, 'volumeClaimTemplates'],
      [
        {
          metadata: { name: 'elasticsearch-data' },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'puni-retain',
            resources: { requests: { storage: instance.capacity.storage } },
          },
        },
      ],
      'Elasticsearch independent claim',
    );
    requirePath(
      es,
      ['spec', 'auth'],
      {
        fileRealm: [
          { secretName: 'signal-health-users' },
          { secretName: 'signal-ingest-users' },
          ...(instance.environment === 'prod' ? [{ secretName: 'platform-ingest-users' }] : []),
        ],
        roles: [
          { secretName: 'signal-health-roles' },
          { secretName: 'signal-ingest-roles' },
          ...(instance.environment === 'prod' ? [{ secretName: 'platform-ingest-roles' }] : []),
        ],
      },
      'Elastic identity roles',
    );
    const kibana = indexed[`${namespace}/kibana`][`Kibana:${namespace}:kibana`];
    requirePath(
      kibana,
      ['spec', 'elasticsearchRef'],
      { name: 'elasticsearch', namespace },
      'Kibana store reference',
    );
    for (const manifest of Object.values(indexed[`${namespace}/kube-prometheus-stack`])) {
      const identity = Resource.assert(manifest);
      if (identity.kind !== 'ServiceMonitor') continue;
      const targets =
        identity.metadata.name === 'kps-apiserver'
          ? ['default']
          : ['kps-coredns', 'kps-kubelet'].includes(identity.metadata.name)
            ? ['kube-system']
            : [namespace];
      requirePath(
        manifest,
        ['spec', 'namespaceSelector'],
        identity.metadata.name === 'kube-prometheus-stack-prometheus-node-exporter'
          ? undefined
          : { matchNames: targets },
        'monitor target',
      );
      requirePath(
        manifest,
        ['metadata', 'labels', 'puni.dev/telemetry-instance'],
        instance.environment,
        'monitor ownership label',
      );
    }
  }
  const external: Record<string, { owner: string; identities: string[] }> = {
    'infra/platform/alerts/base/rules.yaml': {
      owner: 'flux-system/alerts',
      identities: ['PrometheusRule:observability:puni-platform'],
    },
    'infra/platform/alerts/base/probes.yaml': {
      owner: 'flux-system/alerts',
      identities: ['Probe:observability:platform-endpoints'],
    },
    'infra/platform/alerts/production/public-probes.yaml': {
      owner: 'flux-system/alerts',
      identities: ['Probe:observability:public-endpoints'],
    },
    'infra/platform/observability/prometheus/blackbox-exporter.yaml': {
      owner: 'flux-system/observability',
      identities: [
        'ConfigMap:observability:blackbox-exporter',
        'Deployment:observability:blackbox-exporter',
        'Service:observability:blackbox-exporter',
      ],
    },
    'infra/platform/backup/elastic/snapshots.yaml': {
      owner: 'flux-system/backup',
      identities: [
        'ConfigMap:observability:elastic-snapshots',
        'Job:observability:elastic-snapshots',
        'CronJob:observability:elastic-snapshot-check',
      ],
    },
  };
  requireEqual(
    source.handoffs.map((handoff) => handoff.path).sort(),
    Object.keys(external).sort(),
    'external path closure',
  );
  for (const handoff of source.handoffs) {
    const expected = external[handoff.path];
    requireEqual(handoff.owner, expected.owner, 'external owner');
    requireEqual(
      handoff.enabled,
      !handoff.path.includes('/production/public-probes') ||
        source.assembly.request.placement === 'production',
      'external membership',
    );
    requireEqual(handoff.applied, false, 'external adoption');
    const manifests = indexObservabilitySource({
      'observability/external': handoff.resources
        .map((resource) => stringify(parseDocument(resource.manifest).toJSON()))
        .join('---\n'),
    })['observability/external'];
    requireEqual(
      Object.keys(manifests).sort(),
      expected.identities.sort(),
      'external resource closure',
    );
    for (const resource of handoff.resources) {
      const manifest = Resource.assert(parseDocument(resource.manifest).toJSON());
      requireEqual(
        resource.identity,
        `${manifest.apiVersion}:${manifest.kind}:${manifest.metadata.namespace ?? '_'}:${manifest.metadata.name}`,
        'external reference',
      );
      if (manifest.kind === 'CronJob') {
        const metadata = type({ 'labels?': 'Record<string,string>' }).assert(
          parseDocument(
            stringify(
              parseDocument(resource.manifest).getIn([
                'spec',
                'jobTemplate',
                'spec',
                'template',
                'metadata',
              ]) ?? {},
            ),
          ).toJSON(),
        );
        // Proof: skipping this comparison admitted a missing snapshot flow patch in observability-source-render.test.ts.
        requireEqual(
          resource.patches,
          [
            {
              op: 'add',
              path: '/spec/jobTemplate/spec/template/metadata',
              value: {
                ...metadata,
                labels: { ...metadata.labels, 'puni.dev/observability-flow': 'snapshot-check' },
              },
            },
          ],
          'snapshot flow patch',
        );
      }
      if (['PrometheusRule', 'Probe'].includes(manifest.kind)) {
        const metadata = type({ metadata: { 'labels?': 'Record<string,string>' } }).assert(
          manifest,
        ).metadata;
        requireEqual(
          resource.patches,
          [
            {
              op: 'add',
              path: '/metadata/labels',
              value: { ...metadata.labels, 'puni.dev/telemetry-instance': 'prod' },
            },
          ],
          'external selector patch',
        );
      }
    }
  }
  const reader =
    indexed['observability/otel-collector']['ConfigMap:observability:otel-collector-agent'];
  const configuration = type({ data: { relay: 'string' } }).assert(reader).data.relay;
  assertRetainedReaderConfiguration(configuration);
  const config = parseDocument(configuration);
  requirePath(
    config.toJSON(),
    ['exporters', 'elasticsearch', 'user'],
    'platform-ingest',
    'platform ingest identity',
  );
  requirePath(
    config.toJSON(),
    ['exporters', 'elasticsearch', 'password'],
    '${env:PLATFORM_INGEST_PASSWORD}',
    'platform ingest reference',
  );
  requirePath(
    config.toJSON(),
    ['exporters', 'elasticsearch', 'discover'],
    { on_start: false, interval: '0s' },
    'platform ingest discovery',
  );
  requireEqual(
    source.platformAuthority,
    {
      cluster: [],
      indices: [
        {
          names: [`logs-puni.otel-${source.assembly.request.placement}`],
          privileges: ['auto_configure', 'create_doc'],
        },
      ],
      trustDomain: 'platform',
      excludedApplicationIdentities: ['dev', 'prod'],
      effectiveAcceptanceVerified: false,
    },
    'platform authority',
  );
  for (const [receiver, protocol] of [
    ['otlp', 'grpc'],
    ['otlp', 'http'],
    ['otlp/mtls', 'grpc'],
  ]) {
    requirePath(
      config.toJSON(),
      ['receivers', receiver, 'protocols', protocol, 'tls', 'client_ca_file'],
      '/etc/otel/client-trust/ca.crt',
      'platform client trust',
    );
    requirePath(
      config.toJSON(),
      ['receivers', receiver, 'protocols', protocol, 'tls', 'min_version'],
      '1.3',
      'platform TLS',
    );
  }
  return {
    scope: 'full-service-source-validation' as const,
    resources: Object.values(indexed).reduce(
      (count, resources) => count + Object.keys(resources).length,
      0,
    ),
    sourceSecurityPolicy: true as const,
    effectiveAuthorityVerified: false as const,
    operatorAdmissionVerified: false as const,
    claimsBound: false as const,
    controllerHandoverExecuted: false as const,
    runtimeRehearsal: false as const,
    liveBinding: false as const,
    activationReady: false as const,
  };
}
