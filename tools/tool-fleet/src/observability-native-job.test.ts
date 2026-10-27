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
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'setup', namespace: 'dev' },
      spec: {
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'app',
                image: 'example@sha256:' + 'a'.repeat(64),
                resources: {
                  requests: { memory: '128Mi', cpu: '10m' },
                  limits: { memory: '128Mi', cpu: '1', 'ephemeral-storage': '64Mi' },
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
  ['parallelism negative', ['parallelism'], -1],
  ['completions fraction', ['completions'], 1.5],
  ['backoff overflow', ['backoffLimit'], 2147483648],
  ['backoff null', ['backoffLimit'], null],
  ['deadline negative', ['activeDeadlineSeconds'], -1],
  ['deadline unsafe', ['activeDeadlineSeconds'], 9007199254740992],
  ['ttl fraction', ['ttlSecondsAfterFinished'], 1.5],
  ['mode', ['completionMode'], 'Parallel'],
  ['suspend', ['suspend'], 'true'],
  ['manual selector', ['manualSelector'], 'false'],
  ['replacement', ['podReplacementPolicy'], 'Always'],
  ['restart absent value', ['template', 'spec', 'restartPolicy'], 'Always'],
  ['failure shape', ['podFailurePolicy'], []],
  [
    'failure rule action',
    ['podFailurePolicy'],
    { rules: [{ action: 'Retry', onExitCodes: { operator: 'In', values: [1] } }] },
  ],
  ['failure rule neither', ['podFailurePolicy'], { rules: [{ action: 'Count' }] }],
  [
    'failure exit codes empty',
    ['podFailurePolicy'],
    { rules: [{ action: 'Count', onExitCodes: { operator: 'In', values: [] } }] },
  ],
  [
    'failure exit codes zero',
    ['podFailurePolicy'],
    { rules: [{ action: 'Count', onExitCodes: { operator: 'In', values: [0] } }] },
  ],
  [
    'failure exit codes duplicate',
    ['podFailurePolicy'],
    { rules: [{ action: 'Count', onExitCodes: { operator: 'NotIn', values: [1, 1] } }] },
  ],
  [
    'failure exit codes unordered',
    ['podFailurePolicy'],
    { rules: [{ action: 'Count', onExitCodes: { operator: 'NotIn', values: [2, 1] } }] },
  ],
  [
    'failure container unknown',
    ['podFailurePolicy'],
    {
      rules: [
        { action: 'Count', onExitCodes: { operator: 'In', values: [1], containerName: 'missing' } },
      ],
    },
  ],
  [
    'failure conditions status',
    ['podFailurePolicy'],
    {
      rules: [
        { action: 'Ignore', onPodConditions: [{ type: 'DisruptionTarget', status: 'maybe' }] },
      ],
    },
  ],
  [
    'failure both matchers',
    ['podFailurePolicy'],
    {
      rules: [
        {
          action: 'Count',
          onExitCodes: { operator: 'In', values: [1] },
          onPodConditions: [{ type: 'DisruptionTarget' }],
        },
      ],
    },
  ],
  [
    'failure index contradiction',
    ['podFailurePolicy'],
    { rules: [{ action: 'FailIndex', onExitCodes: { operator: 'In', values: [1] } }] },
  ],
  ['success nonindexed', ['successPolicy'], { rules: [{ succeededCount: 1 }] }],
  ['per index nonindexed', ['backoffLimitPerIndex'], 1],
  ['max failed without index', ['maxFailedIndexes'], 1],
  ['selector array', ['selector'], []],
  ['selector labels array', ['selector'], { matchLabels: [] }],
  ['selector label type', ['selector'], { matchLabels: { app: 1 } }],
  [
    'selector expression operator',
    ['selector'],
    { matchExpressions: [{ key: 'app', operator: 'Equal', values: ['x'] }] },
  ],
  [
    'selector expression values',
    ['selector'],
    { matchExpressions: [{ key: 'app', operator: 'In', values: [] }] },
  ],
  [
    'selector exists values',
    ['selector'],
    { matchExpressions: [{ key: 'app', operator: 'Exists', values: ['x'] }] },
  ],
  ['managed by shape', ['managedBy'], 7],
  ['foreign replicas', ['replicas'], 1],
  ['foreign strategy', ['strategy'], {}],
  ['foreign claims', ['volumeClaimTemplates'], []],
] as const) {
  test(`Job malformed ${label} precedes missing bounds and unsupported policy`, () => {
    const packet = fixture((document) => {
      document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
      document.setIn(['spec', 'suspend'], true);
      document.setIn(['spec', ...path], value);
    });
    const pin = structuredClone(lock);
    pin.binaries.k3s.version = 'v0.0.0';
    expect(() => derive(packet, pin)).toThrow('Native ordinal source malformed');
  });
}
test('Job defaults preserve declared absence and intended provider provenance', () => {
  const packet = fixture();
  const ledger = derive(packet);
  expect(ledger.jobScope).toBe('immutable-source-serial-job-attempts');
  expect(ledger.jobLifecycles[0]).toMatchObject({
    owner: 'Job:dev:setup',
    parallelism: { declared: 'absent', effective: 1, basis: 'kubernetes-v1.36.4-default' },
    completions: { declared: 'absent', effective: 1, basis: 'kubernetes-v1.36.4-default' },
    backoffLimit: { declared: 'absent', effective: 6, basis: 'kubernetes-v1.36.4-default' },
    completionMode: { declared: 'absent', effective: 'NonIndexed' },
    suspend: { declared: 'absent', effective: false },
    manualSelector: { declared: 'absent', effective: false },
    podReplacementPolicy: { declared: 'absent', effective: 'TerminatingOrFailed' },
    restartPolicy: 'Never',
    maximumPodSlots: 7,
    grace: { declared: 'absent', effective: 30, reclamationDeadline: false },
    runtimeObserved: false,
    source: {
      owner: 'stage/native',
      pointer: '/0',
      namespace: 'dev',
      source: { frameSHA256: packet.stages[0].sha256 },
    },
  });
  expect(ledger.provider).toMatchObject({
    kubernetesDefaultVersion: 'v1.36.4',
    intendedK3sVersion: 'v1.36.4+k3s1',
    runtimeObserved: false,
  });
  expect(ledger.provider.intendedNodeImage).toEqual(lock.runtimeImages.k3dNode);
});
for (const [label, edits, missingFact] of [
  ['workqueue', { parallelism: 1 }, 'job-serial-policy'],
  ['parallel', { parallelism: 2, completions: 1 }, 'job-serial-policy'],
  ['zero completions', { completions: 0 }, 'job-serial-policy'],
  ['indexed', { completionMode: 'Indexed', completions: 1 }, 'job-serial-policy'],
  ['suspended', { suspend: true }, 'job-serial-policy'],
  ['manual selection', { manualSelector: true }, 'job-serial-policy'],
  ['selector', { selector: {} }, 'job-serial-policy'],
  ['foreign controller', { managedBy: 'example.com/controller' }, 'job-serial-policy'],
  ['replacement Failed', { podReplacementPolicy: 'Failed' }, 'job-serial-policy'],
  [
    'failure policy',
    {
      podFailurePolicy: {
        rules: [{ action: 'Count', onExitCodes: { operator: 'In', values: [1] } }],
      },
    },
    'job-serial-policy',
  ],
  ['range above bound', { backoffLimit: 256 }, 'job-attempt-expansion-range'],
  ['range hostile valid', { backoffLimit: 2147483647 }, 'job-attempt-expansion-range'],
] as const) {
  test(`Job valid unsupported ${label} retains a named obligation`, () => {
    const ledger = derive(
      fixture((document) => {
        for (const [field, value] of Object.entries(edits)) document.setIn(['spec', field], value);
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual({ owner: 'Job:dev:setup', missingFact });
  });
}
test('Job deadline zero and int64-safe metadata do not imply reclamation', () => {
  for (const deadline of [0, 2147483648]) {
    const ledger = derive(
      fixture((document) => {
        document.setIn(['spec', 'activeDeadlineSeconds'], deadline);
      }),
    );
    expect(ledger.jobLifecycles[0].activeDeadlineSeconds).toEqual({
      declared: deadline,
      reclamationDeadline: false,
    });
  }
});
test('Job later malformed policies cannot hide behind earlier unsupported state', () => {
  const packet = fixture((document) => {
    document.setIn(['spec', 'suspend'], true);
  });
  const later = fixture((document) => {
    document.setIn(['metadata', 'name'], 'later');
    document.setIn(['spec', 'podFailurePolicy'], { rules: [{ action: 'Invalid' }] });
  });
  packet.stages[0].bytes += '---\n' + later.stages[0].bytes;
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  expect(() => derive(packet)).toThrow('Native ordinal source malformed');
});
for (const [backoff, slots, memoryMiB, cpuMilli, diskMiB] of [
  [0, 1, 128, 10, 64],
  [4, 5, 640, 50, 320],
  [6, 7, 896, 70, 448],
  [10, 11, 1408, 110, 704],
  [255, 256, 32768, 2560, 16384],
] as const) {
  test(`Job backoff ${String(backoff)} retains ${String(slots)} full normalized attempt charges`, () => {
    const packet = fixture((document) => {
      document.setIn(['spec', 'backoffLimit'], backoff);
      document.setIn(['spec', 'template', 'spec', 'restartPolicy'], 'OnFailure');
    });
    const ledger = derive(packet);
    expect(ledger.entries).toHaveLength(slots);
    expect(ledger.knownContributions).toEqual({ memoryMiB, cpuMilli, diskMiB });
    expect(ledger.jobLifecycles[0]).toMatchObject({
      backoffLimit: { declared: backoff, effective: backoff, basis: 'declared' },
      maximumPodSlots: slots,
      restartPolicy: 'OnFailure',
    });
    for (const [slot, charge] of ledger.entries.entries()) {
      expect(charge).toEqual({
        identity: `Job:dev:setup/attempt/${String(slot)}`,
        owner: 'Job:dev:setup',
        kind: 'pod',
        memoryMiB: 128,
        cpuMilli: 10,
        diskMiB: 64,
        source: {
          owner: 'stage/native',
          sha256: packet.stages[0].sha256,
          pointer: '/0/spec/template/spec',
        },
        concurrency: { phase: 'immutable-source-serial-job-attempts', pods: slots, slot },
      });
    }
  });
}
test('Job charges share init maximum overhead and emptyDir normalization', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(['spec', 'backoffLimit'], 4);
      document.setIn(['spec', 'template', 'spec', 'overhead'], { memory: '2Mi', cpu: '5m' });
      document.setIn(
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'init',
            image: 'init:1',
            resources: {
              requests: { memory: '256Mi', cpu: '20m' },
              limits: { memory: '256Mi', cpu: '1', 'ephemeral-storage': '128Mi' },
            },
            securityContext: { readOnlyRootFilesystem: true },
          },
        ],
      );
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'scratch', emptyDir: { sizeLimit: '192Mi' } }],
      );
    }),
  );
  expect(ledger.knownContributions).toEqual({ memoryMiB: 1290, cpuMilli: 125, diskMiB: 960 });
  expect(
    ledger.entries.every(
      (charge) => charge.memoryMiB === 258 && charge.cpuMilli === 25 && charge.diskMiB === 192,
    ),
  ).toBe(true);
});
test('Job conditions and whole attempt history never confer authority or cleanup credit', () => {
  const packet = fixture((document) => {
    document.setIn(['metadata', 'annotations'], {
      'helm.sh/hook': 'pre-install,pre-upgrade',
      'helm.sh/hook-delete-policy': 'before-hook-creation,hook-succeeded',
      'kustomize.toolkit.fluxcd.io/force': 'enabled',
    });
    document.setIn(['spec', 'activeDeadlineSeconds'], 1200);
    document.setIn(['spec', 'ttlSecondsAfterFinished'], 60);
  });
  const ledger = derive(packet);
  const lifecycle = ledger.jobLifecycles[0];
  expect(lifecycle.conditions).toEqual({
    source: 'fresh-immutable-attempt',
    identity: 'one-Job-UID-one-template-unchanged-counts-and-policies',
    history: 'complete-successful-and-uncertain-creation-reconciliation',
    initial: 'no-prior-work-or-adoption-and-no-unaccounted-creation',
    failures:
      'every-replaced-nonsuccessful-Pod-durably-counted-once-before-next-create-including-finalizers',
    success: 'no-further-creation-after-first-success',
    controller: 'reachable-cooperative-controller-with-reconciled-expectations',
    excluded: [
      'foreign-mutation',
      'forced-deletion',
      'lost-node-execution',
      'controller-recreation',
    ],
    retention: 'full-failed-terminating-and-current-Pod-demand-without-cleanup-credit',
    restarts: 'reuse-Pod-slot-cumulative-restart-logs-remain-unbounded',
    admission: 'independently-bind-and-enforce-event-constraints-before-creation',
    runtimeObserved: false,
  });
  expect(lifecycle.wholeAttempt).toEqual({
    required: [
      'Helm-install-upgrade-retry-remediation-invocation-identities',
      'hook-created-Job-UID-generations',
      'Flux-forced-recreation-generations',
      'retained-predecessor-Pod-device-log-histories',
    ],
    generationMultiplier: 'unobserved',
    cleanupCredit: false,
    runtimeObserved: false,
  });
  expect(lifecycle.ttlSecondsAfterFinished).toEqual({ declared: 60, reclamationDeadline: false });
  expect(lifecycle.annotations).toEqual({
    'helm.sh/hook': 'pre-install,pre-upgrade',
    'helm.sh/hook-delete-policy': 'before-hook-creation,hook-succeeded',
    'kustomize.toolkit.fluxcd.io/force': 'enabled',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact: 'job-serial-runtime-binding',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact:
      'whole-attempt-helm-install-upgrade-retry-remediation-hook-Job-UID-Flux-recreation-and-retained-Pod-device-log-history',
  });
  expect(ledger).toMatchObject({
    state: 'incomplete',
    creationAuthority: false,
    runtimeAuthority: false,
  });
  expect(lifecycle.runtimeObserved).toBe(false);
  const template = (
    parseDocument(packet.stages[0].bytes).toJSON() as { spec: { template: unknown } }
  ).spec.template;
  expect(lifecycle.templateSHA256).toBe(hash(JSON.stringify(template)));
  const changed = derive(
    fixture((document) => {
      document.setIn(['spec', 'template', 'metadata', 'labels'], { revision: 'next' });
    }),
  );
  expect(changed.jobLifecycles[0].templateSHA256).not.toBe(
    derive().jobLifecycles[0].templateSHA256,
  );
});
test('Job absent ephemeral limits retain known demand and independent app and init writer obligations', () => {
  const ledger = derive(
    fixture((document) => {
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
        ['spec', 'template', 'spec', 'initContainers'],
        [
          {
            name: 'init',
            image: 'init:1',
            resources: {
              requests: { memory: '128Mi', cpu: '10m' },
              limits: { memory: '128Mi', cpu: '1' },
            },
            securityContext: { readOnlyRootFilesystem: true },
          },
        ],
      );
    }),
  );
  expect(ledger.entries).toHaveLength(7);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 896, cpuMilli: 70, diskMiB: 0 });
  for (const name of ['app', 'init'])
    expect(ledger.blockers).toContainEqual({
      owner: 'Job:dev:setup',
      missingFact: `ephemeral-storage-limit-absent:${name}; writable-logs-and-runtime-state-unobserved`,
    });
});
for (const resources of [undefined, null, {}, { requests: null, limits: null }]) {
  test(`Job broad resource absence ${JSON.stringify(resources)} stays incomplete`, () => {
    const ledger = derive(
      fixture((document) => {
        if (resources === undefined)
          document.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'resources']);
        else document.setIn(['spec', 'template', 'spec', 'containers', 0, 'resources'], resources);
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual({
      owner: 'Job:dev:setup',
      missingFact: 'workload-bounds-or-resource-policy',
    });
  });
}
test('Job unbounded bucket scratch is never invented', () => {
  const ledger = derive(
    fixture((document) => {
      document.setIn(['spec', 'template', 'spec', 'volumes'], [{ name: 'scratch', emptyDir: {} }]);
    }),
  );
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact: 'candidate-emptydir-unbounded',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact:
      'whole-attempt-helm-install-upgrade-retry-remediation-hook-Job-UID-Flux-recreation-and-retained-Pod-device-log-history',
  });
});
for (const field of [
  'uid',
  'ownerReferences',
  'deletionTimestamp',
  'generation',
  'resourceVersion',
]) {
  test(`Job runtime ${field} excludes immutable source scenario`, () => {
    const ledger = derive(
      fixture((document) => {
        document.setIn(['metadata', field], field === 'ownerReferences' ? [] : 'observed');
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual({
      owner: 'Job:dev:setup',
      missingFact: 'source-controller-identity-and-generation',
    });
  });
}
test('Job namespace and provider remain required for conditional charges', () => {
  const packet = fixture((document) => document.deleteIn(['metadata', 'namespace']));
  expect(derive(packet).blockers).toContainEqual({
    owner: 'Job:_:setup',
    missingFact: 'source-namespace',
  });
  const pin = structuredClone(lock);
  pin.binaries.k3s.version = 'v0.0.0';
  const ledger = derive(fixture(), pin);
  expect(ledger.entries).toEqual([]);
  expect(ledger.blockers).toContainEqual({
    owner: 'provider',
    missingFact: 'pinned-defaulting-contract',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact: 'job-serial-policy',
  });
});
test('Job shared volume and quantity validation precedes range and missing-bound shortcuts', () => {
  for (const fault of ['volume', 'quantity']) {
    const packet = fixture((document) => {
      document.setIn(['spec', 'backoffLimit'], 2147483647);
      document.setIn(['spec', 'suspend'], true);
      if (fault === 'volume')
        document.setIn(
          ['spec', 'template', 'spec', 'volumes'],
          [{ name: 'scratch', emptyDir: {}, secret: { secretName: 'secret' } }],
        );
      else
        document.setIn(
          ['spec', 'template', 'spec', 'containers', 0, 'resources', 'requests', 'cpu'],
          'bogus',
        );
    });
    expect(() => derive(packet)).toThrow(
      fault === 'volume' ? 'Native ordinal source malformed' : 'Generated capacity cpu-unknown',
    );
  }
});
for (const [label, edits] of [
  ['managed controller domain', { managedBy: 'controller' }],
  ['selector invalid key', { selector: { matchLabels: { 'bad key': 'x' } } }],
  ['selector invalid value', { selector: { matchLabels: { app: 'bad value' } } }],
  ['selector mismatched template', { selector: { matchLabels: { app: 'different' } } }],
  [
    'condition type',
    { podFailurePolicy: { rules: [{ action: 'Count', onPodConditions: [{ type: 'bad type' }] }] } },
  ],
  ['indexed work queue', { completionMode: 'Indexed', parallelism: 1 }],
  ['indexed parallel cap', { completionMode: 'Indexed', completions: 1, parallelism: 100001 }],
  [
    'indexed max failures',
    { completionMode: 'Indexed', completions: 2, backoffLimitPerIndex: 1, maxFailedIndexes: 3 },
  ],
  [
    'indexed large missing max failures',
    { completionMode: 'Indexed', completions: 100001, backoffLimitPerIndex: 1 },
  ],
  [
    'failure replacement contradiction',
    { podFailurePolicy: {}, podReplacementPolicy: 'TerminatingOrFailed' },
  ],
  [
    'success empty rule',
    { completionMode: 'Indexed', completions: 2, successPolicy: { rules: [{}] } },
  ],
  [
    'success index exponent',
    {
      completionMode: 'Indexed',
      completions: 2,
      successPolicy: { rules: [{ succeededIndexes: '1e0' }] },
    },
  ],
  [
    'success invalid indexes',
    {
      completionMode: 'Indexed',
      completions: 2,
      successPolicy: { rules: [{ succeededIndexes: 'bogus' }] },
    },
  ],
  [
    'success indexes overlap',
    {
      completionMode: 'Indexed',
      completions: 2,
      successPolicy: { rules: [{ succeededIndexes: '0-1,1' }] },
    },
  ],
  [
    'success indexes bound',
    {
      completionMode: 'Indexed',
      completions: 2,
      successPolicy: { rules: [{ succeededIndexes: '2' }] },
    },
  ],
  [
    'success count exceeds indexes',
    {
      completionMode: 'Indexed',
      completions: 2,
      successPolicy: { rules: [{ succeededIndexes: '0', succeededCount: 2 }] },
    },
  ],
] as const) {
  test(`Job malformed ${label} cannot hide behind Indexed or suspended policy`, () => {
    const packet = fixture((document) => {
      document.setIn(['spec', 'suspend'], true);
      for (const [field, value] of Object.entries(edits)) document.setIn(['spec', field], value);
    });
    expect(() => derive(packet)).toThrow('Native ordinal source malformed');
  });
}
for (const edits of [
  { podFailurePolicy: {} },
  { podFailurePolicy: { rules: [] } },
  {
    podFailurePolicy: {
      rules: [{ action: 'Count', onPodConditions: [{ type: 'DisruptionTarget' }] }],
    },
  },
  { completionMode: 'Indexed', completions: 2, backoffLimitPerIndex: 0, maxFailedIndexes: 1 },
  {
    completionMode: 'Indexed',
    completions: 2,
    successPolicy: { rules: [{ succeededIndexes: '0-1', succeededCount: 1 }] },
  },
  { manualSelector: true, selector: { matchLabels: { app: 'setup' } } },
]) {
  test(`Job valid unsupported nested policy ${JSON.stringify(edits)} stays named incomplete`, () => {
    const ledger = derive(
      fixture((document) => {
        document.setIn(['spec', 'template', 'metadata', 'labels'], { app: 'setup' });
        for (const [field, value] of Object.entries(edits)) document.setIn(['spec', field], value);
      }),
    );
    expect(ledger.entries).toEqual([]);
    expect(ledger.blockers).toContainEqual({
      owner: 'Job:dev:setup',
      missingFact: 'job-serial-policy',
    });
  });
}
test('Job explicit supported policy retains declared facts and selectors never borrow another namespace claim', () => {
  const ledger = derive(
    fixture((document) => {
      for (const [field, value] of Object.entries({
        parallelism: 1,
        completions: 1,
        completionMode: 'NonIndexed',
        suspend: false,
        manualSelector: false,
        podReplacementPolicy: 'TerminatingOrFailed',
        managedBy: 'kubernetes.io/job-controller',
      }))
        document.setIn(['spec', field], value);
      document.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'external', persistentVolumeClaim: { claimName: 'store' } }],
      );
    }),
  );
  expect(ledger.entries).toHaveLength(7);
  expect(ledger.jobLifecycles[0]).toMatchObject({
    parallelism: { declared: 1, effective: 1, basis: 'declared' },
    completions: { declared: 1, effective: 1, basis: 'declared' },
    suspend: { declared: false, effective: false, basis: 'declared' },
    manualSelector: { declared: false, effective: false, basis: 'declared' },
    podReplacementPolicy: {
      declared: 'TerminatingOrFailed',
      effective: 'TerminatingOrFailed',
      basis: 'declared',
    },
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'Job:dev:setup',
    missingFact: 'claim-source:dev/store',
  });
});
test('Job all-native prepass precedes earlier ordinal claim collision', () => {
  const packet = fixture((document) => {
    document.set('apiVersion', 'apps/v1');
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
      metadata: { name: 'records-setup-0', namespace: 'dev' },
      spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
    });
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  expect(() => derive(packet)).toThrow('Native ordinal claim-identity-collision');
  const later = fixture((document) => {
    document.setIn(['metadata', 'name'], 'later');
    document.setIn(['spec', 'suspend'], 'invalid');
  });
  packet.stages[0].bytes += '---\n' + later.stages[0].bytes;
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  packet.contract = captureRehearsalFrames(packet.stages, {});
  expect(() => derive(packet)).toThrow('Native ordinal source malformed');
});
for (const [operator, values, labels] of [
  ['In', ['wrong'], { app: 'setup' }],
  ['NotIn', ['setup'], { app: 'setup' }],
  ['Exists', [], {}],
  ['DoesNotExist', [], { app: 'setup' }],
  ['Exists', ['setup'], { app: 'setup' }],
  ['In', ['bad value'], { app: 'bad value' }],
] as const) {
  test(`Job selector ${operator} ${JSON.stringify(values)} contradicts its template or shape`, () => {
    expect(() =>
      derive(
        fixture((document) => {
          document.setIn(['spec', 'template', 'metadata', 'labels'], labels);
          document.setIn(['spec', 'selector'], {
            matchExpressions: [{ key: 'app', operator, values }],
          });
        }),
      ),
    ).toThrow('Native ordinal source malformed');
  });
}
test('Job failure policy cannot use OnFailure restart', () => {
  expect(() =>
    derive(
      fixture((document) => {
        document.setIn(['spec', 'template', 'spec', 'restartPolicy'], 'OnFailure');
        document.setIn(['spec', 'podFailurePolicy'], {});
      }),
    ),
  ).toThrow('Native ordinal source malformed');
});
test('Job external claim owners remain namespace scoped', () => {
  const packet = fixture((document) => {
    document.setIn(
      ['spec', 'template', 'spec', 'volumes'],
      [{ name: 'records', persistentVolumeClaim: { claimName: 'store' } }],
    );
  });
  const claim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'store', namespace: 'prod' },
    spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
  };
  const jobBytes = packet.stages[0].bytes;
  for (const namespace of ['prod', 'dev']) {
    claim.metadata.namespace = namespace;
    packet.stages[0].bytes = jobBytes + '---\n' + stringify(claim);
    packet.stages[0].sha256 = hash(packet.stages[0].bytes);
    packet.contract = captureRehearsalFrames(packet.stages, {});
    expect(derive(packet).blockers).toContainEqual({
      owner: 'Job:dev:setup',
      missingFact:
        namespace === 'prod' ? 'claim-source:dev/store' : 'claim-owner-and-retention:dev/store',
    });
  }
});
test('Job malformed managed controller empty domain label throws before unsupported policy', () => {
  expect(() =>
    derive(
      fixture((document) => {
        document.setIn(['spec', 'managedBy'], 'example..com/controller');
      }),
    ),
  ).toThrow('Native ordinal source malformed');
});
