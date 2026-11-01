import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseDocument } from 'yaml';

import {
  assertObservabilityProjection,
  createObservabilityProjection,
  selectObservabilityProjection,
} from './observability-projection';

const root = join(import.meta.dir, '../../..');
const request = {
  placement: 'production',
  instances: [
    { environment: 'dev', namespace: 'observability-dev' },
    { environment: 'prod', namespace: 'observability' },
  ],
} as const;

test('dev projection selects one shared controller owner without production services or sources', async () => {
  const projection = await createObservabilityProjection(root, request);
  const selected = selectObservabilityProjection(projection, ['dev']);
  expect(selected.scope).toBe('chart-role-projection');
  expect(selected.completeServiceGraph).toBe(false);
  expect(selected.releases.map((release) => release.owner)).toEqual([
    'observability/eck-operator',
    'observability/prometheus-controller',
    'observability-dev/kube-prometheus-stack',
  ]);
  expect(selected.requiredServices).toEqual([]);
  const dev = parseDocument(selected.releases[2].manifest);
  expect(dev.getIn(['spec', 'values', 'crds', 'enabled'])).toBe(false);
  expect(dev.getIn(['spec', 'values', 'prometheusOperator', 'enabled'])).toBe(false);
  expect(dev.getIn(['spec', 'values', 'nodeExporter', 'enabled'])).toBe(false);
  expect(dev.getIn(['spec', 'values', 'kubeStateMetrics', 'enabled'])).toBe(false);
  const decoded = type({
    spec: {
      values: { prometheus: { prometheusSpec: { serviceMonitorNamespaceSelector: 'object' } } },
    },
  }).assert(dev.toJSON());
  expect(decoded.spec.values.prometheus.prometheusSpec.serviceMonitorNamespaceSelector).toEqual({
    matchLabels: { 'kubernetes.io/metadata.name': 'observability-dev' },
  });
});

test('retained production monitoring and platform sources keep release and store identities', async () => {
  const projection = await createObservabilityProjection(root, request);
  const selected = selectObservabilityProjection(projection, ['prod', 'platform']);
  expect(selected.releases.map((release) => release.owner)).toEqual([
    'observability/eck-operator',
    'observability/prometheus-controller',
    'observability/kube-prometheus-stack',
    'observability/otel-collector',
  ]);
  expect(selected.requiredServices).toEqual(['observability/elasticsearch']);
  const prod = parseDocument(selected.releases[2].manifest);
  expect(prod.getIn(['spec', 'values', 'fullnameOverride'])).toBe('kps');
  expect(
    prod.getIn([
      'spec',
      'values',
      'prometheus',
      'prometheusSpec',
      'storageSpec',
      'volumeClaimTemplate',
      'spec',
      'storageClassName',
    ]),
  ).toBe('puni-retain');
  expect(projection.controllerHandover).toEqual({
    from: 'observability/kube-prometheus-stack',
    to: 'observability/prometheus-controller',
    executed: false,
    requires: 'observed ownership and reviewed handover',
  });
});

test.each([
  ['duplicate', ['dev', 'dev']],
  ['foreign', ['other']],
  ['missing sink', ['platform']],
  ['empty', []],
])('selection refuses %s roles', async (_name, selection) => {
  const projection = await createObservabilityProjection(root, request);
  expect(() => selectObservabilityProjection(projection, selection)).toThrow();
});

test.each([
  [
    'wrong namespace',
    {
      ...request,
      instances: [{ environment: 'dev', namespace: 'observability' }, request.instances[1]],
    },
  ],
  [
    'duplicate environment',
    { ...request, instances: [request.instances[0], request.instances[0]] },
  ],
  ['invented live identity', { ...request, targetUID: 'guessed' }],
  ['missing placement', { instances: request.instances }],
  ['third cluster', { ...request, placement: 'development' }],
])('source contract refuses %s', (_name, input) => {
  expect(createObservabilityProjection(root, input)).rejects.toThrow();
});

test('source validator refuses duplicate foreign missing and modified owner projections', async () => {
  const projection = await createObservabilityProjection(root, request);
  await assertObservabilityProjection(root, projection);
  for (const mutate of [
    (copy: typeof projection) => copy.releases.push(copy.releases[0]),
    (copy: typeof projection) => {
      copy.releases[0].owner = 'foreign/eck-operator';
    },
    (copy: typeof projection) => {
      copy.releases.pop();
    },
    (copy: typeof projection) => {
      copy.releases[2].manifest += '\n# altered source\n';
    },
  ]) {
    const copy = structuredClone(projection);
    mutate(copy);
    expect(assertObservabilityProjection(root, copy)).rejects.toThrow(/projection differs/);
  }
});

test('retained production chart keeps operator monitor ownership and targets the separate owner', async () => {
  const projection = await createObservabilityProjection(root, request);
  const prod = parseDocument(projection.releases[3].manifest);
  const decoded = type({
    spec: { values: { prometheus: { additionalServiceMonitors: 'object[]' } } },
  }).assert(prod.toJSON());
  expect(decoded.spec.values.prometheus.additionalServiceMonitors).toEqual([
    {
      name: 'kps-operator',
      selector: {
        matchLabels: { app: 'kube-prometheus-stack-operator', release: 'prometheus-controller' },
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
  ]);
});

test('source closure refuses a missing controller dependency', async () => {
  const projection = await createObservabilityProjection(root, request);
  const document = parseDocument(projection.releases[2].manifest);
  document.deleteIn(['spec', 'dependsOn']);
  projection.releases[2].manifest = document.toString();
  expect(assertObservabilityProjection(root, projection)).rejects.toThrow(/projection differs/);
});
