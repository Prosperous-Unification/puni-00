import { readFile } from 'node:fs/promises';

import { afterEach, expect, spyOn, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { createRegistryClientCompletion } from './registry-client-completion';
import { requireRegistryClientRestoration } from './registry-client-evidence';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { executeRegistryHostAction } from './registry-maintenance-actions';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import * as kubernetes from './registry-maintenance-kubernetes';
import { requireRegistryRestorationEvidence } from './registry-maintenance-state';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { requireRejection } from './registry-rejection.fixture';

let connected: ReturnType<typeof spyOn<typeof kubernetes, 'createRegistryKubernetes'>> | undefined;
afterEach(() => {
  connected?.mockRestore();
});
function fixture() {
  const cluster = registryClusterFixture().installed;
  const installed = {
    ...cluster,
    registryId: 'proof',
    journalMaximumBytes: 1024 ** 3,
    recovery: { state: 'unenrolled' as const },
    ordinary: { ...cluster.ordinary, storageId: 'old', maximumBytes: 1024 ** 3 },
  };
  const at = new Date().toISOString();
  const backup = {
    snapshotId: 'a'.repeat(64),
    verifiedAt: at,
    registryId: installed.registryId,
    storageId: installed.ordinary.storageId,
    registryPath: installed.ordinary.path,
    journalPath: installed.journalPath,
    journalRevision: 5,
    journalSha256: 'b'.repeat(64),
    censusSha256: 'c'.repeat(64),
    bytes: 1,
  };
  const plan: RegistryClientPullPlan = {
    binding: {
      journalRevision: 7,
      storageId: installed.ordinary.storageId,
      registryPath: installed.ordinary.path,
      censusSha256: 'c'.repeat(64),
      filesystem: '1:2',
    },
    revisions: [],
    pulls: [],
  };
  const journal: RegistryMaintenanceJournal = {
    schemaVersion: 4,
    revision: 8,
    updatedAt: at,
    fenced: true,
    fenceReason: 'maintenance',
    maintenanceVerified: false,
    measurement: null,
    enrollment: {
      registryId: installed.registryId,
      storageId: installed.ordinary.storageId,
      registryPath: installed.ordinary.path,
      rootPath: '/',
      maximumBytes: installed.ordinary.maximumBytes,
      journalMaximumBytes: 1024 ** 3,
      owners: ['operator'],
    },
    protections: [],
    bundles: [],
    reservations: [],
    publication: null,
    closedOperations: [],
    environments: [],
    deployments: [],
    consumers: [],
    publicationEvidence: [],
    retirements: [],
    lastVerifiedBackup: backup,
    maintenance: {
      operationId: 'client',
      owner: 'operator',
      token: '11111111-1111-4111-8111-111111111111',
      kind: 'backup',
      phase: 'verified',
      resumePhase: 'verified',
    },
    maintenanceEvidence: {
      operationId: 'client',
      runtime: 'stopped',
      plan: null,
      backup,
      backupCensusSha256: backup.censusSha256,
      backupAttempts: [],
      backupReconciliation: null,
      backupReconciliations: [],
      uploadsVerified: null,
      retained: [],
      deletions: [],
      recovery: null,
      client: createRegistryClientCompletion(
        plan,
        {
          operationId: 'client',
          registryId: installed.registryId,
          snapshotId: backup.snapshotId,
          scope: 'current',
        },
        at,
      ),
    },
  };
  return { installed, journal, at };
}
for (const fault of ['none', 'missing', 'stale', 'future', 'retained', 'recovery-census'] as const)
  test('actual root restoration gate requires current client evidence: ' + fault, async () => {
    const proof = fixture();
    const evidence = proof.journal.maintenanceEvidence;
    if (evidence?.client === undefined) throw new Error('Missing fixture client');
    const receipt = evidence.client;
    if (fault === 'missing') delete evidence.client;
    if (fault === 'stale') receipt.completedAt = new Date(Date.now() - 300001).toISOString();
    if (fault === 'future') receipt.completedAt = new Date(Date.now() + 60000).toISOString();
    if (fault === 'retained')
      evidence.retained = [{ repository: 'unverified', digest: 'sha256:' + 'd'.repeat(64) }];
    if (fault === 'recovery-census') {
      if (evidence.backup === null) throw new Error('Missing backup');
      evidence.backup.storageId = 'previous';
      evidence.backup.registryPath = '/previous';
      evidence.recovery = JSON.stringify({
        operationId: 'client',
        snapshotId: evidence.backup.snapshotId,
        previousStorageId: 'previous',
        previousRegistryPath: '/previous',
        storageId: proof.journal.enrollment.storageId,
        registryPath: proof.journal.enrollment.registryPath,
        maximumBytes: proof.journal.enrollment.maximumBytes,
        canonicalJournalPath: proof.installed.journalPath,
        stagedJournalPath: '/staged',
        stagedJournalRevision: 5,
        stagedJournalSha256: 'b'.repeat(64),
        currentJournalRevision: 6,
        censusSha256: 'd'.repeat(64),
        verifiedAt: proof.at,
        handoff: 'offline-exclusion-and-current-obligation-reconciliation-required',
      });
    }
    const reached = new Error('root gate reached effects');
    connected = spyOn(kubernetes, 'createRegistryKubernetes').mockRejectedValue(reached);
    const observed = await requireRejection(
      executeRegistryHostAction({
        installed: proof.installed,
        journal: proof.journal,
        request: {
          action: 'restore-service',
          operationId: 'client',
          owner: 'operator',
          token: '11111111-1111-4111-8111-111111111111',
        },
        signal: new AbortController().signal,
        descriptor: 3,
        ready: () => Promise.resolve(),
      }),
    );
    if (fault === 'none') {
      expect(observed.cause).toBe(reached);
      expect(connected).toHaveBeenCalledTimes(1);
    } else {
      expect(observed.cause).not.toBe(reached);
      expect(connected).not.toHaveBeenCalled();
    }
  });
test('client completion is usable at exactly five minutes and expired immediately after', () => {
  const proof = fixture();
  expect(() => {
    requireRegistryClientRestoration(
      proof.journal,
      new Date(Date.parse(proof.at) + 300000).toISOString(),
    );
  }).not.toThrow();
  expect(() => {
    requireRegistryClientRestoration(
      proof.journal,
      new Date(Date.parse(proof.at) + 300001).toISOString(),
    );
  }).toThrow('Stale');
});

for (const delay of ['none', 'stopped', 'replicas', 'service', 'owner'] as const)
  test('actual root restore rechecks freshness after delayed ' + delay, async () => {
    const proof = fixture();
    const source = await readFile(
      new URL('./registry-maintenance-actions.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf("    case 'restore-service': {");
    const end = source.indexOf('\n  }\n}\n\nasync function converge', start);
    if (start < 0 || end < 0) throw new Error('Missing restore dispatcher block');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      'async function prove(){switch(request.action){' + source.slice(start, end) + '}}',
    );
    const events: string[] = [];
    let at = Date.parse(proof.at);
    const expire = () => {
      at += 300001;
    };
    const reached = new Error('availability reached');
    const receipt = {
      prior: {
        replicas: 1,
        withdrawn: false,
        owners: proof.installed.owners.map((owner) => ({
          name: owner.name,
          uid: owner.uid,
          suspended: false,
          requestedAt: null,
        })),
      },
    };
    // Boundary: execute the exact production action block; privileged observation/patch ports and wall clock are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'request',
      'previous',
      'stopped',
      'api',
      'storage',
      'installed',
      'journal',
      'requireRegistryRestorationEvidence',
      'Date',
      'converge',
      'signal',
      'registryDeploymentReady',
      'audit',
      'withdrawnRegistrySelector',
      body + ';return prove();',
    ) as (...ports: unknown[]) => Promise<unknown>;
    const refused = await requireRejection(
      invoke(
        { action: 'restore-service' },
        () => receipt,
        () => {
          events.push('stopped');
          if (delay === 'stopped') expire();
          return Promise.resolve();
        },
        {
          patch: (_cluster: string, _pin: unknown, action: { kind: string }) => {
            events.push(action.kind);
            if (action.kind === delay) expire();
            return Promise.resolve();
          },
        },
        proof.installed.ordinary,
        proof.installed,
        proof.journal,
        requireRegistryRestorationEvidence,
        class extends Date {
          constructor() {
            super(at);
          }
        },
        () => {
          events.push('availability');
          throw reached;
        },
        new AbortController().signal,
        () => true,
        () => Promise.resolve({}),
        {},
      ),
    );
    if (delay === 'none') expect(refused.cause).toBe(reached);
    else {
      expect(refused.throwCause).toThrow('Stale');
      expect(events).not.toContain('availability');
    }
    expect(events.filter((event) => event !== 'stopped').length).toBe(
      delay === 'stopped'
        ? 0
        : delay === 'replicas'
          ? 1
          : delay === 'service'
            ? 2
            : delay === 'owner'
              ? 3
              : proof.installed.owners.length + 3,
    );
  });

test('root supplies the captured restoration freshness guard to the native mutation adapter', async () => {
  const proof = fixture();
  connected = spyOn(kubernetes, 'createRegistryKubernetes').mockImplementation(
    (_installed, _descriptor, _signal, beforeMutation) => {
      const receipt = proof.journal.maintenanceEvidence?.client;
      if (receipt === undefined) throw new Error('Missing client fixture');
      receipt.completedAt = new Date(Date.now() - 300001).toISOString();
      if (beforeMutation === undefined) throw new Error('Missing native mutation freshness guard');
      return invokeRegistryCallback(() => {
        beforeMutation();
        throw new Error('Expired native mutation admitted');
      });
    },
  );
  expect(
    (
      await requireRejection(
        executeRegistryHostAction({
          installed: proof.installed,
          journal: proof.journal,
          request: {
            action: 'restore-service',
            operationId: 'client',
            owner: 'operator',
            token: '11111111-1111-4111-8111-111111111111',
          },
          signal: new AbortController().signal,
          descriptor: 3,
          ready: () => Promise.resolve(),
        }),
      )
    ).throwCause,
  ).toThrow('Stale');
  expect(connected).toHaveBeenCalledTimes(1);
});
