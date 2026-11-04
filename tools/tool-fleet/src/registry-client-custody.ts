import { lstat } from 'node:fs/promises';

import { readRegistryBackupGuardian } from './registry-backup-attempt';
import { admitBuilderScratch, measureFilesystem } from './registry-capacity';
import {
  createRegistryClientAttempt,
  describeRegistryClientAttempt,
  type RegistryClientAttempt,
} from './registry-client-attempt';
import { openRegistryClientAttemptStore } from './registry-client-attempt-store';
import type { RegistryClientPullPlan } from './registry-client-plan';
import type { RegistryMaintenanceJournal } from './registry-journal';
import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryClientInstallation,
} from './registry-maintenance-installation';
import { RegistryBackupReceipt } from './registry-maintenance-state';
import { completeRegistryOperation } from './registry-operation-completion';

/**
 * Serialize one root client's entire scratch/scope custody under the inherited authority.
 * A previous matching operation may be reconciled only after its exact scope is confirmed dead;
 * new execution requires a freshly minted absent scope and fsynced ownership first. Success must
 * leave no workspaces; failed execution recovers only audited owned jobs. Uncertain scope or
 * cleanup preserves the durable record and every original failure for the next fenced retry.
 */
export async function runRegistryClientAttempt<T>(input: {
  store: Awaited<ReturnType<typeof openRegistryClientAttemptStore>>;
  owner: Omit<RegistryClientAttempt, 'id' | 'unit' | 'pool'>;
  assertInactive: (unit: string) => Promise<void>;
  admit: () => Promise<void>;
  execute: (attempt: RegistryClientAttempt) => Promise<T>;
}): Promise<T> {
  const attempt = createRegistryClientAttempt({ ...input.owner, pool: input.store.identity });
  const prior = await input.store.read();
  if (prior !== null) {
    // Proof: custody-owner removal allows another operation to adopt pending custody in registry-client-attempt-store.fixture.ts.
    if (
      prior.operationId !== attempt.operationId ||
      prior.registryId !== attempt.registryId ||
      prior.snapshotId !== attempt.snapshotId ||
      prior.scratchStorageId !== attempt.scratchStorageId ||
      prior.guardian.machineId !== attempt.guardian.machineId
    )
      throw new Error('Interrupted client attempt belongs to another operation or scratch owner');
    await input.store.recover(prior, input.assertInactive);
  }
  await input.assertInactive(attempt.unit);
  // Proof: custody-admission removal launches despite metadata reserve refusal in registry-client-attempt-store.fixture.ts.
  await input.admit();
  // Proof: custody-publication removal enters execution without durable ownership in registry-client-attempt-store.fixture.ts.
  await input.store.publish(attempt);
  let verified = false;
  return completeRegistryOperation(
    async () => {
      const completion = await input.execute(attempt);
      verified = true;
      return completion;
    },
    async () => {
      if (verified) await input.store.finish(attempt, input.assertInactive);
      else await input.store.recover(attempt, input.assertInactive);
    },
  );
}

/** The fixed outside launcher supplies its actual plan and fresh stopped/target audit. Reconcile old custody before new admission, then reserve bounded record allocation without ever writing a regular host-root fallback. */
export async function runRegistryClientCustody(input: {
  installed: RegistryMaintenanceInstallation;
  journal: RegistryMaintenanceJournal;
  request: RegistryMaintenanceHostRequest;
  scope: 'current' | 'recovery';
  plan: RegistryClientPullPlan;
  allocationUnitBytes: number;
  signal: AbortSignal;
  beforeLaunch: () => Promise<void>;
  assertInactive: (unit: string) => Promise<void>;
  execute: (attempt: RegistryClientAttempt) => Promise<string>;
}): Promise<string> {
  const client = requireRegistryClientInstallation(input.installed);
  const backup = RegistryBackupReceipt.assert(input.journal.maintenanceEvidence?.backup);
  const guardian = await readRegistryBackupGuardian(process.pid);
  // Proof: custody-machine removal launches under a foreign guardian machine in registry-client-custody.test.ts.
  if (guardian.machineId !== input.installed.machineId)
    throw new Error('Client guardian differs from installed machine');
  const facts = describeRegistryClientAttempt({
    plan: input.plan,
    owner: {
      operationId: input.request.operationId,
      registryId: input.installed.registryId,
      snapshotId: backup.snapshotId,
      scope: input.scope,
    },
    token: input.request.token,
    client,
  });
  const store = await openRegistryClientAttemptStore(client.scratch.path);
  return completeRegistryOperation(
    () =>
      runRegistryClientAttempt({
        store,
        owner: { ...facts, guardian, createdAt: new Date().toISOString() },
        assertInactive: input.assertInactive,
        admit: async () => {
          // Proof: custody-barrier removal launches after fresh stopped/target audit failure in registry-client-custody.test.ts.
          await input.beforeLaunch();
          input.signal.throwIfAborted();
          const scratch = await admitBuilderScratch({
            path: client.scratch.path,
            receiptPath: client.scratch.receiptPath,
            excludedPaths: [
              input.installed.journalPath,
              input.installed.ordinary.path,
              ...(input.installed.recovery.state === 'enrolled'
                ? [input.installed.recovery.path, input.installed.recovery.stagedJournalPath]
                : []),
            ],
            envelope: { bytes: input.allocationUnitBytes * 32, inodes: 4 },
          });
          const pool = await lstat(client.scratch.path, { bigint: true });
          // Proof: custody-scratch removal accepts changed UUID, bounds or held pool identity in registry-client-custody.test.ts.
          if (
            scratch.identity !== client.scratch.storageId ||
            scratch.maximumBytes !== client.scratch.maximumBytes ||
            scratch.totalInodes > client.scratch.maximumInodes ||
            pool.dev.toString() !== store.identity.device ||
            pool.ino.toString() !== store.identity.inode
          )
            throw new Error('Client attempt scratch differs from its fixed profile and held pool');
          // Proof: custody-root-reserve removal launches below20GiB free root in registry-client-custody.test.ts.
          if ((await measureFilesystem('/')).availableBytes < 20 * 1024 ** 3)
            throw new Error('Client attempt host root reserve is exhausted');
          // Proof: custody-late-cancel removal launches after cancellation during the final root measurement in registry-client-custody.test.ts.
          input.signal.throwIfAborted();
        },
        execute: input.execute,
      }),
    () => store.close(),
  );
}
