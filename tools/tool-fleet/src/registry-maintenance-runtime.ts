import { statfs } from 'node:fs/promises';

import { type } from 'arktype';

import { RegistryBackupAction } from './registry-backup-attempt';
import type { RegistryBackupPreparation, RegistryBackupSource } from './registry-backup-store';
import { accountFilesystem } from './registry-capacity';
import { requireRegistryClientInventory } from './registry-client-inventory';
import { planRegistryClientPulls } from './registry-client-plan';
import type { RegistryInventory, RegistryInventoryIdentity } from './registry-inventory';
import type {
  RegistryMaintenanceAuthority,
  RegistryMaintenanceRuntime,
} from './registry-maintenance';
import { connectRegistryMaintenanceHost } from './registry-maintenance-host';
import type { RegistryRecoveryRuntime } from './registry-maintenance-recovery';
import { RegistryBackupReceipt, RegistryRecoveryPreparation } from './registry-maintenance-state';
import { completeRegistryOperation } from './registry-operation-completion';

const Identity = type({
  registryId: 'string > 0',
  storageId: 'string > 0',
  node: 'string > 0',
  pvcUid: 'string > 0',
  mountIdentity: 'string > 0',
  distributionDigest: /^sha256:[a-f0-9]{64}$/,
  binarySha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});

/** Thin same-session client: fixed root actions own every observation/effect, while only the caller retains the operation token used for HTTP authentication. */
export function createRegistryMaintenanceRuntime(): RegistryMaintenanceRuntime & {
  backup: {
    prepare(
      source: RegistryBackupPreparation,
      authority: RegistryMaintenanceAuthority,
    ): Promise<void>;
    snapshot(
      source: RegistryBackupSource,
      authority: RegistryMaintenanceAuthority,
    ): Promise<RegistryBackupReceipt>;
    verify(receipt: RegistryBackupReceipt, authority: RegistryMaintenanceAuthority): Promise<void>;
    restore(
      receipt: RegistryBackupReceipt,
      target: { registryPath: string; journalPath: string },
      resume: RegistryRecoveryPreparation,
      authority: RegistryMaintenanceAuthority,
    ): Promise<void>;
  };
  recovery: RegistryRecoveryRuntime;
  assertDesired: (authority: RegistryMaintenanceAuthority) => Promise<void>;
} {
  const verifyImages = async (
    authority: RegistryMaintenanceAuthority,
    inventory: RegistryInventory,
    action: 'verify-images' | 'verify-recovery-images',
  ) => {
    const counters = accountFilesystem(
      await statfs('/var/lib/puni-registry/pulls/contents', { bigint: true }),
    );
    const plan = await planRegistryClientPulls(
      inventory.journal,
      counters.allocationUnitBytes,
      AbortSignal.timeout(3600000),
    );
    // Proof: removing this call reaches the mocked root transport on changed physical census or retained repository in runtime negatives.
    requireRegistryClientInventory(plan, inventory);
    const connection = await connectRegistryMaintenanceHost(authority, action, plan);
    await connection.close();
  };
  const call = async (
    authority: RegistryMaintenanceAuthority,
    action: Parameters<typeof connectRegistryMaintenanceHost>[1],
  ) => {
    if (
      RegistryBackupAction.allows(action) &&
      authority
        .read()
        .maintenanceEvidence?.backupAttempts.some((attempt) => attempt.state === 'prepared')
    )
      await call(authority, 'backup-reconcile');
    const connection = await connectRegistryMaintenanceHost(authority, action);
    await connection.close();
    return connection.receipt;
  };
  const verified = async (
    authority: RegistryMaintenanceAuthority,
    action: Parameters<typeof connectRegistryMaintenanceHost>[1],
  ) => {
    if ((await call(authority, action)) !== 'verified')
      throw new Error('Missing fixed host verification receipt');
  };
  const open = async (
    authority: RegistryMaintenanceAuthority,
    action: 'serve-readonly' | 'serve-deletion' | 'serve-recovery',
  ) => {
    const connection = await connectRegistryMaintenanceHost(authority, action);
    try {
      const endpoint = type({
        url: "'http://127.0.0.1:5051'",
        authentication: "'operation-token'",
        '+': 'reject',
      }).assert(JSON.parse(connection.receipt));
      const owned = authority.read().maintenance;
      if (owned === null) throw new Error('Lost maintenance HTTP ownership');
      return {
        endpoint: { url: endpoint.url, username: 'maintenance', password: owned.token },
        close: connection.close,
      };
    } catch (cause) {
      // Proof: legacy completion here loses the primary error for all three actual serve-action callers.
      return completeRegistryOperation(
        () => {
          throw cause;
        },
        () => connection.close(),
      );
    }
  };
  return {
    inspect: (authority) => call(authority, 'inspect'),
    fence: (authority) => call(authority, 'fence'),
    assertStopped: (authority) => verified(authority, 'assert-stopped'),
    identify: async (authority): Promise<RegistryInventoryIdentity> =>
      Identity.assert(JSON.parse(await call(authority, 'identify'))),
    open: (authority, mode) =>
      open(authority, mode === 'readonly' ? 'serve-readonly' : 'serve-deletion'),
    discardUploads: async (authority) =>
      type(/^[a-f0-9]{64}$/).assert(await call(authority, 'discard-uploads')),
    collect: (authority) => verified(authority, 'collect'),
    verifyImages: (authority, inventory) => verifyImages(authority, inventory, 'verify-images'),
    restoreService: (authority) => verified(authority, 'restore-service'),
    assertDesired: (authority) => verified(authority, 'assert-desired'),
    backup: {
      prepare: async (source, authority) => {
        const current = authority.read();
        if (
          source.operationId !== current.maintenance?.operationId ||
          source.registryId !== current.enrollment.registryId ||
          source.storageId !== current.enrollment.storageId ||
          source.registryPath !== current.enrollment.registryPath ||
          source.maximumBytes !== current.enrollment.maximumBytes ||
          source.journalMaximumBytes !== current.enrollment.journalMaximumBytes ||
          source.journalPath !== '/var/lib/puni-registry/journal/contents'
        )
          throw new Error('Backup request differs from canonical source ownership');
        await verified(authority, 'backup-preflight');
      },
      snapshot: async (source, authority) => {
        const current = authority.read();
        if (
          source.journalRevision !== current.revision ||
          source.censusSha256 !== current.maintenanceEvidence?.backupCensusSha256
        )
          throw new Error('Snapshot request differs from durable census revision');
        const receipt = RegistryBackupReceipt.assert(
          JSON.parse(await call(authority, 'backup-snapshot')),
        );
        const prepared = authority.read().maintenanceEvidence?.backupAttempts.at(-1);
        if (
          prepared?.action !== 'backup-snapshot' ||
          prepared.operationId !== source.operationId ||
          prepared.state !== 'settled' ||
          prepared.journalRevision !== source.journalRevision + 1 ||
          receipt.registryId !== source.registryId ||
          receipt.storageId !== source.storageId ||
          receipt.registryPath !== source.registryPath ||
          receipt.journalPath !== source.journalPath ||
          receipt.journalRevision !== prepared.journalRevision ||
          receipt.censusSha256 !== source.censusSha256
        )
          throw new Error('Root snapshot receipt differs from canonical source');
        return receipt;
      },
      verify: async (receipt, authority) => {
        if (
          JSON.stringify(receipt) !== JSON.stringify(authority.read().maintenanceEvidence?.backup)
        )
          throw new Error('Cannot verify a request-selected backup');
        await verified(authority, 'backup-verify');
      },
      restore: async (receipt, target, resume, authority) => {
        const evidence = authority.read().maintenanceEvidence;
        if (
          JSON.stringify(receipt) !== JSON.stringify(evidence?.backup) ||
          JSON.stringify(resume) !== evidence?.recovery ||
          target.registryPath !== resume.registryPath ||
          target.journalPath !== resume.stagedJournalPath
        )
          throw new Error('Cannot restore request-selected snapshot or target');
        await verified(authority, 'backup-restore');
      },
    },
    recovery: {
      audit: async (authority) =>
        type({
          target: RegistryRecoveryPreparation,
          registryIdentityReceipt: 'string > 0',
          stagedJournalIdentityReceipt: 'string > 0',
          canonicalJournalIdentityReceipt: 'string > 0',
          '+': 'reject',
        }).assert(JSON.parse(await call(authority, 'verify-recovery-target'))),
      assertStopped: (authority) => verified(authority, 'assert-stopped'),
      open: (authority) => open(authority, 'serve-recovery'),
      verifyImages: (authority, inventory) =>
        verifyImages(authority, inventory, 'verify-recovery-images'),
    },
  };
}
