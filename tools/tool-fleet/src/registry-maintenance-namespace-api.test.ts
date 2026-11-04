import { expect, test } from 'bun:test';

import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { respondRegistryFixture } from './registry-maintenance-namespace-api.fixture';

const request = (verb = 'get', kind = 'Kustomization', name = 'puni-cluster') => [
  'kubectl',
  '--kubeconfig',
  '/etc/puni/registry-maintenance-management.kubeconfig',
  '--request-timeout=15s',
  verb,
  '--namespace',
  'flux-system',
  kind,
  name,
  ...(verb === 'get'
    ? ['--output=json']
    : ['--type=json', '--patch-file=/dev/stdin', '--output=json']),
];
const state = () => ({
  resources: [...registryClusterFixture().resources.values()].map((resource) => ({
    ...resource,
    metadata: { ...resource.metadata, resourceVersion: '1' },
  })),
});
const patch = () => [
  { op: 'test', path: '/metadata/uid', value: 'puni-cluster' },
  { op: 'test', path: '/metadata/resourceVersion', value: '1' },
  { op: 'add', path: '/spec/suspend', value: true },
  {
    op: 'add',
    path: '/metadata/annotations',
    value: { 'reconcile.fluxcd.io/requestedAt': '11111111-1111-4111-8111-111111111111' },
  },
];

test('synthetic fixture preserves full resources and exact acknowledgement mutation', () => {
  const original = state();
  const observed = respondRegistryFixture(request(), JSON.stringify(original));
  expect(observed.changed).toBeNull();
  expect(observed.response).toEqual(
    original.resources.find(
      (resource) => resource.kind === 'Kustomization' && resource.metadata.name === 'puni-cluster',
    ),
  );
  const changed = respondRegistryFixture(request('patch'), JSON.stringify(original), patch());
  expect(changed.response).toMatchObject({
    metadata: { resourceVersion: '2', generation: 2 },
    spec: { suspend: true },
    status: {
      lastAppliedRevision: 'revision',
      lastHandledReconcileAt: '11111111-1111-4111-8111-111111111111',
    },
  });
  expect(changed.changed).not.toBeNull();
  if (changed.changed === null) throw new Error('Fixture patch lost serialized state');
  expect(respondRegistryFixture(request(), changed.changed).response).toEqual(changed.response);
});

for (const fault of [
  'uid',
  'revision',
  'operation',
  'field',
  'boolean',
  'annotations',
  'extra',
] as const) {
  test(`synthetic patch refuses ${fault}`, () => {
    const mutations = patch();
    if (fault === 'uid') mutations[0].value = 'foreign';
    if (fault === 'revision') mutations[1].value = 'stale';
    if (fault === 'operation') mutations[2].op = 'test';
    if (fault === 'field') mutations[2].path = '/spec/sourceRef';
    if (fault === 'boolean') mutations[2].value = 'true';
    if (fault === 'annotations') mutations[3].value = true;
    if (fault === 'extra') Object.assign(mutations[2], { arbitrary: true });
    expect(() =>
      respondRegistryFixture(request('patch'), JSON.stringify(state()), mutations),
    ).toThrow();
  });
}

for (const fault of [
  'config',
  'verb',
  'options',
  'namespace',
  'name',
  'state-shape',
  'resource-shape',
  'metadata',
  'bound',
] as const) {
  test(`synthetic request refuses ${fault}`, () => {
    const args = request(fault === 'verb' ? 'delete' : 'get');
    const stored = state();
    if (fault === 'config') args[2] = '/arbitrary';
    if (fault === 'verb') args[4] = 'delete';
    if (fault === 'options') args.push('--arbitrary');
    if (fault === 'namespace') args[6] = 'foreign';
    if (fault === 'name') args[8] = 'foreign';
    const fields: Record<string, unknown> = stored;
    if (fault === 'state-shape') fields['extra'] = true;
    if (fault === 'resource-shape') fields['resources'] = [...stored.resources, null];
    if (fault === 'metadata') Object.assign(stored.resources[0].metadata, { generation: '1' });
    if (fault === 'bound')
      Object.assign(stored.resources[0].metadata, { note: 'x'.repeat(1024 ** 2) });
    const serialized = JSON.stringify(fields);
    expect(() =>
      respondRegistryFixture(args, serialized, fault === 'verb' ? patch() : undefined),
    ).toThrow();
  });
}

test('synthetic deployment and selector mutations retain fixed value contracts', () => {
  for (const kind of ['Deployment', 'Service']) {
    const args = request('patch', kind, 'registry');
    args[6] = 'puni-registry';
    const mutations = [
      { op: 'test', path: '/metadata/uid', value: 'registry' },
      { op: 'test', path: '/metadata/resourceVersion', value: '1' },
      {
        op: 'add',
        path: kind === 'Deployment' ? '/spec/replicas' : '/spec/selector',
        value: kind === 'Deployment' ? 0 : { 'puni-registry-maintenance': 'withdrawn' },
      },
    ];
    expect(respondRegistryFixture(args, JSON.stringify(state()), mutations).changed).not.toBeNull();
    const invalid = structuredClone(mutations);
    if (kind === 'Deployment') invalid[2].value = 2;
    else invalid[2].value = { invalid: 1 } as never;
    expect(() => respondRegistryFixture(args, JSON.stringify(state()), invalid)).toThrow();
  }
});
