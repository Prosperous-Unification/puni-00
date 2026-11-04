import assert from 'node:assert/strict';

import { mock, spyOn } from 'bun:test';

import { findRegistryBackupStage } from './registry-backup-diagnostics';
import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import type { RegistryBackupRetentionInput } from './registry-backup-retention';
import { invokeRegistryCallback } from './registry-callback';
import type { RegistryMaintenanceJournal } from './registry-journal';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

const scenario = process.argv[2];
const action = scenario.startsWith('snapshot')
  ? 'backup-snapshot'
  : scenario === 'verify'
    ? 'backup-verify'
    : 'backup-preflight';
const calls: string[] = [];
const configuration = {
  repositoryId: 'f'.repeat(64),
  recoveryPins: ['a'.repeat(64)],
  sourceLimits: {
    registry: {
      maximumLogicalBytes: 1048576,
      maximumEntries: 100,
      maximumDepth: 10,
      maximumMetadataBytes: 65536,
      maximumFanout: 100,
    },
    journal: {
      maximumLogicalBytes: 1048576,
      maximumEntries: 100,
      maximumDepth: 10,
      maximumMetadataBytes: 65536,
      maximumFanout: 100,
    },
  },
  binary: {
    path: '/root/.puni/tools/restic-0.19.1',
    sha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
  },
  password: { path: '/root/.puni/registry/restic.password', sha256: 'b'.repeat(64) },
  environment: { RESTIC_REPOSITORY: 's3:https://fixture.invalid/bucket/repository' },
};
const lastVerified = { snapshotId: 'c'.repeat(64), prior: 'preserve exact prior receipt' };
const journal = {
  revision: 7,
  maintenance: {
    operationId: 'owned-operation',
    phase: scenario === 'snapshot-wrong-phase' ? 'fenced' : 'stopped',
  },
  enrollment: {
    registryId: 'stable-registry',
    rootPath: '/current-source',
    maximumBytes: 100,
    journalMaximumBytes: 10,
  },
  lastVerifiedBackup: scenario === 'preflight-null' ? null : lastVerified,
  maintenanceEvidence: {
    backupCensusSha256: 'd'.repeat(64),
    backup: action === 'backup-verify' ? lastVerified : null,
  },
} as unknown as RegistryMaintenanceJournal;
if (scenario === 'preflight-absent') Reflect.deleteProperty(journal, 'lastVerifiedBackup');
const original = JSON.stringify(journal);
const signal = new AbortController().signal;
const started = Date.now();
const failure = new Error('controlled retention failure with secret content');
const missingFailure = new Error('missing trusted last verified state');
spyOn(process, 'getuid').mockReturnValue(0);
// Root UID, artifact verification and store effects are explicitly modeled ports; no root process, provider or restic runs.
await mock.module('./registry-maintenance-installation', () => ({
  verifyRegistryHostArtifact: () => Promise.resolve(Buffer.from(JSON.stringify(configuration))),
  requireRegistryRecoveryInstallation: () => {
    throw new Error('Unexpected recovery');
  },
}));
const snapshotVersions = () => Promise.resolve([]);
await mock.module('./registry-backup-store', () => ({
  createRegistryBackupStore: () => ({
    inspectRepository: () =>
      invokeRegistryCallback(() => {
        calls.push('repository');
        return scenario === 'preflight-repository-fail' ? 'wrong' : configuration.repositoryId;
      }),
    inspectRetention: (
      request: Omit<RegistryBackupRetentionInput, 'lastVerified'> & {
        lastVerified: RegistryBackupRetentionInput['lastVerified'] | undefined;
      },
      authority: { authorityDescriptor: number },
    ) =>
      invokeRegistryCallback(() => {
        calls.push('retention');
        if (scenario === 'preflight-absent' && request.lastVerified === undefined)
          throw missingFailure;
        assert.equal(request.registryId, 'stable-registry');
        assert.equal(request.journalPath, '/installed-journal');
        assert.equal(authority.authorityDescriptor, 19);
        assert.deepEqual(Object.keys(authority), ['authorityDescriptor']);
        assert.equal(request.observeSnapshotVersions, snapshotVersions);
        assert.deepEqual(request.recoveryPins, ['a'.repeat(64)]);
        assert.equal(request.lastVerified, journal.lastVerifiedBackup);
        assert.equal(request.lastVerified, scenario === 'preflight-null' ? null : lastVerified);
        assert.equal(typeof request.sampledAt, 'string');
        const sampled = Date.parse(request.sampledAt);
        assert(sampled >= started && sampled <= Date.now());
        if (scenario.endsWith('retention-fail')) throw failure;
        return { coverage: { complete: false }, eligibleSnapshotIds: [] };
      }),
    prepare: () =>
      invokeRegistryCallback(() => {
        calls.push('prepare');
      }),
    snapshot: () =>
      invokeRegistryCallback(() => {
        calls.push('snapshot');
        return { snapshotId: 'e'.repeat(64) };
      }),
    verify: () =>
      invokeRegistryCallback(() => {
        calls.push('verify');
      }),
  }),
}));
const { executeRegistryBackupAction } = await import('./registry-maintenance-backup');
try {
  const receipt = await executeRegistryBackupAction({
    effects: modelRegistryBackupEffects(),
    action,
    installed: {
      journalPath: '/installed-journal',
      backupConfiguration: { sha256: 'b'.repeat(64) },
    } as unknown as RegistryMaintenanceInstallation,
    journal,
    descriptor: 19,
    signal,
    lifetime: 'worker',
    admit: (_request, authority) =>
      invokeRegistryCallback(() => {
        calls.push('admit');
        assert.equal(authority.journal, journal);
        assert.equal(authority.authorityDescriptor, 19);
        if (scenario === 'preflight-admission-fail') throw new Error('closed physical admission');
      }),
    openVersions: (_configuration, authority) =>
      invokeRegistryCallback(() => {
        calls.push('open');
        assert.equal(authority.signal, signal);
        assert.equal(authority.journal, journal);
        assert.equal(authority.journalPath, '/installed-journal');
        return {
          snapshotVersions,
          census: () =>
            invokeRegistryCallback(() => {
              calls.push('raw-census');
              if (scenario === 'preflight-raw-fail') throw new Error('unreadable complete census');
              return [];
            }),
          removeVersion: () => Promise.reject(new Error('Unexpected deletion')),
        };
      }),
  });
  console.log(
    JSON.stringify({ ok: true, receipt, calls, unchanged: JSON.stringify(journal) === original }),
  );
} catch (cause) {
  console.log(
    JSON.stringify({
      ok: false,
      calls,
      stage: findRegistryBackupStage(cause),
      exactFailure: cause === failure,
      missingFailure: cause === missingFailure,
      unchanged: JSON.stringify(journal) === original,
    }),
  );
}
