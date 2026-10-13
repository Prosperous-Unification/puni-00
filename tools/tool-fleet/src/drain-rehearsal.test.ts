import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  buildDrainFixture,
  collectDrainSnapshot,
  collectProtectedCase,
  readDrainEvidence,
  requireDrainEvidence,
} from './drain-rehearsal';

const labId = 'f5-a1b2c3';
const target = `puni-vm-${labId}-workers-agent-1`;
const identity = {
  labId,
  target,
  targetUid: 'uid-1',
  namespace: `puni-f5-${labId}`,
  kubeconfigSha256: 'c'.repeat(64),
  toolchainSha256: 'd'.repeat(64),
};
const now = new Date('2026-10-13T10:00:00.000Z');
const preserved = {
  podName: 'fixture-abc',
  podUid: 'pod-1',
  workloadUid: 'work-1',
  serviceUid: 'service-1',
  marker: 'm',
  pvUid: 'pv-1',
  claimUid: 'claim-1',
  workloadSha256: 'a'.repeat(64),
  pvSha256: 'b'.repeat(64),
};
function evidence() {
  return {
    schemaVersion: 1,
    ...identity,
    observedAt: now.toISOString(),
    cases: ['local-pv', 'forge-worktree', 'singleton-sqlite', 'pdb'].map((kind) => ({
      kind,
      exitCode: 1,
      refusal: {
        output:
          kind === 'local-pv'
            ? `refused: ${identity.namespace} is local or pinned to ${target}`
            : kind === 'pdb'
              ? `error: Operation effect failed: Retirement drain for ${target} failed with exit 2\n"rc": 1\nevicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.`
              : `refused: ${identity.namespace}/fixture-abc needs a maintenance transaction`,
      },
      before: preserved,
      after: preserved,
      cordoned: kind === 'pdb',
      serviceActive: true,
      receiptAbsent: true,
      journalState: kind === 'pdb' ? 'recoverable' : 'running',
      failedEffect: kind === 'pdb' ? 'evict workloads respecting disruption budgets' : null,
      elapsedMs: kind === 'pdb' ? 90_100 : 1000,
      completedEffects:
        kind === 'pdb'
          ? ['verify replacement capacity, storage topology, and backup status', 'cordon node']
          : [],
    })),
    success: {
      state: 'complete',
      receiptState: 'retired',
      serviceActive: false,
      nodeAbsent: true,
      secondApplyUnchanged: true,
    },
  };
}

describe('protected drain rehearsal', () => {
  it('accepts only complete fresh evidence for the generated owned lab and target UID', () => {
    expect(() => {
      requireDrainEvidence(evidence(), identity, now);
    }).not.toThrow();
    for (const fault of [
      { schemaVersion: 2 },
      { targetUid: 'other' },
      { namespace: 'default' },
      { labId: 'prod' },
      { observedAt: '2026-10-12T00:00:00.000Z' },
      { cases: [] },
      { cases: [...evidence().cases, evidence().cases[0]] },
      { cases: [...evidence().cases].reverse() },
      { success: { ...evidence().success, secondApplyUnchanged: false } },
    ])
      expect(() => {
        requireDrainEvidence({ ...evidence(), ...fault }, identity, now);
      }).toThrow();
  });

  it('rejects lost workloads, markers, service, receipt, phase, and PDB eviction protection', () => {
    for (const fault of [
      { exitCode: 0 },
      { after: { ...preserved, marker: 'lost' } },
      { before: { ...preserved, marker: '' }, after: { ...preserved, marker: '' } },
      { after: { ...preserved, podUid: 'replacement' } },
      { receiptAbsent: false },
      { serviceActive: false },
      { journalState: 'complete' },
      { completedEffects: ['cordon node'] },
      { cordoned: true },
      { failedEffect: 'cordon node' },
    ]) {
      const document = evidence();
      document.cases[0] = { ...document.cases[0], ...fault };
      expect(() => {
        requireDrainEvidence(document, identity, now);
      }).toThrow();
    }
    for (const fault of [
      { cordoned: false },
      { elapsedMs: 181_000 },
      { elapsedMs: 1000 },
      { exitCode: 0 },
      { exitCode: 124 },
    ]) {
      const document = evidence();
      document.cases[3] = { ...document.cases[3], ...fault };
      expect(() => {
        requireDrainEvidence(document, identity, now);
      }).toThrow();
    }
  });

  it('throws for absent, unreadable and malformed required evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-drain-evidence-'));
    const path = join(directory, 'evidence.json');
    async function expectFailure(evidencePath: string, message: string) {
      const failure = await readDrainEvidence(evidencePath, identity, now).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain(message);
    }
    await expectFailure(path, 'Cannot read required');
    await mkdir(path);
    await expectFailure(path, 'Cannot read required');
    const malformed = join(directory, 'malformed.json');
    await writeFile(malformed, '{');
    await expectFailure(malformed, 'Malformed');
    await writeFile(malformed, JSON.stringify(evidence()));
    await chmod(malformed, 0);
    await expectFailure(malformed, 'Cannot read required');
  });

  it('refuses fixture mutation outside its generated lab namespace or with shell-bearing marker bytes', () => {
    for (const fault of [{ namespace: 'default' }, { target: 'production' }, { labId: 'prod' }]) {
      expect(() => {
        buildDrainFixture({ ...identity, ...fault }, 'pdb', 'probe', 'sqlite', 'a'.repeat(32));
      }).toThrow();
    }
    expect(() => {
      buildDrainFixture(identity, 'stateless', 'probe', 'sqlite', "'; touch /sentinel; '");
    }).toThrow();
  });

  it('uses managed fixture controllers, exact labels, target affinity and a persistent SQLite marker', () => {
    for (const kind of [
      'local-pv',
      'forge-worktree',
      'singleton-sqlite',
      'pdb',
      'stateless',
    ] as const) {
      const manifest = buildDrainFixture(
        identity,
        kind,
        'busybox@sha256:locked',
        'bun@sha256:locked',
        'a'.repeat(32),
      );
      const source = JSON.stringify(manifest);
      expect(source).toContain(identity.namespace);
      expect(source).toContain('Deployment');
      expect(source).toContain(target);
      expect(source).toContain('puni.dev/capability-execution');
      if (kind !== 'stateless')
        expect(source).toContain('requiredDuringSchedulingIgnoredDuringExecution');
      if (kind === 'local-pv') {
        expect(source).toContain('PersistentVolume');
        expect(source).toContain('persistentVolumeClaim');
      }
      if (kind === 'forge-worktree' || kind === 'singleton-sqlite')
        expect(source).toContain(`puni.dev/${kind}`);
      if (kind === 'singleton-sqlite') {
        expect(source).toContain('bun:sqlite');
        expect(source).toContain('fsGroup');
        expect(source).toContain('/state/marker.sqlite');
        expect(source).toContain('SELECT');
      }
      if (kind === 'pdb') {
        expect(source).toContain('PodDisruptionBudget');
        expect(source).toContain('minAvailable');
      }
    }
  });
});

function fixtureKubectl(
  fault: {
    claimUid?: string;
    podUid?: string;
    marker?: string;
    deploymentVersion?: number;
    pvPath?: string;
  } = {},
) {
  return (arguments_: readonly string[]): Promise<string> => {
    const source = arguments_.join(' ');
    if (arguments_.includes('exec')) return Promise.resolve(fault.marker ?? 'marker');
    if (source.includes('get pods'))
      return Promise.resolve(
        JSON.stringify({
          items: [
            {
              metadata: {
                name: 'fixture-abc',
                uid: fault.podUid ?? 'pod-1',
                namespace: identity.namespace,
                ownerReferences: [{ kind: 'ReplicaSet' }],
                labels: { 'puni.dev/forge-worktree': 'true', 'puni.dev/singleton-sqlite': 'true' },
              },
              spec: { nodeName: target },
            },
          ],
        }),
      );
    if (source.includes('get deployment'))
      return Promise.resolve(
        JSON.stringify({
          metadata: { uid: 'work-1' },
          spec: { replicas: fault.deploymentVersion ?? 1 },
        }),
      );
    if (source.includes('get service'))
      return Promise.resolve(JSON.stringify({ metadata: { uid: 'service-1' } }));
    if (source.includes('get pvc'))
      return Promise.resolve(JSON.stringify({ metadata: { uid: fault.claimUid ?? 'claim-1' } }));
    if (source.includes('get pv'))
      return Promise.resolve(
        JSON.stringify({
          metadata: { uid: 'pv-1' },
          spec: { local: { path: fault.pvPath ?? '/owned' } },
        }),
      );
    throw new Error(`Unexpected kubectl ${source}`);
  };
}

it('feeds actual snapshot producer into the protected collector and rejects lost fields and state', async () => {
  const before = await collectDrainSnapshot(identity, 'local-pv', true, 'marker', fixtureKubectl());
  const refusal = {
    exitCode: 1,
    stdout: '',
    stderr: `refused: ${identity.namespace} is local or pinned to ${target}`,
  };
  const journal = { state: 'running', completedSteps: [] };
  const attributes = { cordoned: false, serviceActive: true, receiptAbsent: true, elapsedMs: 1000 };
  expect(() => {
    collectProtectedCase(identity, 'local-pv', before, before, refusal, journal, attributes);
  }).not.toThrow();
  expect(Object.keys(before).sort()).toEqual(
    [
      'podName',
      'podUid',
      'workloadUid',
      'serviceUid',
      'marker',
      'pvUid',
      'claimUid',
      'workloadSha256',
      'pvSha256',
    ].sort(),
  );
  expect(before.claimUid).toBe('claim-1');
  expect(before.workloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(before.pvSha256).toMatch(/^[a-f0-9]{64}$/);
  for (const fault of [
    { claimUid: 'other' },
    { podUid: 'other' },
    { deploymentVersion: 2 },
    { pvPath: '/changed' },
  ]) {
    const after = await collectDrainSnapshot(
      identity,
      'local-pv',
      true,
      'marker',
      fixtureKubectl(fault),
    );
    expect(() => {
      collectProtectedCase(identity, 'local-pv', before, after, refusal, journal, attributes);
    }).toThrow();
  }
  const markerFailure = await collectDrainSnapshot(
    identity,
    'local-pv',
    true,
    'marker',
    fixtureKubectl({ marker: 'lost' }),
  ).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(String(markerFailure)).toContain('persisted marker');
});

it('accepts only the owned fixture refusal and actual PDB denial, rejecting unrelated apply failures', async () => {
  for (const kind of ['local-pv', 'forge-worktree', 'singleton-sqlite', 'pdb'] as const) {
    const before = await collectDrainSnapshot(identity, kind, true, 'marker', fixtureKubectl());
    const journal =
      kind === 'pdb'
        ? {
            state: 'recoverable',
            activeStep: { effect: 'evict workloads respecting disruption budgets' },
            completedSteps: [
              { effect: 'verify replacement capacity, storage topology, and backup status' },
              { effect: 'cordon node' },
            ],
          }
        : { state: 'running', completedSteps: [] };
    const attributes = {
      cordoned: kind === 'pdb',
      serviceActive: true,
      receiptAbsent: true,
      elapsedMs: kind === 'pdb' ? 90_100 : 1000,
    };
    for (const stderr of [
      'SSH connection refused',
      'kubectl API unavailable',
      'timeout without eviction denial',
      `Retirement drain for ${target} failed with exit 124: timeout without owned denial`,
      `Retirement drain for ${target} failed with exit 2\nevicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.`,
      `Retirement drain for ${target} failed with exit 2\n"rc": 1\nevicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.\nRetirement drain for ${target} failed with exit 124`,
      `evicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.`,
      `Retirement drain for ${target} failed with exit 2\n"rc": 1\nevicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.\nAPI connection failed`,
      `evicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}": Cannot evict pod as it would violate the pod's disruption budget.\nAPI connection failed`,
      `evicting pod other/fixture-abc\nCannot evict pod as it would violate the pod's disruption budget.`,
    ]) {
      expect(() => {
        collectProtectedCase(
          identity,
          kind,
          before,
          before,
          { exitCode: 1, stdout: '', stderr: `${stderr}\nsecret-outside-refusal` },
          journal,
          attributes,
        );
      }).toThrow('refusal');
    }
    const stderr =
      kind === 'local-pv'
        ? `refused: ${identity.namespace} is local or pinned to ${target}`
        : kind === 'pdb'
          ? `error: Operation effect failed: Retirement drain for ${target} failed with exit 2\n"rc": 1\nevicting pod ${identity.namespace}/fixture-abc\nerror when evicting pods/"fixture-abc" -n "${identity.namespace}" (will retry after 5s): Cannot evict pod as it would violate the pod's disruption budget.`
          : `refused: ${identity.namespace}/fixture-abc needs a maintenance transaction`;
    expect(() => {
      collectProtectedCase(
        identity,
        kind,
        before,
        before,
        { exitCode: 1, stdout: '', stderr },
        journal,
        attributes,
      );
    }).not.toThrow();
  }
});

it('retains only the owned refusal in durable phase evidence', async () => {
  const before = await collectDrainSnapshot(identity, 'local-pv', true, 'marker', fixtureKubectl());
  const phase = collectProtectedCase(
    identity,
    'local-pv',
    before,
    before,
    {
      exitCode: 1,
      stdout: 'sensitive-unrelated-output',
      stderr: `refused: ${identity.namespace} is local or pinned to ${target}`,
    },
    { state: 'running', completedSteps: [] },
    { cordoned: false, serviceActive: true, receiptAbsent: true, elapsedMs: 1 },
  );
  expect(JSON.stringify(phase)).not.toContain('sensitive-unrelated-output');
});
