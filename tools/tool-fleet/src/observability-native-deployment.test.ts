import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import { readRehearsalNativeCosts } from './observability-native-ordinal';
import { captureRehearsalFrames } from './observability-rehearsal-inventory';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let lock: Toolchain;
beforeAll(async () => {
  lock = await readToolchain(join(import.meta.dir, '../../../infra/versions/toolchain.json'));
});
function fixture(edit?: (document: ReturnType<typeof parseDocument>) => void) {
  const document = parseDocument(
    stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'worker', namespace: 'dev' },
      spec: {
        replicas: 2,
        template: {
          spec: {
            containers: [
              {
                name: 'app',
                image: 'example@sha256:' + 'a'.repeat(64),
                resources: {
                  requests: { memory: '100Mi', cpu: '100m', 'ephemeral-storage': '8Mi' },
                  limits: { memory: '100Mi', cpu: '1', 'ephemeral-storage': '8Mi' },
                },
                securityContext: { readOnlyRootFilesystem: true },
              },
            ],
          },
        },
      },
    }),
  );
  edit?.(document);
  const bytes = document.toString();
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
  return { stages, contract: captureRehearsalFrames(stages, {}) };
}
function derive(packet = fixture(), pin = lock) {
  return readRehearsalNativeCosts(packet.stages, {}, packet.contract, pin);
}
for (const [label, path, value] of [
  ['paused type', ['paused'], 'true'],
  ['strategy object', ['strategy'], 'RollingUpdate'],
  ['strategy array', ['strategy'], []],
  ['strategy enum', ['strategy', 'type'], 'OnDelete'],
  ['rolling object', ['strategy', 'rollingUpdate'], []],
  ['surge negative', ['strategy', 'rollingUpdate', 'maxSurge'], -1],
  ['surge fractional', ['strategy', 'rollingUpdate', 'maxSurge'], 0.5],
  ['surge integer overflow', ['strategy', 'rollingUpdate', 'maxSurge'], 2147483648],
  ['surge plain string', ['strategy', 'rollingUpdate', 'maxSurge'], '1'],
  ['surge fractional percent', ['strategy', 'rollingUpdate', 'maxSurge'], '2.5%'],
  ['unavailable negative', ['strategy', 'rollingUpdate', 'maxUnavailable'], -1],
  ['unavailable percent over 100', ['strategy', 'rollingUpdate', 'maxUnavailable'], '101%'],
  ['unavailable plain string', ['strategy', 'rollingUpdate', 'maxUnavailable'], '1'],
  ['progress negative', ['progressDeadlineSeconds'], -1],
  ['progress zero', ['progressDeadlineSeconds'], 0],
  ['progress fractional', ['progressDeadlineSeconds'], 0.5],
  ['foreign update', ['updateStrategy'], { type: 'RollingUpdate' }],
  ['foreign management', ['podManagementPolicy'], 'OrderedReady'],
  ['foreign ordinals', ['ordinals'], { start: 0 }],
  ['foreign empty claims', ['volumeClaimTemplates'], []],
] as const) {
  test(`Deployment malformed ${label} precedes absent bounds and unsupported policy`, () => {
    const packet = fixture((document) => {
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
      document.setIn(['spec', 'paused'], true);
      document.setIn(['spec', ...path], value);
    });
    expect(() => derive(packet)).toThrow('Native ordinal source malformed');
  });
}
for (const [label, strategy] of [
  ['Recreate rolling contradiction', { type: 'Recreate', rollingUpdate: {} }],
  ['both zero', { rollingUpdate: { maxSurge: 0, maxUnavailable: '0%' } }],
] as const) {
  test(`Deployment malformed ${label}`, () => {
    expect(() =>
      derive(
        fixture((document) => {
          document.setIn(['spec', 'strategy'], strategy);
        }),
      ),
    ).toThrow('Native ordinal source malformed');
  });
}
test('Deployment progress deadline must exceed explicit readiness after defaults', () => {
  expect(() =>
    derive(
      fixture((document) => {
        document.setIn(['spec', 'minReadySeconds'], 600);
      }),
    ),
  ).toThrow('Native ordinal source malformed');
});
test('Deployment later malformed lifecycle survives earlier unsupported owner and provider mismatch', () => {
  const packet = fixture((document) => {
    document.setIn(['spec', 'paused'], true);
  });
  const malformed = fixture((document) => {
    document.setIn(['metadata', 'name'], 'later');
    document.setIn(['spec', 'strategy', 'rollingUpdate', 'maxSurge'], 'bad');
  });
  packet.stages[0].bytes += '---\n' + malformed.stages[0].bytes;
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  const pin = structuredClone(lock);
  pin.binaries.k3s.version = 'v0.0.0';
  expect(() => derive(packet, pin)).toThrow('Native ordinal source malformed');
});

for (const strategy of [
  undefined,
  { type: '' },
  { type: 'Recreate' },
  { type: 'RollingUpdate', rollingUpdate: { maxSurge: '125%', maxUnavailable: 0 } },
]) {
  test(`Deployment first wave keeps both full cohorts under ${JSON.stringify(strategy)}`, () => {
    const packet = fixture((document) => {
      if (strategy !== undefined) document.setIn(['spec', 'strategy'], strategy);
    });
    const ledger = derive(packet);
    expect(
      ledger.entries.map((charge) => [
        charge.identity,
        charge.memoryMiB,
        charge.cpuMilli,
        charge.diskMiB,
      ]),
    ).toEqual([
      ['Deployment:dev:worker/initial/0', 100, 100, 8],
      ['Deployment:dev:worker/initial/1', 100, 100, 8],
      ['Deployment:dev:worker/replacement/0', 100, 100, 8],
      ['Deployment:dev:worker/replacement/1', 100, 100, 8],
    ]);
    expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 32 });
    expect(ledger.entries.map((charge) => charge.concurrency)).toEqual([
      {
        phase: 'immutable-source-deployment-replacement-wave',
        pods: 4,
        cohort: 'initial',
        slot: 0,
      },
      {
        phase: 'immutable-source-deployment-replacement-wave',
        pods: 4,
        cohort: 'initial',
        slot: 1,
      },
      {
        phase: 'immutable-source-deployment-replacement-wave',
        pods: 4,
        cohort: 'replacement',
        slot: 0,
      },
      {
        phase: 'immutable-source-deployment-replacement-wave',
        pods: 4,
        cohort: 'replacement',
        slot: 1,
      },
    ]);
    expect(ledger.entries.map((charge) => charge.source)).toEqual(
      [0, 1, 2, 3].map(() => ({
        owner: 'stage/native',
        sha256: packet.stages[0].sha256,
        pointer: '/0/spec/template/spec',
      })),
    );
    expect(ledger.lifecycles).toEqual([]);
    expect(ledger.scope).toBe('immutable-source-native-ordinal-lifecycle');
    expect(ledger.deploymentScope).toBe('immutable-source-deployment-replacement-wave');
    expect(ledger.deploymentLifecycles[0]).toMatchObject({
      owner: 'Deployment:dev:worker',
      replicas: 2,
      initialPods: 2,
      replacementPods: 2,
      maximumPodSlots: 4,
      scenario: 'immutable-source-single-replicaset-first-replacement-wave',
      runtimeObserved: false,
      grace: {
        declared: 'absent',
        effective: 30,
        basis: 'kubernetes-v1.36.4-default',
        reclamationDeadline: false,
      },
    });
    expect(ledger.blockers).toContainEqual({
      owner: 'Deployment:dev:worker',
      missingFact: 'deployment-replacement-wave-runtime-binding',
    });
    expect(
      ledger.blockers.some((blocker) => blocker.missingFact === 'Deployment-lifecycle-unaccounted'),
    ).toBe(false);
    expect(ledger.state).toBe('incomplete');
    expect(ledger.creationAuthority).toBe(false);
    expect(ledger.runtimeAuthority).toBe(false);
  });
}
test('Deployment default policy and complete event restrictions are unobserved obligations', () => {
  const ledger = derive();
  expect(ledger.deploymentLifecycles[0]).toMatchObject({
    strategy: {
      declared: 'absent',
      effective: 'RollingUpdate',
      basis: 'kubernetes-v1.36.4-default',
    },
    rolling: {
      maxSurge: { declared: 'absent', effective: '25%', basis: 'kubernetes-v1.36.4-default' },
      maxUnavailable: { declared: 'absent', effective: '25%', basis: 'kubernetes-v1.36.4-default' },
    },
    minReadySeconds: { declared: 'absent', effective: 0 },
    revisionHistoryLimit: { declared: 'absent', effective: 10 },
    progressDeadlineSeconds: { declared: 'absent', effective: 600 },
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-deployment-UID-one-replicaset-UID-one-template-unchanged-scale',
      history: 'complete-successful-and-uncertain-creation-history',
      initial: 'no-prior-work-or-adoption-and-no-unaccounted-create-retries',
      replacements: 'at-most-one-per-initial-Pod-no-replacement-of-replacement',
      controller: 'reachable-cooperative-creation-observations-and-expectations-reconciled',
      excluded: [
        'rollout',
        'scale-change',
        'controller-recreation',
        'foreign-mutation',
        'forced-deletion',
        'lost-node-execution',
      ],
      retention: 'full-initial-and-replacement-demand-without-assumed-reclamation',
      admission: 'independently-bind-and-enforce-event-constraints-before-creation',
      runtimeObserved: false,
    },
  });
  expect(ledger.provider).toMatchObject({
    kubernetesDefaultVersion: 'v1.36.4',
    runtimeObserved: false,
    sourceRenderCapability: { kubernetesVersion: '1.35.0', observed: false },
  });
});
test('Deployment explicit metadata never reduces replacement demand', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(['spec', 'replicas'], 1);
      document.setIn(['spec', 'strategy'], { type: 'Recreate' });
      document.setIn(['spec', 'revisionHistoryLimit'], 0);
      document.setIn(['spec', 'minReadySeconds'], 2);
      document.setIn(['spec', 'progressDeadlineSeconds'], 3);
      document.setIn(['spec', 'template', 'spec', 'terminationGracePeriodSeconds'], 0);
    }),
  );
  expect(ledger.knownContributions).toEqual({ memoryMiB: 200, cpuMilli: 200, diskMiB: 16 });
  expect(ledger.deploymentLifecycles[0]).toMatchObject({
    strategy: { declared: 'Recreate', effective: 'Recreate', basis: 'declared' },
    rolling: null,
    grace: { declared: 0, effective: 0, basis: 'declared', reclamationDeadline: false },
    revisionHistoryLimit: { declared: 0, effective: 0, basis: 'declared' },
    progressDeadlineSeconds: { declared: 3, effective: 3, basis: 'declared' },
  });
});
for (const [label, edit, reason] of [
  [
    'paused',
    (document) => {
      document.setIn(['spec', 'paused'], true);
    },
    'deployment-replacement-wave-policy',
  ],
  [
    'zero replicas',
    (document) => {
      document.setIn(['spec', 'replicas'], 0);
    },
    'replica-count',
  ],
  ['absent replicas', (document) => document.deleteIn(['spec', 'replicas']), 'replica-count'],
  [
    'absent namespace',
    (document) => document.deleteIn(['metadata', 'namespace']),
    'source-namespace',
  ],
  [
    'live UID',
    (document) => {
      document.setIn(['metadata', 'uid'], 'live');
    },
    'source-controller-identity-and-generation',
  ],
  [
    'previous generation',
    (document) => {
      document.setIn(['metadata', 'generation'], 2);
    },
    'source-controller-identity-and-generation',
  ],
  [
    'foreign owner',
    (document) => {
      document.setIn(['metadata', 'ownerReferences'], []);
    },
    'source-controller-identity-and-generation',
  ],
  [
    'deleting source',
    (document) => {
      document.setIn(['metadata', 'deletionTimestamp'], '2026-01-01T00:00:00Z');
    },
    'source-controller-identity-and-generation',
  ],
  [
    'resource version',
    (document) => {
      document.setIn(['metadata', 'resourceVersion'], '1');
    },
    'source-controller-identity-and-generation',
  ],
  [
    'live status',
    (document) => {
      document.set('status', {});
    },
    'source-controller-identity-and-generation',
  ],
  [
    'absent bounds',
    (document) => document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']),
    'workload-bounds-or-resource-policy',
  ],
  [
    'null bounds',
    (document) => {
      document.setIn(['spec', 'template', 'spec', 'containers', 0, 'resources'], null);
    },
    'workload-bounds-or-resource-policy',
  ],
  [
    'emptyDir',
    (document) => {
      document.setIn(['spec', 'template', 'spec', 'volumes'], [{ name: 'scratch', emptyDir: {} }]);
    },
    'candidate-emptydir-unbounded',
  ],
  [
    'writable root',
    (document) => {
      document.deleteIn([
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'resources',
        'requests',
        'ephemeral-storage',
      ]);
      document.deleteIn([
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'resources',
        'limits',
        'ephemeral-storage',
      ]);
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'securityContext']);
    },
    'candidate-ephemeral-unbounded',
  ],
] satisfies [string, (document: ReturnType<typeof parseDocument>) => unknown, string][]) {
  test(`Deployment unsupported ${label} remains specifically incomplete`, () => {
    const ledger = derive(fixture(edit));
    expect(ledger.entries).toEqual([]);
    expect(ledger.deploymentLifecycles).toEqual([]);
    expect(ledger.blockers).toContainEqual({
      missingFact: reason,
      owner: label === 'absent namespace' ? 'Deployment:_:worker' : 'Deployment:dev:worker',
    });
  });
}
test('Deployment provider mismatch cannot gain conditional contributions', () => {
  const pin = structuredClone(lock);
  pin.runtimeImages.k3dNode.name = 'wrong';
  const ledger = derive(fixture(), pin);
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual({
    owner: 'Deployment:dev:worker',
    missingFact: 'deployment-replacement-wave-policy',
  });
});
test('Deployment retains external claim and absent ephemeral writer obligations without inventing claims', () => {
  const ledger = derive(
    fixture((document) => {
      document.deleteIn([
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'resources',
        'requests',
        'ephemeral-storage',
      ]);
      document.deleteIn([
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'resources',
        'limits',
        'ephemeral-storage',
      ]);
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'records' } }],
      );
    }),
  );
  expect(ledger.entries).toHaveLength(4);
  expect(ledger.entries.every((charge) => charge.kind === 'pod')).toBe(true);
  expect(ledger.blockers).toContainEqual({
    owner: 'Deployment:dev:worker',
    missingFact: 'claim-source:dev/records',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Deployment:dev:worker',
    missingFact: 'ephemeral-storage-limit-absent:app; writable-logs-and-runtime-state-unobserved',
  });
});
test('Deployment template and frame binding change with the same owner template', () => {
  const original = derive();
  const packet = fixture((document) => {
    document.setIn(['spec', 'template', 'metadata', 'labels'], { version: 'next' });
  });
  const changed = derive(packet);
  const manifest = parseDocument(packet.stages[0].bytes).toJSON() as {
    spec: { template: unknown };
  };
  const template = manifest.spec.template;
  expect(changed.deploymentLifecycles[0].templateSHA256).toBe(hash(JSON.stringify(template)));
  expect(changed.deploymentLifecycles[0].templateSHA256).not.toBe(
    original.deploymentLifecycles[0].templateSHA256,
  );
  expect(changed.deploymentLifecycles[0].source.source.frameSHA256).toBe(packet.stages[0].sha256);
  expect(changed.entries[0].source.sha256).not.toBe(original.entries[0].source.sha256);
});
test('Deployment both cohorts reuse sequential init and overhead normalization', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'setup',
            image: 'example',
            resources: {
              requests: { memory: '180Mi', cpu: '200m', 'ephemeral-storage': '16Mi' },
              limits: { memory: '180Mi', cpu: '1', 'ephemeral-storage': '16Mi' },
            },
          },
        ],
      );
      document.setIn(['spec', 'template', 'spec', 'overhead'], { memory: '10Mi', cpu: '20m' });
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'scratch', emptyDir: { sizeLimit: '4Mi' } }],
      );
    }),
  );
  expect(ledger.knownContributions).toEqual({ memoryMiB: 760, cpuMilli: 880, diskMiB: 64 });
});

for (const [label, edit] of [
  [
    'supplied memory quantity',
    (document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'resources', 'limits', 'memory'],
        'broken',
      );
    },
  ],
  [
    'contradictory volume',
    (document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'scratch', emptyDir: {}, secret: { secretName: 'keys' } }],
      );
    },
  ],
] satisfies [string, (document: ReturnType<typeof parseDocument>) => unknown][]) {
  test(`Deployment paused policy cannot hide malformed ${label}`, () => {
    const packet = fixture((document) => {
      document.setIn(['spec', 'paused'], true);
      edit(document);
    });
    expect(() => derive(packet)).toThrow(
      /Native ordinal source malformed|Generated capacity memory-unknown/,
    );
  });
}

test('Deployment custom rolling quantities remain declared without reducing first wave', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(['spec', 'strategy'], {
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: '125%', maxUnavailable: 0 },
      });
    }),
  );
  expect(ledger.deploymentLifecycles[0].rolling).toEqual({
    maxSurge: { declared: '125%', effective: '125%', basis: 'declared' },
    maxUnavailable: { declared: 0, effective: 0, basis: 'declared' },
  });
  expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 32 });
});
for (const namespace of ['dev', 'prod']) {
  test(`Deployment external ${namespace} claim retains exact namespace obligation`, () => {
    const packet = fixture((document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'records' } }],
      );
    });
    packet.stages[0].bytes +=
      '---\n' +
      stringify({
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'records', namespace },
        spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
      });
    packet.stages[0].sha256 = hash(packet.stages[0].bytes);
    packet.contract = captureRehearsalFrames(packet.stages, {});
    const ledger = derive(packet);
    expect(ledger.entries.filter((charge) => charge.kind === 'claim')).toEqual([]);
    expect(ledger.blockers).toContainEqual({
      owner: 'Deployment:dev:worker',
      missingFact:
        namespace === 'dev' ? 'claim-owner-and-retention:dev/records' : 'claim-source:dev/records',
    });
    expect(ledger.blockers).toContainEqual({
      owner: `PersistentVolumeClaim:${namespace}:records`,
      missingFact: 'claim-owner-and-retention-unaccounted',
    });
  });
}
test('Deployment init writer remains incomplete when readonly root lacks an ephemeral limit', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'setup',
            image: 'example',
            resources: {
              requests: { memory: '100Mi', cpu: '100m' },
              limits: { memory: '100Mi', cpu: '1' },
            },
            securityContext: { readOnlyRootFilesystem: true },
          },
        ],
      );
    }),
  );
  expect(ledger.blockers).toContainEqual({
    owner: 'Deployment:dev:worker',
    missingFact: 'ephemeral-storage-limit-absent:setup; writable-logs-and-runtime-state-unobserved',
  });
});
test('Deployment valid unsupported hostPath remains an explicit workload obligation', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'host', hostPath: { path: '/host' } }],
      );
    }),
  );
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual({
    owner: 'Deployment:dev:worker',
    missingFact: 'workload-volume-unsupported',
  });
});

test('Deployment broad lifecycle prepass precedes earlier ordinal claim collision', () => {
  const packet = fixture((document) => {
    document.set('kind', 'StatefulSet');
    document.setIn(['spec', 'replicas'], 1);
    document.setIn(
      ['spec', 'volumeClaimTemplates'],
      [
        {
          metadata: { name: 'records' },
          spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
        },
      ],
    );
  });
  packet.stages[0].bytes +=
    '---\n' +
    stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: 'records-worker-0', namespace: 'dev' },
      spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
    });
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  expect(() => derive(packet)).toThrow('Native ordinal claim-identity-collision');
  const later = fixture((document) => {
    document.setIn(['metadata', 'name'], 'later');
    document.setIn(['spec', 'paused'], 'bad');
  });
  packet.stages[0].bytes += '---\n' + later.stages[0].bytes;
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  expect(() => derive(packet)).toThrow('Native ordinal source malformed');
});
