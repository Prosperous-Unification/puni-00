import { createHash } from 'node:crypto';
import { chmod, copyFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { beforeAll, expect, spyOn, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import type { RehearsalStageBuild } from './observability-parity-rehearsal';
import {
  authenticateRehearsalHelm,
  captureRehearsalFrames,
  readRehearsalInventory,
} from './observability-rehearsal-inventory';
import { indexObservabilitySource } from './observability-source-render';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let lock: Toolchain;
let stages: RehearsalStageBuild[];
let expansions: Record<string, string>;
let contract: ReturnType<typeof captureRehearsalFrames>;
const image = 'registry.example.invalid/app@sha256:' + 'a'.repeat(64);
const encode = (...manifests: unknown[]) =>
  manifests.map((manifest) => stringify(manifest)).join('---\n');
const native = {
  apiVersion: 'apps/v1',
  kind: 'StatefulSet',
  metadata: { name: 'store', namespace: 'target' },
  spec: {
    replicas: 3,
    template: {
      spec: {
        containers: [{ name: 'app', image, resources: { requests: { memory: '1Gi' } } }],
        initContainers: [{ name: 'init', image }],
        ephemeralContainers: [{ name: 'debug', image }],
        volumes: [{ name: 'existing', persistentVolumeClaim: { claimName: 'existing' } }],
      },
    },
    volumeClaimTemplates: [
      { metadata: { name: 'store' }, spec: { resources: { requests: { storage: '4Gi' } } } },
    ],
  },
};
const claim = {
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  metadata: { name: 'existing', namespace: 'target' },
  spec: { resources: { requests: { storage: '2Gi' } } },
};
const provider = {
  apiVersion: 'example.invalid/v1',
  kind: 'Machine',
  metadata: { name: 'provider', namespace: 'declared' },
  spec: { image },
};
const release = {
  owner: 'target/store',
  chart: 'elasticsearch' as const,
  manifest: stringify({
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: { name: 'store', namespace: 'target' },
    spec: {
      chart: { spec: { chart: './chart.tgz', version: '1.0.0' } },
      values: { disabledWorker: { enabled: false, image } },
    },
  }),
};
beforeAll(async () => {
  lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const pin = lock.charts.elasticsearch;
  const manifest = parseDocument(release.manifest);
  manifest.setIn(
    ['spec', 'chart', 'spec', 'chart'],
    `./infra/platform/charts/${basename(new URL(pin.url).pathname)}`,
  );
  manifest.setIn(['spec', 'chart', 'spec', 'version'], pin.version);
  release.manifest = manifest.toString();
  const bytes = encode(native, claim, provider);
  const declaration = release.manifest;
  stages = [
    {
      stage: 'native',
      path: 'infra/native',
      declarationPath: 'stages/native.yaml',
      sourceSHA256: hash('native-source'),
      bytes,
      sha256: hash(bytes),
      releases: [],
    },
    {
      stage: 'charts',
      path: 'infra/charts',
      declarationPath: 'stages/charts.yaml',
      sourceSHA256: hash('chart-source'),
      bytes: declaration,
      sha256: hash(declaration),
      releases: [release],
    },
  ];
  expansions = {
    'target/store': encode(
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'enabled' },
        spec: { template: { spec: { containers: [{ name: 'app', image }] } } },
      },
      {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'setup', annotations: { 'helm.sh/hook': 'pre-install,pre-upgrade' } },
        spec: { template: { spec: { containers: [{ name: 'setup', image }] } } },
      },
    ),
  };
  contract = captureRehearsalFrames(stages, expansions);
});

test('retains actual native image roles, claim facts, release linkage and hook intent without disabled values', () => {
  const inventory = readRehearsalInventory(stages, expansions, contract, lock);
  expect(inventory.entries).toHaveLength(6);
  const store = inventory.entries.find(
    (entry) => entry.name === 'store' && entry.kind === 'StatefulSet',
  );
  expect(store).toMatchObject({
    namespace: 'target',
    namespaceOrigin: 'metadata',
    category: 'native-template',
    owner: 'stage/native',
  });
  expect(store?.images.map((reference) => reference.role)).toEqual([
    'containers',
    'initContainers',
    'ephemeralContainers',
  ]);
  expect(store?.claims).toEqual([
    {
      pointer: '/spec/template/spec/volumes/0/persistentVolumeClaim/claimName',
      kind: 'reference',
      name: 'existing',
    },
    { pointer: '/spec/volumeClaimTemplates/0', kind: 'template', name: 'store', storage: '4Gi' },
  ]);
  expect(store?.sourceRequests).toEqual([
    {
      pointer: '/spec/template/spec/containers/0/resources/requests',
      quantities: { memory: '1Gi' },
    },
  ]);
  expect(inventory.entries.find((entry) => entry.name === 'existing')).toMatchObject({
    claims: [{ kind: 'claim', storage: '2Gi' }],
  });
  expect(inventory.entries.find((entry) => entry.name === 'enabled')).toMatchObject({
    namespace: 'target',
    namespaceOrigin: 'release',
    releaseOwner: 'target/store',
  });
  expect(inventory.entries.find((entry) => entry.name === 'setup')).toMatchObject({
    hooks: ['pre-install', 'pre-upgrade'],
    schedulingObserved: false,
  });
  expect(inventory.entries.some((entry) => entry.name === 'disabledWorker')).toBe(false);
  expect(inventory.entries.find((entry) => entry.kind === 'HelmRelease')).toMatchObject({
    expansionOwner: 'target/store',
  });
  expect(inventory.creationAuthority).toBe(false);
  expect(inventory.runtimeRehearsal).toBe(false);
  expect(inventory.transportObserved).toBe('not-evaluated');
  expect(inventory.runnableClosure).toBe('incomplete');
});

test('unknown provider scope stays unresolved even with declared and release namespaces', () => {
  const inventory = readRehearsalInventory(stages, expansions, contract, lock);
  expect(inventory.entries.find((entry) => entry.kind === 'Machine')).toMatchObject({
    namespace: null,
    declaredNamespace: 'declared',
    namespaceOrigin: 'unresolved',
    category: 'unclassified',
  });
  expect(inventory.unresolved.some((obligation) => obligation.includes('Machine'))).toBe(true);
  expect(inventory.unresolved.some((obligation) => obligation.includes('helper'))).toBe(true);
  expect(inventory.unresolved.some((obligation) => obligation.includes('bootstrap'))).toBe(true);
});

test.each(['stage', 'expansion', 'hook', 'hash', 'owner'] as const)(
  'source closure refuses omitted or changed %s',
  (fault) => {
    const selected = structuredClone(stages);
    const rendered = { ...expansions };
    if (fault === 'stage') selected.pop();
    if (fault === 'expansion') delete rendered['target/store'];
    if (fault === 'hook')
      rendered['target/store'] = encode(parseDocument(rendered['target/store']).toJSON());
    if (fault === 'hash') selected[0] = { ...selected[0], bytes: selected[0].bytes + '\n' };
    if (fault === 'owner') selected.push(selected[0]);
    expect(() => readRehearsalInventory(selected, rendered, contract, lock)).toThrow(
      /closure|hash/,
    );
  },
);

function changeNative(edit: (manifest: typeof native) => void) {
  const selected = structuredClone(stages);
  const manifest = structuredClone(native);
  edit(manifest);
  const bytes = encode(manifest, claim, provider);
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  return selected;
}
test.each(['image', 'claim', 'template', 'pod'] as const)(
  'known malformed native %s refuses through the production fold',
  (fault) => {
    const selected = changeNative((manifest) => {
      if (fault === 'image') manifest.spec.template.spec.containers[0].image = '';
      if (fault === 'claim')
        manifest.spec.template.spec.volumes[0].persistentVolumeClaim.claimName = '';
      if (fault === 'template')
        manifest.spec.volumeClaimTemplates[0].spec.resources.requests.storage = '';
      if (fault === 'pod') Reflect.deleteProperty(manifest.spec.template.spec, 'containers');
    });
    expect(() =>
      readRehearsalInventory(
        selected,
        expansions,
        captureRehearsalFrames(selected, expansions),
        lock,
      ),
    ).toThrow();
  },
);

test.each(['duplicate', 'namespace', 'identity', 'empty'] as const)(
  'rendered expansion refuses %s contradictions',
  (fault) => {
    const rendered = { ...expansions };
    if (fault === 'duplicate') rendered['target/store'] += '\n---\n' + rendered['target/store'];
    if (fault === 'namespace')
      rendered['target/store'] = rendered['target/store'].replace(
        'name: enabled',
        'name: enabled\n  namespace: foreign',
      );
    const selected = structuredClone(stages);
    if (fault === 'identity')
      selected[1].releases[0].manifest = selected[1].releases[0].manifest.replace(
        'name: store',
        'name: foreign',
      );
    if (fault === 'empty') rendered['target/store'] = '';
    expect(() =>
      readRehearsalInventory(
        selected,
        rendered,
        fault === 'namespace' ? contract : captureRehearsalFrames(selected, rendered),
        lock,
      ),
    ).toThrow(fault === 'identity' ? /release identity/ : undefined);
  },
);

test('structural List decoding retains member coordinates and refuses malformed Lists and YAML', () => {
  const selected = structuredClone(stages);
  const bytes = encode({ apiVersion: 'v1', kind: 'List', items: [native, claim, provider] });
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  const inventory = readRehearsalInventory(
    selected,
    expansions,
    captureRehearsalFrames(selected, expansions),
    lock,
  );
  expect(inventory.entries.find((entry) => entry.kind === 'StatefulSet')?.pointer).toBe(
    '/0/items/0',
  );
  for (const bytes of [
    'apiVersion: v1\nkind: List\nitems: null',
    'apiVersion: v1\nkind: ConfigMap\nkind: Secret\nmetadata: {name: valid}',
  ]) {
    selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
    expect(() => captureRehearsalFrames(selected, expansions)).toThrow();
  }
});

test('same-version substituted Helm refuses before executing its version or render commands', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-fake-helm-');
  const marker = join(directory, 'invoked');
  await writeFile(
    join(directory, 'helm'),
    `#!/bin/sh\ntouch '${marker}'\nprintf '%s' '${lock.binaries.helm.version}'\n`,
  );
  await chmod(join(directory, 'helm'), 0o755);
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  expect(authenticateRehearsalHelm(root, directory, archive)).rejects.toThrow(
    /Helm executable integrity/,
  );
  expect(await Bun.file(marker).exists()).toBe(false);
});

test('verified archive extraction authenticates actual Helm and distinguishes archive from executable bytes', async () => {
  const tools = await provisionObservabilityTools();
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  const identity = await authenticateRehearsalHelm(root, tools, archive);
  expect(identity.archiveSHA256).toBe(lock.binaries.helm.sha256);
  expect(identity.executableSHA256).not.toBe(identity.archiveSHA256);
  expect(identity.member).toBe('linux-amd64/helm');
});

test.each(['absent', 'changed'] as const)(
  'required Helm archive %s refuses without download',
  async (fault) => {
    const tools = await provisionObservabilityTools();
    const directory = await scratchAsync('rehearsal-helm-archive-');
    const archive = join(directory, 'helm.tgz');
    if (fault === 'changed') await writeFile(archive, 'substitute');
    expect(authenticateRehearsalHelm(root, tools, archive)).rejects.toThrow();
  },
);

test('CRD-declared namespaced and cluster provider scopes retain provider obligations', () => {
  const crd = (name: string, kind: string, scope: string) => ({
    apiVersion: 'apiextensions.k8s.io/v1',
    kind: 'CustomResourceDefinition',
    metadata: { name },
    spec: { group: 'example.invalid', names: { kind }, scope, versions: [{ name: 'v1' }] },
  });
  const selected = structuredClone(stages);
  const bytes = encode(
    crd('machines.example.invalid', 'Machine', 'Namespaced'),
    crd('fleets.example.invalid', 'Fleet', 'Cluster'),
    provider,
    { apiVersion: 'example.invalid/v1', kind: 'Fleet', metadata: { name: 'fleet' } },
  );
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  const inventory = readRehearsalInventory(
    selected,
    expansions,
    captureRehearsalFrames(selected, expansions),
    lock,
  );
  expect(inventory.entries.find((entry) => entry.kind === 'Machine')).toMatchObject({
    scope: 'Namespaced',
    namespace: 'declared',
    category: 'provider-input',
  });
  expect(inventory.entries.find((entry) => entry.kind === 'Fleet')).toMatchObject({
    scope: 'Cluster',
    namespace: null,
    namespaceOrigin: 'crd',
    category: 'provider-input',
  });
});

test.each([
  'cluster-namespace',
  'native-api',
  'duplicate-crd',
  'malformed-crd',
  'missing-declaration',
  'bad-hook',
  'bad-pvc',
  'missing-native-namespace',
] as const)('scope and declaration validation accounts for %s', (fault) => {
  const selected = structuredClone(stages);
  let bytes = selected[0].bytes;
  const rendered = { ...expansions };
  if (fault === 'cluster-namespace')
    bytes = encode({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'target', namespace: 'wrong' },
    });
  if (fault === 'native-api') bytes = encode({ ...native, apiVersion: 'foreign/v1' });
  if (fault === 'duplicate-crd' || fault === 'malformed-crd') {
    const crd = {
      apiVersion: 'apiextensions.k8s.io/v1',
      kind: 'CustomResourceDefinition',
      metadata: { name: 'machines.example.invalid' },
      spec: {
        group: 'example.invalid',
        names: { kind: 'Machine' },
        scope: fault === 'malformed-crd' ? 'Guessed' : 'Namespaced',
        versions: [{ name: 'v1' }],
      },
    };
    bytes =
      fault === 'duplicate-crd'
        ? encode(crd, { ...crd, metadata: { name: 'other.example.invalid' } })
        : encode(crd);
  }
  if (fault === 'missing-declaration')
    selected[1] = { ...selected[1], bytes: '', sha256: hash('') };
  if (fault === 'bad-hook')
    rendered['target/store'] = rendered['target/store'].replace('pre-install,pre-upgrade', "''");
  if (fault === 'bad-pvc') bytes = encode({ ...claim, spec: {} });
  if (fault === 'missing-native-namespace')
    bytes = encode({ ...native, metadata: { name: 'store' } });
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  const expected = captureRehearsalFrames(selected, rendered);
  if (fault === 'missing-native-namespace') {
    expect(
      readRehearsalInventory(selected, rendered, expected, lock).entries.find(
        (entry) => entry.kind === 'StatefulSet',
      ),
    ).toMatchObject({ scope: 'unresolved', namespace: null });
  } else expect(() => readRehearsalInventory(selected, rendered, expected, lock)).toThrow();
});

test('immutable stage source and resource contracts refuse a narrowed view even with recomputed frame hashes', () => {
  const selected = structuredClone(stages);
  selected[0] = { ...selected[0], sourceSHA256: hash('foreign-source') };
  expect(() => readRehearsalInventory(selected, expansions, contract, lock)).toThrow(
    /stage closure/,
  );
  const rendered = { 'target/store': expansions['target/store'].split('---')[0] };
  const expected = structuredClone(contract);
  const expansion = expected.frames.find((frame) => frame.owner === 'release/target/store');
  if (expansion === undefined) throw new Error('fixture expansion absent');
  expansion.sha256 = hash(rendered['target/store']);
  expect(() => readRehearsalInventory(stages, rendered, expected, lock)).toThrow(
    /resource closure/,
  );
});

test('required Helm archive unreadability refuses distinctly from absence', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-unreadable-archive-');
  const archive = join(directory, 'helm.tgz');
  await copyFile(
    join(
      tools,
      'cache',
      `helm-${lock.binaries.helm.version}`,
      basename(new URL(lock.binaries.helm.url).pathname),
    ),
    archive,
  );
  await chmod(archive, 0);
  try {
    const failure: unknown = await authenticateRehearsalHelm(root, tools, archive).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(failure).toMatchObject({ code: 'EACCES' });
  } finally {
    await chmod(archive, 0o600);
  }
});

test('a discovered release cannot relabel its locked chart version', () => {
  const selected = structuredClone(stages);
  const manifest = parseDocument(selected[1].releases[0].manifest);
  manifest.setIn(['spec', 'chart', 'spec', 'version'], '0.0.0');
  selected[1].releases[0].manifest = manifest.toString();
  selected[1] = { ...selected[1], bytes: manifest.toString(), sha256: hash(manifest.toString()) };
  expect(() =>
    readRehearsalInventory(
      selected,
      expansions,
      captureRehearsalFrames(selected, expansions),
      lock,
    ),
  ).toThrow(/chart pin/);
});

test.each(['duplicate-release', 'frame-owner', 'declaration-bytes', 'undeclared-release'] as const)(
  'source frame boundary refuses %s',
  (fault) => {
    const selected = structuredClone(stages);
    const expected = structuredClone(contract);
    if (fault === 'duplicate-release')
      selected[1] = { ...selected[1], releases: [release, release] };
    if (fault === 'frame-owner') expected.frames[0].owner = 'stage/foreign';
    if (fault === 'declaration-bytes') {
      const manifest = parseDocument(selected[1].releases[0].manifest);
      manifest.setIn(['spec', 'values', 'disabledWorker', 'enabled'], true);
      selected[1].releases[0].manifest = manifest.toString();
    }
    if (fault === 'undeclared-release') {
      selected[0] = {
        ...selected[0],
        bytes: selected[0].bytes + '\n---\n' + release.manifest,
        sha256: hash(selected[0].bytes + '\n---\n' + release.manifest),
      };
    }
    expect(() =>
      readRehearsalInventory(
        selected,
        expansions,
        fault === 'undeclared-release' ? captureRehearsalFrames(selected, expansions) : expected,
        lock,
      ),
    ).toThrow(fault === 'frame-owner' ? /frame owner closure/ : undefined);
  },
);

test.each(['Pod', 'DaemonSet', 'CronJob'] as const)(
  'native %s uses shared PodSpec extraction with source coordinates',
  (kind) => {
    const selected = structuredClone(stages);
    const pod = native.spec.template.spec;
    const spec =
      kind === 'Pod'
        ? pod
        : kind === 'CronJob'
          ? { jobTemplate: { spec: { template: { spec: pod } } } }
          : { template: { spec: pod } };
    const bytes = encode({
      apiVersion: kind === 'Pod' ? 'v1' : kind === 'CronJob' ? 'batch/v1' : 'apps/v1',
      kind,
      metadata: { name: 'native', namespace: 'target' },
      spec,
    });
    selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
    const inventory = readRehearsalInventory(
      selected,
      expansions,
      captureRehearsalFrames(selected, expansions),
      lock,
    );
    expect(inventory.entries.find((entry) => entry.name === 'native')?.images).toHaveLength(3);
  },
);

test('API versions cannot create two owners for the same group/kind resource', () => {
  const selected = structuredClone(stages);
  const bytes = encode(provider, { ...provider, apiVersion: 'example.invalid/v2' });
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  expect(() =>
    readRehearsalInventory(
      selected,
      expansions,
      captureRehearsalFrames(selected, expansions),
      lock,
    ),
  ).toThrow(/duplicate object/);
});

test('known PVC shape cannot borrow a foreign API', () => {
  const selected = structuredClone(stages);
  const bytes = encode({ ...claim, apiVersion: 'apps/v1' });
  selected[0] = { ...selected[0], bytes, sha256: hash(bytes) };
  expect(() =>
    readRehearsalInventory(
      selected,
      expansions,
      captureRehearsalFrames(selected, expansions),
      lock,
    ),
  ).toThrow(/claim API/);
});

test('changed Helm archive refuses before the existing installer can fetch replacement bytes', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-no-download-');
  const archive = join(directory, 'helm.tgz');
  await writeFile(archive, 'substitute');
  // The installer legitimately downloads absent/bad cache content elsewhere; this boundary must refuse first.
  const blockFetch = Object.assign(
    () => {
      throw new Error('Unexpected inventory download');
    },
    { preconnect: fetch.preconnect },
  );
  const network = spyOn(globalThis, 'fetch').mockImplementation(blockFetch);
  try {
    const failure: unknown = await authenticateRehearsalHelm(root, tools, archive).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(failure).toMatchObject({ message: 'Rehearsal Helm archive integrity differs' });
  } finally {
    network.mockRestore();
  }
});

test('an unfamiliar chart provider cannot acquire scope from the Helm namespace', () => {
  const rendered = {
    'target/store':
      expansions['target/store'] +
      '\n---\n' +
      encode({ ...provider, metadata: { name: 'chart-provider' } }),
  };
  const inventory = readRehearsalInventory(
    stages,
    rendered,
    captureRehearsalFrames(stages, rendered),
    lock,
  );
  expect(inventory.entries.find((entry) => entry.name === 'chart-provider')).toMatchObject({
    namespace: null,
    scope: 'unresolved',
    declaredNamespace: null,
    namespaceOrigin: 'unresolved',
    releaseOwner: 'target/store',
  });
  expect(
    inventory.entries
      .find((entry) => entry.name === 'store' && entry.kind === 'StatefulSet')
      ?.images.every((reference) => reference.pin === 'unresolved'),
  ).toBe(true);
});

test('legacy observability indexing retains its API allowlist and owner-derived namespace policy', () => {
  const indexed = indexObservabilitySource({
    'legacy/native': encode(
      { ...native, metadata: { name: 'store' } },
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { name: 'global' },
      },
    ),
  });
  expect(Object.keys(indexed['legacy/native'])).toEqual([
    'StatefulSet:legacy:store',
    'ClusterRole:_:global',
  ]);
  expect(() => indexObservabilitySource({ 'legacy/provider': encode(provider) })).toThrow();
  expect(() =>
    indexObservabilitySource({ 'legacy/native': encode({ ...native, apiVersion: 'foreign/v1' }) }),
  ).toThrow();
});

test('known API scope honors explicit chart metadata in a different namespace', () => {
  const rendered = {
    'target/store':
      expansions['target/store'] +
      '\n---\n' +
      encode({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'coredns', namespace: 'kube-system' },
      }),
  };
  const inventory = readRehearsalInventory(
    stages,
    rendered,
    captureRehearsalFrames(stages, rendered),
    lock,
  );
  expect(inventory.entries.find((entry) => entry.name === 'coredns')).toMatchObject({
    namespace: 'kube-system',
    namespaceOrigin: 'metadata',
    releaseOwner: 'target/store',
  });
});
