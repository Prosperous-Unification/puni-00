import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import {
  deriveRehearsalNativeCosts,
  readRehearsalNativeCosts,
} from './observability-native-ordinal';
import { captureRehearsalFrames, readRehearsalSource } from './observability-rehearsal-inventory';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const root = join(import.meta.dir, '../../..');
let lock: Toolchain;
let topologyBytes: string;
beforeAll(async () => {
  lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  topologyBytes = await readFile(join(root, 'infra/local/platform.k3d.yaml'), 'utf8');
});
function fixture(edit?: (document: ReturnType<typeof parseDocument>) => void, nodes = 1) {
  const document = parseDocument(
    stringify({
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name: 'worker', namespace: 'dev' },
      spec: {
        selector: { matchLabels: { app: 'worker' } },
        template: {
          metadata: { labels: { app: 'worker' } },
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
  const topology = parseDocument(topologyBytes);
  topology.set('servers', 1);
  topology.set('agents', nodes - 1);
  const retained = topology.toString();
  const source = {
    sourcePath: 'infra/local/platform.k3d.yaml',
    artifactPath: 'infra/local/platform.k3d.yaml',
    sha256: hash(retained),
  };
  const selection = { sourceRevision: 'a'.repeat(40), artifactSHA256: 'b'.repeat(64) };
  const contract = {
    ...captureRehearsalFrames(stages, {}),
    bootstrapSources: [structuredClone(source)],
    provenance: structuredClone(selection),
  };
  return { stages, contract, topology: { bytes: retained, source, selection } };
}
function derive(packet = fixture(), pin = lock) {
  return readRehearsalNativeCosts(packet.stages, {}, packet.contract, pin, [], packet.topology);
}
function rewriteTopology(
  packet: ReturnType<typeof fixture>,
  edit: (document: ReturnType<typeof parseDocument>) => void,
) {
  const topology = parseDocument(packet.topology.bytes);
  edit(topology);
  packet.topology.bytes = topology.toString();
  packet.topology.source.sha256 = hash(packet.topology.bytes);
  packet.contract.bootstrapSources[0].sha256 = packet.topology.source.sha256;
}
const identity = 'DaemonSet:dev:worker';
const missing = (missingFact: string) => ({ owner: identity, missingFact });

test('DaemonSet legacy calls retain missing topology plus runtime and history obligations', () => {
  const packet = fixture();
  const ledger = readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock);
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual(missing('daemon-candidate-topology'));
  expect(ledger.blockers).toContainEqual(missing('daemon-replacement-wave-runtime-binding'));
  expect(ledger.blockers).toContainEqual(
    missing('daemon-whole-attempt-generations-and-retained-history'),
  );
});
for (const [label, edit] of [
  [
    'bytes',
    (p: ReturnType<typeof fixture>) => {
      p.topology.bytes += '\n';
    },
  ],
  [
    'source hash',
    (p: ReturnType<typeof fixture>) => {
      p.topology.source.sha256 = 'c'.repeat(64);
    },
  ],
  [
    'original path',
    (p: ReturnType<typeof fixture>) => {
      p.topology.source.sourcePath = 'infra/other.yaml';
    },
  ],
  [
    'retained path',
    (p: ReturnType<typeof fixture>) => {
      p.topology.source.artifactPath = 'infra/other.yaml';
    },
  ],
  [
    'selected revision',
    (p: ReturnType<typeof fixture>) => {
      p.topology.selection.sourceRevision = 'c'.repeat(40);
    },
  ],
  [
    'packet identity',
    (p: ReturnType<typeof fixture>) => {
      p.topology.selection.artifactSHA256 = 'c'.repeat(64);
    },
  ],
  [
    'missing contract source',
    (p: ReturnType<typeof fixture>) => {
      p.contract.bootstrapSources = [];
    },
  ],
  [
    'duplicate contract source',
    (p: ReturnType<typeof fixture>) => {
      p.contract.bootstrapSources.push(structuredClone(p.topology.source));
    },
  ],
] as const)
  test(`DaemonSet topology ${label} drift refuses`, () => {
    const packet = fixture();
    edit(packet);
    expect(() => derive(packet)).toThrow(/topology|source coordinates/);
  });
test('DaemonSet evidence cannot replace independent argument three contract', () => {
  const packet = fixture();
  expect(() =>
    readRehearsalNativeCosts(
      packet.stages,
      {},
      // @ts-expect-error External callers cannot substitute the legacy contract for bound evidence.
      captureRehearsalFrames(packet.stages, {}),
      lock,
      [],
      packet.topology,
    ),
  ).toThrow(/topology/);
});
for (const [label, edit] of [
  [
    'schema',
    (d: ReturnType<typeof parseDocument>) => {
      d.set('servers', '1');
    },
  ],
  [
    'unsafe count',
    (d: ReturnType<typeof parseDocument>) => {
      d.set('agents', Number.MAX_SAFE_INTEGER + 1);
    },
  ],
  [
    'unsafe sum',
    (d: ReturnType<typeof parseDocument>) => {
      d.set('agents', Number.MAX_SAFE_INTEGER);
    },
  ],
  [
    'forbidden resource option',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['options', 'k3d', 'serversMemory'], '1g');
    },
  ],
] as const)
  test(`DaemonSet coherently hashed topology ${label} refuses`, () => {
    const packet = fixture();
    rewriteTopology(packet, edit);
    expect(() => derive(packet)).toThrow();
  });
test('DaemonSet coherently hashed duplicate YAML refuses', () => {
  const packet = fixture();
  packet.topology.bytes += 'servers: 1\n';
  packet.topology.source.sha256 = hash(packet.topology.bytes);
  packet.contract.bootstrapSources[0].sha256 = packet.topology.source.sha256;
  expect(() => derive(packet)).toThrow(/topology|source coordinates/);
});
for (const nodes of [129, 2147483647])
  test(`DaemonSet valid ${String(nodes)} population stays computationally unsupported`, () => {
    const ledger = derive(fixture(undefined, nodes));
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual(missing('daemon-candidate-expansion-range'));
  });
test('DaemonSet upper supported population materializes bounded full cohorts', () => {
  const ledger = derive(fixture(undefined, 128));
  expect(ledger.entries).toHaveLength(256);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 25600, cpuMilli: 25600, diskMiB: 2048 });
});
for (const [label, path, value] of [
  ['strategy enum', ['updateStrategy', 'type'], 'Recreate'],
  ['strategy array', ['updateStrategy'], []],
  ['rolling array', ['updateStrategy', 'rollingUpdate'], []],
  ['surge negative', ['updateStrategy', 'rollingUpdate', 'maxSurge'], -1],
  ['surge fractional', ['updateStrategy', 'rollingUpdate', 'maxSurge'], 0.5],
  ['surge maxint', ['updateStrategy', 'rollingUpdate', 'maxSurge'], 2147483648],
  ['surge percentage', ['updateStrategy', 'rollingUpdate', 'maxSurge'], '101%'],
  ['unavailable percentage', ['updateStrategy', 'rollingUpdate', 'maxUnavailable'], '101%'],
  ['quantity grammar', ['updateStrategy', 'rollingUpdate', 'maxUnavailable'], '1'],
  ['both zero', ['updateStrategy', 'rollingUpdate'], { maxSurge: 0, maxUnavailable: 0 }],
  ['both nonzero', ['updateStrategy', 'rollingUpdate'], { maxSurge: 1, maxUnavailable: 1 }],
  ['selector empty', ['selector'], {}],
  ['selector mismatch', ['selector', 'matchLabels', 'app'], 'other'],
  ['selector array', ['selector'], []],
  [
    'selector expression values',
    ['selector', 'matchExpressions'],
    [{ key: 'app', operator: 'Exists', values: ['worker'] }],
  ],
  ['nodeSelector type', ['template', 'spec', 'nodeSelector'], { app: 1 }],
  ['nodeSelector array', ['template', 'spec', 'nodeSelector'], []],
  ['toleration empty key', ['template', 'spec', 'tolerations'], [{}]],
  [
    'toleration exists value',
    ['template', 'spec', 'tolerations'],
    [{ operator: 'Exists', value: 'x' }],
  ],
  [
    'toleration seconds effect',
    ['template', 'spec', 'tolerations'],
    [{ key: 'x', tolerationSeconds: 1 }],
  ],
  ['toleration enum', ['template', 'spec', 'tolerations'], [{ key: 'x', effect: 'Bad' }]],
  ['toleration array', ['template', 'spec', 'tolerations'], [[]]],
  [
    'affinity operator',
    ['template', 'spec', 'affinity'],
    {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions: [{ key: 'x', operator: 'Bad' }] }],
        },
      },
    },
  ],
  [
    'affinity cardinality',
    ['template', 'spec', 'affinity'],
    {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            { matchExpressions: [{ key: 'x', operator: 'Gt', values: ['1', '2'] }] },
          ],
        },
      },
    },
  ],
  [
    'affinity weight',
    ['template', 'spec', 'affinity'],
    {
      nodeAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [{ weight: 101, preference: {} }],
      },
    },
  ],
  ['restart', ['template', 'spec', 'restartPolicy'], 'Never'],
  ['deadline', ['template', 'spec', 'activeDeadlineSeconds'], 10],
  ['foreign replicas', ['replicas'], 1],
  ['foreign strategy', ['strategy'], {}],
  ['foreign claims', ['volumeClaimTemplates'], []],
] as const)
  test(`DaemonSet malformed ${label} precedes missing bounds topology and provider`, () => {
    const packet = fixture((d) => {
      d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
      d.setIn(['spec', ...path], value);
    });
    const pin = structuredClone(lock);
    pin.binaries.k3s.version = 'v0';
    expect(() => readRehearsalNativeCosts(packet.stages, {}, packet.contract, pin)).toThrow(
      'Native ordinal source malformed',
    );
  });
test('DaemonSet late malformed placement is decoded before earlier ordinal claim collision', () => {
  const packet = fixture((d) => {
    d.setIn(['spec', 'template', 'spec', 'tolerations'], [{ key: 'x', operator: 'Bad' }]);
  });
  const earlier = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'earlier', namespace: 'dev' },
    spec: {
      replicas: 1,
      template: {
        spec: {
          containers: [
            {
              name: 'app',
              image: 'example',
              resources: {
                requests: { memory: '1Mi', cpu: '1' },
                limits: { memory: '1Mi', cpu: '1' },
              },
              securityContext: { readOnlyRootFilesystem: true },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'claim' },
          spec: { storageClassName: 'local', resources: { requests: { storage: '1Mi' } } },
        },
      ],
    },
  };
  const claim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'claim-earlier-0', namespace: 'dev' },
    spec: { resources: { requests: { storage: '1Mi' } } },
  };
  packet.stages[0].bytes =
    stringify(earlier) + '---\n' + stringify(claim) + '---\n' + packet.stages[0].bytes;
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  Object.assign(packet.contract, captureRehearsalFrames(packet.stages, {}));
  expect(() => derive(packet)).toThrow('Native ordinal source malformed');
});
for (const strategy of [
  { type: 'OnDelete' },
  { type: 'OnDelete', rollingUpdate: { maxSurge: 1, maxUnavailable: 1 } },
  { type: 'RollingUpdate', rollingUpdate: { maxSurge: '100%', maxUnavailable: 0 } },
])
  test(`DaemonSet valid unsupported ${JSON.stringify(strategy)}`, () => {
    const ledger = derive(
      fixture((d) => {
        d.setIn(['spec', 'updateStrategy'], strategy);
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual(missing('daemon-replacement-wave-policy'));
    expect(ledger.blockers).toContainEqual(missing('daemon-replacement-wave-runtime-binding'));
  });
test('DaemonSet full two-node cohorts ignore restrictive placement and retain all source bindings', () => {
  const packet = fixture((d) => {
    d.setIn(['spec', 'template', 'spec', 'nodeSelector'], { impossible: 'true' });
    d.setIn(['spec', 'template', 'spec', 'hostNetwork'], true);
  }, 2);
  const ledger = derive(packet);
  expect(ledger.entries.map((c) => [c.identity, c.memoryMiB, c.cpuMilli, c.diskMiB])).toEqual([
    [identity + '/initial/0', 100, 100, 8],
    [identity + '/initial/1', 100, 100, 8],
    [identity + '/replacement/0', 100, 100, 8],
    [identity + '/replacement/1', 100, 100, 8],
  ]);
  expect(ledger.entries.map((c) => c.concurrency)).toEqual([
    {
      phase: 'immutable-source-daemon-replacement-wave',
      pods: 4,
      cohort: 'initial',
      candidateSlot: 0,
    },
    {
      phase: 'immutable-source-daemon-replacement-wave',
      pods: 4,
      cohort: 'initial',
      candidateSlot: 1,
    },
    {
      phase: 'immutable-source-daemon-replacement-wave',
      pods: 4,
      cohort: 'replacement',
      candidateSlot: 0,
    },
    {
      phase: 'immutable-source-daemon-replacement-wave',
      pods: 4,
      cohort: 'replacement',
      candidateSlot: 1,
    },
  ]);
  for (const charge of ledger.entries)
    expect(charge.source).toEqual({
      owner: 'stage/native',
      sha256: packet.stages[0].sha256,
      pointer: '/0/spec/template/spec',
    });
  expect(ledger.knownContributions).toEqual({ memoryMiB: 400, cpuMilli: 400, diskMiB: 32 });
  const lifecycle = ledger.daemonLifecycles[0];
  expect(lifecycle.templateSHA256).toBe(
    hash(
      JSON.stringify(
        type({ spec: { template: 'unknown' } }).assert(
          parseDocument(packet.stages[0].bytes).toJSON(),
        ).spec.template,
      ),
    ),
  );
  expect(lifecycle.source).toMatchObject({
    kind: 'DaemonSet',
    namespace: 'dev',
    pointer: '/0',
    source: { frameSHA256: packet.stages[0].sha256 },
  });
  expect(lifecycle.topology).toMatchObject({
    source: packet.topology.source,
    selection: packet.topology.selection,
    servers: 1,
    agents: 1,
    candidateNodes: 2,
    nodeUIDs: 'unobserved',
  });
  expect(lifecycle).toMatchObject({
    initialPods: 2,
    replacementPods: 2,
    maximumPodSlots: 4,
    runtimeObserved: false,
    strategy: {
      declared: 'absent',
      effective: 'RollingUpdate',
      basis: 'kubernetes-v1.36.4-default',
    },
    rolling: {
      maxSurge: { declared: 'absent', effective: 0 },
      maxUnavailable: { declared: 'absent', effective: 1 },
    },
    restartPolicy: { declared: 'absent', effective: 'Always' },
    grace: { declared: 'absent', effective: 30, reclamationDeadline: false },
    minReadySeconds: { effective: 0 },
    revisionHistoryLimit: { effective: 10 },
  });
  expect(lifecycle.placement.nodeSelector).toEqual({ impossible: 'true' });
  expect(lifecycle.placement.controllerTolerations.entries).toHaveLength(7);
  expect(lifecycle.placement.controllerTolerations.entries).toContainEqual({
    key: 'node.kubernetes.io/network-unavailable',
    operator: 'Exists',
    effect: 'NoSchedule',
  });
  expect(lifecycle.placement.controllerTolerations.basis).toBe('kubernetes-v1.36.4-controller');
  expect(lifecycle.conditions).toMatchObject({
    nodes: 'fixed-reachable-unchanged-Node-UID-set',
    controller: 'reachable-cooperative-DaemonSet-controller',
    initial: 'no-prior-adopted-or-orphan-work-and-no-uncharged-retention',
    history: 'complete-successful-and-uncertain-creation-history-and-reconciled-expectations',
    replacements: 'at-most-one-first-replacement-per-candidate-no-replacement-of-replacement',
    retention: 'full-initial-failed-terminating-unschedulable-and-replacement-demand',
    runtimeObserved: false,
  });
  expect(lifecycle.conditions.excluded).toEqual([
    'rollout',
    'node-addition',
    'node-replacement',
    'placement-mutation',
    'repeated-failure-or-eviction',
    'forced-deletion',
    'lost-node-execution',
    'controller-recreation',
    'foreign-mutation',
  ]);
  expect(lifecycle.wholeAttempt).toEqual({
    generationMultiplier: 'unobserved',
    required: [
      'DaemonSet-UID-and-template-generations',
      'successful-and-uncertain-creation-and-expectation-history',
      'retained-predecessor-Pod-device-log-histories',
    ],
    cleanupCredit: false,
    runtimeObserved: false,
  });
  expect([ledger.state, ledger.creationAuthority, ledger.runtimeAuthority]).toEqual([
    'incomplete',
    false,
    false,
  ]);
  packet.topology.source.sha256 = 'c'.repeat(64);
  packet.topology.selection.sourceRevision = 'c'.repeat(40);
  packet.contract.bootstrapSources[0].sha256 = 'd'.repeat(64);
  expect(lifecycle.topology.source.sha256).not.toBe(packet.topology.source.sha256);
  expect(lifecycle.topology.selection.sourceRevision).toBe('a'.repeat(40));
});
test('DaemonSet declared policy and default empty strings retain provenance', () => {
  const ledger = derive(
    fixture((d) => {
      d.setIn(['spec', 'updateStrategy'], {
        type: '',
        rollingUpdate: { maxUnavailable: '25%', maxSurge: '0%' },
      });
      d.setIn(['spec', 'template', 'spec', 'restartPolicy'], '');
      d.setIn(['spec', 'template', 'spec', 'terminationGracePeriodSeconds'], 60);
      d.setIn(['spec', 'minReadySeconds'], 7);
      d.setIn(['spec', 'revisionHistoryLimit'], 0);
    }),
  );
  expect(ledger.daemonLifecycles[0]).toMatchObject({
    strategy: { declared: '', effective: 'RollingUpdate', basis: 'kubernetes-v1.36.4-default' },
    restartPolicy: { declared: '', effective: 'Always', basis: 'kubernetes-v1.36.4-default' },
    rolling: {
      maxSurge: { effective: '0%', basis: 'declared' },
      maxUnavailable: { effective: '25%', basis: 'declared' },
    },
    grace: { effective: 60, basis: 'declared' },
    minReadySeconds: { effective: 7 },
    revisionHistoryLimit: { effective: 0 },
  });
  expect(ledger.daemonLifecycles[0].placement.controllerTolerations.entries).toHaveLength(6);
});
test('DaemonSet source UID namespace and provider mismatches retain obligations without charges', () => {
  for (const field of [
    'uid',
    'generation',
    'ownerReferences',
    'deletionTimestamp',
    'resourceVersion',
  ]) {
    const ledger = derive(
      fixture((d) => {
        d.setIn(['metadata', field], field === 'ownerReferences' ? [] : 'x');
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual(missing('source-controller-identity-and-generation'));
  }
  const unresolved = derive(fixture((d) => d.deleteIn(['metadata', 'namespace'])));
  expect(unresolved.entries).toEqual([]);
  expect(unresolved.blockers).toContainEqual({
    owner: 'DaemonSet:_:worker',
    missingFact: 'source-namespace',
  });
  const pin = structuredClone(lock);
  pin.binaries.k3s.version = 'v0';
  const ledger = derive(fixture(), pin);
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual(missing('daemon-replacement-wave-policy'));
});
test('DaemonSet independent claim host scratch and writer obligations survive missing topology and first normalizer failure', () => {
  const packet = fixture((d) => {
    d.deleteIn([
      'spec',
      'template',
      'spec',
      'containers',
      0,
      'resources',
      'limits',
      'ephemeral-storage',
    ]);
    d.deleteIn([
      'spec',
      'template',
      'spec',
      'containers',
      0,
      'resources',
      'requests',
      'ephemeral-storage',
    ]);
    d.setIn(
      ['spec', 'template', 'spec', 'containers', 0, 'securityContext', 'readOnlyRootFilesystem'],
      false,
    );
    d.setIn(
      ['spec', 'template', 'spec', 'volumes'],
      [
        { name: 'host', hostPath: { path: '/var/lib/host' } },
        { name: 'scratch', emptyDir: {} },
        { name: 'external', persistentVolumeClaim: { claimName: 'store' } },
      ],
    );
  });
  for (const ledger of [
    derive(packet),
    readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock),
  ]) {
    expect(ledger.entries).toEqual([]);
    for (const fact of [
      'workload-volume-unsupported',
      'hostPath-device-growth:host',
      'emptyDir-bound:scratch',
      'writable-root-bound:app',
      'ephemeral-storage-limit-absent:app; writable-logs-and-runtime-state-unobserved',
      'claim-source:dev/store',
      'daemon-replacement-wave-runtime-binding',
      'daemon-whole-attempt-generations-and-retained-history',
    ])
      expect(ledger.blockers).toContainEqual(missing(fact));
  }
});

test('DaemonSet zero declared population stays incomplete without schema defaults', () => {
  const packet = fixture();
  rewriteTopology(packet, (d) => {
    d.set('servers', 0);
    d.set('agents', 0);
  });
  const ledger = derive(packet);
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual(missing('daemon-candidate-expansion-range'));
});
test('DaemonSet shared normalizer retains init overhead and memory emptyDir without replacement credit', () => {
  const packet = fixture((d) => {
    d.setIn(
      ['spec', 'template', 'spec', 'initContainers'],
      [
        {
          name: 'init',
          image: 'example',
          resources: {
            requests: { memory: '200Mi', cpu: '200m', 'ephemeral-storage': '16Mi' },
            limits: { memory: '200Mi', cpu: '1', 'ephemeral-storage': '16Mi' },
          },
          securityContext: { readOnlyRootFilesystem: true },
        },
      ],
    );
    d.setIn(['spec', 'template', 'spec', 'overhead'], { memory: '10Mi', cpu: '10m' });
    d.setIn(
      ['spec', 'template', 'spec', 'volumes'],
      [{ name: 'memory', emptyDir: { medium: 'Memory', sizeLimit: '256Mi' } }],
    );
  });
  const ledger = derive(packet);
  expect(ledger.entries.map((c) => [c.memoryMiB, c.cpuMilli, c.diskMiB])).toEqual([
    [266, 210, 16],
    [266, 210, 16],
  ]);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 532, cpuMilli: 420, diskMiB: 32 });
});
test('DaemonSet namespace-scoped existing claims are never multiplied as fresh reservations', () => {
  const packet = fixture((d) => {
    d.setIn(
      ['spec', 'template', 'spec', 'volumes'],
      [{ name: 'external', persistentVolumeClaim: { claimName: 'store' } }],
    );
  });
  const claim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'store', namespace: 'dev' },
    spec: { resources: { requests: { storage: '64Mi' } } },
  };
  packet.stages[0].bytes += '---\n' + stringify(claim);
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  Object.assign(packet.contract, captureRehearsalFrames(packet.stages, {}));
  const ledger = derive(packet);
  expect(ledger.entries).toHaveLength(2);
  expect(ledger.entries.every((c) => c.kind === 'pod')).toBe(true);
  expect(ledger.blockers).toContainEqual(missing('claim-owner-and-retention:dev/store'));
});
for (const value of [undefined, null, {}])
  test(`DaemonSet absent resource ${JSON.stringify(value)} preserves missing bounds with missing topology`, () => {
    const packet = fixture((d) => {
      if (value === undefined)
        d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
      else d.setIn(['spec', 'template', 'spec', 'containers', 0, 'resources'], value);
    });
    const ledger = readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock);
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual(missing('workload-bounds-or-resource-policy'));
    expect(ledger.blockers).toContainEqual(missing('daemon-candidate-topology'));
    expect(ledger.sourceUnresolved.some((fact) => fact.includes('resources/limits'))).toBe(true);
  });
for (const field of [
  'paused',
  'completionMode',
  'backoffLimitPerIndex',
  'podFailurePolicy',
  'concurrencyPolicy',
])
  test(`DaemonSet foreign lifecycle ${field} refuses before unsupported branches`, () => {
    const packet = fixture((d) => {
      d.setIn(['spec', field], field === 'paused' ? true : 'foreign');
      d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
    });
    expect(() => derive(packet)).toThrow('Native ordinal source malformed');
  });
test('DaemonSet placement retains declared toleration and its pinned default provenance', () => {
  const ledger = derive(
    fixture((d) => {
      d.setIn(
        ['spec', 'template', 'spec', 'tolerations'],
        [{ key: 'dedicated', value: 'worker' }, { operator: 'Exists' }],
      );
    }),
  );
  expect(ledger.daemonLifecycles[0].placement.tolerationDefaults).toEqual([
    {
      operator: { declared: 'absent', effective: 'Equal', basis: 'kubernetes-v1.36.4-default' },
      effect: { declared: 'absent', effective: '', basis: 'kubernetes-v1.36.4-default' },
      seconds: { declared: 'absent', effective: 'unbounded' },
    },
    {
      operator: { declared: 'Exists', effective: 'Exists', basis: 'declared' },
      effect: { declared: 'absent', effective: '', basis: 'kubernetes-v1.36.4-default' },
      seconds: { declared: 'absent', effective: 'unbounded' },
    },
  ]);
});

for (const [label, path, value] of [
  ['selector key grammar', ['selector', 'matchLabels'], { 'bad key': 'worker' }],
  ['template label grammar', ['template', 'metadata', 'labels', 'extra'], 'bad value'],
  ['nodeSelector label grammar', ['template', 'spec', 'nodeSelector'], { valid: 'bad value' }],
  [
    'affinity field relation',
    ['template', 'spec', 'affinity'],
    {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            { matchFields: [{ key: 'metadata.uid', operator: 'In', values: ['uid'] }] },
          ],
        },
      },
    },
  ],
  [
    'pod affinity key',
    ['template', 'spec', 'affinity'],
    {
      podAffinity: { requiredDuringSchedulingIgnoredDuringExecution: [{ topologyKey: 'bad key' }] },
    },
  ],
  [
    'pod affinity selector',
    ['template', 'spec', 'affinity'],
    {
      podAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: [
          {
            topologyKey: 'hostname',
            labelSelector: {
              matchExpressions: [{ key: 'app', operator: 'Exists', values: ['x'] }],
            },
          },
        ],
      },
    },
  ],
] as const)
  test(`DaemonSet malformed ${label} is validated behind absent bounds`, () => {
    const packet = fixture((d) => {
      d.setIn(['spec', ...path], value);
      d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
    });
    expect(() => derive(packet)).toThrow('Native ordinal source malformed');
  });
test('DaemonSet valid selector expressions and int64 node preference never reduce candidate population', () => {
  const packet = fixture((d) => {
    d.setIn(['spec', 'selector'], {
      matchExpressions: [
        { key: 'app', operator: 'In', values: ['worker'] },
        { key: 'other', operator: 'DoesNotExist' },
      ],
    });
    d.setIn(['spec', 'template', 'spec', 'affinity'], {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                { key: 'generation', operator: 'Gt', values: ['9223372036854775807'] },
              ],
            },
          ],
        },
      },
    });
  });
  expect(derive(packet).entries).toHaveLength(2);
});
for (const [operator, values] of [
  ['In', ['other']],
  ['NotIn', ['worker']],
  ['Exists', undefined],
  ['DoesNotExist', undefined],
] as const)
  test(`DaemonSet selector expression ${operator} must match template`, () => {
    const packet = fixture((d) => {
      d.setIn(['spec', 'selector'], {
        matchExpressions: [
          {
            key: operator === 'Exists' ? 'missing' : 'app',
            operator,
            ...(values === undefined ? {} : { values }),
          },
        ],
      });
    });
    expect(() => derive(packet)).toThrow('Native ordinal source malformed');
  });

for (const operator of ['Exists', 'DoesNotExist'] as const)
  test(`DaemonSet valid ${operator} affinity without values retains full source and all candidates`, () => {
    const packet = fixture((d) => {
      d.setIn(['spec', 'template', 'spec', 'affinity'], {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [{ matchExpressions: [{ key: 'present', operator }] }],
          },
        },
      });
    });
    const ledger = derive(packet);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.daemonLifecycles[0].placement.affinity).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions: [{ key: 'present', operator }] }],
        },
      },
    });
  });

for (const field of ['sourceRevision', 'artifactSHA256'] as const)
  test(`DaemonSet malformed coherent ${field} contract refuses`, () => {
    const packet = fixture();
    packet.contract.provenance[field] = 'not-an-identity';
    packet.topology.selection[field] = 'not-an-identity';
    expect(() => derive(packet)).toThrow(/topology|source coordinates/);
  });
test('DaemonSet coherent source contract cannot invent a retained topology relocation', () => {
  const packet = fixture();
  packet.contract.bootstrapSources[0].artifactPath = 'infra/rehearsal/bootstrap/other.yaml';
  packet.topology.source.artifactPath = 'infra/rehearsal/bootstrap/other.yaml';
  expect(() => derive(packet)).toThrow(/coordinates/);
});

test('DaemonSet self-consistent changed topology bytes cannot rewrite the independent hash contract', () => {
  const packet = fixture();
  packet.topology.bytes += '\n';
  packet.topology.source.sha256 = hash(packet.topology.bytes);
  expect(() => derive(packet)).toThrow(/topology/);
});
test('DaemonSet absent init ephemeral limit remains an independent writer obligation', () => {
  const ledger = derive(
    fixture((d) => {
      d.setIn(
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'init',
            image: 'example',
            resources: {
              requests: { memory: '20Mi', cpu: '10m' },
              limits: { memory: '20Mi', cpu: '1' },
            },
            securityContext: { readOnlyRootFilesystem: true },
          },
        ],
      );
    }),
  );
  expect(ledger.entries).toHaveLength(2);
  expect(ledger.blockers).toContainEqual(
    missing('ephemeral-storage-limit-absent:init; writable-logs-and-runtime-state-unobserved'),
  );
});

async function nodeExporterFixture(edit?: (document: ReturnType<typeof parseDocument>) => void) {
  const capturedValue: unknown = await Bun.file(
    join(import.meta.dir, 'fixtures/observability-node-exporter.json'),
  ).json();
  const captured = type({
    manifest: 'string',
    release: { owner: 'string', chart: "'kubePrometheusStack'", manifest: 'string' },
  }).assert(capturedValue);
  const document = parseDocument(captured.manifest);
  edit?.(document);
  const expansion = document.toString();
  const release = captured.release;
  const bytes = release.manifest;
  const stages = [
    {
      stage: 'observability',
      path: 'infra/platform/observability',
      declarationPath: 'stages/observability.yaml',
      sourceSHA256: hash('node-exporter-fixture'),
      sha256: hash(bytes),
      bytes,
      releases: [release],
    },
  ];
  const expansions = { [release.owner]: expansion };
  const packet = fixture();
  const contract = {
    ...captureRehearsalFrames(stages, expansions),
    bootstrapSources: packet.contract.bootstrapSources,
    provenance: packet.contract.provenance,
  };
  return { stages, expansions, contract, topology: packet.topology };
}
async function deriveNodeExporter(
  edit?: (document: ReturnType<typeof parseDocument>) => void,
  pin = lock,
) {
  const packet = await nodeExporterFixture(edit);
  return readRehearsalNativeCosts(
    packet.stages,
    packet.expansions,
    packet.contract,
    pin,
    [],
    packet.topology,
  );
}
const nodeExporterIdentity =
  'DaemonSet:observability:kube-prometheus-stack-prometheus-node-exporter';
test('Task60 selected node-exporter contributes both full native-reader cohorts', async () => {
  const ledger = await deriveNodeExporter();
  expect(ledger.entries.filter((charge) => charge.owner === nodeExporterIdentity)).toHaveLength(2);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 128, cpuMilli: 20, diskMiB: 128 });
  expect(ledger.daemonLifecycles).toHaveLength(1);
  expect(ledger.blockers).toContainEqual({
    owner: nodeExporterIdentity,
    missingFact: 'hostPath-device-growth:root',
  });
  expect(ledger.state).toBe('incomplete');
});

test('Task60 source consumer facts retain full template identity and every independent obligation', async () => {
  const ledger = await deriveNodeExporter();
  expect(ledger.hostPathConsumers).toHaveLength(3);
  const root = ledger.hostPathConsumers?.find((host) => host.name === 'root');
  expect(root).toMatchObject({
    owner: nodeExporterIdentity,
    path: '/',
    consumerIntent: 'read-only',
    enforcement: 'unobserved',
    mounts: [
      {
        role: 'containers',
        container: 'node-exporter',
        mountPath: '/host/root',
        readOnly: true,
        mountPropagation: 'HostToContainer',
      },
    ],
  });
  expect(root && Object.hasOwn(root, 'type')).toBe(false);
  expect(root?.source.releaseOwner).toBe('observability/kube-prometheus-stack');
  expect(root?.templateSHA256).toBe(ledger.daemonLifecycles[0].templateSHA256);
  for (const name of ['proc', 'sys', 'root'])
    for (const fact of [
      'hostPath-device-growth',
      'hostPath-independent-writers-and-retained-bytes',
      'hostPath-bind-device-submount-and-recursive-readonly',
      'hostPath-Pod-node-observation',
    ])
      expect(ledger.blockers).toContainEqual({
        owner: nodeExporterIdentity,
        missingFact: `${fact}:${name}`,
      });
});
for (const [label, path, value] of [
  ['writable', ['volumeMounts', 0, 'readOnly'], false],
  ['absent readOnly', ['volumeMounts', 0, 'readOnly'], undefined],
  ['different path', null, { path: '/proc-other' }],
  ['explicit empty type', null, { path: '/proc', type: '' }],
  ['declared directory', null, { path: '/proc', type: 'Directory' }],
  ['explicit None', ['volumeMounts', 0, 'mountPropagation'], 'None'],
  ['wrong propagation', ['volumeMounts', 2, 'mountPropagation'], 'None'],
  ['Bidirectional', ['volumeMounts', 2, 'mountPropagation'], 'Bidirectional'],
  ['target', ['volumeMounts', 0, 'mountPath'], '/other'],
  ['subpath', ['volumeMounts', 0, 'subPath'], 'slice'],
  ['subpath expression', ['volumeMounts', 0, 'subPathExpr'], '$(POD)'],
] as const)
  test(`Task60 native exact tuple refuses ${label} and retains facts`, async () => {
    const ledger = await deriveNodeExporter((document) => {
      if (path === null)
        document.setIn(['spec', 'template', 'spec', 'volumes', 0, 'hostPath'], value);
      else if (value === undefined)
        document.deleteIn(['spec', 'template', 'spec', 'containers', 0, ...path]);
      else document.setIn(['spec', 'template', 'spec', 'containers', 0, ...path], value);
    });
    expect(ledger.entries.filter((charge) => charge.owner === nodeExporterIdentity)).toHaveLength(
      0,
    );
    expect(ledger.hostPathConsumers).toHaveLength(3);
    expect(ledger.blockers).toContainEqual({
      owner: nodeExporterIdentity,
      missingFact: 'workload-volume-unsupported',
    });
  });
for (const [label, edit] of [
  [
    'extra app reference',
    (document: ReturnType<typeof parseDocument>) => {
      document.addIn(['spec', 'template', 'spec', 'containers', 0, 'volumeMounts'], {
        name: 'proc',
        mountPath: '/again',
        readOnly: true,
      });
    },
  ],
  [
    'writable init',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'writer',
            image: lock.charts.kubePrometheusStack.images.find((pin) => pin.role === 'nodeExporter')
              ?.name,
            volumeMounts: [{ name: 'proc', mountPath: '/proc', readOnly: false }],
          },
        ],
      );
    },
  ],
  [
    'unknown image',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'image'],
        'example.invalid/foreign@sha256:' + 'f'.repeat(64),
      );
    },
  ],
  [
    'same labels foreign name',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['metadata', 'name'], 'foreign');
    },
  ],
  [
    'foreign namespace',
    (document: ReturnType<typeof parseDocument>) => {
      document.setIn(['metadata', 'namespace'], 'foreign');
    },
  ],
] as const)
  test(`Task60 native source cannot inherit permission through ${label}`, async () => {
    const ledger = await deriveNodeExporter(edit);
    expect(ledger.entries).toHaveLength(0);
    expect(ledger.hostPathConsumers).toHaveLength(3);
  });
test('Task60 native changed chart lock cannot reuse reader defaults', async () => {
  const pin = structuredClone(lock);
  pin.charts.kubePrometheusStack.sha256 = 'c'.repeat(64);
  const ledger = await deriveNodeExporter(undefined, pin);
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.hostPathConsumers).toHaveLength(3);
});
for (const [label, edit] of [
  [
    'absent bounds',
    (d: ReturnType<typeof parseDocument>) =>
      d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']),
  ],
  [
    'unsupported lifecycle',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'updateStrategy'], { type: 'OnDelete' });
    },
  ],
  [
    'earlier unsupported volume',
    (d: ReturnType<typeof parseDocument>) => {
      d.addIn(['spec', 'template', 'spec', 'volumes'], { name: 'extra', csi: {} });
    },
  ],
] as const)
  test(`Task60 malformed late host body precedes ${label}`, async () => {
    const packet = await nodeExporterFixture((d) => {
      edit(d);
      d.setIn(['spec', 'template', 'spec', 'volumes', 2, 'hostPath'], { path: '/ok', extra: true });
    });
    expect(() =>
      readRehearsalNativeCosts(
        packet.stages,
        packet.expansions,
        packet.contract,
        lock,
        [],
        packet.topology,
      ),
    ).toThrow('Native ordinal source malformed');
  });
for (const fault of ['body', 'mixed', 'duplicate', 'mode', 'propagation'] as const)
  test(`Task60 late host ${fault} is validated before earlier owner claim collision`, async () => {
    const packet = await nodeExporterFixture((d) => {
      if (fault === 'body') d.setIn(['spec', 'template', 'spec', 'volumes', 2, 'hostPath'], {});
      if (fault === 'mixed')
        d.setIn(['spec', 'template', 'spec', 'volumes', 2, 'emptyDir'], { sizeLimit: '1Mi' });
      if (fault === 'duplicate')
        d.setIn(['spec', 'template', 'spec', 'volumes', 2, 'name'], 'proc');
      if (fault === 'mode')
        d.setIn(
          ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'readOnly'],
          'true',
        );
      if (fault === 'propagation')
        d.setIn(
          ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
          'Other',
        );
    });
    const collision = fixture((d) => {
      d.set('kind', 'StatefulSet');
      d.setIn(['spec', 'volumes'], []);
      d.setIn(
        ['spec', 'volumeClaimTemplates'],
        [{ metadata: { name: 'same' }, spec: { resources: { requests: { storage: '1Gi' } } } }],
      );
      d.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'same', emptyDir: { sizeLimit: '1Mi' } }],
      );
    });
    const stages = [...collision.stages, ...packet.stages];
    const expansions = packet.expansions;
    const contract = {
      ...captureRehearsalFrames(stages, expansions),
      bootstrapSources: packet.contract.bootstrapSources,
      provenance: packet.contract.provenance,
    };
    expect(() =>
      readRehearsalNativeCosts(stages, expansions, contract, lock, [], packet.topology),
    ).toThrow('Native ordinal source malformed');
  });
test('Task60 host consumer facts survive missing topology and provider mismatch with nested snapshots', async () => {
  const packet = await nodeExporterFixture();
  const pin = structuredClone(lock);
  pin.binaries.k3s.version = 'v1.36.5+k3s1';
  const ledger = readRehearsalNativeCosts(
    packet.stages,
    packet.expansions,
    packet.contract,
    pin,
    [],
    undefined,
  );
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.hostPathConsumers).toHaveLength(3);
  const before = structuredClone(ledger.hostPathConsumers);
  packet.stages[0].releases[0].owner = 'changed';
  packet.contract.provenance.sourceRevision = 'e'.repeat(40);
  expect(ledger.hostPathConsumers).toEqual(before);
  expect(Object.hasOwn(derive(), 'hostPathConsumers')).toBe(false);
});
test('Task60 matching native names and image without chart source cannot select policy', async () => {
  const packet = await nodeExporterFixture();
  const bytes = Object.values(packet.expansions)[0];
  const stages = [{ ...fixture().stages[0], bytes, sha256: hash(bytes) }];
  const contract = {
    ...captureRehearsalFrames(stages, {}),
    bootstrapSources: packet.contract.bootstrapSources,
    provenance: packet.contract.provenance,
  };
  const ledger = readRehearsalNativeCosts(stages, {}, contract, lock, [], packet.topology);
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.hostPathConsumers).toHaveLength(3);
});
test('Task60 exact image assertion without nodeExporter lock role cannot select policy', async () => {
  const pin = structuredClone(lock);
  const image = pin.charts.kubePrometheusStack.images.find(
    (image) => image.role === 'nodeExporter',
  );
  if (!image) throw new Error('nodeExporter lock role absent');
  image.role = 'foreign';
  const ledger = await deriveNodeExporter(undefined, pin);
  expect(ledger.entries).toHaveLength(0);
});
test('Task60 coherent changed chart version stays unsupported', async () => {
  const pin = structuredClone(lock);
  pin.charts.kubePrometheusStack.version = '92.0.0';
  const packet = await nodeExporterFixture();
  const declaration = parseDocument(packet.stages[0].releases[0].manifest);
  declaration.setIn(['spec', 'chart', 'spec', 'version'], '92.0.0');
  packet.stages[0].releases[0].manifest = declaration.toString();
  packet.stages[0].bytes = declaration.toString();
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = {
    ...captureRehearsalFrames(packet.stages, packet.expansions),
    bootstrapSources: packet.contract.bootstrapSources,
    provenance: packet.contract.provenance,
  };
  const ledger = readRehearsalNativeCosts(
    packet.stages,
    packet.expansions,
    packet.contract,
    pin,
    [],
    packet.topology,
  );
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.hostPathConsumers).toHaveLength(3);
});
for (const [label, edit] of [
  [
    'mode',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'readOnly'], 'true');
    },
  ],
  [
    'propagation',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
        'Other',
      );
    },
  ],
  [
    'mount array',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'template', 'spec', 'containers', 0, 'volumeMounts'], {});
    },
  ],
  [
    'host array',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'template', 'spec', 'volumes', 0, 'hostPath'], []);
    },
  ],
  [
    'mixed host sources',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'template', 'spec', 'volumes', 0, 'emptyDir'], { sizeLimit: '1Mi' });
    },
  ],
  [
    'duplicate host name',
    (d: ReturnType<typeof parseDocument>) => {
      d.setIn(['spec', 'template', 'spec', 'volumes', 1, 'name'], 'proc');
    },
  ],
] as const)
  test(`Task60 native malformed ${label} precedes absent bounds and provider mismatch`, async () => {
    const packet = await nodeExporterFixture((d) => {
      edit(d);
      d.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
    });
    const pin = structuredClone(lock);
    pin.binaries.k3s.version = 'v1.36.5+k3s1';
    expect(() =>
      readRehearsalNativeCosts(
        packet.stages,
        packet.expansions,
        packet.contract,
        pin,
        [],
        packet.topology,
      ),
    ).toThrow('Native ordinal source malformed');
  });
test('Task60 native consumer metadata snapshots detach validated source arrays', async () => {
  const packet = await nodeExporterFixture();
  const source = readRehearsalSource(packet.stages, packet.expansions, packet.contract, lock, []);
  const ledger = deriveRehearsalNativeCosts(source, packet.contract, lock, packet.topology);
  const expected = structuredClone(ledger.hostPathConsumers);
  source.native[0].entry.images[0].image = 'mutated';
  source.native[0].entry.source.frameSHA256 = 'c'.repeat(64);
  expect(ledger.hostPathConsumers).toEqual(expected);
});
