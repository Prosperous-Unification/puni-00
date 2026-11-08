import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import { observabilityInputs, renderObservabilityConfiguration } from './observability';
import {
  assertObservabilityAssemblyResources,
  createObservabilityComposition,
  selectObservabilityComposition,
} from './observability-composition';
import { assertRetainedReaderConfiguration } from './observability-reader';
import { type ObservabilityRenderRelease } from './observability-render';
import {
  createObservabilityDiscovery,
  createObservabilityNetworkPolicies,
  decodeObservabilitySourceNetwork,
  encodeObservabilitySource,
} from './observability-source-network';

const Input = type({
  placement: "'local'|'production'",
  instances: 'unknown[]',
  network: 'unknown',
  '+': 'reject',
});
const Configuration = type({ metadata: { name: 'string' }, data: 'Record<string,string>' });
const Metadata = type({
  apiVersion: 'string',
  kind: 'string',
  metadata: { name: 'string', 'namespace?': 'string' },
});
const label = 'puni.dev/telemetry-instance';
function addressConfiguration(files: Record<string, string>): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.keys(files)
          .sort()
          .map((filename) => [filename, files[filename]]),
      ),
    )
    .digest('hex');
}
/** Re-address only the four independently validated namespace-local content maps and their known Pod/Job volumes after source policy composition. */
function refreshConfiguration(
  source: string,
  namespace: string,
  configuration: Record<string, string>,
): string {
  assertObservabilityAssemblyResources(source, namespace);
  const documents = parseAllDocuments(source);
  const names = new Map<string, string>();
  for (const document of documents) {
    if (document.get('kind') !== 'ConfigMap') continue;
    const map = Configuration.assert(document.toJSON());
    const base = map.metadata.name.slice(0, -65);
    if (base === 'signal-configuration') document.set('data', configuration);
    const files = Configuration.assert(document.toJSON()).data;
    const name = `${base}-${addressConfiguration(files)}`;
    names.set(map.metadata.name, name);
    document.setIn(['metadata', 'name'], name);
  }
  for (const document of documents) {
    if (document.get('kind') === 'NetworkPolicy') document.setIn(['spec', 'ingress'], []);
    if (document.get('kind') === 'ServiceMonitor') {
      document.setIn(['metadata', 'labels', label], namespace === 'observability' ? 'prod' : 'dev');
      document.setIn(['spec', 'namespaceSelector'], { matchNames: [namespace] });
    }
    if (
      document.get('kind') === 'StatefulSet' &&
      document.getIn(['metadata', 'name']) === 'signal-gateway'
    ) {
      document.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'env'],
        [
          {
            name: 'ELASTIC_INGEST_PASSWORD',
            valueFrom: { secretKeyRef: { name: 'signal-elastic-ingest', key: 'password' } },
          },
        ],
      );
    }
    for (const [old, name] of names) {
      const volumes = type({ spec: { template: { spec: { volumes: 'object[]' } } } })(
        document.toJSON(),
      );
      if (volumes instanceof type.errors) continue;
      for (let index = 0; index < volumes.spec.template.spec.volumes.length; index++) {
        const path = ['spec', 'template', 'spec', 'volumes', index, 'configMap', 'name'];
        if (document.getIn(path) === old) document.setIn(path, name);
      }
    }
  }
  const encoded = documents.map((document) => stringify(document.toJSON())).join('---\n');
  assertObservabilityAssemblyResources(encoded, namespace);
  return encoded;
}
async function readDesiredPeers(root: string) {
  const inventory = parseDocument(
    await readFile(join(root, 'infra/ansible/inventory/production-existing-hosts.yml'), 'utf8'),
  );
  const desired = parseDocument(await readFile(join(root, 'infra/fleet/desired.yaml'), 'utf8'));
  // Proof: without this parser guard, duplicate inventory keys produced a successful source packet in observability-source-trusted.test.ts (inventory YAML fault).
  if (inventory.errors.length || desired.errors.length)
    throw new Error('Observability source desired network YAML malformed');
  const peers = type('string[]')(
    parseDocument(
      stringify(inventory.getIn(['all', 'vars', 'puni_enrolled_private_addresses'])),
    ).toJSON(),
  );
  // Proof: removing declared-peer equality admitted 10.1.0.3 in observability-source-trusted.test.ts (enrolled peers fault).
  if (
    peers instanceof type.errors ||
    JSON.stringify(peers) !== JSON.stringify(['10.1.0.4', '10.1.0.2']) ||
    inventory.getIn(['all', 'vars', 'puni_registration_url']) !== 'https://10.1.0.4:6443' ||
    !desired.toString().includes('apiEndpoint: https://10.1.0.4:6443')
  )
    throw new Error('Observability source desired network intent differs');
  return peers.map((address) => `${address}/32`);
}
/** Complete desired source packet. Supplied network hosts are explicit operator declarations, not observations or effective bindings. */
export async function createObservabilitySource(root: string, input: unknown) {
  const decoded = Input(input);
  if (decoded instanceof type.errors) throw new Error('Invalid observability source request');
  const network = decodeObservabilitySourceNetwork(decoded.network);
  const assembly = await createObservabilityComposition(root, {
    placement: decoded.placement,
    instances: decoded.instances,
  });
  const enrolled = await readDesiredPeers(root);
  const releases: ObservabilityRenderRelease[] = structuredClone(
    selectObservabilityComposition(assembly, ['dev', 'prod', 'platform']).releases,
  );
  const instances = assembly.instances.map((instance) => {
    const inputs = observabilityInputs(assembly.request.placement, instance);
    inputs.trust.elasticsearch.username = 'signal-ingest';
    inputs.trust.elasticsearch.passwordEnv = 'ELASTIC_INGEST_PASSWORD';
    const configuration = renderObservabilityConfiguration(root, inputs);
    const gateway = parseDocument(configuration['gateway.yaml']);
    gateway.setIn(['exporters', 'elasticsearch/otel', 'discover'], {
      on_start: false,
      interval: '0s',
    });
    gateway.setIn(['exporters', 'elasticsearch/otel', 'mapping', 'allowed_modes'], ['otel']);
    configuration['gateway.yaml'] = gateway.toString();
    const monitoring = releases.find((release) => release.owner === instance.monitoring.owner);
    const elastic = releases.find(
      (release) => release.owner === `${instance.namespace}/elasticsearch`,
    );
    if (!monitoring || !elastic) throw new Error('Observability source required owner absent');
    const monitor = parseDocument(monitoring.manifest);
    monitor.setIn(['spec', 'values', 'global', 'rbac', 'create'], false);
    monitor.setIn(['spec', 'values', 'commonLabels', label], instance.environment);
    if (instance.environment === 'prod') {
      for (const chart of ['kube-state-metrics', 'prometheus-node-exporter'])
        monitor.setIn(
          ['spec', 'values', chart, 'prometheus', 'monitor', 'additionalLabels', label],
          'prod',
        );
      monitor.setIn(
        ['spec', 'values', 'kube-state-metrics', 'prometheus', 'monitor', 'namespaceSelector'],
        [instance.namespace],
      );
    }
    for (const family of ['serviceMonitor', 'podMonitor', 'probe', 'rule', 'scrapeConfig']) {
      monitor.setIn(['spec', 'values', 'prometheus', 'prometheusSpec', `${family}Selector`], {
        matchLabels: { [label]: instance.environment },
      });
      monitor.setIn(
        ['spec', 'values', 'prometheus', 'prometheusSpec', `${family}NamespaceSelector`],
        { matchLabels: { 'kubernetes.io/metadata.name': instance.namespace } },
      );
    }
    monitor.setIn(
      ['spec', 'values', 'prometheus', 'prometheusSpec', 'ignoreNamespaceSelectors'],
      instance.environment === 'dev',
    );
    monitoring.manifest = monitor.toString();
    const es = parseDocument(elastic.manifest);
    es.setIn(
      ['spec', 'values', 'auth', 'fileRealm'],
      [
        { secretName: 'signal-health-users' },
        { secretName: 'signal-ingest-users' },
        ...(instance.environment === 'prod' ? [{ secretName: 'platform-ingest-users' }] : []),
      ],
    );
    es.setIn(
      ['spec', 'values', 'auth', 'roles'],
      [
        { secretName: 'signal-health-roles' },
        { secretName: 'signal-ingest-roles' },
        ...(instance.environment === 'prod' ? [{ secretName: 'platform-ingest-roles' }] : []),
      ],
    );
    elastic.manifest = es.toString();
    return {
      ...instance,
      native: refreshConfiguration(instance.native, instance.namespace, configuration),
      security: encodeObservabilitySource([
        ...createObservabilityDiscovery(instance.namespace),
        ...createObservabilityNetworkPolicies(instance.namespace, network, enrolled),
      ]),
      authority: {
        ...instance.authority,
        ingest: {
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
      },
      requiredSecrets: [
        ...instance.requiredSecrets.map((secret) =>
          secret.name === 'elasticsearch-es-elastic-user'
            ? { ...secret, authority: 'setup-admin' }
            : secret,
        ),
        {
          name: 'signal-elastic-ingest',
          keys: ['password'],
          authority: 'ingest-client',
          provisioner: 'external',
        },
        {
          name: 'signal-ingest-users',
          keys: ['users', 'users_roles'],
          authority: 'ingest-file-realm',
          provisioner: 'external',
        },
        {
          name: 'signal-ingest-roles',
          keys: ['roles.yml'],
          authority: 'ingest-role',
          provisioner: 'external',
        },
        ...(instance.environment === 'prod'
          ? [
              {
                name: 'platform-elastic-ingest',
                keys: ['password'],
                authority: 'platform-ingest-client',
                provisioner: 'external',
              },
              {
                name: 'platform-ingest-users',
                keys: ['users', 'users_roles'],
                authority: 'platform-ingest-file-realm',
                provisioner: 'external',
              },
              {
                name: 'platform-ingest-roles',
                keys: ['roles.yml'],
                authority: 'platform-ingest-role',
                provisioner: 'external',
              },
            ]
          : []),
      ],
    };
  });
  const reader = releases.find((release) => release.owner === assembly.retainedReader.owner);
  if (!reader) throw new Error('Observability source reader owner absent');
  const manifest = parseDocument(reader.manifest);
  manifest.setIn(['spec', 'values', 'extraEnvs', 0], {
    name: 'PLATFORM_INGEST_PASSWORD',
    valueFrom: { secretKeyRef: { name: 'platform-elastic-ingest', key: 'password' } },
  });
  manifest.setIn(
    ['spec', 'values', 'alternateConfig', 'exporters', 'elasticsearch', 'user'],
    'platform-ingest',
  );
  manifest.setIn(
    ['spec', 'values', 'alternateConfig', 'exporters', 'elasticsearch', 'password'],
    '${env:PLATFORM_INGEST_PASSWORD}',
  );
  manifest.setIn(['spec', 'values', 'alternateConfig', 'exporters', 'elasticsearch', 'discover'], {
    on_start: false,
    interval: '0s',
  });
  manifest.setIn(['spec', 'values', 'serviceMonitor', 'extraLabels', label], 'prod');
  const tls = manifest.getIn(
    ['spec', 'values', 'alternateConfig', 'receivers', 'otlp/mtls', 'protocols', 'grpc', 'tls'],
    true,
  );
  if (tls === undefined) throw new Error('Observability source retained reader TLS absent');
  for (const protocol of ['grpc', 'http'])
    manifest.setIn(
      ['spec', 'values', 'alternateConfig', 'receivers', 'otlp', 'protocols', protocol, 'tls'],
      tls,
    );
  reader.manifest = manifest.toString();
  assertRetainedReaderConfiguration(
    stringify(manifest.getIn(['spec', 'values', 'alternateConfig'], true)),
  );
  const paths = [
    'infra/platform/alerts/base/rules.yaml',
    'infra/platform/alerts/base/probes.yaml',
    'infra/platform/alerts/production/public-probes.yaml',
    'infra/platform/observability/prometheus/blackbox-exporter.yaml',
    'infra/platform/backup/elastic/snapshots.yaml',
  ];
  const handoffs = [];
  for (const path of paths) {
    const source = await readFile(join(root, path), 'utf8');
    const profile =
      path === 'infra/platform/alerts/base/rules.yaml' &&
      assembly.request.placement === 'production'
        ? parseDocument(
            await readFile(
              join(root, 'infra/platform/alerts/production/kustomization.yaml'),
              'utf8',
            ),
          )
        : undefined;
    const resources = parseAllDocuments(source).map((document) => {
      if (document.errors.length)
        throw new Error('Observability source external resource YAML malformed');
      const identity = Metadata.assert(document.toJSON());
      if (profile !== undefined) {
        const changes = type({ patches: type({ patch: 'string' }).array() }).assert(
          profile.toJSON(),
        );
        for (const change of changes.patches) {
          const edits = type({ op: "'replace'", path: 'string', value: 'string' })
            .array()
            .assert(parseDocument(change.patch).toJSON());
          for (const edit of edits) {
            const keys = edit.path
              .slice(1)
              .split('/')
              .map((key) => (/^\d+$/.test(key) ? Number(key) : key));
            if (!document.hasIn(keys))
              throw new Error('Observability source external patch target absent');
            document.setIn(keys, edit.value);
          }
        }
      }
      const patches: object[] = [];
      if (['PrometheusRule', 'Probe'].includes(identity.kind)) {
        const labels = type('Record<string,string>')(document.getIn(['metadata', 'labels']) ?? {});
        if (labels instanceof type.errors)
          throw new Error('Observability source external labels malformed');
        patches.push({
          op: 'add',
          path: '/metadata/labels',
          value: { ...labels, [label]: 'prod' },
        });
      }
      if (identity.kind === 'CronJob' && identity.metadata.name === 'elastic-snapshot-check') {
        const metadata = type({ 'labels?': 'Record<string,string>' }).assert(
          parseDocument(
            stringify(
              document.getIn(['spec', 'jobTemplate', 'spec', 'template', 'metadata']) ?? {},
            ),
          ).toJSON(),
        );
        // Proof: targeting the absent metadata/labels parent failed the same-owner snapshot patch control; create metadata while preserving its existing fields.
        patches.push({
          op: 'add',
          path: '/spec/jobTemplate/spec/template/metadata',
          value: {
            ...metadata,
            labels: { ...metadata.labels, 'puni.dev/observability-flow': 'snapshot-check' },
          },
        });
      }
      return {
        identity: `${identity.apiVersion}:${identity.kind}:${identity.metadata.namespace ?? '_'}:${identity.metadata.name}`,
        manifest: document.toString(),
        patches,
      };
    });
    handoffs.push({
      path,
      owner: path.includes('/alerts/')
        ? 'flux-system/alerts'
        : path.includes('/backup/')
          ? 'flux-system/backup'
          : 'flux-system/observability',
      enabled:
        path !== 'infra/platform/alerts/production/public-probes.yaml' ||
        assembly.request.placement === 'production',
      resources,
      applied: false as const,
    });
  }
  return {
    scope: 'full-service-desired-source' as const,
    assembly,
    network,
    enrolled,
    releases,
    instances,
    handoffs,
    requiredBindingsVerified: false as const,
    platformAuthority: {
      cluster: [],
      indices: [
        {
          names: [`logs-puni.otel-${assembly.request.placement}`],
          privileges: ['auto_configure', 'create_doc'],
        },
      ],
      trustDomain: 'platform',
      excludedApplicationIdentities: ['dev', 'prod'],
      effectiveAcceptanceVerified: false as const,
    },
    migrationPrerequisites: [
      'actual retained plaintext listener clients must pass authenticated canaries before transition',
      'same-owner external patches must be reviewed and applied',
      'namespace identity and admission remain observed prerequisites',
    ],
    retainedListeners: [4317, 4318, 14317].map((port) => ({
      owner: assembly.retainedReader.owner,
      port,
      desiredAuthentication: 'mtls',
      trustDomain: 'platform',
      effectiveAcceptanceVerified: false as const,
    })),
    runtimeRehearsal: false as const,
    liveBinding: false as const,
    activationReady: false as const,
  };
}
export type ObservabilitySource = Awaited<ReturnType<typeof createObservabilitySource>>;
