import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import { readRehearsalNativeCosts } from './observability-native-ordinal';
import { captureRehearsalFrames } from './observability-rehearsal-inventory';

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
