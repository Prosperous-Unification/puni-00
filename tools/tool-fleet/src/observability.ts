import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  createSignalConfiguration,
  renderSignalConfiguration,
  type SignalInputs,
} from '@tools/observability-signals';
import { type } from 'arktype';
import { parse, stringify } from 'yaml';

import { readToolchain } from './contracts';
import { applicationMiB, assessObservabilityBudget } from './observability-budget';

/** The platform DaemonSet alone owns filelog/host collection; application instances receive OTLP. */
export function observabilityInputs(environment: 'local' | 'production'): SignalInputs {
  return {
    deployment: { cluster: `platform-${environment}`, namespace: 'observability' },
    source: {
      collection: 'external',
      environment: environment === 'production' ? 'prod' : 'dev',
      admittedEnvironments: [environment === 'production' ? 'prod' : 'dev'],
      infrastructureClusters: [`platform-${environment}`, `workers-${environment}`],
      filelogExcludes: ['/var/log/pods/observability_signal-*/*/*.log'],
    },
    endpoints: {
      collectorHttp: '0.0.0.0:4318',
      collectorPlatformGrpc: '0.0.0.0:14317',
      gatewayGrpc: '0.0.0.0:4317',
      gatewayUpstream: 'signal-gateway.observability.svc:4317',
      platformGrpc: '0.0.0.0:14317',
      platformUpstream: 'signal-gateway.observability.svc:14317',
      elasticsearch: 'https://elasticsearch-es-http.observability.svc:9200',
      metricsRemoteWrite: 'https://signal-metrics.observability.svc:8443/api/v1/write',
    },
    trust: {
      collector: {
        certFile: '/trust/server/tls.crt',
        keyFile: '/trust/server/tls.key',
        clientCaFile: '/trust/clients/ca.crt',
      },
      gateway: {
        certFile: '/trust/server/tls.crt',
        keyFile: '/trust/server/tls.key',
        clientCaFile: '/trust/clients/ca.crt',
      },
      upstream: {
        caFile: '/trust/upstream/ca.crt',
        certFile: '/trust/client/tls.crt',
        keyFile: '/trust/client/tls.key',
        serverName: 'signal-gateway.observability.svc',
      },
      elasticsearch: {
        caFile: '/trust/elastic/ca.crt',
        username: 'elastic',
        passwordEnv: 'ELASTIC_PASSWORD',
      },
      metrics: {
        caFile: '/trust/metrics/ca.crt',
        username: 'writer',
        passwordFile: '/trust/metrics/password',
      },
    },
    capacity: {
      queueBytes: 16777216,
      collectorMemoryMiB: 384,
      collectorSpikeMiB: 64,
      gatewayMemoryMiB: 768,
      gatewaySpikeMiB: 128,
    },
    retention: {
      logs: '30d',
      traces: '7d',
      aggregates: '7d',
      rolloverAge: '1d',
      rolloverSize: '10gb',
      replicas: 0,
      metricsTime: '15d',
      metricsSize: '8GB',
    },
  };
}

const metadata = (name: string) => ({ name, namespace: 'observability' });
const labels = (name: string) => ({ 'app.kubernetes.io/name': name });
const resources = (memory: number) => ({
  requests: { cpu: '100m', memory: `${String(memory)}Mi` },
  limits: { cpu: '1', memory: `${String(memory)}Mi` },
});
const securityContext = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ['ALL'] },
};
const podSecurity = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  fsGroup: 1000,
  seccompProfile: { type: 'RuntimeDefault' },
};
const selector = { 'puni.dev/capability-observability': 'true' };
const secretVolume = (name: string, secretName: string) => ({ name, secret: { secretName } });
const mount = (name: string, mountPath: string) => ({ name, mountPath, readOnly: true });
const documents = (manifests: readonly object[]) =>
  manifests.map((manifest) => stringify(manifest)).join('---\n');

function createSignalWorkload(role: 'collector' | 'gateway', image: string) {
  const name = `signal-${role}`;
  const isCollector = role === 'collector';
  const ports = isCollector
    ? [
        { name: 'otlp-http', containerPort: 4318 },
        { name: 'platform', containerPort: 14317 },
        { name: 'probe-metrics', containerPort: 8889 },
      ]
    : [
        { name: 'otlp', containerPort: 4317 },
        { name: 'platform', containerPort: 14317 },
      ];
  const volumes = [
    { name: 'configuration', configMap: { name: 'signal-configuration' } },
    secretVolume('server', `${name}-tls`),
    secretVolume('clients', 'signal-client-trust'),
    ...(isCollector
      ? [
          secretVolume('client', 'signal-collector-client'),
          secretVolume('upstream', 'signal-gateway-trust'),
          secretVolume('metrics', 'signal-metrics-writer'),
        ]
      : [secretVolume('elastic', 'elasticsearch-es-http-certs-public')]),
  ];
  const mounts = [
    mount('configuration', '/configuration'),
    mount('server', '/trust/server'),
    mount('clients', '/trust/clients'),
    { name: 'state', mountPath: isCollector ? '/var/lib/otelcol' : '/var/lib/elastic-agent' },
    ...(isCollector
      ? [
          mount('client', '/trust/client'),
          mount('upstream', '/trust/upstream'),
          mount('metrics', '/trust/metrics'),
        ]
      : [mount('elastic', '/trust/elastic')]),
  ];
  return [
    {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: metadata(name),
      spec: {
        serviceName: name,
        replicas: 1,
        selector: { matchLabels: labels(name) },
        persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Retain', whenScaled: 'Retain' },
        template: {
          metadata: {
            labels: labels(name),
            annotations: { 'puni.dev/platform-collection-owner': 'otel-collector' },
          },
          spec: {
            automountServiceAccountToken: false,
            nodeSelector: selector,
            securityContext: podSecurity,
            containers: [
              {
                name: role,
                image,
                command: isCollector
                  ? ['/otelcol-contrib']
                  : ['/usr/share/elastic-agent/elastic-agent'],
                args: isCollector
                  ? ['--config=/configuration/collector.yaml']
                  : ['otel', '--config=/configuration/gateway.yaml'],
                ...(isCollector
                  ? {}
                  : {
                      env: [
                        {
                          name: 'ELASTIC_PASSWORD',
                          valueFrom: {
                            secretKeyRef: { name: 'elasticsearch-es-elastic-user', key: 'elastic' },
                          },
                        },
                      ],
                    }),
                ports: [
                  ...ports,
                  { name: 'metrics', containerPort: 8888 },
                  { name: 'health', containerPort: 13133 },
                ],
                resources: resources(
                  isCollector ? applicationMiB.collector : applicationMiB.gateway,
                ),
                securityContext,
                readinessProbe: { httpGet: { path: '/', port: 'health' }, periodSeconds: 10 },
                livenessProbe: {
                  httpGet: { path: '/', port: 'health' },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
                volumeMounts: mounts,
              },
            ],
            volumes,
          },
        },
        volumeClaimTemplates: [
          {
            metadata: { name: 'state' },
            spec: {
              storageClassName: 'puni-retain',
              accessModes: ['ReadWriteOnce'],
              resources: { requests: { storage: '2Gi' } },
            },
          },
        ],
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: metadata(name),
      spec: {
        type: 'ClusterIP',
        selector: labels(name),
        ports: [...ports, { name: 'metrics', containerPort: 8888 }].map((port) => ({
          name: port.name,
          port: port.containerPort,
          targetPort: port.name,
        })),
      },
    },
    {
      apiVersion: 'monitoring.coreos.com/v1',
      kind: 'ServiceMonitor',
      metadata: metadata(name),
      spec: {
        selector: { matchLabels: labels(name) },
        endpoints: [{ port: 'metrics' }, ...(isCollector ? [{ port: 'probe-metrics' }] : [])],
      },
    },
  ].map((manifest) =>
    manifest.kind === 'Service'
      ? { ...manifest, metadata: { ...manifest.metadata, labels: labels(name) } }
      : manifest,
  );
}

function createMetricsProxy(image: string) {
  const name = 'signal-metrics';
  const configuration = {
    http: {
      routers: {
        write: {
          entryPoints: ['metrics'],
          rule: 'Path(`/api/v1/write`) && Method(`POST`)',
          middlewares: ['write'],
          service: 'prometheus',
          tls: {},
        },
        query: {
          entryPoints: ['metrics'],
          rule: '(Path(`/api/v1/query`) || Path(`/api/v1/query_range`)) && (Method(`GET`) || Method(`POST`))',
          middlewares: ['query'],
          service: 'prometheus',
          tls: {},
        },
      },
      middlewares: {
        write: { basicAuth: { usersFile: '/auth/write/users', removeHeader: true } },
        query: { basicAuth: { usersFile: '/auth/query/users', removeHeader: true } },
      },
      services: {
        prometheus: {
          loadBalancer: { servers: [{ url: 'http://kps-prometheus.observability.svc:9090' }] },
        },
      },
    },
    tls: {
      certificates: [{ certFile: '/tls/tls.crt', keyFile: '/tls/tls.key' }],
      options: { default: { minVersion: 'VersionTLS13' } },
    },
  };
  return [
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: metadata(name),
      data: { 'dynamic.yaml': stringify(configuration) },
    },
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: metadata(name),
      spec: {
        replicas: 1,
        selector: { matchLabels: labels(name) },
        template: {
          metadata: { labels: labels(name) },
          spec: {
            automountServiceAccountToken: false,
            securityContext: podSecurity,
            nodeSelector: selector,
            containers: [
              {
                name: 'proxy',
                image,
                args: [
                  '--entrypoints.metrics.address=:8443',
                  '--providers.file.filename=/configuration/dynamic.yaml',
                  '--api=false',
                  '--global.checknewversion=false',
                  '--global.sendanonymoususage=false',
                ],
                ports: [{ name: 'https', containerPort: 8443 }],
                resources: resources(applicationMiB.metricsProxy),
                securityContext,
                readinessProbe: { tcpSocket: { port: 'https' } },
                volumeMounts: [
                  mount('configuration', '/configuration'),
                  mount('tls', '/tls'),
                  mount('write', '/auth/write'),
                  mount('query', '/auth/query'),
                ],
              },
            ],
            volumes: [
              { name: 'configuration', configMap: { name } },
              secretVolume('tls', 'signal-metrics-tls'),
              secretVolume('write', 'signal-metrics-write-auth'),
              secretVolume('query', 'signal-metrics-query-auth'),
            ],
          },
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: metadata(name),
      spec: {
        type: 'ClusterIP',
        selector: labels(name),
        ports: [{ name: 'https', port: 8443, targetPort: 'https' }],
      },
    },
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: metadata(name),
      spec: {
        podSelector: { matchLabels: labels(name) },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { 'kubernetes.io/metadata.name': 'observability' },
                },
              },
            ],
            ports: [{ protocol: 'TCP', port: 8443 }],
          },
        ],
      },
    },
  ];
}

/** Flux recreates this bounded Job when its hash-named retention/mapping inputs change. */
function createRetentionJob(image: string) {
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'elastic-settings',
      namespace: 'observability',
      annotations: {
        'kustomize.toolkit.fluxcd.io/force': 'enabled',
      },
    },
    spec: {
      backoffLimit: 10,
      activeDeadlineSeconds: 1200,
      template: {
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000,
            seccompProfile: {
              type: 'RuntimeDefault',
            },
          },
          containers: [
            {
              name: 'apply',
              image: image,
              command: ['bun', '/settings/apply.js'],
              env: [
                {
                  name: 'ELASTIC_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'elasticsearch-es-elastic-user',
                      key: 'elastic',
                    },
                  },
                },
              ],
              resources: {
                requests: {
                  cpu: '10m',
                  memory: '32Mi',
                },
                limits: {
                  cpu: '200m',
                  memory: '128Mi',
                },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: {
                  drop: ['ALL'],
                },
              },
              volumeMounts: [
                {
                  name: 'settings',
                  mountPath: '/settings',
                  readOnly: true,
                },
                {
                  name: 'failure-fields',
                  mountPath: '/failure-fields',
                  readOnly: true,
                },
                {
                  name: 'es-ca',
                  mountPath: '/es-ca',
                  readOnly: true,
                },
              ],
            },
          ],
          volumes: [
            {
              name: 'settings',
              configMap: {
                name: 'signal-configuration',
              },
            },
            {
              name: 'failure-fields',
              configMap: {
                name: 'elastic-failure-fields',
              },
            },
            {
              name: 'es-ca',
              secret: {
                secretName: 'elasticsearch-es-http-certs-public',
              },
            },
          ],
        },
      },
    },
  };
}

/** Deterministic committed inputs consumed by Flux; no host generator or credential material. */
export async function renderObservability(root: string): Promise<Record<string, string>> {
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const image = (
    images: readonly { role: string; name: string; digest: string }[],
    role: string,
  ) => {
    // readToolchain has already required the exact chart role sets; this internal lookup cannot be absent.
    const [pinned] = images.filter((candidate) => candidate.role === role);
    return `${pinned.name}@${pinned.digest}`;
  };
  const files: Record<string, string> = {
    'observability/elastic/settings/settings.yaml': stringify(
      createRetentionJob(
        `${lock.runtimeImages.sqliteBackup.name}@${lock.runtimeImages.sqliteBackup.digest}`,
      ),
    ),
    'observability/base/coexistence.json': JSON.stringify(await assessObservabilityBudget(root)),
    'observability/base/signals.yaml': documents([
      ...createSignalWorkload(
        'collector',
        image(lock.charts.opentelemetryCollector.images, 'collector'),
      ),
      ...createSignalWorkload(
        'gateway',
        `${lock.runtimeImages.elasticGateway.name}@${lock.runtimeImages.elasticGateway.digest}`,
      ),
    ]),
    'observability/base/metrics.yaml': documents([
      ...createMetricsProxy(image(lock.charts.traefik.images, 'controller')),
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: metadata('prometheus-private'),
        spec: {
          podSelector: { matchLabels: { 'app.kubernetes.io/name': 'prometheus' } },
          policyTypes: ['Ingress'],
          ingress: [
            {
              from: [
                {
                  podSelector: { matchLabels: { 'app.kubernetes.io/instance': 'otel-collector' } },
                },
                { podSelector: { matchLabels: labels('signal-metrics') } },
                { podSelector: { matchLabels: { 'app.kubernetes.io/name': 'prometheus' } } },
              ],
              ports: [{ protocol: 'TCP', port: 9090 }],
            },
          ],
        },
      },
    ]),
  };
  for (const environment of ['local', 'production'] as const) {
    const inputs = observabilityInputs(environment);
    const paths = {
      collector: join(root, 'infra/platform/observability/otel/collector.yaml'),
      agent: join(root, 'infra/platform/telemetry/agent/agent.yaml'),
      failureFields: join(
        root,
        'infra/platform/observability/elastic/settings/failure-fields.json',
      ),
    };
    const configuration = createSignalConfiguration(inputs, paths);
    const rendered = renderSignalConfiguration(inputs, configuration, paths);
    for (const [name, content] of Object.entries(rendered).filter(
      ([name]) => name !== 'failure-fields.json',
    ))
      files[`observability/${environment}/${name}`] = content;
    const policies = configuration.retention;
    const statements = [
      `const { Bun, process, Buffer, fetch, AbortSignal } = globalThis;
const password = process.env.ELASTIC_PASSWORD;
// Proof: retention Job refuses missing credentials; removing this check admits an empty credential.
if (!password) throw new Error('ELASTIC_PASSWORD is required');
const ca = await Bun.file('/es-ca/ca.crt').text();
const url = 'https://elasticsearch-es-http.observability.svc:9200';
/** The filtered health and acknowledgement contracts are closed; unknown outcomes fail the Job. */
function assertResponse(response, contract) {
  // Proof: retention Job rejects health/mutation missing, null, unknown fields and wrong values;
  // removing this guard makes those production-program negative controls fail.
  if (response === null || typeof response !== 'object' || Array.isArray(response) ||
      Object.keys(response).length !== Object.keys(contract).length ||
      !Object.entries(contract).every(([key, values]) => Object.hasOwn(response, key) && values.includes(response[key])))
    throw new Error('Invalid retention response');
}
/** TLS, credentials, redirect refusal and timeout apply to every health/mutation exchange. */
async function request(path, method, body) {
  const response = await fetch(url + path, {
    method, body, redirect: 'error', signal: AbortSignal.timeout(150000), tls: { ca },
    headers: { authorization: 'Basic ' + Buffer.from('elastic:' + password).toString('base64'), 'content-type': 'application/json' },
  });
  // Proof: retention Job rejects health and mutation HTTP 503/202 even with otherwise valid JSON;
  // removing this guard makes those production-program negative controls fail.
  if (response.status !== 200) throw new Error('Retention HTTP ' + String(response.status));
  return await response.json();
}
assertResponse(await request('/_cluster/health?wait_for_status=yellow&timeout=120s&filter_path=status,timed_out', 'GET'),
  { status: ['yellow', 'green'], timed_out: [false] });
async function mutate(path, filename) {
  assertResponse(await request(path, 'PUT', await Bun.file(import.meta.dir + '/' + filename).text()), { acknowledged: [true] });
}`,
    ];
    for (const [signal, policy] of Object.entries(policies.elastic)) {
      files[`observability/${environment}/${signal}-policy.json`] = JSON.stringify(policy.policy);
      files[`observability/${environment}/${signal}-template.json`] = JSON.stringify(
        policy.template,
      );
    }
    statements.push(`const retention = JSON.parse(await Bun.file(import.meta.dir + '/retention.json').text());
for (const signal of ['logs', 'traces', 'metrics']) {
  const policy = retention.elastic[signal];
  await mutate('/_ilm/policy/' + policy.policyName, signal + '-policy.json');
  await mutate('/_component_template/' + policy.templateName, signal + '-template.json');
}`);
    files[`observability/${environment}/apply.js`] = statements.join('\n') + '\n';
  }
  return files;
}

/** Reject drift in the production caller before Flux planning, including auth, queues and omitted pipelines. */
export async function assertObservability(root: string): Promise<void> {
  const prometheus = type({
    spec: {
      values: { prometheus: { prometheusSpec: { retention: 'string', retentionSize: 'string' } } },
    },
  }).assert(
    parse(
      await readFile(
        join(root, 'infra/platform/observability/prometheus/kube-prometheus-stack.yaml'),
        'utf8',
      ),
    ),
  ).spec.values.prometheus.prometheusSpec;
  const retention = observabilityInputs('production').retention;
  // Proof: removing this guard accepts changed TSDB duration or size in production-path retention negatives.
  if (
    prometheus.retention !== retention.metricsTime ||
    prometheus.retentionSize !== retention.metricsSize
  )
    throw new Error('observability requires shared Prometheus retention');

  const platform = type({
    spec: {
      values: {
        alternateConfig: {
          processors: 'Record<string, unknown>',
          service: {
            pipelines: { logs: { processors: 'string[]' }, metrics: { processors: 'string[]' } },
          },
        },
      },
    },
  }).assert(
    parse(await readFile(join(root, 'infra/platform/observability/otel/collector.yaml'), 'utf8')),
  ).spec.values.alternateConfig;
  const expression = 'resource.attributes["deployment.environment.name"] != nil';
  // Proof: removing this comparison accepts independent logs/metrics application-exclusion changes in validatePlatform.
  if (
    !isDeepStrictEqual(platform.processors['filter/platform-only'], {
      error_mode: 'propagate',
      logs: { log_record: [expression] },
      metrics: { datapoint: [expression] },
    })
  )
    throw new Error('observability platform-only application exclusion required');
  for (const pipeline of Object.values(platform.service.pipelines)) {
    // Proof: removing this registration guard accepts independent logs/metrics bypasses in validatePlatform.
    if (!pipeline.processors.includes('filter/platform-only'))
      throw new Error('observability platform-only pipeline registration required');
  }

  for (const [path, expected] of Object.entries(await renderObservability(root))) {
    // Proof: gateway/routing/retention/write-auth mutations reject through validatePlatform in observability-parity.test.ts.
    // Proof: absent ENOENT and chmod-000 EACCES retention faults reject independently in the production validator.
    const actual = await readFile(join(root, 'infra/platform', path), 'utf8');
    if (actual !== expected) throw new Error(`observability generated artifact differs: ${path}`);
  }
}
