import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import {
  captureRehearsalFrames,
  readRehearsalInventory,
  readRehearsalSource,
} from './observability-rehearsal-inventory';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let lock: Toolchain;
beforeAll(async () => {
  lock = await readToolchain(join(import.meta.dir, '../../../infra/versions/toolchain.json'));
});
function fixture() {
  const manifests = ['dev', 'prod'].map((namespace) => ({
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'store', namespace },
    spec: {
      replicas: 2,
      volumeClaimTemplates: [
        {
          metadata: { name: 'records' },
          spec: {
            storageClassName: 'retain',
            resources: { requests: { storage: '64Mi' } },
          },
        },
      ],
      template: {
        spec: {
          containers: [
            {
              name: 'app',
              image: 'example@sha256:' + 'a'.repeat(64),
              resources: {
                requests: { memory: '100Mi', cpu: '100m' },
                limits: { memory: '100Mi', cpu: '1' },
              },
              securityContext: { readOnlyRootFilesystem: true },
              volumeMounts: [{ name: 'records', mountPath: '/records' }],
            },
          ],
        },
      },
    },
  }));
  const bytes = manifests.map((manifest) => stringify(manifest)).join('---\n');
  const stages = [
    {
      stage: 'native',
      path: 'infra/native',
      declarationPath: 'stages/native.yaml',
      sourceSHA256: hash('source'),
      sha256: hash(bytes),
      bytes,
      releases: [],
    },
  ];
  return { stages, expansions: {}, contract: captureRehearsalFrames(stages, {}) };
}

test('shared traversal exposes exact native bodies while the existing receipt stays source-only', () => {
  const packet = fixture();
  const source = readRehearsalSource(packet.stages, packet.expansions, packet.contract, lock);
  expect(source.inventory).toEqual(
    readRehearsalInventory(packet.stages, packet.expansions, packet.contract, lock),
  );
  expect(source.native).toHaveLength(2);
  expect(
    source.native.map(({ entry }) => [entry.namespace, entry.pointer, entry.source.frameSHA256]),
  ).toEqual([
    ['dev', '/0', packet.contract.frames[0].sha256],
    ['prod', '/1', packet.contract.frames[0].sha256],
  ]);
  expect(source.native[0].manifest).toMatchObject({ spec: { replicas: 2 } });
  expect(source.inventory).not.toHaveProperty('native');
  expect(source.inventory).not.toHaveProperty('knownContributions');
});

test('shared owner normalization and claim expansion preserve full ordinal charges', async () => {
  const { normalizeNativeOwner, expandNativeOwner } = await import('./observability-cold-start');
  const { NativeWorkloadSpec } = await import('./observability-workload');
  const packet = fixture();
  const source = readRehearsalSource(packet.stages, packet.expansions, packet.contract, lock);
  const view = source.native[0];
  const manifest = view.manifest as {
    spec: {
      template: { spec: unknown };
      volumeClaimTemplates: {
        metadata: { name: string };
        spec: { storageClassName: string; resources: { requests: { storage: string } } };
      }[];
    };
  };
  const templates = manifest.spec.volumeClaimTemplates;
  const identity = 'StatefulSet:dev:store';
  const model = normalizeNativeOwner(
    NativeWorkloadSpec.assert(manifest.spec.template.spec),
    templates,
    'StatefulSet',
    view.entry.owner,
    identity,
  );
  const entries = expandNativeOwner({
    identity,
    namespace: 'dev',
    name: 'store',
    pods: 2,
    templates,
    model,
    source: {
      owner: view.entry.owner,
      sha256: view.entry.source.frameSHA256,
      pointer: '/0/spec/template/spec',
    },
    claimPointer: (_template, index) => `/0/spec/volumeClaimTemplates/${String(index)}`,
  });
  expect(
    entries.map((entry) => [entry.identity, entry.memoryMiB, entry.cpuMilli, entry.diskMiB]),
  ).toEqual([
    ['StatefulSet:dev:store/pod/0', 100, 100, 0],
    ['PersistentVolumeClaim:dev:records-store-0', 0, 0, 64],
    ['StatefulSet:dev:store/pod/1', 100, 100, 0],
    ['PersistentVolumeClaim:dev:records-store-1', 0, 0, 64],
  ]);
  expect(entries[1].source.pointer).toBe('/0/spec/volumeClaimTemplates/0');
});

async function derive(packet = fixture(), pin = lock) {
  const { readRehearsalNativeCosts } = await import('./observability-native-ordinal');
  return readRehearsalNativeCosts(packet.stages, packet.expansions, packet.contract, pin);
}

test('default StatefulSet lifecycle retains full Pods and unique claims through graceful replacement', async () => {
  const ledger = await derive();
  expect(ledger.entries).toHaveLength(8);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 256 });
  expect(
    ledger.entries.filter((charge) => charge.kind === 'claim').map((charge) => charge.identity),
  ).toEqual([
    'PersistentVolumeClaim:dev:records-store-0',
    'PersistentVolumeClaim:dev:records-store-1',
    'PersistentVolumeClaim:prod:records-store-0',
    'PersistentVolumeClaim:prod:records-store-1',
  ]);
  expect(ledger.lifecycles[0]).toMatchObject({
    owner: 'StatefulSet:dev:store',
    management: {
      declared: 'absent',
      effective: 'OrderedReady',
      basis: 'kubernetes-v1.36.4-default',
    },
    update: { declared: 'absent', effective: 'RollingUpdate', basis: 'kubernetes-v1.36.4-default' },
    grace: {
      declared: 'absent',
      effective: 30,
      basis: 'kubernetes-v1.36.4-default',
      reclamationDeadline: false,
    },
    scenario: 'immutable-source-process-recovery-or-graceful-same-template-ordinal-replacement',
    runtimeObserved: false,
  });
  expect(ledger.lifecycles[0].templateSHA256).toMatch(/^[a-f0-9]{64}$/);
  expect(ledger.provider).toMatchObject({
    kubernetesDefaultVersion: 'v1.36.4',
    intendedK3sVersion: 'v1.36.4+k3s1',
    runtimeObserved: false,
    sourceRenderCapability: { kubernetesVersion: '1.35.0', observed: false },
  });
  expect(ledger.state).toBe('incomplete');
  expect(ledger.creationAuthority).toBe(false);
  expect(ledger.runtimeAuthority).toBe(false);
  for (const scenario of [
    'forced-deletion',
    'lost-node-execution',
    'foreign-mutation',
    'unbound-old-new-templates',
    'unaccounted-controller-generations',
  ])
    expect(ledger.unsupportedScenarios).toContain(scenario);
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'ephemeral-storage-limit-absent:app; writable-logs-and-runtime-state-unobserved',
  });
});

function change(edit: (manifest: ReturnType<typeof parseDocument>) => void) {
  const packet = fixture();
  const documents = packet.stages[0].bytes.split('---\n').map((bytes) => parseDocument(bytes));
  edit(documents[0]);
  packet.stages[0].bytes = documents
    .map((document: ReturnType<typeof parseDocument>) => document.toString())
    .join('---\n');
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, packet.expansions);
  return packet;
}
for (const [label, edit] of [
  [
    'negative replicas',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'replicas'], -1);
    },
  ],
  [
    'fractional replicas',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'replicas'], 1.5);
    },
  ],
  [
    'fractional ordinal',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'ordinals'], { start: 0.5 });
    },
  ],
  [
    'contradictory update strategy',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'updateStrategy'], {
        type: 'OnDelete',
        rollingUpdate: { partition: 0 },
      });
    },
  ],
  [
    'negative partition',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'updateStrategy'], {
        type: 'RollingUpdate',
        rollingUpdate: { partition: -1 },
      });
    },
  ],
  [
    'fractional unavailable',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'updateStrategy'], {
        type: 'RollingUpdate',
        rollingUpdate: { maxUnavailable: 1.5 },
      });
    },
  ],
  [
    'foreign strategy field',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'strategy'], { type: 'Recreate' });
    },
  ],
  [
    'late contradictory volume after unsupported management',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'bad', hostPath: { path: '/var' }, emptyDir: { sizeLimit: '1Mi' } }],
      );
    },
  ],
  [
    'late contradictory volume after absent bounds',
    (document: ReturnType<typeof parseDocument>) => {
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'bad', secret: { secretName: 's' }, emptyDir: { sizeLimit: '1Mi' } }],
      );
    },
  ],
  [
    'late malformed volume quantity after unsupported management',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'bad', emptyDir: { sizeLimit: '-1Mi' } }],
      );
    },
  ],
  [
    'duplicate claim templates after unsupported management',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
      document.setIn(
        ['spec', 'volumeClaimTemplates', 1],
        document.getIn(['spec', 'volumeClaimTemplates', 0]),
      );
    },
  ],
  [
    'Job negative parallelism',
    (document: ReturnType<typeof parseDocument>) => {
      document.set('apiVersion', 'batch/v1');
      document.set('kind', 'Job');
      document.setIn(['spec', 'parallelism'], -1);
    },
  ],
] as const)
  test(`malformed ${label} throws before incomplete source classification`, () => {
    expect(derive(change(edit))).rejects.toThrow(
      label === 'duplicate claim templates after unsupported management'
        ? 'claim-template-duplicate'
        : undefined,
    );
  });

for (const [label, edit, fact] of [
  [
    'parallel management',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
    },
    'stateful-ordinal-lifecycle-policy',
  ],
  [
    'custom ordinal',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'ordinals'], { start: 10 });
    },
    'stateful-ordinal-lifecycle-policy',
  ],
  [
    'OnDelete',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'updateStrategy'], { type: 'OnDelete' });
    },
    'stateful-ordinal-lifecycle-policy',
  ],
  [
    'absent resources',
    (document: ReturnType<typeof parseDocument>) =>
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']),
    'workload-bounds-or-resource-policy',
  ],
  [
    'null resources',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'template', 'spec', 'containers', 0, 'resources'], null);
    },
    'workload-bounds-or-resource-policy',
  ],
] as const)
  test(`valid ${label} remains named incomplete without invented charges`, async () => {
    const ledger = await derive(change(edit));
    expect(ledger.blockers).toContainEqual({ owner: 'StatefulSet:dev:store', missingFact: fact });
    expect(ledger.entries.filter((entry) => entry.owner === 'StatefulSet:dev:store')).toHaveLength(
      0,
    );
  });

test('explicit policy provenance remains declared without changing full charges', async () => {
  const ledger = await derive(
    change((document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'podManagementPolicy'], 'OrderedReady');
      document.setIn(['spec', 'updateStrategy'], { type: 'RollingUpdate' });
      document.setIn(['spec', 'template', 'spec', 'terminationGracePeriodSeconds'], 10);
    }),
  );
  expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 256 });
  expect(ledger.lifecycles[0].management).toEqual({
    declared: 'OrderedReady',
    effective: 'OrderedReady',
    basis: 'declared',
  });
  expect(ledger.lifecycles[0].grace).toEqual({
    declared: 10,
    effective: 10,
    basis: 'declared',
    reclamationDeadline: false,
  });
});

test('valid null security context on unrelated DaemonSet preserves its lifecycle obligation', async () => {
  const ledger = await derive(
    change((document: ReturnType<typeof parseDocument>) => {
      document.set('kind', 'DaemonSet');
      document.deleteIn(['spec', 'volumeClaimTemplates']);
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'volumeMounts']);
      document.setIn(['spec', 'template', 'spec', 'containers', 0, 'securityContext'], null);
    }),
  );
  expect(ledger.blockers).toContainEqual({
    owner: 'DaemonSet:dev:store',
    missingFact: 'DaemonSet-lifecycle-unaccounted',
  });
});

function appendClaim(
  packet: ReturnType<typeof fixture>,
  namespace: string,
  name: string,
  storage = '64Mi',
) {
  packet.stages[0].bytes +=
    '---\n' +
    stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { namespace, name },
      spec: { storageClassName: 'retain', resources: { requests: { storage } } },
    });
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, packet.expansions);
  return packet;
}
for (const storage of ['64Mi', '128Mi'])
  test(`explicit PVC cannot duplicate an ordinal claim at ${storage}`, () => {
    expect(derive(appendClaim(fixture(), 'dev', 'records-store-0', storage))).rejects.toThrow(
      'claim-identity-collision',
    );
  });

test('claim reference in another namespace cannot cover a native owner', async () => {
  const packet = appendClaim(
    change((document: ReturnType<typeof parseDocument>) => {
      document.deleteIn(['spec', 'volumeClaimTemplates']);
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'existing' } }],
      );
    }),
    'prod',
    'existing',
  );
  const ledger = await derive(packet);
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'claim-source:dev/existing',
  });
});

for (const field of ['ownerReferences', 'deletionTimestamp'])
  test(`supplied ${field} cannot assert the fixed fresh source scenario`, async () => {
    const ledger = await derive(
      change((document: ReturnType<typeof parseDocument>) => {
        document.setIn(
          ['metadata', field],
          field === 'ownerReferences'
            ? [{ kind: 'Foreign', name: 'controller', uid: 'unobserved' }]
            : '2026-01-01T00:00:00Z',
        );
      }),
    );
    expect(ledger.blockers).toContainEqual({
      owner: 'StatefulSet:dev:store',
      missingFact: 'source-controller-identity-and-generation',
    });
    expect(ledger.entries.filter((entry) => entry.owner === 'StatefulSet:dev:store')).toHaveLength(
      0,
    );
  });

for (const dimension of ['version', 'node'])
  test(`intended provider ${dimension} drift never inherits researched defaults`, async () => {
    const changed = structuredClone(lock);
    if (dimension === 'version') changed.binaries.k3s.version = 'v1.35.0+k3s1';
    else changed.runtimeImages.k3dNode.name = 'docker.io/rancher/k3s:v1.35.0-k3s1';
    const ledger = await derive(fixture(), changed);
    expect(ledger.entries).toHaveLength(0);
    expect(ledger.blockers).toContainEqual({
      owner: 'provider',
      missingFact: 'pinned-defaulting-contract',
    });
    expect(ledger.provider.runtimeObserved).toBe(false);
  });

for (const fault of ['missing', 'duplicate', 'changed', 'namespace'])
  test(`companion refuses independently bound ${fault} frame input`, () => {
    const packet = fixture();
    if (fault === 'missing') packet.stages = [];
    else if (fault === 'duplicate') packet.stages.push(packet.stages[0]);
    else if (fault === 'changed') packet.stages[0].bytes += '\n# changed\n';
    else {
      packet.stages[0].bytes = packet.stages[0].bytes.replace(
        'namespace: dev',
        'namespace: foreign',
      );
      packet.stages[0].sha256 = hash(packet.stages[0].bytes);
      packet.contract.frames[0].sha256 = packet.stages[0].sha256;
      packet.contract.stages[0].sha256 = packet.stages[0].sha256;
    }
    expect(derive(packet)).rejects.toThrow();
  });

test('malformed supplied security context is not treated as absent', () => {
  expect(
    derive(
      change((document: ReturnType<typeof parseDocument>) => {
        document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
        document.setIn(
          ['spec', 'template', 'spec', 'containers', 0, 'securityContext'],
          'SENTINEL-PRIVATE',
        );
      }),
    ),
  ).rejects.toThrow('Native ordinal source malformed');
});

for (const [label, edit, fact] of [
  [
    'writable root without ephemeral limit',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'securityContext', 'readOnlyRootFilesystem'],
        false,
      );
    },
    'candidate-ephemeral-unbounded',
  ],
  [
    'emptyDir without size',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'template', 'spec', 'volumes'], [{ name: 'scratch', emptyDir: {} }]);
    },
    'candidate-emptydir-unbounded',
  ],
  [
    'claim storage class absent',
    (document: ReturnType<typeof parseDocument>) =>
      document.deleteIn(['spec', 'volumeClaimTemplates', 0, 'spec', 'storageClassName']),
    'claim-storage-class-unresolved',
  ],
] as const)
  test(`valid ${label} remains an explicit missing bound`, async () => {
    const ledger = await derive(change(edit));
    expect(ledger.blockers).toContainEqual({ owner: 'StatefulSet:dev:store', missingFact: fact });
  });

test('explicit default rolling fields retain ordinal charges and declared source provenance', async () => {
  const ledger = await derive(
    change((document: ReturnType<typeof parseDocument>) => {
      document.setIn(['spec', 'updateStrategy'], {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 0 },
      });
    }),
  );
  expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 256 });
  expect(ledger.lifecycles[0].update.declared).toBe('RollingUpdate');
});

test('claim concurrency metadata identifies each retained ordinal and template pointer', async () => {
  const ledger = await derive();
  expect(
    ledger.entries
      .filter((entry) => entry.kind === 'claim')
      .map((entry) => [entry.concurrency.ordinal, entry.concurrency.phase, entry.source.pointer]),
  ).toEqual([
    [0, 'immutable-source-ordinal', '/0/spec/volumeClaimTemplates/0'],
    [1, 'immutable-source-ordinal', '/0/spec/volumeClaimTemplates/0'],
    [0, 'immutable-source-ordinal', '/1/spec/volumeClaimTemplates/0'],
    [1, 'immutable-source-ordinal', '/1/spec/volumeClaimTemplates/0'],
  ]);
});

test('changed same-owner template retains a distinct source binding', async () => {
  const original = await derive();
  const changed = await derive(
    change((document) => {
      document.setIn(['spec', 'template', 'metadata', 'labels'], { revision: 'changed' });
    }),
  );
  expect(changed.lifecycles[0].templateSHA256).not.toBe(original.lifecycles[0].templateSHA256);
  expect(changed.lifecycles[0].source.source.frameSHA256).not.toBe(
    original.lifecycles[0].source.source.frameSHA256,
  );
  expect(changed.unsupportedScenarios).toContain('unbound-old-new-templates');
});

for (const [field, value] of [
  ['partition', 1],
  ['maxUnavailable', 1],
] as const)
  test(`custom rolling ${field} stays outside the fixed default scenario`, async () => {
    const ledger = await derive(
      change((document) => {
        document.setIn(['spec', 'updateStrategy'], {
          type: 'RollingUpdate',
          rollingUpdate: { [field]: value },
        });
      }),
    );
    expect(ledger.blockers).toContainEqual({
      owner: 'StatefulSet:dev:store',
      missingFact: 'stateful-ordinal-lifecycle-policy',
    });
    expect(ledger.entries.filter((entry) => entry.owner === 'StatefulSet:dev:store')).toHaveLength(
      0,
    );
  });

for (const [label, path, value] of [
  ['negative grace', ['spec', 'template', 'spec', 'terminationGracePeriodSeconds'], -1],
  ['malformed overhead', ['spec', 'template', 'spec', 'overhead'], { cpu: '-1' }],
  ['malformed memory overhead', ['spec', 'template', 'spec', 'overhead'], { memory: '-1Mi' }],
  [
    'unknown mount',
    ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts'],
    [{ name: 'missing', mountPath: '/missing' }],
  ],
  [
    'duplicate containers',
    ['spec', 'template', 'spec', 'containers', 1],
    { name: 'app', image: 'example' },
  ],
  [
    'malformed standalone metadata',
    ['spec', 'template', 'spec', 'volumes'],
    [{ name: 'metadata', downwardAPI: { items: 'invalid' } }],
  ],
] as const)
  test(`${label} is validated before unsupported policy`, () => {
    expect(
      derive(
        change((document) => {
          document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
          document.setIn(path, value);
        }),
      ),
    ).rejects.toThrow();
  });

for (const replicas of [undefined, 0])
  test(`replicas ${String(replicas)} retains the explicit source count obligation`, async () => {
    const ledger = await derive(
      change((document) => {
        if (replicas === undefined) document.deleteIn(['spec', 'replicas']);
        else document.setIn(['spec', 'replicas'], replicas);
      }),
    );
    expect(ledger.blockers).toContainEqual({
      owner: 'StatefulSet:dev:store',
      missingFact: 'replica-count',
    });
    expect(ledger.entries.filter((entry) => entry.owner === 'StatefulSet:dev:store')).toHaveLength(
      0,
    );
  });

test('unresolved native namespace cannot acquire default-namespace charges', async () => {
  const ledger = await derive(
    change((document) => {
      document.deleteIn(['metadata', 'namespace']);
    }),
  );
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:_:store',
    missingFact: 'source-namespace',
  });
  expect(ledger.entries.filter((entry) => entry.owner === 'StatefulSet:_:store')).toHaveLength(0);
});

test('native ledger charges remain bound to exact frame hash and document pointers', async () => {
  const packet = fixture();
  const ledger = await derive(packet);
  expect(
    ledger.entries.every((entry) => entry.source.sha256 === packet.contract.frames[0].sha256),
  ).toBe(true);
  expect(
    ledger.entries.filter((entry) => entry.kind === 'pod').map((entry) => entry.source.pointer),
  ).toEqual([
    '/0/spec/template/spec',
    '/0/spec/template/spec',
    '/1/spec/template/spec',
    '/1/spec/template/spec',
  ]);
});

for (const [label, projection] of [
  [
    'both selectors',
    {
      path: 'labels',
      fieldRef: { fieldPath: 'metadata.labels' },
      resourceFieldRef: { resource: 'limits.cpu' },
    },
  ],
  ['unsafe path', { path: '../labels', fieldRef: { fieldPath: 'metadata.labels' } }],
] as const)
  test(`standalone metadata ${label} cannot hide behind incomplete policy`, () => {
    expect(
      derive(
        change((document) => {
          document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
          document.setIn(
            ['spec', 'template', 'spec', 'volumes'],
            [{ name: 'metadata', downwardAPI: { items: [projection] } }],
          );
        }),
      ),
    ).rejects.toThrow();
  });

const modeVolumes = [
  [
    'projected default',
    (mode: number) => ({
      name: 'projected-mode',
      projected: {
        defaultMode: mode,
        sources: [
          {
            downwardAPI: {
              items: [{ path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } }],
            },
          },
        ],
      },
    }),
  ],
  [
    'configMap default',
    (mode: number) => ({
      name: 'config-default',
      configMap: { name: 'configuration', defaultMode: mode },
    }),
  ],
  [
    'secret default',
    (mode: number) => ({
      name: 'secret-default',
      secret: { secretName: 'credentials', defaultMode: mode },
    }),
  ],
  [
    'configMap item',
    (mode: number) => ({
      name: 'config-mode',
      configMap: {
        name: 'configuration',
        items: [{ key: 'configuration', path: 'configuration', mode }],
      },
    }),
  ],
  [
    'secret item',
    (mode: number) => ({
      name: 'secret-mode',
      secret: {
        secretName: 'credentials',
        items: [{ key: 'credential', path: 'credential', mode }],
      },
    }),
  ],
] as const;

for (const [surface, volume] of modeVolumes) {
  for (const mode of [-1, 0.5, 512]) {
    for (const shortcut of ['unsupported policy', 'absent bounds'])
      test(`fix1 ${surface} mode ${String(mode)} refuses before ${shortcut}`, () => {
        expect(
          derive(
            change((document) => {
              if (shortcut === 'unsupported policy')
                document.setIn(['spec', 'podManagementPolicy'], 'Parallel');
              else document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
              document.setIn(['spec', 'template', 'spec', 'volumes'], [volume(mode)]);
            }),
          ),
        ).rejects.toThrow('Native ordinal source malformed');
      });
  }
  test(`fix1 ${surface} invalid mode refuses a supported lifecycle`, () => {
    expect(
      derive(
        change((document) => {
          document.setIn(['spec', 'template', 'spec', 'volumes'], [volume(512)]);
        }),
      ),
    ).rejects.toThrow('Native ordinal source malformed');
  });
}
for (const mode of [0, 511])
  test(`fix1 valid boundary mode ${String(mode)} keeps source ordinal charges`, async () => {
    const ledger = await derive(
      change((document) => {
        document.setIn(
          ['spec', 'template', 'spec', 'volumes'],
          modeVolumes.map(([, volume]) => volume(mode)),
        );
      }),
    );
    expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 256 });
    expect(ledger.lifecycles).toHaveLength(2);
    expect(ledger.creationAuthority).toBe(false);
  });
