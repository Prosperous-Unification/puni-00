import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';
import { type Document, parseAllDocuments, stringify } from 'yaml';

import fixture from './fixtures/observability-projection.json';
import { createObservabilityProjection } from './observability-projection';
import {
  assertObservabilityProjectionParity,
  assertRenderedObservabilityProjection,
  renderObservabilityProjection,
} from './observability-projection-render';
import * as pinnedRendering from './observability-render';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');
const request = (placement: 'local' | 'production') => ({
  placement,
  instances: [
    { environment: 'dev', namespace: 'observability-dev' },
    { environment: 'prod', namespace: 'observability' },
  ],
});
// Reduced actual Helm output from the locked charts: resource identities and operative fields,
// without CRD schemas or generated Secret contents. The source CLI separately exercises full output.
function rendering() {
  return Object.fromEntries(
    Object.entries(fixture).map(([owner, manifests]) => [
      owner,
      manifests.map((manifest) => stringify(manifest)).join('---\n'),
    ]),
  );
}
function change(
  rendered: Record<string, string>,
  owner: string,
  kind: string,
  name: string,
  path: (string | number)[],
  value: unknown,
) {
  const documents: Document[] = parseAllDocuments(rendered[owner]);
  const selected = documents.find(
    (document) => document.get('kind') === kind && document.getIn(['metadata', 'name']) === name,
  );
  if (!selected) throw new Error('test resource missing');
  selected.setIn(path, value);
  rendered[owner] = documents.map((document) => document.toString()).join('---\n');
}

test('actual pinned resource fixture closes one controller and source owner plus distinct Prometheus resources', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  expect(assertRenderedObservabilityProjection(projection, rendering())).toMatchObject({
    resources: 118,
    controllers: { eck: 1, prometheus: 1 },
    crds: 22,
    sources: { kubeStateMetrics: 1, nodeExporter: 1, collector: 1 },
    prometheusResources: ['observability-dev/kps-prometheus', 'observability/kps-prometheus'],
    claimsBound: false,
  });
});

test.each(['missing', 'duplicate', 'foreign', 'extra'] as const)(
  'effective resource closure refuses %s resources',
  async (fault) => {
    const projection = await createObservabilityProjection(root, request('production'));
    const rendered = rendering();
    const owner = 'observability/prometheus-controller';
    const documents: Document[] = parseAllDocuments(rendered[owner]);
    const crd = documents.findIndex(
      (document) => document.get('kind') === 'CustomResourceDefinition',
    );
    if (fault === 'missing') documents.splice(crd, 1);
    if (fault === 'duplicate') documents.push(documents[crd]);
    if (fault === 'foreign') documents[crd].setIn(['metadata', 'name'], 'foreign.example.test');
    if (fault === 'extra')
      documents.push(
        parseAllDocuments(
          'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: extra, namespace: observability }\n',
        )[0],
      );
    rendered[owner] = documents.map((document) => document.toString()).join('---\n');
    expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
      /resource closure/,
    );
  },
);

test('effective owner closure refuses an extra release owner', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  expect(() =>
    assertRenderedObservabilityProjection(projection, { ...rendering(), 'foreign/owner': '' }),
  ).toThrow(/owner closure/);
});

test.each(['serviceMonitor', 'podMonitor', 'probe', 'rule', 'scrapeConfig'])(
  'dev %s resource and namespace selectors remain scoped',
  async (resource) => {
    const projection = await createObservabilityProjection(root, request('production'));
    for (const field of [`${resource}Selector`, `${resource}NamespaceSelector`]) {
      const rendered = rendering();
      change(
        rendered,
        'observability-dev/kube-prometheus-stack',
        'Prometheus',
        'kps-prometheus',
        ['spec', field],
        {},
      );
      expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
        /dev discovery/,
      );
    }
  },
);

test('dev monitors cannot discover foreign target namespaces', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  change(
    rendered,
    'observability-dev/kube-prometheus-stack',
    'ServiceMonitor',
    'kps-prometheus',
    ['spec', 'namespaceSelector'],
    { matchNames: ['observability'] },
  );
  expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(/dev monitor/);
});

test.each(['alertmanager namespace', 'claim binding'] as const)(
  'instance reference refuses foreign %s',
  async (fault) => {
    const projection = await createObservabilityProjection(root, request('production'));
    const rendered = rendering();
    change(
      rendered,
      'observability-dev/kube-prometheus-stack',
      'Prometheus',
      'kps-prometheus',
      fault === 'claim binding'
        ? ['spec', 'storage', 'volumeClaimTemplate', 'spec', 'volumeName']
        : ['spec', 'alerting', 'alertmanagers', 0, 'namespace'],
      fault === 'claim binding' ? 'production-pv' : 'observability',
    );
    expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
      /instance reference/,
    );
  },
);

test.each(['selector', 'namespace', 'tls'] as const)(
  'retained operator monitor refuses changed %s',
  async (fault) => {
    const projection = await createObservabilityProjection(root, request('production'));
    const rendered = rendering();
    const paths = {
      selector: ['spec', 'selector', 'matchLabels', 'release'],
      namespace: ['spec', 'namespaceSelector', 'matchNames', 0],
      tls: ['spec', 'endpoints', 0, 'tlsConfig', 'ca', 'secret', 'name'],
    };
    change(
      rendered,
      'observability/kube-prometheus-stack',
      'ServiceMonitor',
      'kps-operator',
      paths[fault],
      'foreign',
    );
    expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
      /operator monitor/,
    );
  },
);

test('supported native List members remain individually checked', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  const owner = 'observability/kube-prometheus-stack';
  const manifests: unknown[] = parseAllDocuments(rendered[owner]).map((document) => {
    const manifest: unknown = document.toJSON();
    return manifest;
  });
  rendered[owner] = stringify({ apiVersion: 'v1', kind: 'List', items: manifests });
  expect(assertRenderedObservabilityProjection(projection, rendered).resources).toBe(118);
  for (const malformed of [
    { apiVersion: 'foreign/v1', kind: 'List', items: manifests },
    { apiVersion: 'v1', kind: 'List', items: manifests, ignored: 'foreign' },
  ])
    expect(() =>
      assertRenderedObservabilityProjection(projection, {
        ...rendered,
        [owner]: stringify(malformed),
      }),
    ).toThrow();
  for (const members of [
    undefined,
    null,
    [null],
    [...manifests, manifests[0]],
    [
      ...manifests,
      { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'foreign', namespace: 'foreign' } },
    ],
  ]) {
    const broken = {
      ...rendered,
      [owner]: stringify({
        apiVersion: 'v1',
        kind: 'List',
        ...(members === undefined ? {} : { items: members }),
      }),
    };
    expect(() => assertRenderedObservabilityProjection(projection, broken)).toThrow();
  }
});

test('semantic placement comparison checks concrete siblings after its only cluster scalar difference', async () => {
  const localProjection = await createObservabilityProjection(root, request('local'));
  const prodProjection = await createObservabilityProjection(root, request('production'));
  const local = rendering();
  change(
    local,
    'observability/kube-prometheus-stack',
    'ServiceMonitor',
    'kube-prometheus-stack-kube-state-metrics',
    ['spec', 'endpoints', 0, 'metricRelabelings', 0, 'replacement'],
    'platform-local',
  );
  expect(() => {
    assertObservabilityProjectionParity(localProjection, local, prodProjection, rendering());
  }).not.toThrow();
  const prod = rendering();
  change(
    prod,
    'observability/kube-prometheus-stack',
    'ServiceMonitor',
    'kube-prometheus-stack-kube-state-metrics',
    ['spec', 'endpoints', 0, 'metricRelabelings', 0, 'action'],
    'drop',
  );
  expect(() => {
    assertObservabilityProjectionParity(localProjection, local, prodProjection, prod);
  }).toThrow(/semantic placement/);
});

test.each(['unknown marker', 'cross-profile marker'] as const)(
  'placement scalar refuses %s',
  async (fault) => {
    const projection = await createObservabilityProjection(root, request('production'));
    const rendered = rendering();
    change(
      rendered,
      'observability/kube-prometheus-stack',
      'ServiceMonitor',
      'kube-prometheus-stack-kube-state-metrics',
      ['spec', 'endpoints', 0, 'metricRelabelings', 0, 'replacement'],
      fault === 'unknown marker' ? 'guessed' : 'platform-local',
    );
    expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
      /placement marker/,
    );
  },
);

test.each(['absent', 'unreadable', 'wrong version', 'failed render'] as const)(
  'renderer refuses %s required Helm dependency',
  async (fault) => {
    const directory = await scratchAsync('projection-helm-');
    const helm = join(directory, 'helm');
    if (fault !== 'absent') {
      await writeFile(
        helm,
        fault === 'failed render'
          ? '#!/bin/sh\nif [ "$1" = version ]; then printf v4.3.0; else exit 42; fi\n'
          : '#!/bin/sh\nprintf wrong-version\n',
      );
      await chmod(helm, fault === 'unreadable' ? 0 : 0o700);
    }
    const projection = await createObservabilityProjection(root, request('production'));
    expect(renderObservabilityProjection(root, directory, projection)).rejects.toThrow();
  },
);

test('renderer refuses a changed pinned chart before invoking it', async () => {
  const directory = await scratchAsync('projection-chart-');
  await cp(join(root, 'infra'), join(directory, 'infra'), { recursive: true });
  await mkdir(join(directory, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(directory, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  const projection = await createObservabilityProjection(directory, request('production'));
  const archive = join(directory, 'infra/platform/charts/eck-operator-3.5.0.tgz');
  const tools = await provisionObservabilityTools();
  const render = pinnedRendering.renderObservabilityReleases;
  // Corrupt the owned copy after the wrapper revalidates source, without substituting an executable.
  const fault = spyOn(pinnedRendering, 'renderObservabilityReleases').mockImplementation(
    async (...arguments_) => {
      await writeFile(archive, 'broken');
      return render(...arguments_);
    },
  );
  try {
    const failure: unknown = await renderObservabilityProjection(directory, tools, projection).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error) expect(failure.message).toMatch(/chart differs/);
  } finally {
    fault.mockRestore();
  }
});

test('effective parser refuses malformed YAML independently of resource membership', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  rendered['observability/otel-collector'] = rendered['observability/otel-collector'].replace(
    'kind: ServiceAccount',
    'kind: ServiceAccount\nkind: ServiceAccount',
  );
  expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
    /Malformed projection YAML/,
  );
});

test('dev cannot bypass monitor target-namespace restrictions', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  change(
    rendered,
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    'kps-prometheus',
    ['spec', 'ignoreNamespaceSelectors'],
    false,
  );
  expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
    /dev discovery/,
  );
});

test.each(['prometheus', 'eck'] as const)(
  'controller watch scope refuses widened %s namespaces',
  async (controller) => {
    const projection = await createObservabilityProjection(root, request('production'));
    const rendered = rendering();
    if (controller === 'eck') {
      change(
        rendered,
        'observability/eck-operator',
        'ConfigMap',
        'elastic-operator',
        ['data', 'eck.yaml'],
        'namespaces: [observability, observability-dev, foreign]',
      );
    } else {
      const owner = 'observability/prometheus-controller';
      const documents: Document[] = parseAllDocuments(rendered[owner]);
      const deployment = documents.find((document) => document.get('kind') === 'Deployment');
      if (!deployment) throw new Error('test controller missing');
      const path = ['spec', 'template', 'spec', 'containers', 0, 'args'];
      deployment.setIn(path, [
        '--namespaces=observability,observability-dev,foreign',
        '--prometheus-instance-namespaces=observability,observability-dev',
        '--alertmanager-instance-namespaces=observability,observability-dev',
      ]);
      rendered[owner] = documents.map((document) => document.toString()).join('---\n');
    }
    expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
      /controller watches/,
    );
  },
);

test('placement comparison refuses two production candidates masquerading as two profiles', async () => {
  const projection = await createObservabilityProjection(root, request('production'));
  expect(() => {
    assertObservabilityProjectionParity(projection, rendering(), projection, rendering());
  }).toThrow(/placement pair/);
});

const apiFaults = [
  ['missing', undefined],
  ['empty', ''],
  ['null', null],
  ['number', 1],
  ['object', { group: 'apps', version: 'v1' }],
  ['foreign group', 'foreign.example.test/v1'],
  ['foreign version', 'apps/v99'],
  ['wrong standard API', 'v1'],
] as const;

test.each(
  apiFaults.flatMap(([fault, apiVersion]) =>
    ['ordinary', 'List'].map((wrapper) => [wrapper, fault, apiVersion] as const),
  ),
)('reviewed API identity on %s refuses %s', async (wrapper, _fault, apiVersion) => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  const owner = 'observability/prometheus-controller';
  const documents: Document[] = parseAllDocuments(rendered[owner]);
  const deployment = documents.find((document) => document.get('kind') === 'Deployment');
  if (!deployment) throw new Error('test controller missing');
  if (apiVersion === undefined) deployment.delete('apiVersion');
  else deployment.set('apiVersion', apiVersion);
  rendered[owner] =
    wrapper === 'ordinary'
      ? documents.map((document) => document.toString()).join('---\n')
      : stringify({
          apiVersion: 'v1',
          kind: 'List',
          items: documents.map((document) => {
            const manifest: unknown = document.toJSON();
            return manifest;
          }),
        });
  expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
    /apiVersion|kind/,
  );
});

test.each([
  'Alertmanager',
  'ClusterRole',
  'ClusterRoleBinding',
  'ConfigMap',
  'CustomResourceDefinition',
  'DaemonSet',
  'Deployment',
  'Job',
  'MutatingWebhookConfiguration',
  'Prometheus',
  'PrometheusRule',
  'Role',
  'RoleBinding',
  'Secret',
  'Service',
  'ServiceAccount',
  'ServiceMonitor',
  'StatefulSet',
  'ValidatingWebhookConfiguration',
])('reviewed API identity rejects a foreign group for %s', async (kind) => {
  const projection = await createObservabilityProjection(root, request('production'));
  const rendered = rendering();
  const entry = Object.entries(fixture).find(([, manifests]) =>
    manifests.some((manifest) => manifest.kind === kind),
  );
  if (!entry) throw new Error('test resource kind missing');
  const [owner, manifests] = entry;
  const selected = manifests.find((manifest) => manifest.kind === kind);
  if (!selected) throw new Error('test resource missing');
  change(rendered, owner, kind, selected.metadata.name, ['apiVersion'], 'foreign.example.test/v1');
  expect(() => assertRenderedObservabilityProjection(projection, rendered)).toThrow(
    /apiVersion|kind/,
  );
});
