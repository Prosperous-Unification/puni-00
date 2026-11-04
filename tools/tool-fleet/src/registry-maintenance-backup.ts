import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { observeRegistryBackupStage } from './registry-backup-diagnostics';
import {
  reconcileRegistryBackupLocks,
  requireRegistryBackupLockReservation,
  verifyRegistryBackupRepository,
} from './registry-backup-locks';
import { proveRegistryBackupOriginStopped } from './registry-backup-origin';
import type { OpenRegistryBackupVersions } from './registry-backup-provider';
import {
  openRegistryBackupReservation,
  type RegistryBackupEffectPort,
} from './registry-backup-reservation';
import { RegistryBackupSourceLimits } from './registry-backup-source';
import { createRegistryBackupStore, type RegistryBackupAdmission } from './registry-backup-store';
import { measureVerifiedFilesystem } from './registry-capacity';
import type { RegistryMaintenanceJournal } from './registry-journal';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryRecoveryInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { RegistryRecoveryPreparation } from './registry-maintenance-state';

const Configuration = type({
  // Proof: making this optional accepts a truly absent JSON property in the production parser negative.
  repositoryId: /^[a-f0-9]{64}$/,
  // Proof: absent-property production parser accepted the config before required source limits.
  sourceLimits: RegistryBackupSourceLimits,
  // Proof: optional-field plus duplicate-guard removal accepted truly absent JSON pins; separate hash/bound removals accepted short/uppercase/excess pins.
  recoveryPins: type(/^[a-f0-9]{64}$/)
    .array()
    .atMostLength(2048),
  binary: {
    path: "'/root/.puni/tools/restic-0.19.1'",
    sha256: "'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639'",
    '+': 'reject',
  },
  password: {
    path: "'/root/.puni/registry/restic.password'",
    sha256: /^[a-f0-9]{64}$/,
    '+': 'reject',
  },
  environment: {
    RESTIC_REPOSITORY: 'string > 0',
    'AWS_ACCESS_KEY_ID?': 'string > 0',
    'AWS_SECRET_ACCESS_KEY?': 'string > 0',
    'AWS_DEFAULT_REGION?': 'string > 0',
    'AWS_SESSION_TOKEN?': 'string > 0',
    '+': 'reject',
  },
  '+': 'reject',
});
/** Root-only configuration never accepts commands, caller secret paths, inline password or loader environment. */
export function parseRegistryBackupConfiguration(input: unknown) {
  const configuration = Configuration.assert(input);
  // Proof: duplicate-guard removal accepted repeated full snapshot IDs in the production parser negative.
  if (new Set(configuration.recoveryPins).size !== configuration.recoveryPins.length)
    throw new Error('Duplicate configured backup recovery pin');
  return configuration;
}

/** Mandatory Task9 physical-provider admission executes inside the same root helper and inherited authority session. */
export type RegistryBackupAdmissionPort = (
  request: RegistryBackupAdmission,
  authority: { journal: RegistryMaintenanceJournal; authorityDescriptor: number },
) => Promise<void>;

/** Fixed root-only restic effects derive source/restore/snapshot identities exclusively from current canonical evidence and installed targets. */
export async function executeRegistryBackupAction(input: {
  action:
    | 'backup-preflight'
    | 'backup-snapshot'
    | 'backup-verify'
    | 'backup-restore'
    | 'backup-reconcile';
  installed: RegistryMaintenanceInstallation;
  journal: RegistryMaintenanceJournal;
  descriptor: number;
  signal: AbortSignal;
  admit: RegistryBackupAdmissionPort;
  lifetime: 'worker';
  openVersions: OpenRegistryBackupVersions;
  /** Controlled ordinary tests can model persistence; production opens the fixed root-owned sibling. */
  effects?: RegistryBackupEffectPort;
}): Promise<string> {
  if (process.getuid?.() !== 0)
    throw new Error('Provider credentials require the root maintenance guardian');
  const bytes = await verifyRegistryHostArtifact(input.installed.backupConfiguration, true);
  const configuration = parseRegistryBackupConfiguration(JSON.parse(bytes.toString('utf8')));
  await verifyRegistryHostArtifact(configuration.binary);
  await verifyRegistryHostArtifact(configuration.password, true);
  const { journal } = input;
  const owned = journal.maintenance;
  if (owned === null) throw new Error('Backup guardian requires active canonical ownership');
  const authority = { authorityDescriptor: input.descriptor };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const effects =
    input.effects ??
    (() => {
      const evidence = journal.maintenanceEvidence;
      const attempt = evidence?.backupAttempts.find(
        (attempt) =>
          attempt.state === 'prepared' &&
          attempt.action === input.action &&
          attempt.journalRevision === journal.revision,
      );
      if (input.action !== 'backup-reconcile' && attempt === undefined)
        throw new Error('Missing exact canonical backup effect attempt');
      if (input.action === 'backup-reconcile')
        requireRegistryBackupLockReservation(
          evidence?.backupReconciliation,
          evidence?.backupAttempts ?? [],
          owned.operationId,
          input.installed.backupConfiguration.sha256,
          journal.revision,
        );
      return openRegistryBackupReservation({
        journalPath: input.installed.journalPath,
        authorityDescriptor: input.descriptor,
        authorityUid: 59001,
        uid: 0,
        journalMaximumBytes: input.installed.journalMaximumBytes,
        binding: {
          operationId: owned.operationId,
          tokenSha256: hash(owned.token),
          registryId: journal.enrollment.registryId,
          storageId: journal.enrollment.storageId,
          repositoryId: configuration.repositoryId,
          configurationSha256: input.installed.backupConfiguration.sha256,
          // This identifies fixed execution inputs only; missing full resource/provider evidence still blocks physical admission.
          profileSha256: hash(
            JSON.stringify({
              binary: configuration.binary,
              configuration: input.installed.backupConfiguration.sha256,
              profile: 'restic/no-cache/locked-commands/v1',
            }),
          ),
        },
        attempt: {
          id: attempt?.id ?? hash(JSON.stringify(evidence?.backupReconciliation)),
          revision: journal.revision,
          action: input.action,
        },
        signal: input.signal,
        measure: async () => {
          const measured = await measureVerifiedFilesystem(
            input.installed.journalPath,
            input.installed.journalIdentityReceipt,
          );
          if (measured.maximumBytes !== input.installed.journalMaximumBytes)
            throw new Error('Backup effect journal capacity differs from installation');
          return measured;
        },
      });
    })();
  const store = createRegistryBackupStore({
    effects,
    signal: input.signal,
    authorityUid: 59001,
    lifetime: input.lifetime,
    repositoryId: configuration.repositoryId,
    sourceLimits: configuration.sourceLimits,
    binary: configuration.binary.path,
    binarySha256: configuration.binary.sha256,
    environment: {
      ...configuration.environment,
      RESTIC_PASSWORD_FILE: configuration.password.path,
    },
    admit: (request) => input.admit(request, { ...authority, journal }),
  });
  const source = {
    operationId: owned.operationId,
    ...journal.enrollment,
    journalPath: input.installed.journalPath,
  };
  if (input.action !== 'backup-reconcile') {
    await input.admit(
      {
        operationId: owned.operationId,
        phase: 'inspection',
        registryMaximumBytes: source.maximumBytes,
        journalMaximumBytes: source.journalMaximumBytes,
      },
      { ...authority, journal },
    );
  }
  await effects.bindPhase({ phase: 'inspection' });
  // Proof: removing either field in a disposable copy fails the actual backup-action consumer fixture's installed-path/same-signal boundary.
  const versions = await input.openVersions(configuration, {
    ...authority,
    journal,
    journalPath: input.installed.journalPath,
    signal: input.signal,
    effects,
  });
  const inspectRepository = (scope: 'initial' | 'final') =>
    store.inspectRepository(input.installed.journalPath, authority, input.signal, scope);
  await observeRegistryBackupStage('repository-verification', () =>
    verifyRegistryBackupRepository(
      versions,
      configuration.repositoryId,
      () => inspectRepository('initial'),
      input.action === 'backup-reconcile' ? 'reconciliation' : 'effect',
    ),
  );
  if (input.action === 'backup-reconcile') {
    const evidence = journal.maintenanceEvidence;
    await observeRegistryBackupStage('reservation', () => {
      requireRegistryBackupLockReservation(
        evidence?.backupReconciliation,
        evidence?.backupAttempts ?? [],
        owned.operationId,
        input.installed.backupConfiguration.sha256,
        journal.revision,
      );
    });
    if (evidence === null) throw new Error('Missing backup reconciliation evidence');
    const receipt = await reconcileRegistryBackupLocks(
      evidence.backupAttempts.filter((attempt) => attempt.state === 'prepared'),
      input.installed.backupConfiguration.sha256,
      {
        ...versions,
        inspect: (version, censusSha256) =>
          store.inspectLock(version.key.slice(6), input.installed.journalPath, authority, {
            versionId: version.versionId,
            censusSha256,
          }),
        proveStopped: proveRegistryBackupOriginStopped,
      },
    );
    await observeRegistryBackupStage('final-verification', () =>
      verifyRegistryBackupRepository(versions, configuration.repositoryId, () =>
        inspectRepository('final'),
      ),
    );
    return JSON.stringify(receipt);
  }
  // Proof: removing this inspection let controlled retention failures reach prepare/snapshot; a null-default mutation failed the truly absent trusted-field witness.
  if (input.action === 'backup-preflight' || input.action === 'backup-snapshot') {
    await observeRegistryBackupStage('repository-verification', () =>
      store.inspectRetention(
        {
          registryId: journal.enrollment.registryId,
          journalPath: input.installed.journalPath,
          sampledAt: new Date().toISOString(),
          lastVerified: journal.lastVerifiedBackup,
          recoveryPins: configuration.recoveryPins,
          observeSnapshotVersions: versions.snapshotVersions,
        },
        authority,
      ),
    );
  }
  const receipt = await (async () => {
    if (input.action === 'backup-preflight') {
      await store.prepare(source, authority);
      return 'verified';
    }
    if (input.action === 'backup-snapshot') {
      const censusSha256 = journal.maintenanceEvidence?.backupCensusSha256;
      if (
        // Proof: the actual action consumer reached snapshot with phase fenced before this stopped-phase check.
        owned.phase !== 'stopped' ||
        censusSha256 === null ||
        censusSha256 === undefined ||
        journal.maintenanceEvidence?.backup !== null
      )
        throw new Error(
          'Backup snapshot requires durable fresh census and no previous operation snapshot',
        );
      return JSON.stringify(
        await store.snapshot(
          { ...source, journalRevision: journal.revision, censusSha256 },
          authority,
        ),
      );
    }
    const backup = journal.maintenanceEvidence?.backup;
    if (backup === null || backup === undefined)
      throw new Error('Backup guardian requires canonical verified snapshot lineage');
    if (input.action === 'backup-verify') {
      await store.verify(backup, authority);
      return 'verified';
    }
    const target = requireRegistryRecoveryInstallation(input.installed);
    const serialized = journal.maintenanceEvidence?.recovery;
    if (serialized === null || serialized === undefined)
      throw new Error('Backup restore requires durable target ownership');
    const prepared = RegistryRecoveryPreparation.assert(JSON.parse(serialized));
    if (
      prepared.operationId !== owned.operationId ||
      prepared.snapshotId !== backup.snapshotId ||
      prepared.storageId !== target.storageId ||
      prepared.registryPath !== target.path ||
      prepared.stagedJournalPath !== target.stagedJournalPath ||
      prepared.stagedJournalStorageId !== target.stagedJournalStorageId ||
      prepared.maximumBytes !== target.maximumBytes ||
      prepared.stagedJournalMaximumBytes !== target.stagedJournalMaximumBytes ||
      prepared.canonicalJournalPath !== input.installed.journalPath
    )
      throw new Error('Backup restore target differs from canonical and installed lineage');
    await store.restore(
      backup,
      { registryPath: target.path, journalPath: target.stagedJournalPath },
      prepared,
      authority,
    );
    return 'verified';
  })();
  await observeRegistryBackupStage('final-verification', () =>
    verifyRegistryBackupRepository(versions, configuration.repositoryId, () =>
      inspectRepository('final'),
    ),
  );
  return receipt;
}
