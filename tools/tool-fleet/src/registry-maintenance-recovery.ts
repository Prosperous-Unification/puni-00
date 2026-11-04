import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import type { RegistryEndpoint } from './platform-registry';
import { measureVerifiedFilesystem } from './registry-capacity';
import { collectRegistryInventory, type RegistryInventory } from './registry-inventory';
import {
  parseRegistryCommandResponse,
  projectRegistryRecovery,
  type RegistryJournalPorts,
} from './registry-journal';
import { type RegistryMaintenanceAuthority, verifyRegistryPulls } from './registry-maintenance';
import {
  type RegistryBackupReceipt,
  RegistryRecoveryPreparation,
  type RegistryRecoveryReceipt,
} from './registry-maintenance-state';
import { completeRegistryOperation } from './registry-operation-completion';

/** Fixed server configuration selects the targets; clients cannot supply paths, identities or capacities. */
export interface RegistryRecoveryRuntime {
  audit(authority: RegistryMaintenanceAuthority): Promise<{
    target: RegistryRecoveryPreparation;
    registryIdentityReceipt: string;
    stagedJournalIdentityReceipt: string;
    canonicalJournalIdentityReceipt: string;
  }>;
  verifyImages(
    authority: RegistryMaintenanceAuthority,
    inventory: RegistryInventory,
  ): Promise<void>;
  assertStopped(authority: RegistryMaintenanceAuthority): Promise<void>;
  open(
    authority: RegistryMaintenanceAuthority,
  ): Promise<{ endpoint: RegistryEndpoint; close(): Promise<void> }>;
}

/** Actual device identity supplements the independently trusted ext4 receipt; different labels cannot disguise one shared filesystem. */
export async function measureRecoveryMount(path: string, receipt: string) {
  return { ...(await measureVerifiedFilesystem(path, receipt)), device: (await lstat(path)).dev };
}

/**
 * Stage matching registry/journal contents on independent bounded targets, then reconcile the
 * healthy current authority's entire obligation set. Extraction never replaces canonical state
 * or its lock. Interrupted extraction resumes only from its durable target ownership receipt.
 */
export function createRegistryRecoveryVerifier(input: {
  runtime: RegistryRecoveryRuntime;
  backup: {
    verify(receipt: RegistryBackupReceipt, authority: RegistryMaintenanceAuthority): Promise<void>;
    restore(
      receipt: RegistryBackupReceipt,
      target: { registryPath: string; journalPath: string },
      resume: RegistryRecoveryPreparation,
      authority: RegistryMaintenanceAuthority,
    ): Promise<void>;
  };
  consumers: Pick<RegistryJournalPorts, 'verifyConsumers' | 'collectConsumers'>;
  measure?: typeof measureRecoveryMount;
}): Pick<RegistryJournalPorts, 'prepareRegistryRecovery' | 'recoverRegistry'> {
  const measure = input.measure ?? measureRecoveryMount;
  const audit = async (authority: RegistryMaintenanceAuthority) => {
    const journal = authority.read();
    await input.runtime.assertStopped(authority);
    const observed = await input.runtime.audit(authority);
    const target = RegistryRecoveryPreparation.assert(observed.target);
    const [registry, staged, canonical] = await Promise.all([
      measure(target.registryPath, observed.registryIdentityReceipt),
      measure(target.stagedJournalPath, observed.stagedJournalIdentityReceipt),
      measure(target.canonicalJournalPath, observed.canonicalJournalIdentityReceipt),
    ]);
    if (
      new Set([
        registry.device,
        staged.device,
        canonical.device,
        (await lstat(journal.enrollment.registryPath)).dev,
      ]).size !== 4 ||
      new Set([
        registry.identity,
        staged.identity,
        canonical.identity,
        journal.enrollment.storageId,
      ]).size !== 4 ||
      registry.identity !== target.storageId ||
      staged.identity !== target.stagedJournalStorageId ||
      registry.maximumBytes !== target.maximumBytes ||
      staged.maximumBytes !== target.stagedJournalMaximumBytes ||
      canonical.maximumBytes !== journal.enrollment.journalMaximumBytes ||
      [target.registryPath, target.stagedJournalPath, target.canonicalJournalPath].some(
        (path) => !path.startsWith('/'),
      )
    )
      throw new Error('Recovery mounts are not independently verified configured storage');
    for (const path of [target.registryPath, target.stagedJournalPath, target.canonicalJournalPath])
      if ((await realpath(path)) !== path) throw new Error('Recovery path is not canonical');
    return { authority, target };
  };
  return {
    async prepareRegistryRecovery(journal, descriptor, authority) {
      if (
        authority.authorityDescriptor !== descriptor ||
        authority.read().revision !== journal.revision
      )
        throw new Error('Recovery verifier requires the current held authority session');
      // Proof: the backup-session recovery negative failed because the former snapshot adapter omitted durable attempt methods.
      const { target } = await audit(authority);
      const backup = journal.maintenanceEvidence?.backup;
      if (
        backup === null ||
        backup === undefined ||
        target.operationId !== journal.maintenance?.operationId ||
        target.snapshotId !== backup.snapshotId ||
        target.previousStorageId !== journal.enrollment.storageId ||
        target.previousRegistryPath !== journal.enrollment.registryPath
      )
        throw new Error('Configured recovery target differs from verified lineage');
      await input.backup.verify(backup, authority);
      if (
        (await readdir(target.registryPath)).length !== 0 ||
        (await readdir(target.stagedJournalPath)).length !== 0
      )
        throw new Error('First recovery requires empty verified targets');
      return target;
    },
    async recoverRegistry(journal, descriptor, authority): Promise<RegistryRecoveryReceipt> {
      if (
        authority.authorityDescriptor !== descriptor ||
        authority.read().revision !== journal.revision
      )
        throw new Error('Recovery verifier requires the current held authority session');
      const serialized = journal.maintenanceEvidence?.recovery;
      const backup = journal.maintenanceEvidence?.backup;
      if (
        serialized === null ||
        serialized === undefined ||
        backup === null ||
        backup === undefined
      )
        throw new Error('Missing durable recovery target ownership');
      const prepared = RegistryRecoveryPreparation.assert(JSON.parse(serialized));
      const { target } = await audit(authority);
      if (
        JSON.stringify({ ...target, preparedAt: prepared.preparedAt }) !== JSON.stringify(prepared)
      )
        throw new Error('Recovery target changed after preparation');
      await input.backup.restore(
        backup,
        { registryPath: target.registryPath, journalPath: target.stagedJournalPath },
        prepared,
        authority,
      );
      await audit(authority);
      const bytes = await readFile(join(target.stagedJournalPath, 'journal.json'));
      const decodedJournal: unknown = JSON.parse(bytes.toString('utf8'));
      const restored = parseRegistryCommandResponse({ state: decodedJournal }).state;
      const journalSha256 = createHash('sha256').update(bytes).digest('hex');
      if (
        journalSha256 !== backup.journalSha256 ||
        restored.revision !== backup.journalRevision ||
        restored.enrollment.storageId !== backup.storageId ||
        restored.enrollment.registryPath !== backup.registryPath
      )
        throw new Error('Staged journal does not match verified snapshot authority');
      const current = authority.read();
      const candidate = projectRegistryRecovery(current, target);
      const server = await input.runtime.open(authority);
      // Proof: legacy completion here loses the primary error in the actual restore caller test.
      const inventory = await completeRegistryOperation(
        async () => {
          const inventory = await collectRegistryInventory({
            journal: candidate,
            identity: {
              registryId: candidate.enrollment.registryId,
              storageId: target.storageId,
              node: target.node,
              pvcUid: target.pvcUid,
              mountIdentity: target.mountIdentity,
              distributionDigest: target.distributionDigest,
              binarySha256: target.binarySha256,
            },
            endpoint: server.endpoint,
            consumers: input.consumers,
          });
          await verifyRegistryPulls(inventory, server.endpoint);
          return inventory;
        },
        () => server.close(),
      );
      await input.runtime.assertStopped(authority);
      await input.runtime.verifyImages(authority, inventory);
      await input.runtime.assertStopped(authority);
      return {
        operationId: target.operationId,
        snapshotId: backup.snapshotId,
        previousStorageId: journal.enrollment.storageId,
        previousRegistryPath: journal.enrollment.registryPath,
        storageId: target.storageId,
        registryPath: target.registryPath,
        maximumBytes: target.maximumBytes,
        canonicalJournalPath: target.canonicalJournalPath,
        stagedJournalPath: target.stagedJournalPath,
        stagedJournalRevision: restored.revision,
        stagedJournalSha256: journalSha256,
        currentJournalRevision: authority.read().revision,
        censusSha256: inventory.binding.censusSha256,
        verifiedAt: new Date().toISOString(),
        handoff: 'offline-exclusion-and-current-obligation-reconciliation-required',
      };
    },
  };
}
