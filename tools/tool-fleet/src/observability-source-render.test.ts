import { join } from 'node:path';

import { type } from 'arktype';
import { beforeAll, expect, test } from 'bun:test';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import { createObservabilitySource, type ObservabilitySource } from './observability-source';
import {
  assertObservabilitySource,
  assertRenderedObservabilitySource,
  indexObservabilitySource,
  type ObservabilitySourceIndex,
  renderObservabilitySource,
} from './observability-source-render';
import { assertObservabilitySelectedResources } from './observability-source-resources';
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
let indexed: ObservabilitySourceIndex;
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
  indexed = indexObservabilitySource(rendered);
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

const TestResource = type('Record<string,unknown>');
const TestContainers = type({
  name: 'string',
  'resources?': {
    requests: 'Record<string, string | number>',
    limits: 'Record<string, string | number>',
  },
}).array();
const TestVolumes = type({ name: 'string', 'emptyDir?': 'object' }).array();
const selectedPods: [string, string, (string | number)[], string[], string[]][] = [
  [
    'observability-dev/elasticsearch',
    'Elasticsearch',
    ['spec', 'nodeSets', 0, 'podTemplate', 'spec'],
    ['elasticsearch'],
    [
      'prepare-s3-trust',
      'elastic-internal-init-filesystem',
      'elastic-internal-init-keystore',
      'elastic-internal-suspend',
    ],
  ],
  [
    'observability/elasticsearch',
    'Elasticsearch',
    ['spec', 'nodeSets', 0, 'podTemplate', 'spec'],
    ['elasticsearch'],
    [
      'prepare-s3-trust',
      'elastic-internal-init-filesystem',
      'elastic-internal-init-keystore',
      'elastic-internal-suspend',
    ],
  ],
  [
    'observability-dev/kibana',
    'Kibana',
    ['spec', 'podTemplate', 'spec'],
    ['kibana'],
    ['elastic-internal-init'],
  ],
  [
    'observability/kibana',
    'Kibana',
    ['spec', 'podTemplate', 'spec'],
    ['kibana'],
    ['elastic-internal-init'],
  ],
  ...['observability-dev', 'observability'].flatMap((namespace): typeof selectedPods => [
    [
      `${namespace}/kube-prometheus-stack`,
      'Prometheus',
      ['spec'],
      ['prometheus', 'config-reloader'],
      ['init-config-reloader'],
    ],
    [
      `${namespace}/kube-prometheus-stack`,
      'Alertmanager',
      ['spec'],
      ['alertmanager', 'config-reloader'],
      ['init-config-reloader'],
    ],
  ]),
  ['observability/eck-operator', 'StatefulSet', ['spec', 'template', 'spec'], ['manager'], []],
  [
    'observability/prometheus-controller',
    'Deployment',
    ['spec', 'template', 'spec'],
    ['kube-prometheus-stack'],
    [],
  ],
  ['observability/prometheus-controller', 'Job', ['spec', 'template', 'spec'], ['create'], []],
  ['observability/prometheus-controller', 'Job', ['spec', 'template', 'spec'], ['patch'], []],
];
/** Mutates a fresh target document; the real pinned index and rendered bytes stay untouched. */
function alterSelected(
  owner: string,
  kind: string,
  role: string | undefined,
  change: (document: ReturnType<typeof parseDocument>) => void,
): ObservabilitySourceIndex {
  for (const [identity, manifest] of Object.entries(indexed[owner])) {
    if (!identity.startsWith(`${kind}:`)) continue;
    const document = parseDocument(stringify(manifest));
    if (
      role !== undefined &&
      kind === 'Job' &&
      document.getIn(['spec', 'template', 'spec', 'containers', 0, 'name']) !== role
    )
      continue;
    change(document);
    return {
      ...indexed,
      [owner]: { ...indexed[owner], [identity]: TestResource.assert(document.toJSON()) },
    };
  }
  throw new Error('selected test resource absent');
}
const selectedBudgets: Partial<Record<string, [string, string, string, string, string]>> = {
  'Elasticsearch/prepare-s3-trust': ['100m', '500m', '128Mi', '256Mi', '64Mi'],
  'Elasticsearch/elastic-internal-init-filesystem': ['100m', '100m', '50Mi', '50Mi', '64Mi'],
  'Elasticsearch/elastic-internal-init-keystore': ['500m', '500m', '196Mi', '196Mi', '64Mi'],
  'Kibana/kibana': ['200m', '1', '512Mi', '1Gi', '1Gi'],
  'Kibana/elastic-internal-init': ['100m', '100m', '50Mi', '50Mi', '64Mi'],
  'Prometheus/prometheus': ['200m', '1', '512Mi', '1Gi', '1Gi'],
  'Alertmanager/alertmanager': ['10m', '200m', '64Mi', '128Mi', '256Mi'],
  'StatefulSet/manager': ['100m', '1', '150Mi', '512Mi', '256Mi'],
  'Deployment/kube-prometheus-stack': ['50m', '500m', '64Mi', '256Mi', '256Mi'],
  'Job/create': ['100m', '500m', '64Mi', '128Mi', '64Mi'],
  'Job/patch': ['100m', '500m', '64Mi', '128Mi', '64Mi'],
};
test('selected pinned provider inputs have complete positive maps in both instances and shared controller output', () => {
  for (const [owner, kind, pod, applications, inits] of selectedPods) {
    for (const [field, names] of [
      ['containers', applications],
      ['initContainers', inits],
    ] as const) {
      for (const name of names) {
        alterSelected(owner, kind, name, (document) => {
          const containers: unknown = document.getIn([...pod, field]);
          const entries = TestContainers.assert(
            parseAllDocuments(stringify(containers))[0].toJSON(),
          );
          const container = entries.find((entry: { name: string }) => entry.name === name);
          expect(container, `${owner}/${name}`).toBeDefined();
          if (!container?.resources) throw new Error('selected test resources absent');
          const memory = owner.startsWith('observability-dev/') ? '2Gi' : '4Gi';
          const budget =
            kind === 'Elasticsearch' && ['elasticsearch', 'elastic-internal-suspend'].includes(name)
              ? ['500m', '2', memory, memory, '1Gi']
              : ['config-reloader', 'init-config-reloader'].includes(name)
                ? ['10m', '100m', '32Mi', '64Mi', '64Mi']
                : selectedBudgets[`${kind}/${name}`];
          if (!budget) throw new Error('selected test budget absent');
          expect(container.resources).toEqual({
            requests: { cpu: budget[0], memory: budget[2], 'ephemeral-storage': budget[4] },
            limits: { cpu: budget[1], memory: budget[3], 'ephemeral-storage': budget[4] },
          });

          for (const bound of ['requests', 'limits'] as const)
            for (const resource of ['cpu', 'memory', 'ephemeral-storage'])
              expect(
                Number.parseFloat(String(container.resources[bound][resource])),
                `${owner}/${name}/${bound}/${resource}`,
              ).toBeGreaterThan(0);
        });
      }
    }
  }
});
const selectedFaults = selectedPods.flatMap(([owner, kind, pod, applications, inits]) =>
  (
    [
      ['containers', applications],
      ['initContainers', inits],
    ] as const
  ).flatMap(([field, names]) =>
    names.flatMap((name) =>
      [
        'role',
        'resources',
        ...['requests', 'limits'].flatMap((bound) =>
          ['cpu', 'memory', 'ephemeral-storage'].map((resource) => `${bound}/${resource}`),
        ),
      ].map((fault) => ({ owner, kind, pod, field, name, fault })),
    ),
  ),
);
test.each(selectedFaults)(
  'selected source refuses $owner $name $fault',
  ({ owner, kind, pod, field, name, fault }) => {
    const changed = alterSelected(owner, kind, name, (document) => {
      const entries: unknown = document.getIn([...pod, field]);
      const containers = TestContainers.assert(parseAllDocuments(stringify(entries))[0].toJSON());
      const index = containers.findIndex((container: { name: string }) => container.name === name);
      if (index < 0) throw new Error('selected test role absent');
      if (fault === 'role') document.deleteIn([...pod, field, index]);
      else if (fault === 'resources') document.deleteIn([...pod, field, index, 'resources']);
      else document.setIn([...pod, field, index, 'resources', ...fault.split('/')], '0');
    });
    expect(() => {
      assertObservabilitySelectedResources(source, changed);
    }).toThrow(/selected resource/);
  },
);
test.each(['Prometheus', 'Alertmanager'])(
  'selected source refuses duplicate generated config-out on %s',
  (kind) => {
    const changed = alterSelected(
      'observability-dev/kube-prometheus-stack',
      kind,
      undefined,
      (document) => {
        document.setIn(
          ['spec', 'volumes'],
          [{ name: 'config-out', emptyDir: { sizeLimit: '64Mi' } }],
        );
      },
    );
    expect(() => {
      assertObservabilitySelectedResources(source, changed);
    }).toThrow(/selected resource/);
  },
);
test('selected source refuses a changed provider role assumption', () => {
  const changed = alterSelected('observability-dev/kibana', 'Kibana', undefined, (document) => {
    document.setIn(
      ['spec', 'podTemplate', 'spec', 'initContainers'],
      [
        {
          name: 'foreign-init',
          resources: {
            requests: { cpu: '100m', memory: '50Mi', 'ephemeral-storage': '64Mi' },
            limits: { cpu: '100m', memory: '50Mi', 'ephemeral-storage': '64Mi' },
          },
        },
      ],
    );
  });
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});
const scratchPods = selectedPods.filter(
  ([_owner, kind]) => kind === 'Elasticsearch' || kind === 'Kibana',
);
test.each(
  scratchPods.flatMap(([owner, kind, pod]) =>
    ['missing', 'zero', 'foreign', 'duplicate'].map((fault) => ({ owner, kind, pod, fault })),
  ),
)('selected scratch refuses $owner $fault', ({ owner, kind, pod, fault }) => {
  const changed = alterSelected(owner, kind, undefined, (document) => {
    const volumes = TestVolumes.assert(
      parseAllDocuments(stringify(document.getIn([...pod, 'volumes'])))[0].toJSON(),
    );
    const index = volumes.findIndex(
      (volume: { emptyDir?: object }) => volume.emptyDir !== undefined,
    );
    if (fault === 'missing') document.deleteIn([...pod, 'volumes', index]);
    if (fault === 'zero') document.setIn([...pod, 'volumes', index, 'emptyDir', 'sizeLimit'], '0');
    if (fault === 'foreign') document.setIn([...pod, 'volumes', index, 'name'], 'foreign-scratch');
    if (fault === 'duplicate') document.setIn([...pod, 'volumes', volumes.length], volumes[index]);
  });
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});
test.each(
  ['Prometheus', 'Alertmanager'].flatMap((kind) =>
    ['missing', 'zero'].map((fault) => ({ kind, fault })),
  ),
)('selected primary map refuses $kind $fault', ({ kind, fault }) => {
  const changed = alterSelected(
    'observability-dev/kube-prometheus-stack',
    kind,
    undefined,
    (document) => {
      if (fault === 'missing') document.deleteIn(['spec', 'resources']);
      else document.setIn(['spec', 'resources', 'limits', 'memory'], '0');
    },
  );
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});
test.each(['observability/eck-operator', 'observability/prometheus-controller'])(
  'selected provider pin refuses %s',
  (owner) => {
    const changed = structuredClone(source);
    const release = changed.releases.find((release) => release.owner === owner);
    if (!release) throw new Error('test provider absent');
    const document = parseAllDocuments(release.manifest)[0];
    document.setIn(['spec', 'chart', 'spec', 'version'], '99.0.0');
    release.manifest = document.toString();
    expect(() => {
      assertObservabilitySelectedResources(changed, indexed);
    }).toThrow(/selected resource/);
  },
);
test.each([
  ['observability/eck-operator', 'StatefulSet'],
  ['observability/prometheus-controller', 'Deployment'],
])('selected provider image refuses %s', (owner, kind) => {
  const changed = alterSelected(owner, kind, undefined, (document) => {
    document.setIn(['spec', 'template', 'spec', 'containers', 0, 'image'], 'foreign/provider:99');
  });
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});
test.each([
  '--config-reloader-cpu-request=10m',
  '--config-reloader-cpu-limit=100m',
  '--config-reloader-memory-request=32Mi',
  '--config-reloader-memory-limit=64Mi',
])('selected reloader flags refuse removed %s', (flag) => {
  const changed = alterSelected(
    'observability/prometheus-controller',
    'Deployment',
    undefined,
    (document) => {
      const path = ['spec', 'template', 'spec', 'containers', 0, 'args'];
      const flags = type('string[]').assert(
        parseAllDocuments(stringify(document.getIn(path)))[0].toJSON(),
      );
      document.setIn(
        path,
        flags.filter((argument) => argument !== flag),
      );
    },
  );
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});

test('selected source refuses a duplicate named provider role', () => {
  const changed = alterSelected('observability-dev/kibana', 'Kibana', undefined, (document) => {
    const path = ['spec', 'podTemplate', 'spec', 'initContainers'];
    document.setIn([...path, 1], document.getIn([...path, 0]));
  });
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
});

test('native PVC indexing preserves full selected source extra-resource refusal', () => {
  const changed = structuredClone(rendered);
  changed['observability/eck-operator'] +=
    '\n---\n' +
    stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { namespace: 'observability', name: 'foreign' },
      spec: { storageClassName: 'puni-retain', resources: { requests: { storage: '1Mi' } } },
    });
  expect(Object.keys(indexObservabilitySource(changed)['observability/eck-operator'])).toContain(
    'PersistentVolumeClaim:observability:foreign',
  );
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow('resource closure');
});

test('full source invokes selected guard for a missing reloader flag', () => {
  const owner = 'observability/prometheus-controller';
  const changed = { ...rendered };
  const documents = parseAllDocuments(changed[owner]);
  const controller = documents.find((document) => document.get('kind') === 'Deployment');
  if (!controller) throw new Error('fixture controller absent');
  const path = ['spec', 'template', 'spec', 'containers', 0, 'args'];
  const flags = type('string[]').assert(parseDocument(stringify(controller.getIn(path))).toJSON());
  controller.setIn(
    path,
    flags.filter((flag) => flag !== '--config-reloader-cpu-request=10m'),
  );
  changed[owner] = documents.map((document) => document.toString()).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(/selected resource/);
});

test('full source preserves projection watches refusal for a missing controller role', () => {
  const owner = 'observability/prometheus-controller';
  const changed = { ...rendered };
  const documents = parseAllDocuments(changed[owner]);
  const controller = documents.find((document) => document.get('kind') === 'Deployment');
  if (!controller) throw new Error('fixture controller absent');
  controller.deleteIn(['spec', 'template', 'spec', 'containers', 0]);
  changed[owner] = documents.map((document) => document.toString()).join('---\n');
  expect(() => assertRenderedObservabilitySource(source, changed)).toThrow(
    /Projection controller watches differ/,
  );
});

test('selected target mutation leaves the next valid fixture and pinned source unchanged', () => {
  const owner = 'observability-dev/kibana';
  const before = structuredClone(indexed[owner]);
  const bytes = rendered[owner];
  const path = ['spec', 'podTemplate', 'spec', 'initContainers', 0, 'resources'];
  const changed = alterSelected(owner, 'Kibana', undefined, (document) => document.deleteIn(path));
  expect(() => {
    assertObservabilitySelectedResources(source, changed);
  }).toThrow(/selected resource/);
  const fresh = alterSelected(owner, 'Kibana', undefined, (document) => {
    expect(document.hasIn(path)).toBe(true);
  });
  expect(() => {
    assertObservabilitySelectedResources(source, fresh);
  }).not.toThrow();
  expect(indexed[owner]).toEqual(before);
  expect(rendered[owner]).toBe(bytes);
});
