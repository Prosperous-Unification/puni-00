import { lstat } from 'node:fs/promises';

import { readRegistryBackupGuardian } from './registry-backup-attempt';
import {
  createWritePermit,
  measureFilesystem,
  measureVerifiedFilesystem,
  type RegistryWritePermit,
  requireFreshCapacity,
} from './registry-capacity';
import { readTrustedEnrollment } from './registry-enrollment';
import { verifyStoredImages } from './registry-image-availability';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import {
  assertConsumerUniverse,
  type RegistryEnrollment,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { collectRegistryConsumers } from './registry-reader';

/** Called with canonical enrollment by the held authority session. Paths/receipts are returned only from root-installed allowlisted storage, never from request strings or an unlocked journal read. */
export function selectRegistryAuthorityStorage(
  enrollment: RegistryEnrollment,
  installed: RegistryMaintenanceInstallation,
): RegistryMaintenanceInstallation['ordinary'] {
  if (
    enrollment.registryId !== installed.registryId ||
    enrollment.rootPath !== '/' ||
    enrollment.journalMaximumBytes !== installed.journalMaximumBytes
  )
    throw new Error('Authority enrollment differs from fixed registry/journal installation');
  const candidates = [
    installed.ordinary,
    ...(installed.recovery.state === 'enrolled' ? [installed.recovery] : []),
  ];
  const selected = candidates.find(
    (storage) =>
      storage.path === enrollment.registryPath &&
      storage.storageId === enrollment.storageId &&
      storage.maximumBytes === enrollment.maximumBytes,
  );
  // Proof: unenrolled, stale identity/path, registry and independent capacity mutations all refuse selection.
  if (selected === undefined)
    throw new Error('Current registry store is not an enrolled fixed target');
  return selected;
}

/**
 * One physical/consumer/permission adapter for ordinary commands and maintenance. The journal
 * and lock never move. A verified rebind changes only which installed registry receipt/guard
 * acknowledgement is consulted; every measurement and image read checks that current target.
 * Permit instances are selected inside authority callbacks, preserving correlated revoke/ack
 * state without reading canonical state outside the flock. Mount failures never fall back.
 */
export function createRegistryAuthorityPorts(
  installed: RegistryMaintenanceInstallation,
): RegistryJournalPorts {
  let current: RegistryEnrollment | undefined;
  const permits = new Map<string, RegistryWritePermit>();
  const select = (enrollment: RegistryEnrollment) => {
    const storage = selectRegistryAuthorityStorage(enrollment, installed);
    current = enrollment;
    return storage;
  };
  const verifyMount = async (enrollment: RegistryEnrollment) => {
    const storage = select(enrollment);
    const measured = await measureVerifiedFilesystem(storage.path, storage.identityReceipt);
    const [registryDevice, journalDevice, rootDevice] = await Promise.all([
      lstat(storage.path),
      lstat(installed.journalPath),
      lstat('/'),
    ]);
    if (
      measured.identity !== storage.storageId ||
      measured.maximumBytes !== storage.maximumBytes ||
      new Set([registryDevice.dev, journalDevice.dev, rootDevice.dev]).size !== 3
    )
      throw new Error('Current registry receipt/mount differs from independent installed storage');
    return measured;
  };
  const measureRegistry: RegistryJournalPorts['measureRegistry'] = async (enrollment) => {
    const measuredAt = Date.now();
    const [registry, root] = await Promise.all([verifyMount(enrollment), measureFilesystem('/')]);
    return requireFreshCapacity(
      {
        measuredAt,
        capacity: {
          maximumBytes: enrollment.maximumBytes,
          usableBytes: registry.usableBytes,
          usedBytes: registry.usedBytes,
          totalInodes: registry.totalInodes,
          usedInodes: registry.usedInodes,
          rootFreeBytes: root.availableBytes,
        },
      },
      Date.now(),
    );
  };
  const permit = () => {
    if (current === undefined)
      throw new Error('Missing session-verified current registry enrollment');
    const enrollment = current;
    const storage = selectRegistryAuthorityStorage(enrollment, installed);
    const existing = permits.get(storage.storageId);
    if (existing !== undefined) return existing;
    const created = createWritePermit(
      installed.journalPath,
      () => measureRegistry(enrollment),
      storage.path,
    );
    permits.set(storage.storageId, created);
    return created;
  };
  return {
    describeBackupGuardian: async (pid) => {
      const guardian = await readRegistryBackupGuardian(pid);
      if (guardian.machineId !== installed.machineId)
        throw new Error('Backup guardian differs from installed machine');
      return { guardian, configurationSha256: installed.backupConfiguration.sha256 };
    },
    permit: {
      isFresh: () => permit().isFresh(),
      prepare: (serialized, reopen) => permit().prepare(serialized, reopen),
      publish: (serialized) => permit().publish(serialized),
      revoke: () => permit().revoke(),
      confirmReadonly: async () => {
        const selected = permit();
        if (selected.confirmReadonly === undefined)
          throw new Error('Missing current registry acknowledgement verifier');
        await selected.confirmReadonly();
      },
    },
    verifyConsumers: async (sources, registryId) => {
      assertConsumerUniverse(
        await readTrustedEnrollment('/etc/puni/registry-consumers.json'),
        sources,
        registryId,
      );
    },
    collectConsumers: (sources, revision, enrollment) =>
      collectRegistryConsumers(sources, revision, enrollment.registryId),
    verifyImages: async (enrollment, references) => {
      await verifyMount(enrollment);
      await verifyStoredImages(
        selectRegistryAuthorityStorage(enrollment, installed).path,
        references,
      );
    },
    measureJournal: async (enrollment) => {
      select(enrollment);
      const measured = await measureVerifiedFilesystem(
        installed.journalPath,
        installed.journalIdentityReceipt,
      );
      if (measured.maximumBytes !== installed.journalMaximumBytes)
        throw new Error('Canonical journal capacity differs from fixed installation');
      return {
        usableBytes: measured.usableBytes,
        allocationUnitBytes: measured.allocationUnitBytes,
        usedBytes: measured.usedBytes,
        totalInodes: measured.totalInodes,
        usedInodes: measured.usedInodes,
      };
    },
    measureRegistry,
  };
}
