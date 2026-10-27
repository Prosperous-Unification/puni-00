import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { parseAllDocuments, stringify } from 'yaml';

import { createObservabilitySource, type ObservabilitySource } from './observability-source';
import {
  assertObservabilitySource,
  assertRenderedObservabilitySource,
  indexObservabilitySource,
  renderObservabilitySource,
} from './observability-source-render';
import { provisionObservabilityTools } from './observability-tools.fixture';

const tools = await provisionObservabilityTools();
const root = join(import.meta.dir, '../../..');
const network = {
  api: ['10.1.0.4/32'],
  observer: ['172.31.100.10/32'],
  grafana: ['172.31.100.11/32'],
  s3: ['172.31.100.12/32'],
  alertDelivery: ['172.31.100.13/32'],
  publicProbes: ['172.31.100.14/32'],
};
let source: ObservabilitySource;
let rendered: Record<string, string>;
beforeAll(async () => {
  source = await createObservabilitySource(root, {
    placement: 'production',
    instances: [
      { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
      { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
    ],
    network,
  });
  rendered = await renderObservabilitySource(root, tools, source);
});
test('actual full pinned source rendering closes every owner and keeps source and runtime receipts distinct', () => {
  expect(assertRenderedObservabilitySource(source, rendered)).toMatchObject({
    sourceSecurityPolicy: true,
    effectiveAuthorityVerified: false,
    activationReady: false,
  });
});
const faults: [string, string, string, (string | number)[], unknown][] = [
  ['API', 'observability-dev/elasticsearch', 'Elasticsearch', ['apiVersion'], 'foreign/v1'],
  ['selector', 'observability/kube-prometheus-stack', 'Prometheus', ['spec', 'ruleSelector'], {}],
  [
    'target',
    'observability-dev/native',
    'ServiceMonitor',
    ['spec', 'namespaceSelector'],
    { any: true },
  ],
  [
    'seccomp',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'securityContext', 'seccompProfile'],
    { type: 'Unconfined' },
  ],
  [
    'default deny',
    'observability-dev/security',
    'NetworkPolicy',
    ['spec', 'podSelector'],
    { matchLabels: { bypass: 'true' } },
  ],
  [
    'claim',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    ['spec', 'nodeSets', 0, 'volumeClaimTemplates', 0, 'spec', 'volumeName'],
    'shared-prod-volume',
  ],
  ['retention', 'observability/kube-prometheus-stack', 'Prometheus', ['spec', 'retention'], '1h'],
  [
    'AM persistence',
    'observability-dev/kube-prometheus-stack',
    'Alertmanager',
    ['spec', 'storage'],
    {},
  ],
  ['realm', 'observability-dev/elasticsearch', 'Elasticsearch', ['spec', 'auth', 'fileRealm'], []],
];
test.each(faults)(
  'full production source validator refuses independent %s fault',
  (_name, owner, kind, path, value) => {
    const mutated = { ...rendered };
    const documents = parseAllDocuments(mutated[owner]);
    const selected = documents.find((document) => document.get('kind') === kind);
    if (!selected) throw new Error('test resource absent');
    selected.setIn(path, value);
    mutated[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
    expect(() => assertRenderedObservabilitySource(source, mutated)).toThrow();
  },
);
test.each(['missing', 'duplicate', 'owner'] as const)(
  'full production source validator refuses %s closure',
  (fault) => {
    const mutated = { ...rendered };
    const owner = 'observability-dev/elasticsearch';
    if (fault === 'missing') {
      const eck = 'observability/eck-operator';
      const documents = parseAllDocuments(mutated[eck]);
      const removed = documents.findIndex(
        (document) => document.get('kind') === 'CustomResourceDefinition',
      );
      if (removed < 0) throw new Error('fixture CRD absent');
      documents.splice(removed, 1);
      mutated[eck] = documents.map((document) => stringify(document.toJSON())).join('---\n');
    }
    if (fault === 'duplicate') mutated[owner] += '\n---\n' + mutated[owner];
    if (fault === 'owner')
      mutated['foreign/owner'] = stringify({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'foreign', namespace: 'foreign' },
      });
    expect(() => assertRenderedObservabilitySource(source, mutated)).toThrow();
  },
);

test.each([
  ['S3 HTTPS', ['spec', 'nodeSets', 0, 'config', 's3.client.default.protocol'], 'http'],
  [
    'S3 init bound',
    [
      'spec',
      'nodeSets',
      0,
      'podTemplate',
      'spec',
      'initContainers',
      0,
      'resources',
      'requests',
      'memory',
    ],
    '1Mi',
  ],
  [
    'Elastic memory',
    [
      'spec',
      'nodeSets',
      0,
      'podTemplate',
      'spec',
      'containers',
      0,
      'resources',
      'limits',
      'memory',
    ],
    '512Mi',
  ],
  ['trust scratch', ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes', 0, 'emptyDir'], {}],
] as [string, (string | number)[], unknown][])(
  'full source independently rejects %s weakening',
  (_name, path, value) => {
    const changed = { ...rendered };
    const owner = 'observability-dev/elasticsearch';
    const documents = parseAllDocuments(changed[owner]);
    documents[0].setIn(path, value);
    changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
    expect(() => assertRenderedObservabilitySource(source, changed)).toThrow();
  },
);
test.each([
  'query grant',
  'ingest grant',
  'external membership',
  'external owner',
  'external disabled',
  'external API',
])('full source independently rejects %s declaration', (fault) => {
  const changed = structuredClone(source);
  if (fault === 'query grant')
    changed.instances[0].authority.healthQuery.indices[0].privileges = ['write'];
  if (fault === 'ingest grant')
    Object.assign(changed.instances[0].authority.ingest, { cluster: ['all'] });
  if (fault === 'external membership') changed.handoffs[0].resources = [];
  if (fault === 'external owner') changed.handoffs[0].owner = 'foreign/owner';
  if (fault === 'external disabled') changed.handoffs[0].enabled = false;
  if (fault === 'external API')
    changed.handoffs[0].resources[0].manifest = changed.handoffs[0].resources[0].manifest.replace(
      'monitoring.coreos.com/v1',
      'foreign/v1',
    );
  expect(() => assertRenderedObservabilitySource(changed, rendered)).toThrow();
});

test.each([
  ['Elasticsearch', 'elasticsearch.k8s.elastic.co/v1'],
  ['Kibana', 'kibana.k8s.elastic.co/v1'],
  ['NetworkPolicy', 'networking.k8s.io/v1'],
  ['Probe', 'monitoring.coreos.com/v1'],
  ['CronJob', 'batch/v1'],
])('full index independently checks %s API identity', (kind, apiVersion) => {
  const manifest = { apiVersion, kind, metadata: { name: 'identity', namespace: 'observability' } };
  expect(
    Object.keys(indexObservabilitySource({ 'observability/test': stringify(manifest) })),
  ).toEqual(['observability/test']);
  expect(() =>
    indexObservabilitySource({
      'observability/test': stringify({ ...manifest, apiVersion: 'foreign/v1' }),
    }),
  ).toThrow();
});
test('full index refuses malformed duplicate YAML keys', () => {
  expect(() =>
    indexObservabilitySource({
      'observability/test':
        'apiVersion: v1\nkind: ConfigMap\nkind: ConfigMap\nmetadata: {name: test}\n',
    }),
  ).toThrow(/malformed/);
});
test('full source rejects altered candidate before pinned render', () => {
  const changed = structuredClone(source);
  changed.activationReady = true as false;
  expect(assertObservabilitySource(root, changed)).rejects.toThrow(/packet differs/);
});

test('full source refuses omitted retained HTTP flow', () => {
  const changed = { ...rendered };
  const owner = 'observability/security';
  const documents = parseAllDocuments(changed[owner]).map(
    (document) =>
      document.toJSON() as {
        metadata: { name: string };
        spec: { ingress: { ports: { port: number }[] }[] };
      },
  );
  const reader = documents.find((document) => document.metadata.name === 'allow-reader');
  if (!reader) throw new Error('fixture policy absent');
  for (const flow of reader.spec.ingress)
    flow.ports = flow.ports.filter((port) => port.port !== 4318);
  changed[owner] = documents.map((document) => stringify(document)).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(
    /network and discovery policy/,
  );
});
test('full source refuses missing snapshot flow patch', () => {
  const changed = structuredClone(source);
  const resource = changed.handoffs
    .find((handoff) => handoff.path.endsWith('/snapshots.yaml'))
    ?.resources.find((resource) => resource.identity.includes(':CronJob:'));
  if (!resource) throw new Error('fixture CronJob absent');
  resource.patches = [];
  expect(() => assertRenderedObservabilitySource(changed, rendered)).toThrow(/snapshot flow patch/);
});

test.each(['observability-dev', 'observability'])(
  'full source independently refuses omitted reloader scrape flows in %s',
  (namespace) => {
    for (const role of ['prometheus', 'alertmanager'])
      for (const direction of ['ingress', 'egress'] as const) {
        const changed = { ...rendered };
        const owner = `${namespace}/security`;
        const policies = parseAllDocuments(changed[owner]).map(
          (document) =>
            document.toJSON() as {
              metadata: { name: string };
              spec: {
                ingress: { ports: { port: number }[] }[];
                egress: { ports: { port: number }[] }[];
              };
            },
        );
        const selected = policies.find(
          (policy) =>
            policy.metadata.name === `allow-${direction === 'egress' ? 'prometheus' : role}`,
        );
        if (!selected) throw new Error('fixture policy absent');
        for (const rule of selected.spec[direction])
          rule.ports = rule.ports.filter((port: { port: number }) => port.port !== 8080);
        changed[owner] = policies.map((policy) => stringify(policy)).join('---\n');
        expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(/scrape/);
      }
  },
);
test.each([
  'monitor endpoint',
  'monitor selector',
  'service port',
  'service target',
  'service selector',
])('full source independently refuses reloader %s mismatch', (fault) => {
  const changed = { ...rendered };
  const owner = 'observability-dev/kube-prometheus-stack';
  const documents = parseAllDocuments(changed[owner]);
  const kind = fault.startsWith('monitor') ? 'ServiceMonitor' : 'Service';
  const resource = documents.find(
    (document) =>
      document.get('kind') === kind && document.getIn(['metadata', 'name']) === 'kps-alertmanager',
  );
  if (!resource) throw new Error('fixture scrape resource absent');
  if (fault === 'monitor selector') resource.setIn(['spec', 'selector', 'matchLabels'], {});
  if (fault === 'monitor endpoint')
    resource.setIn(['spec', 'endpoints', 1, 'port'], 'missing-port');
  if (fault === 'service port') resource.setIn(['spec', 'ports', 1, 'port'], 8081);
  if (fault === 'service target')
    resource.setIn(['spec', 'ports', 1, 'targetPort'], 'foreign-port');
  if (fault === 'service selector') resource.setIn(['spec', 'selector', 'alertmanager'], 'foreign');
  changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(/scrape/);
});

test.each(['escalation', 'capability add', 'capability drop', 'missing context'])(
  'full source independently rejects ES container %s',
  (fault) => {
    for (const namespace of ['observability-dev', 'observability']) {
      const changed = { ...rendered };
      const owner = `${namespace}/elasticsearch`;
      const documents = parseAllDocuments(changed[owner]);
      const path = [
        'spec',
        'nodeSets',
        0,
        'podTemplate',
        'spec',
        'containers',
        0,
        'securityContext',
      ];
      if (fault === 'escalation') documents[0].setIn([...path, 'allowPrivilegeEscalation'], true);
      if (fault === 'capability add')
        documents[0].setIn([...path, 'capabilities', 'add'], ['SYS_ADMIN']);
      if (fault === 'capability drop') documents[0].setIn([...path, 'capabilities', 'drop'], []);
      if (fault === 'missing context') documents[0].deleteIn(path);
      changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
      expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(
        /container security/,
      );
    }
  },
);

test('full source rejects malformed scrape contract', () => {
  const changed = { ...rendered };
  const owner = 'observability-dev/kube-prometheus-stack';
  const documents = parseAllDocuments(changed[owner]);
  const service = documents.find(
    (document) =>
      document.get('kind') === 'Service' &&
      document.getIn(['metadata', 'name']) === 'kps-alertmanager',
  );
  if (!service) throw new Error('fixture Service absent');
  service.setIn(['spec', 'ports'], 'invalid');
  changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(
    /scrape contract malformed/,
  );
});

test('full source rejects malformed scrape sender policy', () => {
  const changed = { ...rendered };
  const owner = 'observability-dev/security';
  const documents = parseAllDocuments(changed[owner]);
  const policy = documents.find(
    (document) => document.getIn(['metadata', 'name']) === 'allow-prometheus',
  );
  if (!policy) throw new Error('fixture policy absent');
  policy.setIn(['spec', 'egress'], 'invalid');
  changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(
    /scrape policy malformed/,
  );
});
