import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { buildDrainFixture, readDrainEvidence, requireDrainEvidence } from './drain-rehearsal';

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
      before: preserved,
      after: preserved,
      cordoned: kind === 'pdb',
      serviceActive: true,
      receiptAbsent: true,
      journalState: kind === 'pdb' ? 'recoverable' : 'running',
      failedEffect:
        kind === 'pdb'
          ? 'evict workloads respecting disruption budgets'
          : 'verify replacement capacity, storage topology, and backup status',
      elapsedMs: 1000,
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
    for (const fault of [{ cordoned: false }, { elapsedMs: 181_000 }, { exitCode: 0 }]) {
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
