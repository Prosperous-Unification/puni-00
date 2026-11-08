import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { validatePlatform } from './platform';

const Request = type({
  placement: "'local' | 'production'",
  instances: [
    { environment: "'dev'", namespace: "'observability-dev'", '+': 'reject' },
    { environment: "'prod'", namespace: "'observability'", '+': 'reject' },
  ],
  '+': 'reject',
});

/** Declared source placement and independently admitted instances; no context, observed UID or credential material. */
export type ObservabilityProjectionRequest = typeof Request.infer;
export type ObservabilityProjectionRole = 'controllers' | 'dev' | 'prod' | 'platform';

/** One Helm owner may satisfy both the production store and platform-source roles without rendering twice. */
export interface ObservabilityProjectionRelease {
  owner: string;
  roles: ObservabilityProjectionRole[];
  chart: 'eckOperator' | 'kubePrometheusStack' | 'opentelemetryCollector';
  manifest: string;
}

/** Source conformance only. ES/Kibana, app signals, isolation and fresh target binding belong to the complete service candidate. */
export interface ObservabilityProjection {
  scope: 'chart-role-projection';
  completeServiceGraph: false;
  request: ObservabilityProjectionRequest;
  declaredTarget: string;
  controllerHandover: {
    from: string;
    to: string;
    executed: false;
    requires: 'observed ownership and reviewed handover';
  };
  releases: ObservabilityProjectionRelease[];
}

const directory = 'infra/platform/observability';
const monitoringPath = `${directory}/prometheus/kube-prometheus-stack.yaml`;
const sourcePaths = {
  eck: `${directory}/eck/eck-operator.yaml`,
  monitoring: monitoringPath,
  collector: `${directory}/otel/collector.yaml`,
};

async function projectRelease(
  root: string,
  path: string,
  changes: readonly (readonly [readonly string[], unknown])[],
): Promise<string> {
  const document = parseDocument(await readFile(join(root, path), 'utf8'));
  // validatePlatform already parsed and checked this source path; only the declared projection fields change.
  for (const [location, value] of changes) document.setIn(location, value);
  return document.toString();
}

/** Build additive chart-role projections without writing or selecting any Flux path. Current source validation remains authoritative. */
export async function createObservabilityProjection(
  root: string,
  input: unknown,
): Promise<ObservabilityProjection> {
  // Proof: wrong namespace, duplicate environment, invented live identity, missing placement and third-cluster negatives reject here.
  const request = Request.assert(input);
  await validatePlatform(root);
  const namespaces = ['observability', 'observability-dev'];
  const values = ['spec', 'values'];
  const controller = await projectRelease(root, sourcePaths.monitoring, [
    [['metadata', 'name'], 'prometheus-controller'],
    [[...values, 'prometheus', 'enabled'], false],
    [[...values, 'alertmanager', 'enabled'], false],
    [[...values, 'nodeExporter', 'enabled'], false],
    [[...values, 'kubeStateMetrics', 'enabled'], false],
    [[...values, 'kubernetesServiceMonitors', 'enabled'], false],
    [[...values, 'defaultRules', 'create'], false],
    ...['kubeApiServer', 'kubelet', 'coreDns', 'kubeDns'].map(
      (component) => [[...values, component, 'enabled'], false] as const,
    ),
    [[...values, 'prometheusOperator', 'serviceMonitor', 'selfMonitor'], false],
    [
      [...values, 'prometheusOperator', 'namespaces'],
      {
        releaseNamespace: true,
        additional: ['observability-dev'],
      },
    ],
    [[...values, 'prometheusOperator', 'prometheusInstanceNamespaces'], namespaces],
    [[...values, 'prometheusOperator', 'alertmanagerInstanceNamespaces'], namespaces],
  ]);
  const eck = await projectRelease(root, sourcePaths.eck, [
    [[...values, 'managedNamespaces'], namespaces],
  ]);
  const disableController = [
    [[...values, 'crds', 'enabled'], false],
    [[...values, 'prometheusOperator', 'enabled'], false],
    [[...values, 'prometheusOperator', 'admissionWebhooks', 'enabled'], false],
    [[...values, 'prometheusOperator', 'admissionWebhooks', 'patch', 'enabled'], false],
  ] as const;
  const prod = await projectRelease(root, sourcePaths.monitoring, [
    ...disableController,
    [['spec', 'dependsOn'], [{ name: 'prometheus-controller' }]],
    [
      [...values, 'prometheus', 'additionalServiceMonitors'],
      [
        {
          name: 'kps-operator',
          selector: {
            matchLabels: {
              app: 'kube-prometheus-stack-operator',
              release: 'prometheus-controller',
            },
          },
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
        },
      ],
    ],
    [
      [...values, 'kube-state-metrics', 'prometheus', 'monitor', 'metricRelabelings'],
      [
        {
          targetLabel: 'puni_cluster',
          replacement: `platform-${request.placement}`,
          action: 'replace',
        },
      ],
    ],
  ]);
  const devNamespace = request.instances[0].namespace;
  const dev = await projectRelease(root, sourcePaths.monitoring, [
    ...disableController,
    [['metadata', 'namespace'], devNamespace],
    [['spec', 'dependsOn'], [{ name: 'prometheus-controller', namespace: 'observability' }]],
    [[...values, 'commonLabels'], { 'puni.dev/telemetry-instance': 'dev' }],
    [[...values, 'global', 'rbac', 'create'], false],
    [[...values, 'nodeExporter', 'enabled'], false],
    [[...values, 'kubeStateMetrics', 'enabled'], false],
    [[...values, 'defaultRules', 'create'], false],
    ...['kubeApiServer', 'kubelet', 'coreDns', 'kubeDns'].map(
      (component) => [[...values, component, 'enabled'], false] as const,
    ),
    [[...values, 'prometheus', 'prometheusSpec', 'ignoreNamespaceSelectors'], true],
    ...['serviceMonitor', 'podMonitor', 'probe', 'rule', 'scrapeConfig'].flatMap((resource) => [
      [
        [...values, 'prometheus', 'prometheusSpec', `${resource}SelectorNilUsesHelmValues`],
        false,
      ] as const,
      [
        [...values, 'prometheus', 'prometheusSpec', `${resource}Selector`],
        {
          matchLabels: { 'puni.dev/telemetry-instance': 'dev' },
        },
      ] as const,
      [
        [...values, 'prometheus', 'prometheusSpec', `${resource}NamespaceSelector`],
        {
          matchLabels: { 'kubernetes.io/metadata.name': devNamespace },
        },
      ] as const,
    ]),
  ]);
  return {
    scope: 'chart-role-projection',
    completeServiceGraph: false,
    request,
    declaredTarget: `platform-${request.placement}`,
    controllerHandover: {
      from: 'observability/kube-prometheus-stack',
      to: 'observability/prometheus-controller',
      executed: false,
      requires: 'observed ownership and reviewed handover',
    },
    releases: [
      {
        owner: 'observability/eck-operator',
        roles: ['controllers'],
        chart: 'eckOperator',
        manifest: eck,
      },
      {
        owner: 'observability/prometheus-controller',
        roles: ['controllers'],
        chart: 'kubePrometheusStack',
        manifest: controller,
      },
      {
        owner: 'observability-dev/kube-prometheus-stack',
        roles: ['dev'],
        chart: 'kubePrometheusStack',
        manifest: dev,
      },
      {
        owner: 'observability/kube-prometheus-stack',
        roles: ['prod', 'platform'],
        chart: 'kubePrometheusStack',
        manifest: prod,
      },
      {
        owner: 'observability/otel-collector',
        roles: ['platform'],
        chart: 'opentelemetryCollector',
        manifest: await readFile(join(root, sourcePaths.collector), 'utf8'),
      },
    ],
  };
}

/** Compare externally retained projection content to its complete source-derived owner and role closure. */
export async function assertObservabilityProjection(
  root: string,
  projection: ObservabilityProjection,
): Promise<void> {
  const expected = await createObservabilityProjection(root, projection.request);
  // Proof: duplicate, foreign, missing and modified owner projections fail; removing equality admits each injected fault.
  if (!isDeepStrictEqual(projection, expected))
    throw new Error('Observability projection differs from its source contract');
}

/** Select chart prerequisites only; platform collection additionally requires the retained production sink and its named external service. */
export function selectObservabilityProjection(
  projection: ObservabilityProjection,
  selection: readonly string[],
) {
  // Proof: duplicate/foreign/empty role and platform-without-prod negatives fail when this guard is removed.
  if (
    selection.length === 0 ||
    new Set(selection).size !== selection.length ||
    selection.some((role) => !['dev', 'prod', 'platform'].includes(role)) ||
    (selection.includes('platform') && !selection.includes('prod'))
  )
    throw new Error(
      'Projection selection must name distinct application roles and bind platform sources to prod',
    );
  return {
    scope: projection.scope,
    completeServiceGraph: projection.completeServiceGraph,
    releases: projection.releases.filter(
      (release) =>
        release.roles.includes('controllers') ||
        release.roles.some((role) => selection.includes(role)),
    ),
    requiredServices: selection.includes('platform') ? ['observability/elasticsearch'] : [],
  };
}
