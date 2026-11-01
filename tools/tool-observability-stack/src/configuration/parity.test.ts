import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';
import { type Document, parseAllDocuments, parseDocument, stringify } from 'yaml';

const root = resolve(import.meta.dir, '../../../..');
const cli = join(import.meta.dir, 'parity-cli.ts');
const fixture = readFileSync(
  join(root, 'infra/platform/observability/local/receiver.yaml'),
  'utf8',
);
const releases = [
  'eck-operator',
  'elasticsearch',
  'kibana',
  'kube-prometheus-stack',
  'otel-collector',
];
function document(kind: string, name: string, spec = {}) {
  return { apiVersion: 'test/v1', kind, metadata: { namespace: 'observability', name }, spec };
}
function candidate(local: boolean) {
  const manifests = [
    document('StatefulSet', 'signal-collector'),
    document('StatefulSet', 'signal-gateway', {
      template: {
        spec: {
          containers: [
            {
              image: 'gateway@sha256:111',
              authentication: true,
              resources: { limits: { memory: '1Gi' } },
            },
          ],
        },
      },
    }),
    document('Deployment', 'signal-metrics'),
    document('Job', 'elastic-settings'),
    {
      ...document('ConfigMap', 'signal-configuration-abc123'),
      data: {
        'collector.yaml': stringify({ receivers: { otlp: { tls: true } } }),
        'gateway.yaml': '{}',
        'retention.json': '{}',
      },
    },
    { ...document('ConfigMap', 'puni-telemetry'), data: { environment: 'common' } },
    document('NetworkPolicy', 'otlp-ingress'),
    ...releases.map((name) =>
      document(
        'HelmRelease',
        name,
        name === 'elasticsearch'
          ? {
              values: {
                nodeSets: [
                  {
                    podTemplate: {
                      spec: {
                        containers: [{ resources: { limits: { memory: local ? '2Gi' : '4Gi' } } }],
                      },
                    },
                  },
                ],
              },
            }
          : {},
      ),
    ),
  ];
  return {
    rendered:
      manifests.map((manifest) => stringify(manifest)).join('---\n') +
      (local ? `---\n${fixture}` : ''),
    effective: {
      'eck-operator': stringify(document('StatefulSet', 'elastic-operator')),
      elasticsearch: stringify({
        ...document('Elasticsearch', 'elasticsearch'),
        metadata: { name: 'elasticsearch' },
      }),
      kibana: stringify({ ...document('Kibana', 'kibana'), metadata: { name: 'kibana' } }),
      'kube-prometheus-stack': [
        document('Prometheus', 'kps-prometheus'),
        document('Alertmanager', 'kps-alertmanager'),
        document('Deployment', 'kps-operator'),
        document('Deployment', 'kube-prometheus-stack-kube-state-metrics'),
        document('DaemonSet', 'kube-prometheus-stack-prometheus-node-exporter'),
        document('ServiceMonitor', 'kube-prometheus-stack-kube-state-metrics'),
      ]
        .map((manifest) => stringify(manifest))
        .join('---\n'),
      'otel-collector': stringify(document('DaemonSet', 'otel-collector-agent')),
    },
  };
}
function input() {
  return {
    candidates: { local: candidate(true), production: candidate(false) },
    differences: [
      {
        path: '/rendered/HelmRelease:observability:elasticsearch/spec/values/nodeSets/0/podTemplate/spec/containers/0/resources/limits/memory',
        candidates: ['local', 'production'],
        expected: { local: '2Gi', production: '4Gi' },
        reason: 'Bounded disposable capacity',
        verification: 'openspec/changes/observability-environment-parity/verify.md#render-parity',
      },
    ],
  };
}
function run(payload: unknown) {
  const directory = mkdtempSync(join(tmpdir(), 'parity-test-'));
  try {
    const path = join(directory, 'input.json');
    writeFileSync(path, JSON.stringify(payload));
    return Bun.spawnSync([process.execPath, cli, '--input', path]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function refuses(payload: unknown, message: string) {
  const outcome = run(payload);
  expect(outcome.exitCode).toBe(1);
  expect(outcome.stderr.toString()).toContain(message);
}
function change(
  payload: ReturnType<typeof input>,
  edit: (documents: Document[]) => void,
  candidateName: 'local' | 'production' = 'production',
) {
  const documents = parseAllDocuments(payload.candidates[candidateName].rendered);
  edit(documents);
  payload.candidates[candidateName].rendered = documents
    .map((document) => document.toString({ directives: false }))
    .join('---\n');
}
test('all reviewed candidates satisfy one contract', () => {
  const outcome = run(input());
  expect(outcome.stderr.toString()).toBe('');
  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout.toString()).toContain('render-time parity');
});
test('capacity exception still compares its siblings', () => {
  const payload = input();
  change(payload, (documents) => {
    documents[1].setIn(['spec', 'queue'], false);
  });
  refuses(payload, 'unreviewed difference');
});
test('changed gateway digest refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    documents[1].setIn(
      ['spec', 'template', 'spec', 'containers', 0, 'image'],
      'gateway@sha256:222',
    );
  });
  refuses(payload, 'unreviewed difference');
});
test('disabled authentication refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    documents[1].setIn(['spec', 'template', 'spec', 'containers', 0, 'authentication'], false);
  });
  refuses(payload, 'unreviewed difference');
});
test('missing gateway in both candidates refuses', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    change(
      payload,
      (documents) => {
        documents.splice(1, 1);
      },
      name,
    );
  refuses(payload, 'required role');
});
test('effective Helm role absent in both refuses', () => {
  const payload = input();
  payload.candidates.local.effective.kibana = '';
  payload.candidates.production.effective.kibana = '';
  refuses(payload, 'required role');
});
test('unknown and unused exception paths refuse', () => {
  const payload = input();
  payload.differences[0].path += '/unknown';
  refuses(payload, 'invalid exception path');
});
test('whole-subtree exception refuses', () => {
  const payload = input();
  payload.differences[0].path = '/rendered/StatefulSet:observability:signal-gateway/spec';
  refuses(payload, 'subtree exception');
});
test('wildcard exception refuses', () => {
  const payload = input();
  payload.differences[0].path += '/*';
  refuses(payload, 'exception');
});
test('duplicate exception refuses', () => {
  const payload = input();
  payload.differences.push(payload.differences[0]);
  refuses(payload, 'duplicate exception');
});
test('stale concrete value refuses', () => {
  const payload = input();
  payload.differences[0].expected.production = '8Gi';
  refuses(payload, 'exception values');
});
test('unused equal-value exception refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    findElastic(documents).setIn(
      [
        'spec',
        'values',
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
      '2Gi',
    );
  });
  payload.differences[0].expected.production = '2Gi';
  refuses(payload, 'unused exception');
});
for (const field of [
  'image',
  'authentication',
  'queue',
  'protocol',
  'secretName',
  'readinessProbe',
])
  test(`forbidden ${field} exception refuses`, () => {
    const payload = input();
    payload.differences.push({
      ...payload.differences[0],
      path: `/rendered/StatefulSet:observability:signal-gateway/spec/${field}`,
    });
    change(
      payload,
      (documents) => {
        documents[1].setIn(['spec', field], '2Gi');
      },
      'local',
    );
    change(payload, (documents) => {
      documents[1].setIn(['spec', field], '4Gi');
    });
    refuses(payload, 'forbidden exception');
  });
test('malformed exception refuses', () => {
  const payload = input();
  refuses({ ...payload, differences: [{ ...payload.differences[0], reason: '' }] }, 'malformed');
});
test('modified rehearsal receiver refuses', () => {
  const payload = input();
  payload.candidates.local.rendered = payload.candidates.local.rendered.replace(
    'memory: 32Mi',
    'memory: 64Mi',
  );
  refuses(payload, 'rehearsal fixture');
});
test('extra empty key refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    documents[1].setIn(['spec', 'extra'], {});
  });
  refuses(payload, 'unreviewed difference');
});
test('malformed rendered YAML refuses', () => {
  const payload = input();
  payload.candidates.production.rendered = 'a: [broken';
  refuses(payload, 'malformed');
});
test('absent unreadable and malformed inputs refuse distinctly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'parity-input-'));
  const path = join(directory, 'input.json');
  try {
    const invoke = () => Bun.spawnSync([process.execPath, cli, '--input', path]);
    expect(invoke().stderr.toString()).toContain('absent input');
    writeFileSync(path, '{}');
    chmodSync(path, 0);
    expect(invoke().stderr.toString()).toContain('unreadable input');
    chmodSync(path, 0o600);
    writeFileSync(path, '{');
    expect(invoke().stderr.toString()).toContain('malformed input');
  } finally {
    chmodSync(directory, 0o700);
    rmSync(directory, { recursive: true, force: true });
  }
});
test('missing generated configuration refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    documents.splice(4, 1);
  });
  refuses(payload, 'required role');
});
test('duplicate resource refuses', () => {
  const payload = input();
  change(payload, (documents) => {
    documents.push(documents[1].clone());
  });
  refuses(payload, 'duplicate resource');
});
test('absent rehearsal fixture refuses', () => {
  const payload = input();
  payload.candidates.local.rendered = payload.candidates.local.rendered.replace(
    `---\n${fixture}`,
    '',
  );
  refuses(payload, 'rehearsal fixture');
});
test('rehearsal fixture in production refuses', () => {
  const payload = input();
  payload.candidates.production.rendered += `---\n${fixture}`;
  refuses(payload, 'rehearsal fixture');
});
test('effective Helm ConfigMap compares parsed values', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    payload.candidates[name].effective['otel-collector'] +=
      `---\n${stringify({ ...document('ConfigMap', 'effective-config'), data: { 'config.yaml': name === 'local' ? 'tls: true\nqueue: true\n' : 'queue: true\ntls: true\n' } })}`;
  const outcome = run(payload);
  expect(outcome.exitCode).toBe(0);
});
test('effective Helm config authentication drift refuses', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    payload.candidates[name].effective['otel-collector'] +=
      `---\n${stringify({ ...document('ConfigMap', 'effective-config'), data: { 'config.yaml': name === 'local' ? 'tls: true\n' : 'tls: false\n' } })}`;
  refuses(payload, 'unreviewed difference');
});
test('source code cannot be an identity exception', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    change(
      payload,
      (documents) => {
        documents[4].setIn(['data', 'apply.js'], name === 'local' ? '2Gi' : '4Gi');
      },
      name,
    );
  payload.differences.push({
    ...payload.differences[0],
    path: '/rendered/ConfigMap:observability:signal-configuration/data/apply.js',
  });
  refuses(payload, 'forbidden exception');
});
test('missing renderer tools refuses without skipping', () => {
  const outcome = Bun.spawnSync([
    process.execPath,
    join(import.meta.dir, 'parity-render-cli.ts'),
    root,
    '/absent-parity-tools',
  ]);
  expect(outcome.exitCode).toBe(1);
  expect(outcome.stderr.toString()).toContain('renderer tool');
});

test('both-missing Alertmanager refuses', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    payload.candidates[name].effective['kube-prometheus-stack'] = stringify(
      document('Prometheus', 'kps-prometheus'),
    );
  refuses(payload, 'required role');
});

test('duplicate generated configurations in both candidates refuse', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    change(
      payload,
      (documents) => {
        const duplicate = documents[4].clone();
        duplicate.setIn(['metadata', 'name'], 'signal-configuration-second');
        documents.push(duplicate);
      },
      name,
    );
  refuses(payload, 'required role: generated signal-configuration');
});

test('duplicate effective resource refuses', () => {
  const payload = input();
  payload.candidates.production.effective.kibana += `---\n${payload.candidates.production.effective.kibana}`;
  refuses(payload, 'duplicate resource');
});
test('unknown effective Helm release in both refuses', () => {
  const payload = input();
  for (const name of ['local', 'production'] as const)
    Object.assign(payload.candidates[name].effective, { unknown: '{}' });
  refuses(payload, 'required role: exact Helm release set');
});

test('capacity exception cannot remove a resource bound', () => {
  const payload = input();
  change(payload, (documents) => {
    findElastic(documents).setIn(
      [
        'spec',
        'values',
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
      null,
    );
  });
  Object.assign(payload.differences[0].expected, { production: null });
  refuses(payload, 'forbidden exception');
});

const trustRoot = {
  rendered:
    '/rendered/HelmRelease:observability:elasticsearch/spec/values/nodeSets/0/podTemplate/spec',
  effective:
    '/effective/elasticsearch/Elasticsearch:_:elasticsearch/spec/nodeSets/0/podTemplate/spec',
};
function findElastic(documents: Document[]): Document {
  const elastic = documents.find(
    (document) => document.getIn(['metadata', 'name']) === 'elasticsearch',
  );
  if (elastic === undefined) throw new Error('missing Elasticsearch test fixture');
  return elastic;
}
function createTrustInput(localMode = 'system-roots-plus-ca', productionMode = 'system-roots') {
  const payload = input();
  payload.differences = [];
  for (const [name, mode] of [
    ['local', localMode],
    ['production', productionMode],
  ] as const) {
    const shared = parseDocument(
      readFileSync(
        join(root, 'infra/platform/observability/elastic/base/elasticsearch.yaml'),
        'utf8',
      ),
    );
    shared.setIn(
      [
        'spec',
        'values',
        'nodeSets',
        0,
        'podTemplate',
        'spec',
        'initContainers',
        0,
        'env',
        0,
        'value',
      ],
      mode,
    );
    change(
      payload,
      (documents) => {
        findElastic(documents).setIn(['spec', 'values'], shared.getIn(['spec', 'values']));
      },
      name,
    );
    const elastic = parseDocument(
      stringify({
        apiVersion: 'elasticsearch.k8s.elastic.co/v1',
        kind: 'Elasticsearch',
        metadata: { name: 'elasticsearch' },
      }),
    );
    elastic.set('spec', shared.getIn(['spec', 'values']));
    payload.candidates[name].effective.elasticsearch = elastic.toString();
  }
  for (const path of Object.values(trustRoot))
    payload.differences.push({
      path: path + '/initContainers/0/env/0/value',
      candidates: ['local', 'production'],
      expected: { local: localMode, production: productionMode },
      reason:
        'Disposable local CA extends bundled roots; production retains bundled roots. Verified transport, the common executable and every sibling remain compared.',
      verification: 'tools/tool-fleet/src/backup-tls.test.ts',
    });
  return payload;
}
function changeTrust(
  payload: ReturnType<typeof input>,
  view: keyof typeof trustRoot,
  path: (string | number)[],
  value: unknown,
) {
  if (view === 'rendered')
    change(payload, (documents) => {
      findElastic(documents).setIn(
        ['spec', 'values', 'nodeSets', 0, 'podTemplate', 'spec', ...path],
        value,
      );
    });
  else {
    const elastic = parseDocument(payload.candidates.production.effective.elasticsearch);
    elastic.setIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', ...path], value);
    payload.candidates.production.effective.elasticsearch = elastic.toString();
  }
}
test('closed Elasticsearch trust modes satisfy one contract', () => {
  const outcome = run(createTrustInput());
  expect(outcome.exitCode).toBe(0);
  expect(outcome.stderr.toString()).toBe('');
});
for (const [name, localMode, productionMode] of [
  ['unknown local', 'insecure', 'system-roots'],
  ['unknown production', 'system-roots-plus-ca', 'insecure'],
  ['swapped', 'system-roots', 'system-roots-plus-ca'],
  ['heap-shaped unknown', '-Xms1g -Xmx1g', '-Xms2g -Xmx2g'],
] as const)
  test(`closed Elasticsearch trust modes refuse ${name} even with matching exception values`, () => {
    refuses(createTrustInput(localMode, productionMode), 'forbidden exception');
  });
for (const view of ['rendered', 'effective'] as const) {
  for (const [name, path, value] of [
    ['executable', ['initContainers', 0, 'command', 2], 'export NODE_TLS_REJECT_UNAUTHORIZED=0'],
    ['mode variable', ['initContainers', 0, 'env', 0, 'name'], 'SKIP_TLS_VERIFY'],
    ['JVM mount', ['containers', 0, 'volumeMounts', 1, 'readOnly'], false],
    ['CA reference', ['volumes', 1, 'secret', 'secretName'], 'untrusted-credentials'],
    ['init resources', ['initContainers', 0, 'resources', 'limits', 'memory'], '1Mi'],
  ] satisfies [string, (string | number)[], unknown][])
    test(`${view} trust-mode exception still compares ${name}`, () => {
      const payload = createTrustInput();
      changeTrust(payload, view, path, value);
      refuses(payload, 'unreviewed difference');
    });
  test(`${view} trust allowance refuses a lookalike field path`, () => {
    const payload = createTrustInput();
    for (const candidateName of ['local', 'production'] as const) {
      const text =
        view === 'rendered'
          ? payload.candidates[candidateName].rendered
          : payload.candidates[candidateName].effective.elasticsearch;
      const documents = parseAllDocuments(text);
      findElastic(documents).setIn(
        view === 'rendered'
          ? ['spec', 'values', 'nodeSets', 0, 'podTemplate', 'spec', 'initContainers', 0, 'env', 1]
          : ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'initContainers', 0, 'env', 1],
        {
          name: 'UNREVIEWED_MODE',
          value: candidateName === 'local' ? 'system-roots-plus-ca' : 'system-roots',
        },
      );
      const updated = documents
        .map((document) => document.toString({ directives: false }))
        .join('---\n');
      if (view === 'rendered') payload.candidates[candidateName].rendered = updated;
      else payload.candidates[candidateName].effective.elasticsearch = updated;
    }
    payload.differences.push({
      ...payload.differences[0],
      path: trustRoot[view] + '/initContainers/0/env/1/value',
    });

    refuses(payload, 'forbidden exception');
  });
  test(`${view} HTTP cannot be excepted beside the trust mode`, () => {
    const payload = createTrustInput();
    const path =
      view === 'rendered'
        ? ['spec', 'values', 'nodeSets', 0, 'config', 's3.client.default.protocol']
        : ['spec', 'nodeSets', 0, 'config', 's3.client.default.protocol'];
    if (view === 'rendered')
      change(payload, (documents) => {
        findElastic(documents).setIn(path, 'http');
      });
    else {
      const elastic = parseDocument(payload.candidates.production.effective.elasticsearch);
      elastic.setIn(path, 'http');
      payload.candidates.production.effective.elasticsearch = elastic.toString();
    }
    payload.differences.push({
      ...payload.differences[0],
      path: trustRoot[view].replace('/podTemplate/spec', '') + '/config/s3.client.default.protocol',
      expected: { local: 'https', production: 'http' },
    });
    refuses(payload, 'forbidden exception');
  });
  test(`${view} common trust program cannot be excepted`, () => {
    const payload = createTrustInput();
    for (const candidateName of ['local', 'production'] as const) {
      const documents = parseAllDocuments(
        view === 'rendered'
          ? payload.candidates[candidateName].rendered
          : payload.candidates[candidateName].effective.elasticsearch,
      );
      findElastic(documents).setIn(
        view === 'rendered'
          ? [
              'spec',
              'values',
              'nodeSets',
              0,
              'podTemplate',
              'spec',
              'initContainers',
              0,
              'command',
              2,
            ]
          : ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'initContainers', 0, 'command', 2],
        candidateName === 'local' ? 'system-roots-plus-ca' : 'system-roots',
      );
      const updated = documents
        .map((document) => document.toString({ directives: false }))
        .join('---\n');
      if (view === 'rendered') payload.candidates[candidateName].rendered = updated;
      else payload.candidates[candidateName].effective.elasticsearch = updated;
    }
    payload.differences.push({
      ...payload.differences[0],
      path: trustRoot[view] + '/initContainers/0/command/2',
    });
    refuses(payload, 'forbidden exception');
  });
}

function setPolicyLeaf(
  payload: ReturnType<typeof input>,
  candidateName: 'local' | 'production',
  path: string,
  value: unknown,
) {
  const segments = path
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  const view = segments.shift();
  const effective: Record<string, string> = payload.candidates[candidateName].effective;
  const release = view === 'effective' ? segments.shift() : undefined;
  const identity = segments.shift();
  if (identity === undefined) throw new Error('missing policy fixture identity');
  const [kind, , name] = identity.split(':');
  const documents = parseAllDocuments(
    view === 'rendered' ? payload.candidates[candidateName].rendered : effective[release!],
  );
  const manifest = documents.find(
    (document) =>
      document.get('kind') === kind &&
      (document.getIn(['metadata', 'name']) === name ||
        (name === 'signal-configuration' &&
          String(document.getIn(['metadata', 'name'])).startsWith('signal-configuration-'))),
  );
  if (manifest === undefined) throw new Error('missing policy fixture manifest');
  if (
    kind === 'ConfigMap' &&
    segments[0] === 'data' &&
    /\.(yaml|json)$/.test(segments[1]) &&
    segments.length > 2
  ) {
    const content = manifest.getIn(segments.slice(0, 2));
    const nested = parseDocument(typeof content === 'string' ? content : '{}');
    nested.setIn(
      segments.slice(2).map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
      value,
    );
    manifest.setIn(
      segments.slice(0, 2),
      segments[1].endsWith('.json')
        ? JSON.stringify(nested.toJSON())
        : nested.toString({ directives: false }),
    );
  } else
    manifest.setIn(
      segments.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
      value,
    );
  const text = documents.map((document) => document.toString({ directives: false })).join('---\n');
  if (view === 'rendered') payload.candidates[candidateName].rendered = text;
  else effective[release!] = text;
}
function createPolicyInput(path: string, local: unknown, production: unknown) {
  const payload = input();
  for (const [candidateName, value] of [
    ['local', local],
    ['production', production],
  ] as const)
    setPolicyLeaf(payload, candidateName, path, value);
  const existing = payload.differences.find((difference) => difference.path === path);
  const expected = { local, production };
  if (existing !== undefined) Object.assign(existing.expected, expected);
  else
    payload.differences.push({
      path,
      candidates: ['local', 'production'],
      expected: expected as { local: string; production: string },
      reason: 'Exact reviewed profile inputs',
      verification: 'tools/tool-observability-stack/src/configuration/parity.test.ts',
    });
  return payload;
}
const elasticValues = '/rendered/HelmRelease:observability:elasticsearch/spec/values/nodeSets/0';
for (const [name, path, local, production, bad] of [
  [
    'endpoint',
    elasticValues + '/config/s3.client.default.endpoint',
    'object-store.puni-backup.svc:9000',
    'hel1.your-objectstorage.com',
    [null, 'http://hel1.your-objectstorage.com', 'https://unreviewed.test', 'broken endpoint'],
  ],
  [
    'capacity',
    elasticValues + '/podTemplate/spec/containers/0/resources/limits/memory',
    '2Gi',
    '4Gi',
    [null, '1Mi', '8Gi'],
  ],
  [
    'JVM heap',
    elasticValues + '/podTemplate/spec/containers/0/env/0/value',
    '-Xms1g -Xmx1g',
    '-Xms2g -Xmx2g',
    ['-Xms0g -Xmx0g', '-Xms3g -Xmx3g'],
  ],
  [
    'ingress',
    '/rendered/NetworkPolicy:observability:otlp-ingress/spec/ingress/1/from/0/ipBlock/cidr',
    '172.16.0.0/12',
    '10.1.0.0/16',
    [null, '0.0.0.0/0', '::/0', '10.0.0.0/8', 'private'],
  ],
  [
    'metric cluster',
    '/rendered/HelmRelease:observability:kube-prometheus-stack/spec/values/kube-state-metrics/prometheus/monitor/metricRelabelings/0/replacement',
    'platform-local',
    'platform-production',
    [null, 'foreign-production'],
  ],
  [
    'environment',
    '/rendered/ConfigMap:observability:puni-telemetry/data/environment',
    'local',
    'production',
    ['unreviewed'],
  ],
  [
    'policy name',
    '/rendered/ConfigMap:observability:signal-configuration/data/retention.json/elastic/logs/policyName',
    'puni-dev-logs',
    'puni-prod-logs',
    [null, 'puni-prod-traces', 'foreign-policy'],
  ],
] as const) {
  test(`exception policy accepts exact ${name} profile`, () => {
    const payload = createPolicyInput(path, local, production);
    expect(run(payload).exitCode).toBe(0);
  });
  test(`exception policy refuses ${name} local value with matching record`, () => {
    refuses(createPolicyInput(path, bad[0], production), 'forbidden exception');
  });
  for (const value of bad)
    test(`exception policy refuses ${name} value ${JSON.stringify(value)} with matching record`, () => {
      refuses(createPolicyInput(path, local, value), 'forbidden exception');
    });
}

for (const [name, suffix, local, production] of [
  [
    'endpoint',
    'config/s3.client.default.endpoint',
    'object-store.puni-backup.svc:9000',
    'hel1.your-objectstorage.com',
  ],
  ['capacity', 'resources/limits/memory', '2Gi', '4Gi'],
  ['heap', 'env/0/value', '-Xms1g -Xmx1g', '-Xms2g -Xmx2g'],
  ['ingress', 'ipBlock/cidr', '172.16.0.0/12', '10.1.0.0/16'],
  ['metric cluster', 'metricRelabelings/0/replacement', 'platform-local', 'platform-production'],
  ['environment', 'puni-telemetry/data/environment', 'local', 'production'],
] as const)
  test(`exception policy refuses ${name} at a lookalike destination`, () => {
    refuses(
      createPolicyInput(
        '/rendered/Deployment:observability:signal-metrics/spec/forged/' + suffix,
        local,
        production,
      ),
      'forbidden exception',
    );
  });
test('exception policy refuses policy name at a lookalike destination', () => {
  refuses(
    createPolicyInput(
      '/rendered/ConfigMap:observability:signal-configuration/data/retention.json/forged/policyName',
      'puni-dev-logs',
      'puni-prod-logs',
    ),
    'forbidden exception',
  );
});
for (const role of ['collector', 'gateway'])
  for (const family of ['source', 'platform'])
    for (const signal of ['logs/log_record', 'traces/span', 'metrics/datapoint']) {
      const path =
        '/rendered/ConfigMap:observability:signal-configuration/data/' +
        role +
        '.yaml/processors/filter~1' +
        family +
        '/' +
        signal +
        '/0';
      const source = (environment: string) =>
        `(resource.attributes["deployment.environment.name"] != "${environment}") or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""`;
      const platform = (environment: string) =>
        `(resource.attributes["puni.cluster"] != "platform-${environment}" and resource.attributes["puni.cluster"] != "workers-${environment}") or resource.attributes["deployment.environment.name"] != nil`;
      const local = family === 'source' ? source('dev') : platform('local');
      const production = family === 'source' ? source('prod') : platform('production');
      test(`canonical exception accepts ${role} ${family} ${signal}`, () => {
        expect(run(createPolicyInput(path, local, production)).exitCode).toBe(0);
      });
      test(`canonical exception refuses ${role} ${family} ${signal} service behavior with matching records`, () => {
        refuses(
          createPolicyInput(
            path,
            local + ' or resource.attributes["service.name"] == "dev"',
            production + ' or resource.attributes["service.name"] == "prod"',
          ),
          'forbidden exception',
        );
      });
    }

test('reviewed exception verification references resolve to concrete sources', () => {
  const records = JSON.parse(
    readFileSync(join(import.meta.dir, 'reviewed-differences.json'), 'utf8'),
  ) as { verification: string }[];
  for (const record of records)
    expect(readFileSync(join(root, record.verification), 'utf8').length).toBeGreaterThan(0);
});
test('exception policy binds generated references to the actual ConfigMap identity', () => {
  refuses(
    createPolicyInput(
      '/rendered/StatefulSet:observability:signal-gateway/spec/template/spec/volumes/0/configMap/name',
      'signal-configuration-wronglocal',
      'signal-configuration-wrongproduction',
    ),
    'forbidden exception',
  );
});
test('exception policy refuses a generated reference at a lookalike volume', () => {
  const names = {
    local: 'signal-configuration-local',
    production: 'signal-configuration-production',
  };
  const metadata = '/rendered/ConfigMap:observability:signal-configuration/metadata/name';
  const payload = createPolicyInput(metadata, names.local, names.production);
  const path =
    '/rendered/StatefulSet:observability:signal-gateway/spec/template/spec/volumes/1/configMap/name';
  for (const candidateName of ['local', 'production'] as const)
    setPolicyLeaf(payload, candidateName, path, names[candidateName]);
  payload.differences.push({ ...payload.differences[1], path });
  refuses(payload, 'forbidden exception');
});

for (const family of ['source', 'platform'])
  test(`canonical exception refuses ${family} at a lookalike configuration file`, () => {
    const local =
      family === 'source'
        ? '(resource.attributes["deployment.environment.name"] != "dev") or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""'
        : '(resource.attributes["puni.cluster"] != "platform-local" and resource.attributes["puni.cluster"] != "workers-local") or resource.attributes["deployment.environment.name"] != nil';
    const production =
      family === 'source'
        ? '(resource.attributes["deployment.environment.name"] != "prod") or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""'
        : '(resource.attributes["puni.cluster"] != "platform-production" and resource.attributes["puni.cluster"] != "workers-production") or resource.attributes["deployment.environment.name"] != nil';
    refuses(
      createPolicyInput(
        '/rendered/ConfigMap:observability:signal-configuration/data/unreviewed.yaml/processors/filter~1' +
          family +
          '/logs/log_record/0',
        local,
        production,
      ),
      'forbidden exception',
    );
  });
