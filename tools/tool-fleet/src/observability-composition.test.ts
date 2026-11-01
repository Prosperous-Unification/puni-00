import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parse, parseAllDocuments, parseDocument, stringify } from 'yaml';

import { renderObservability } from './observability';
import {
  assertObservabilityAssemblyResources,
  assertObservabilityComposition,
  createObservabilityComposition,
  selectObservabilityComposition,
} from './observability-composition';

const root = join(import.meta.dir, '../../..');
const request = {
  placement: 'production',
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
} as const;

const Resource = type({
  apiVersion: 'string',
  kind: 'string',
  metadata: { name: 'string', namespace: 'string' },
});
function resources(source: string) {
  return parseAllDocuments(source).map((document) => Resource.assert(document.toJSON()));
}

test('common assembly composes two three-signal instances and preserves current selected bytes', async () => {
  const candidate = await createObservabilityComposition(root, request);
  expect(candidate.scope).toBe('service-source-assembly');
  expect(candidate.securityConformant).toBe(false);
  expect(candidate.wholeRenderParity).toBe(false);
  expect(candidate.projection.releases).toHaveLength(5);
  for (const instance of candidate.instances) {
    expect(instance.releases.map((release) => release.owner)).toEqual([
      `${instance.namespace}/elasticsearch`,
      `${instance.namespace}/kibana`,
    ]);
    expect(
      resources(instance.native).every(
        (resource) => resource.metadata.namespace === instance.namespace,
      ),
    ).toBe(true);
    const config = type({
      data: { 'collector.yaml': 'string', 'gateway.yaml': 'string', 'apply.js': 'string' },
    }).assert(
      parseAllDocuments(instance.native)
        .map((document) => type({ metadata: { name: 'string' } }).assert(document.toJSON()))
        .find((resource) => resource.metadata.name.startsWith('signal-configuration-')),
    );
    const collector = type({
      receivers: 'object',
      service: { pipelines: { logs: 'object', traces: 'object', metrics: 'object' } },
    }).assert(parse(config.data['collector.yaml']));
    expect(collector.receivers).not.toHaveProperty('filelog');
    expect(collector.receivers).not.toHaveProperty('hostmetrics');
    expect(config.data['gateway.yaml']).toContain(
      `elasticsearch-es-http.${instance.namespace}.svc`,
    );
    expect(config.data['apply.js']).toContain(`elasticsearch-es-http.${instance.namespace}.svc`);
  }
  for (const [path, expected] of Object.entries(await renderObservability(root)))
    expect(await readFile(join(root, 'infra/platform', path), 'utf8')).toBe(expected);
});

test('instance capacity follows explicit policy independently of placement and ES seccomp is explicit', async () => {
  for (const placement of ['local', 'production']) {
    const candidate = await createObservabilityComposition(root, { ...request, placement });
    for (const instance of candidate.instances) {
      const release = parseDocument(instance.releases[0].manifest);
      const pod = ['spec', 'values', 'nodeSets', 0, 'podTemplate', 'spec'];
      expect(release.getIn([...pod, 'securityContext', 'seccompProfile', 'type'])).toBe(
        'RuntimeDefault',
      );
      expect(release.getIn([...pod, 'containers', 0, 'resources', 'limits', 'memory'])).toBe(
        instance.environment === 'dev' ? '2Gi' : '4Gi',
      );
      expect(release.getIn([...pod, 'initContainers', 0, 'resources', 'requests', 'memory'])).toBe(
        '128Mi',
      );
      expect(release.getIn([...pod, 'volumes', 0, 'emptyDir', 'sizeLimit'])).toBe('16Mi');
    }
  }
});

test('dev assembly selection retains prerequisites without activating production sources or stores', async () => {
  const candidate = await createObservabilityComposition(root, request);
  const selected = selectObservabilityComposition(candidate, ['dev']);
  expect(selected.instances.map((instance) => instance.environment)).toEqual(['dev']);
  expect(selected.releases.map((release) => release.owner)).toEqual([
    'observability/eck-operator',
    'observability/prometheus-controller',
    'observability-dev/kube-prometheus-stack',
    'observability-dev/elasticsearch',
    'observability-dev/kibana',
  ]);
  expect(
    selected.prerequisites.some(
      (prerequisite) =>
        prerequisite.kind === 'retained-reader-exclusion' &&
        prerequisite.owner === 'observability/otel-collector' &&
        !prerequisite.verified,
    ),
  ).toBe(true);
  expect(selected.activationReady).toBe(false);
});

test('authority handoff declares exclusive ingest trust, readonly exact health scope and unresolved routes', async () => {
  const candidate = await createObservabilityComposition(root, request);
  for (const instance of candidate.instances) {
    expect(instance.authority.healthQuery).toEqual({
      cluster: [],
      indices: [
        {
          names: [`logs-*.otel-${instance.environment}`, `traces-*.otel-${instance.environment}`],
          privileges: ['read'],
        },
      ],
    });
    expect(instance.authority.ingestTrust).toEqual({
      scope: 'exclusive-instance-ca',
      environment: instance.environment,
      effectiveAcceptanceVerified: false,
    });
    expect(instance.routes.every((route) => route.externalBinding === 'required')).toBe(true);
    expect(
      instance.requiredSecrets.some(
        (secret) => secret.name === 'signal-health-users' && secret.keys.includes('users_roles'),
      ),
    ).toBe(true);
    expect(instance.requiredSecrets.every((secret) => !Object.hasOwn(secret, 'data'))).toBe(true);
  }
});

test.each([
  [
    'absent policy',
    {
      ...request,
      instances: [{ environment: 'dev', namespace: 'observability-dev' }, request.instances[1]],
    },
  ],
  [
    'prod downsizing',
    {
      ...request,
      instances: [request.instances[0], { ...request.instances[1], policy: 'development' }],
    },
  ],
  ['invented live authority', { ...request, observedUID: 'invented' }],
])('assembly request refuses %s', (_name, input) => {
  expect(createObservabilityComposition(root, input)).rejects.toThrow();
});

test('assembly validator refuses altered source API, seccomp, claims, prerequisites and trust', async () => {
  const candidate = await createObservabilityComposition(root, request);
  await assertObservabilityComposition(root, candidate);
  for (const mutate of [
    (copy: typeof candidate) => {
      copy.instances[0].native = copy.instances[0].native.replace(
        'apiVersion: apps/v1',
        'apiVersion: foreign/v1',
      );
    },
    (copy: typeof candidate) => {
      copy.instances[0].releases[0].manifest = copy.instances[0].releases[0].manifest.replace(
        'RuntimeDefault',
        'Unconfined',
      );
    },
    (copy: typeof candidate) => {
      copy.instances[0].native = copy.instances[0].native.replace('storage: 2Gi', 'storage: 0Gi');
    },
    (copy: typeof candidate) => {
      copy.prerequisites.pop();
    },
    (copy: typeof candidate) => {
      copy.instances[0].requiredSecrets.pop();
    },
  ]) {
    const copy = structuredClone(candidate);
    mutate(copy);
    expect(assertObservabilityComposition(root, copy)).rejects.toThrow(/composition differs/);
  }
});

test('explicit disposable prod rehearsal is allowed locally and refused on production placement', async () => {
  const instances = [
    request.instances[0],
    { ...request.instances[1], policy: 'disposable-rehearsal' },
  ];
  const rehearsal = await createObservabilityComposition(root, { placement: 'local', instances });
  expect(rehearsal.instances[1].capacity.memory).toBe('2Gi');
  expect(
    createObservabilityComposition(root, { placement: 'production', instances }),
  ).rejects.toThrow(/Rehearsal capacity/);
});

test('desired retained reader excludes the dev namespace without editing the current reader', async () => {
  const candidate = await createObservabilityComposition(root, request);
  expect(candidate.retainedReader.desiredManifest).toContain(
    '/var/log/pods/observability-dev_*/*/*.log',
  );
  expect(candidate.retainedReader.desiredManifest).toContain(
    'resource.attributes["k8s.namespace.name"] == "observability-dev"',
  );
  expect(candidate.projection.releases[4].manifest).toBe(
    await readFile(join(root, 'infra/platform/observability/otel/collector.yaml'), 'utf8'),
  );
  expect(candidate.retainedReader.applied).toBe(false);
});

const resourceFaults = [
  ['missing resource', (source: string) => source.slice(source.indexOf('---\n') + 4), /closure/],
  [
    'duplicate resource',
    (source: string) => source + '---\n' + source.slice(0, source.indexOf('---\n')),
    /closure/,
  ],
  [
    'foreign namespace',
    (source: string) => source.replace('namespace: observability-dev', 'namespace: observability'),
    /namespace/,
  ],
  [
    'foreign API',
    (source: string) => source.replace('apiVersion: apps/v1', 'apiVersion: foreign/v1'),
    /apiVersion/,
  ],
  [
    'foreign NetworkPolicy API',
    (source: string) =>
      source.replace('apiVersion: networking.k8s.io/v1', 'apiVersion: networking.k8s.io/v2'),
    /apiVersion/,
  ],
  ['missing API', (source: string) => source.replace('apiVersion: apps/v1\n', ''), /apiVersion/],
  [
    'malformed YAML',
    (source: string) => source.replace('kind: StatefulSet', 'kind: StatefulSet\nkind: StatefulSet'),
    /Malformed/,
  ],
] as const;
test.each(resourceFaults)(
  'native assembly refuses %s independently',
  async (_name, mutate, diagnostic) => {
    const candidate = await createObservabilityComposition(root, request);
    const native = candidate.instances[0].native;
    assertObservabilityAssemblyResources(native, 'observability-dev');
    expect(() => {
      assertObservabilityAssemblyResources(mutate(native), 'observability-dev');
    }).toThrow(diagnostic);
  },
);

type Candidate = Awaited<ReturnType<typeof createObservabilityComposition>>;
const mutations: [string, (candidate: Candidate) => void][] = [
  [
    'missing ES seccomp',
    (candidate) => {
      const manifest = parseDocument(candidate.instances[0].releases[0].manifest);
      manifest.deleteIn([
        'spec',
        'values',
        'nodeSets',
        0,
        'podTemplate',
        'spec',
        'securityContext',
        'seccompProfile',
      ]);
      candidate.instances[0].releases[0].manifest = manifest.toString();
    },
  ],
  [
    'foreign store claim',
    (candidate) => {
      const manifest = parseDocument(candidate.instances[0].releases[0].manifest);
      manifest.setIn(
        ['spec', 'values', 'nodeSets', 0, 'volumeClaimTemplates', 0, 'spec', 'volumeName'],
        'production-pv',
      );
      candidate.instances[0].releases[0].manifest = manifest.toString();
    },
  ],
  [
    'missing controller',
    (candidate) => {
      const manifest = parseDocument(candidate.instances[0].releases[0].manifest);
      manifest.deleteIn(['spec', 'dependsOn']);
      candidate.instances[0].releases[0].manifest = manifest.toString();
    },
  ],
  [
    'foreign query realm',
    (candidate) => {
      const manifest = parseDocument(candidate.instances[0].releases[0].manifest);
      manifest.setIn(['spec', 'values', 'auth', 'fileRealm', 0, 'secretName'], 'prod-users');
      candidate.instances[0].releases[0].manifest = manifest.toString();
    },
  ],
  [
    'query write grant',
    (candidate) => {
      candidate.instances[0].authority.healthQuery.indices[0].privileges = ['write'];
    },
  ],
  [
    'query wildcard scope',
    (candidate) => {
      candidate.instances[0].authority.healthQuery.indices[0].names = ['*'];
    },
  ],
  [
    'query admin credential',
    (candidate) => {
      candidate.instances[0].routes[1].credential = 'elasticsearch-es-elastic-user';
    },
  ],
  [
    'invented effective authority',
    (candidate) => {
      Object.assign(candidate.instances[0].authority, { effectiveAcceptanceVerified: true });
    },
  ],
  [
    'invented live binding',
    (candidate) => {
      Object.assign(candidate, { liveBinding: true });
    },
  ],
  [
    'invented source security',
    (candidate) => {
      Object.assign(candidate, { securityConformant: true });
    },
  ],
  [
    'invented full parity',
    (candidate) => {
      Object.assign(candidate, { wholeRenderParity: true });
    },
  ],
  [
    'invented claim binding',
    (candidate) => {
      Object.assign(candidate, { claimsBound: true });
    },
  ],
  [
    'invented handover',
    (candidate) => {
      Object.assign(candidate, { controllerHandoverExecuted: true });
    },
  ],
  [
    'queue omission',
    (candidate) => {
      candidate.instances[0].native = candidate.instances[0].native.replaceAll(
        'file_storage',
        'missing_storage',
      );
    },
  ],
  [
    'retention omission',
    (candidate) => {
      candidate.instances[0].native = candidate.instances[0].native.replaceAll('30d', '0d');
    },
  ],
  [
    'retained reader omission',
    (candidate) => {
      candidate.retainedReader.desiredManifest = candidate.projection.releases[4].manifest;
    },
  ],
];
test.each(mutations)('assembly production validation refuses %s', async (_name, mutate) => {
  const candidate = await createObservabilityComposition(root, request);
  mutate(candidate);
  expect(assertObservabilityComposition(root, candidate)).rejects.toThrow(/composition differs/);
});

async function copySource() {
  const directory = await scratchAsync('observability-composition-');
  await cp(join(root, 'infra'), join(directory, 'infra'), { recursive: true });
  await mkdir(join(directory, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(directory, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  return directory;
}
test.each(['missing assignment', 'duplicate assignment', 'missing file', 'unreadable file'])(
  'trusted UI setup refuses %s',
  async (fault) => {
    const directory = await copySource();
    const path = join(directory, 'infra/platform/observability/kibana/objects/apply.sh');
    const program = await readFile(path, 'utf8');
    const assignment = 'url=https://kibana-kb-http.observability.svc:5601\n';
    if (fault === 'missing assignment') await writeFile(path, program.replace(assignment, ''));
    if (fault === 'duplicate assignment') await writeFile(path, program + assignment);
    if (fault === 'missing file') await rm(path);
    if (fault === 'unreadable file') await chmod(path, 0);
    expect(createObservabilityComposition(directory, request)).rejects.toThrow(
      fault === 'missing file'
        ? /ENOENT/
        : fault === 'unreadable file'
          ? /EACCES/
          : /Kibana setup URL binding/,
    );
  },
);

test('common monitoring adds declared durable AM state through a separate service release boundary', async () => {
  const candidate = await createObservabilityComposition(root, request);
  for (const instance of candidate.instances) {
    const base = candidate.projection.releases.find(
      (release) => release.owner === `${instance.namespace}/kube-prometheus-stack`,
    );
    expect(
      parseDocument(base?.manifest ?? '').getIn([
        'spec',
        'values',
        'alertmanager',
        'alertmanagerSpec',
        'storage',
      ]),
    ).toBeUndefined();
    const monitoring = parseDocument(instance.monitoring.manifest);
    expect(
      monitoring.getIn([
        'spec',
        'values',
        'alertmanager',
        'alertmanagerSpec',
        'storage',
        'volumeClaimTemplate',
        'spec',
        'resources',
        'requests',
        'storage',
      ]),
    ).toBe('1Gi');
    expect(instance.capacity.alertmanagerStorage).toBe('1Gi');
  }
  const selected = selectObservabilityComposition(candidate, ['prod', 'platform']);
  expect(
    selected.releases.find((release) => release.owner === 'observability/kube-prometheus-stack')
      ?.manifest,
  ).toBe(candidate.instances[1].monitoring.manifest);
  expect(
    selected.releases.find((release) => release.owner === 'observability/otel-collector')?.manifest,
  ).toBe(candidate.retainedReader.desiredManifest);
});

test.each([
  'foreign owner',
  'foreign base',
  'duplicate base',
  'missing base',
  'changed override',
  'duplicate selection',
])('service selection refuses %s', async (fault) => {
  const candidate = await createObservabilityComposition(root, request);
  if (fault === 'foreign owner')
    candidate.instances[0].monitoring.owner = 'observability/kube-prometheus-stack';
  if (fault === 'foreign base')
    candidate.instances[0].monitoring.baseOwner = 'observability/kube-prometheus-stack';
  if (fault === 'duplicate base')
    candidate.projection.releases.push(candidate.projection.releases[2]);
  if (fault === 'missing base') candidate.projection.releases.splice(2, 1);
  if (fault === 'changed override')
    candidate.instances[0].monitoring.manifest += '# not the exact expected override\n';
  expect(() =>
    selectObservabilityComposition(
      candidate,
      fault === 'duplicate selection' ? ['dev', 'dev'] : ['dev'],
    ),
  ).toThrow();
});

test('service selection refuses duplicate controller prerequisites after owner substitution', async () => {
  const candidate = await createObservabilityComposition(root, request);
  candidate.projection.releases.push(candidate.projection.releases[0]);
  expect(() => selectObservabilityComposition(candidate, ['dev'])).toThrow(
    /Duplicate service release owner/,
  );
});

test('composition request refusal does not expose private external values', async () => {
  const input = {
    ...request,
    instances: [
      { ...request.instances[0], policy: 'private-request-marker' },
      request.instances[1],
    ],
  };
  try {
    await createObservabilityComposition(root, input);
    throw new Error('Expected request refusal');
  } catch (failure) {
    expect(String(failure)).toBe('Error: Invalid observability composition request');
  }
});

function nativeDocuments(source: string) {
  return parseAllDocuments(source).map((document) =>
    type({
      kind: 'string',
      metadata: { name: 'string', namespace: 'string' },
    }).assert(document.toJSON()),
  );
}
test('configuration content addresses refresh same-instance Pod and immutable Job templates', async () => {
  const directory = await copySource();
  const before = await createObservabilityComposition(directory, request);
  const unchanged = await createObservabilityComposition(directory, request);
  expect(unchanged.instances[0].native).toBe(before.instances[0].native);
  const objects = join(directory, 'infra/platform/observability/kibana/objects/objects.ndjson');
  await writeFile(
    objects,
    (await readFile(objects, 'utf8')).replace('PUNI logs', 'PUNI source logs'),
  );
  const after = await createObservabilityComposition(directory, request);
  for (const index of [0, 1]) {
    const prior = nativeDocuments(before.instances[index].native);
    const next = nativeDocuments(after.instances[index].native);
    const priorConfig = prior.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata.name.startsWith('kibana-objects-'),
    );
    const nextConfig = next.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata.name.startsWith('kibana-objects-'),
    );
    expect(priorConfig).toBeDefined();
    expect(nextConfig?.metadata.name).not.toBe(priorConfig?.metadata.name);
    const job = type({
      metadata: { annotations: { 'kustomize.toolkit.fluxcd.io/force': "'enabled'" } },
      spec: {
        template: {
          spec: { volumes: type({ name: 'string', 'configMap?': { name: 'string' } }).array() },
        },
      },
    }).assert(
      next.find(
        (manifest) => manifest.kind === 'Job' && manifest.metadata.name === 'kibana-objects',
      ),
    );
    expect(
      job.spec.template.spec.volumes.find((volume) => volume.name === 'objects')?.configMap?.name,
    ).toBe(nextConfig?.metadata.name);
    const configuration = type({ data: 'Record<string, string>' }).assert(
      next.find(
        (manifest) =>
          manifest.kind === 'ConfigMap' &&
          manifest.metadata.name.startsWith('signal-configuration-'),
      ),
    );
    expect(configuration.data['collector.yaml']).toContain(
      `signal-gateway.${after.instances[index].namespace}.svc`,
    );
    assertObservabilityAssemblyResources(
      after.instances[index].native,
      after.instances[index].namespace,
    );
  }
});

test.each([
  'stale content',
  'missing reference',
  'foreign reference',
  'duplicate reference',
  'missing Job force',
])('native refresh refuses %s', async (fault) => {
  const candidate = await createObservabilityComposition(root, request);
  const documents = parseAllDocuments(candidate.instances[0].native);
  const configuration = documents.find(
    (document) =>
      document.get('kind') === 'ConfigMap' &&
      String(document.getIn(['metadata', 'name'])).startsWith('signal-configuration'),
  );
  const workload = documents.find(
    (document) =>
      document.get('kind') === 'StatefulSet' &&
      document.getIn(['metadata', 'name']) === 'signal-collector',
  );
  const job = documents.find(
    (document) =>
      document.get('kind') === 'Job' && document.getIn(['metadata', 'name']) === 'elastic-settings',
  );
  if (fault === 'stale content') configuration?.setIn(['data', 'collector.yaml'], 'altered');
  if (fault === 'missing reference')
    workload?.deleteIn(['spec', 'template', 'spec', 'volumes', 0, 'configMap']);
  if (fault === 'foreign reference')
    workload?.setIn(
      ['spec', 'template', 'spec', 'volumes', 0, 'configMap', 'name'],
      'foreign-configuration',
    );
  if (fault === 'duplicate reference')
    workload?.addIn(['spec', 'template', 'spec', 'volumes'], {
      name: 'configuration',
      configMap: {
        name: String(
          workload.getIn(['spec', 'template', 'spec', 'volumes', 0, 'configMap', 'name']),
        ),
      },
    });
  if (fault === 'missing Job force')
    job?.deleteIn(['metadata', 'annotations', 'kustomize.toolkit.fluxcd.io/force']);
  expect(() => {
    assertObservabilityAssemblyResources(
      documents
        .map((document) => stringify(type('object').assert(document.toJSON())))
        .join('---\n'),
      'observability-dev',
    );
  }).toThrow(/configuration|refresh/);
});

test('changed source configuration updates Pod references while preserving each namespace', async () => {
  const production = await createObservabilityComposition(root, request);
  const local = await createObservabilityComposition(root, { ...request, placement: 'local' });
  for (const index of [0, 1]) {
    const prior = nativeDocuments(production.instances[index].native);
    const next = nativeDocuments(local.instances[index].native);
    const priorConfig = prior.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata.name.startsWith('signal-configuration-'),
    );
    const nextConfig = next.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata.name.startsWith('signal-configuration-'),
    );
    expect(nextConfig?.metadata.name).not.toBe(priorConfig?.metadata.name);
    for (const name of ['signal-collector', 'signal-gateway']) {
      const pod = type({
        metadata: { namespace: 'string' },
        spec: {
          template: {
            spec: { volumes: type({ name: 'string', 'configMap?': { name: 'string' } }).array() },
          },
        },
      }).assert(
        next.find((manifest) => manifest.kind === 'StatefulSet' && manifest.metadata.name === name),
      );
      expect(pod.metadata.namespace).toBe(local.instances[index].namespace);
      expect(
        pod.spec.template.spec.volumes.find((volume) => volume.name === 'configuration')?.configMap
          ?.name,
      ).toBe(nextConfig?.metadata.name);
    }
  }
});

const savedObject = {
  type: 'lens',
  id: 'fixture-view',
  attributes: { title: 'Fixture view' },
  references: [{ name: 'source', type: 'index-pattern', id: 'fixture-source' }],
};
const invalidSavedObjects: [string, string][] = [
  ['invalid JSON', '{ private-json-marker }\n'],
  ['empty stream', ''],
  ['newline-only stream', '\n\r\n'],
  ['null record', 'null\n'],
  ['array record', '[]\n'],
  ['scalar record', '42\n'],
  ['string record', '"private-record-marker"\n'],
  ['missing type', JSON.stringify({ id: 'fixture', attributes: {}, references: [] })],
  ['wrong type', JSON.stringify({ ...savedObject, type: 42 })],
  ['blank type', JSON.stringify({ ...savedObject, type: ' ' })],
  ['missing id', JSON.stringify({ type: 'lens', attributes: {}, references: [] })],
  ['wrong id', JSON.stringify({ ...savedObject, id: null })],
  ['empty id', JSON.stringify({ ...savedObject, id: '' })],
  ['missing attributes', JSON.stringify({ type: 'lens', id: 'fixture', references: [] })],
  ['null attributes', JSON.stringify({ ...savedObject, attributes: null })],
  ['array attributes', JSON.stringify({ ...savedObject, attributes: [] })],
  [
    'primitive attributes',
    JSON.stringify({ ...savedObject, attributes: 'private-envelope-marker' }),
  ],
  ['missing references', JSON.stringify({ type: 'lens', id: 'fixture', attributes: {} })],
  ['wrong references', JSON.stringify({ ...savedObject, references: {} })],
  ['null reference', JSON.stringify({ ...savedObject, references: [null] })],
  [
    'missing reference name',
    JSON.stringify({ ...savedObject, references: [{ type: 'lens', id: 'fixture' }] }),
  ],
  [
    'wrong reference name',
    JSON.stringify({ ...savedObject, references: [{ ...savedObject.references[0], name: false }] }),
  ],
  [
    'missing reference type',
    JSON.stringify({ ...savedObject, references: [{ name: 'source', id: 'fixture' }] }),
  ],
  [
    'wrong reference type',
    JSON.stringify({ ...savedObject, references: [{ ...savedObject.references[0], type: null }] }),
  ],
  [
    'missing reference id',
    JSON.stringify({ ...savedObject, references: [{ name: 'source', type: 'lens' }] }),
  ],
  [
    'blank reference id',
    JSON.stringify({ ...savedObject, references: [{ ...savedObject.references[0], id: ' ' }] }),
  ],
];

test.each(invalidSavedObjects)(
  'saved-object input refuses %s before packaging with safe diagnostics',
  async (_fault, source) => {
    const directory = await copySource();
    await writeFile(
      join(directory, 'infra/platform/observability/kibana/objects/objects.ndjson'),
      source,
    );
    try {
      await createObservabilityComposition(directory, request);
      throw new Error('Malformed saved objects were packaged');
    } catch (failure) {
      expect(failure).toBeInstanceOf(Error);
      const refusal = type({ message: 'string', 'cause?': 'unknown' }).assert(failure);
      expect(refusal.message).toBe('Invalid Kibana saved-object input at line 1');
      expect(refusal.cause).toBeUndefined();
    }
  },
);

test('saved-object assertion refuses a bad second line at the input boundary', async () => {
  const directory = await copySource();
  const candidate = await createObservabilityComposition(directory, request);
  await writeFile(
    join(directory, 'infra/platform/observability/kibana/objects/objects.ndjson'),
    `${JSON.stringify(savedObject)}\n{ private-second-line-marker }\n`,
  );
  expect(assertObservabilityComposition(directory, candidate)).rejects.toThrow(
    'Invalid Kibana saved-object input at line 2',
  );
});

test('saved-object input preserves current valid bytes and opaque metadata with trailing newlines', async () => {
  const directory = await copySource();
  const path = join(directory, 'infra/platform/observability/kibana/objects/objects.ndjson');
  const current = await readFile(path, 'utf8');
  for (const source of [
    current,
    `${JSON.stringify({ ...savedObject, type: 'opaque-plugin-type', unknownMetadata: { future: true }, attributes: { nested: [null, { untouched: true }] } })}\r\n\r\n`,
  ]) {
    await writeFile(path, source);
    const candidate = await createObservabilityComposition(directory, request);
    await assertObservabilityComposition(directory, candidate);
    for (const instance of candidate.instances) {
      const configuration = type({ data: { 'objects.ndjson': 'string' } }).assert(
        nativeDocuments(instance.native).find(
          (manifest) =>
            manifest.kind === 'ConfigMap' && manifest.metadata.name.startsWith('kibana-objects-'),
        ),
      );
      expect(configuration.data['objects.ndjson']).toBe(source);
    }
  }
});

test.each(['missing', 'unreadable'])(
  'saved-object input preserves distinct %s file refusal',
  async (fault) => {
    const directory = await copySource();
    const path = join(directory, 'infra/platform/observability/kibana/objects/objects.ndjson');
    if (fault === 'missing') await rm(path);
    else await chmod(path, 0);
    expect(createObservabilityComposition(directory, request)).rejects.toThrow(
      fault === 'missing' ? /ENOENT/ : /EACCES/,
    );
  },
);
