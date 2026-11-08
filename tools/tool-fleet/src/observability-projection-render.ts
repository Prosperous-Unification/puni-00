import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parse, parseAllDocuments } from 'yaml';

import {
  assertObservabilityProjection,
  createObservabilityProjection,
  type ObservabilityProjection,
} from './observability-projection';
import resourceInventory from './observability-projection-resources.json';
import { renderObservabilityReleases } from './observability-render';

/** Reviewed API identities for every allowed inventory kind, independent of the candidate render. */
export const ObservabilityResourceAPI = type({
  apiVersion: "'v1'",
  kind: "'ConfigMap' | 'Secret' | 'Service' | 'ServiceAccount'",
})
  .or({ apiVersion: "'apps/v1'", kind: "'DaemonSet' | 'Deployment' | 'StatefulSet'" })
  .or({ apiVersion: "'batch/v1'", kind: "'Job'" })
  .or({
    apiVersion: "'rbac.authorization.k8s.io/v1'",
    kind: "'ClusterRole' | 'ClusterRoleBinding' | 'Role' | 'RoleBinding'",
  })
  .or({ apiVersion: "'apiextensions.k8s.io/v1'", kind: "'CustomResourceDefinition'" })
  .or({
    apiVersion: "'admissionregistration.k8s.io/v1'",
    kind: "'MutatingWebhookConfiguration' | 'ValidatingWebhookConfiguration'",
  })
  .or({
    apiVersion: "'monitoring.coreos.com/v1'",
    kind: "'Alertmanager' | 'Prometheus' | 'PrometheusRule' | 'ServiceMonitor'",
  });

// Proof: removing this API intersection admits missing/malformed/foreign API identities on
// ordinary resources and native List members, including foreign groups for all 19 allowed kinds.
const Manifest = type({
  kind: 'string>0',
  metadata: { name: 'string>0', 'namespace?': 'string>0' },
}).and(ObservabilityResourceAPI);
const List = type({ apiVersion: "'v1'", kind: "'List'", items: 'unknown[]', '+': 'reject' });
const Spec = type({ spec: 'Record<string, unknown>' });
const inventory: Record<string, string[]> = resourceInventory;
export const observabilityClusterKinds = new Set([
  'CustomResourceDefinition',
  'ClusterRole',
  'ClusterRoleBinding',
  'MutatingWebhookConfiguration',
  'ValidatingWebhookConfiguration',
]);

/** Full effective YAML keyed by namespace/release identity; never resolved credential contents. */
export type ObservabilityProjectionRendering = Record<string, string>;
type ResourceIndex = Record<string, Record<string, unknown>>;

/** Render the exact approved chart-role projection through the shared pinned renderer. */
export async function renderObservabilityProjection(
  root: string,
  tools: string,
  projection: ObservabilityProjection,
): Promise<ObservabilityProjectionRendering> {
  await assertObservabilityProjection(root, projection);
  return renderObservabilityReleases(root, tools, projection.releases);
}

function flattenResource(manifest: unknown): unknown[] {
  const identity = type({ kind: 'string' }).assert(manifest);
  if (identity.kind !== 'List') return [manifest];
  // Proof: native List absent/null/malformed members refuse rather than disappearing; every member then enters exact resource closure.
  return List.assert(manifest).items.flatMap(flattenResource);
}

function indexResources(
  projection: ObservabilityProjection,
  rendered: ObservabilityProjectionRendering,
): ResourceIndex {
  const owners = projection.releases.map((release) => release.owner).sort();
  // Proof: removing this comparison admits an extra effective release owner.
  if (!isDeepStrictEqual(Object.keys(rendered).sort(), owners))
    throw new Error('Projection owner closure differs');
  const indexed: ResourceIndex = {};
  for (const owner of owners) {
    const manifests = parseAllDocuments(rendered[owner]).flatMap((document) => {
      // Proof: malformed effective YAML negative fails with this parser-error guard removed.
      if (document.errors.length) throw new Error('Malformed projection YAML');
      const manifest: unknown = document.toJSON();
      return manifest === null ? [] : flattenResource(manifest);
    });
    const entries = manifests.map((manifest) => {
      const identity = Manifest.assert(manifest);
      const namespace =
        identity.metadata.namespace ??
        (observabilityClusterKinds.has(identity.kind) ? '_' : owner.split('/')[0]);
      return [`${identity.kind}:${namespace}:${identity.metadata.name}`, manifest] as const;
    });
    // Proof: missing/duplicate/foreign/extra resources (including List members) pass the negative tests if this closed inventory comparison is removed.
    if (!isDeepStrictEqual(entries.map(([identity]) => identity).sort(), inventory[owner]))
      throw new Error(`Projection resource closure differs: ${owner}`);
    indexed[owner] = Object.fromEntries(entries);
  }
  return indexed;
}

/** Shared controller/source-reference constraints, independent of the surrounding full-service inventory. */
export function requireObservabilityProjectionReferences(
  projection: ObservabilityProjection,
  indexed: ResourceIndex,
): void {
  const dev = indexed['observability-dev/kube-prometheus-stack'];
  const prometheus = Spec.assert(dev['Prometheus:observability-dev:kps-prometheus']).spec;
  const discoveries = ['serviceMonitor', 'podMonitor', 'probe', 'rule', 'scrapeConfig'];
  // Proof: each widened resource/namespace selector and ignoreNamespaceSelectors bypass fails the dev discovery negative with this guard removed.
  if (
    prometheus['ignoreNamespaceSelectors'] !== true ||
    discoveries.some(
      (resource) =>
        !isDeepStrictEqual(prometheus[`${resource}Selector`], {
          matchLabels: { 'puni.dev/telemetry-instance': 'dev' },
        }) ||
        !isDeepStrictEqual(prometheus[`${resource}NamespaceSelector`], {
          matchLabels: { 'kubernetes.io/metadata.name': 'observability-dev' },
        }),
    )
  )
    throw new Error('Projection dev discovery selectors differ');
  for (const name of ['kps-prometheus', 'kps-alertmanager']) {
    const monitor = Spec.assert(dev[`ServiceMonitor:observability-dev:${name}`]).spec;
    // Proof: the foreign target namespace negative is admitted if this guard is removed.
    if (!isDeepStrictEqual(monitor['namespaceSelector'], { matchNames: ['observability-dev'] }))
      throw new Error('Projection dev monitor namespace differs');
  }
  for (const namespace of ['observability-dev', 'observability']) {
    const owner = `${namespace}/kube-prometheus-stack`;
    const spec = Spec.assert(indexed[owner][`Prometheus:${namespace}:kps-prometheus`]).spec;
    const storage = {
      volumeClaimTemplate: {
        spec: {
          storageClassName: 'puni-retain',
          accessModes: ['ReadWriteOnce'],
          resources: { requests: { storage: '10Gi' } },
        },
      },
    };
    // Proof: foreign Alertmanager namespace and explicitly rebound shared PV negatives pass when this reference/storage guard is removed.
    if (
      !isDeepStrictEqual(spec['storage'], storage) ||
      !isDeepStrictEqual(spec['alerting'], {
        alertmanagers: [
          {
            namespace,
            name: 'kps-alertmanager',
            port: 'http-web',
            pathPrefix: '/',
            apiVersion: 'v2',
          },
        ],
      })
    )
      throw new Error('Projection instance reference or retained storage differs');
  }
  const prod = indexed['observability/kube-prometheus-stack'];
  const operator = Spec.assert(prod['ServiceMonitor:observability:kps-operator']).spec;
  const service = type({
    metadata: { labels: 'Record<string, string>' },
    spec: { ports: 'object[]' },
  }).assert(indexed['observability/prometheus-controller']['Service:observability:kps-operator']);
  const selector = { app: 'kube-prometheus-stack-operator', release: 'prometheus-controller' };
  // Proof: operator selector/namespace/CA mutations fail when this exact retained-monitor/service binding guard is removed.
  if (
    !isDeepStrictEqual(operator, {
      selector: { matchLabels: selector },
      namespaceSelector: { matchNames: ['observability'] },
      endpoints: [
        {
          port: 'https',
          scheme: 'https',
          honorLabels: true,
          tlsConfig: {
            serverName: 'kps-operator',
            ca: { secret: { name: 'kps-admission', key: 'ca', optional: false } },
          },
        },
      ],
    }) ||
    Object.entries(selector).some(([label, value]) => service.metadata.labels[label] !== value) ||
    !isDeepStrictEqual(service.spec.ports, [{ name: 'https', port: 443, targetPort: 'https' }])
  )
    throw new Error('Projection operator monitor binding differs');
  const controller = type({
    spec: { template: { spec: { containers: type({ args: 'string[]' }).array() } } },
  }).assert(
    indexed['observability/prometheus-controller']['Deployment:observability:kps-operator'],
  );
  const watched = controller.spec.template.spec.containers
    .flatMap((container) => container.args)
    .filter((argument) =>
      /^--(?:namespaces|prometheus-instance-namespaces|alertmanager-instance-namespaces)=/.test(
        argument,
      ),
    )
    .sort();
  const eck = type({ data: { 'eck.yaml': 'string' } }).assert(
    indexed['observability/eck-operator']['ConfigMap:observability:elastic-operator'],
  );
  const managed = type({ namespaces: 'string[]' }).assert(parse(eck.data['eck.yaml']));
  // Proof: widened Prometheus and ECK watches are admitted by their production negatives with this guard removed.
  if (
    !isDeepStrictEqual(watched, [
      '--alertmanager-instance-namespaces=observability,observability-dev',
      '--namespaces=observability,observability-dev',
      '--prometheus-instance-namespaces=observability,observability-dev',
    ]) ||
    !isDeepStrictEqual(managed.namespaces, ['observability', 'observability-dev'])
  )
    throw new Error('Projection controller watches differ');
  const metric = type({
    spec: {
      endpoints: type({ metricRelabelings: type({ replacement: 'string' }).array() }).array(),
    },
  }).assert(prod['ServiceMonitor:observability:kube-prometheus-stack-kube-state-metrics']);
  // Proof: unknown/cross-profile markers pass their production negatives when this exact scalar guard is removed.
  if (
    metric.spec.endpoints[0].metricRelabelings[0].replacement !==
    `platform-${projection.request.placement}`
  )
    throw new Error('Projection placement marker differs');
}

/** Closed pinned-chart role inventory plus concrete reference checks. This does not certify full-service isolation or admission. */
export function assertRenderedObservabilityProjection(
  projection: ObservabilityProjection,
  rendered: ObservabilityProjectionRendering,
) {
  const indexed = indexResources(projection, rendered);
  requireObservabilityProjectionReferences(projection, indexed);
  const identities = Object.values(indexed).flatMap((resources) => Object.keys(resources));
  return {
    scope: 'chart-role-projection' as const,
    completeServiceGraph: false as const,
    resources: identities.length,
    crds: identities.filter((identity) => identity.startsWith('CustomResourceDefinition:')).length,
    controllers: {
      eck: identities.filter(
        (identity) => identity === 'StatefulSet:observability:elastic-operator',
      ).length,
      prometheus: identities.filter(
        (identity) => identity === 'Deployment:observability:kps-operator',
      ).length,
    },
    sources: {
      kubeStateMetrics: identities.filter(
        (identity) =>
          identity === 'Deployment:observability:kube-prometheus-stack-kube-state-metrics',
      ).length,
      nodeExporter: identities.filter(
        (identity) =>
          identity === 'DaemonSet:observability:kube-prometheus-stack-prometheus-node-exporter',
      ).length,
      collector: identities.filter(
        (identity) => identity === 'DaemonSet:observability:otel-collector-agent',
      ).length,
    },
    // The unchanged CR name and claim template preserve source identity; only observed operator workloads and preflight can bind actual claims.
    prometheusResources: ['observability-dev/kps-prometheus', 'observability/kps-prometheus'],
    claimsBound: false as const,
  };
}

/** Compare every effective field after checking exactly one permitted placement scalar; no namespace, owner or subtree is erased. */
export function assertObservabilityProjectionParity(
  localProjection: ObservabilityProjection,
  local: ObservabilityProjectionRendering,
  productionProjection: ObservabilityProjection,
  production: ObservabilityProjectionRendering,
): void {
  // Proof: comparing production against itself passes the duplicate-placement negative with this guard removed.
  if (
    localProjection.request.placement !== 'local' ||
    productionProjection.request.placement !== 'production'
  )
    throw new Error('Projection placement pair must be local and production');
  assertRenderedObservabilityProjection(localProjection, local);
  assertRenderedObservabilityProjection(productionProjection, production);
  const indexed = [
    indexResources(localProjection, local),
    indexResources(productionProjection, production),
  ];
  for (const candidate of indexed) {
    const monitor = type({
      spec: {
        endpoints: type({ metricRelabelings: type({ replacement: 'string' }).array() }).array(),
      },
    }).assert(
      candidate['observability/kube-prometheus-stack'][
        'ServiceMonitor:observability:kube-prometheus-stack-kube-state-metrics'
      ],
    );
    monitor.spec.endpoints[0].metricRelabelings[0].replacement = 'platform-placement';
  }
  // Proof: changing the adjacent relabel action to drop passes its semantic placement negative if this comparison is removed.
  if (!isDeepStrictEqual(indexed[0], indexed[1]))
    throw new Error('Projection semantic placement difference outside the reviewed cluster scalar');
}

/** Bounded source validation entrypoint; caller supplies both independent placement/instance requests explicitly. */
export async function validateObservabilityProjections(
  root: string,
  tools: string,
  input: unknown,
) {
  // Proof: the actual CLI refuses an extra request-profile key; removing this boundary admits it with otherwise valid pinned renders.
  const requests = type({ local: 'unknown', production: 'unknown', '+': 'reject' }).assert(input);
  const localProjection = await createObservabilityProjection(root, requests.local);
  const productionProjection = await createObservabilityProjection(root, requests.production);
  const local = await renderObservabilityProjection(root, tools, localProjection);
  const production = await renderObservabilityProjection(root, tools, productionProjection);
  assertObservabilityProjectionParity(localProjection, local, productionProjection, production);
  return {
    scope: 'chart-role-projection' as const,
    sourceConformant: true,
    completeServiceGraph: false,
    runtimeRehearsal: false,
    liveBinding: false,
    controllerHandoverExecuted: false,
    local: assertRenderedObservabilityProjection(localProjection, local),
    production: assertRenderedObservabilityProjection(productionProjection, production),
    renderedSHA256: {
      local: createHash('sha256').update(JSON.stringify(local)).digest('hex'),
      production: createHash('sha256').update(JSON.stringify(production)).digest('hex'),
    },
  };
}
