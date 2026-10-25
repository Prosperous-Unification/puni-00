import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';
import { type Document, parseAllDocuments, stringify } from 'yaml';

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
              resources: { limits: { memory: local ? '2Gi' : '4Gi' } },
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
    ...releases.map((name) => document('HelmRelease', name)),
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
        path: '/rendered/StatefulSet:observability:signal-gateway/spec/template/spec/containers/0/resources/limits/memory',
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
    .map((document) => document.toString())
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
    documents[1].setIn(
      ['spec', 'template', 'spec', 'containers', 0, 'resources', 'limits', 'memory'],
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
    documents[1].setIn(
      ['spec', 'template', 'spec', 'containers', 0, 'resources', 'limits', 'memory'],
      null,
    );
  });
  Object.assign(payload.differences[0].expected, { production: null });
  refuses(payload, 'forbidden exception');
});
