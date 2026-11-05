import { expect, it } from 'bun:test';

import { fixture } from './observability-preflight.fixture';

async function rejection(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  }
  return 'fulfilled-without-refusal';
}

const core = ['deployments.apps', 'statefulsets.apps', 'daemonsets.apps', 'replicasets.apps'];
const elasticsearch = 'elasticsearches.elasticsearch.k8s.elastic.co';
const kibana = 'kibanas.kibana.k8s.elastic.co';
const helm = 'helmreleases.helm.toolkit.fluxcd.io';

for (const [label, definitions, customKinds] of [
  ['all', [elasticsearch, kibana, helm], ['Elasticsearch', 'Kibana', 'HelmRelease']],
  ['Elasticsearch only', [elasticsearch], ['Elasticsearch']],
  ['Kibana only', [kibana], ['Kibana']],
  ['HelmRelease only', [helm], ['HelmRelease']],
  ['Elasticsearch and Kibana', [elasticsearch, kibana], ['Elasticsearch', 'Kibana']],
  ['Elasticsearch and HelmRelease', [elasticsearch, helm], ['Elasticsearch', 'HelmRelease']],
  ['Kibana and HelmRelease', [kibana, helm], ['Kibana', 'HelmRelease']],
  ['none', [], []],
] as const) {
  it(`first inventory queries exactly discovered custom APIs: ${label}`, async () => {
    const setup = await fixture();
    setup.request.phase = 'inventory';
    setup.request.resources = [];
    setup.request.candidate = [];
    setup.snapshot.resources = setup.snapshot.resources.filter(
      (resource) =>
        resource.kind !== 'CustomResourceDefinition' ||
        (definitions as readonly string[]).includes(resource.name),
    );
    for (const kind of ['DaemonSet', 'ReplicaSet', 'StatefulSet', 'Elasticsearch', 'Kibana'])
      setup.snapshot.resources.push({
        ...setup.snapshot.resources[0],
        kind,
        name: `discovery-${kind.toLowerCase()}`,
        uid: `discovery-${kind.toLowerCase()}`,
      });
    const receipt = await setup.direct((_command, response) => response);
    expect(receipt.customWorkloadAPIs).toMatchObject([
      {
        resourceType: elasticsearch,
        state: (definitions as readonly string[]).includes(elasticsearch) ? 'present' : 'absent',
      },
      {
        resourceType: kibana,
        state: (definitions as readonly string[]).includes(kibana) ? 'present' : 'absent',
      },
      {
        resourceType: helm,
        state: (definitions as readonly string[]).includes(helm) ? 'present' : 'absent',
      },
    ]);
    expect(receipt.inventoryComplete).toBe(true);
    expect(receipt.migrationReady).toBe(false);
    expect(receipt.promotionAuthorized).toBe(false);
    expect(receipt.blockers).toEqual(['review-required']);
    const query = receipt.provenance.find((entry) => entry.source.includes('/deployments.apps'));
    expect(query?.source.split('/').at(-1)?.split(',')).toEqual([...core, ...definitions]);
    expect(
      receipt.observed.resources
        .filter((resource) => resource.kind === 'CustomResourceDefinition')
        .map((resource) => resource.name),
    ).toEqual([...definitions]);
    const observedKinds = receipt.observed.resources.map((resource) => resource.kind);
    for (const kind of ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', ...customKinds])
      expect(observedKinds).toContain(kind);
    for (const kind of ['Elasticsearch', 'Kibana', 'HelmRelease'])
      expect(observedKinds.includes(kind)).toBe((customKinds as readonly string[]).includes(kind));
  });
}

it('first inventory ignores unrecognized CRDs and non-CRD metadata impersonating a supported CRD', async () => {
  const setup = await fixture();
  setup.request.phase = 'inventory';
  setup.snapshot.resources = setup.snapshot.resources.filter(
    (resource) => resource.kind !== 'CustomResourceDefinition',
  );
  setup.snapshot.resources.push(
    {
      ...setup.snapshot.resources[0],
      kind: 'CustomResourceDefinition',
      name: 'other.example.test',
    },
    { ...setup.snapshot.resources[0], kind: 'Namespace', name: elasticsearch },
  );
  const receipt = await setup.direct((_command, response) => response);
  expect(receipt.inventoryComplete).toBe(true);
  expect(
    receipt.observed.resources.some((resource) => resource.name === 'other.example.test'),
  ).toBe(true);
  expect(
    receipt.provenance.find((entry) => entry.source.includes('/deployments.apps'))?.source,
  ).toBe('observability-kubernetes:reviewed-context/' + core.join(','));
});

it('first inventory queries discovered unready custom APIs rather than treating readiness as absence', async () => {
  const setup = await fixture();
  setup.request.phase = 'inventory';
  for (const resource of setup.snapshot.resources)
    if (resource.kind === 'CustomResourceDefinition') {
      resource.ready = false;
      resource.observedGeneration = -1;
    }
  const receipt = await setup.direct((_command, response) => response);
  expect(receipt.observed.resources.some((resource) => resource.kind === 'HelmRelease')).toBe(true);
  expect(
    receipt.provenance.find((entry) => entry.source.includes('/deployments.apps'))?.source,
  ).toBe(
    'observability-kubernetes:reviewed-context/' + [...core, elasticsearch, kibana, helm].join(','),
  );
});

for (const definition of [elasticsearch, kibana, helm])
  it(`first inventory refuses a native query failure for discovered ${definition}`, async () => {
    const setup = await fixture();
    setup.request.phase = 'inventory';
    expect(
      await rejection(
        setup.direct((command, response) =>
          command.arguments.includes('get') &&
          command.arguments[command.arguments.indexOf('get') + 1]?.split(',').includes(definition)
            ? { ...response, exitCode: 1, stdout: '[]', stderr: 'native API unavailable' }
            : response,
        ),
      ),
    ).toContain('command-failed');
  });

for (const [label, stdout, exitCode, refusal] of [
  ['missing', '', 0, 'projection-malformed'],
  ['malformed', '{}', 0, 'projection-malformed'],
  ['malformed member', '[{}]', 0, 'projection-malformed'],
  ['unreadable', '', 1, 'command-failed'],
] as const)
  it(`first inventory refuses ${label} CRD inventory before workloads`, async () => {
    const setup = await fixture();
    setup.request.phase = 'inventory';
    let queriedWorkloads = false;
    expect(
      await rejection(
        setup.direct((command, response) => {
          if (command.source.includes('/deployments.apps')) queriedWorkloads = true;
          return command.arguments.includes('namespaces,customresourcedefinitions')
            ? { ...response, stdout, exitCode }
            : response;
        }),
      ),
    ).toContain(refusal);
    expect(queriedWorkloads).toBe(false);
  });

it('cutover still refuses missing required controllers after custom API discovery', async () => {
  const setup = await fixture();
  setup.snapshot.resources = setup.snapshot.resources.filter((resource) => resource.name !== helm);
  expect(await rejection(setup.direct((_command, response) => response))).toContain(
    'controller-owner-conflict',
  );
});

it('custom API discovery preserves the cutover receipt contract', async () => {
  const setup = await fixture();
  const receipt = await setup.direct((_command, response) => response);
  expect(receipt.inventoryComplete).toBe(true);
  expect(receipt.migrationReady).toBe(true);
  expect(receipt).not.toHaveProperty('customWorkloadAPIs');
});
