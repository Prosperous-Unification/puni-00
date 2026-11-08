import { readdir, readFile } from 'node:fs/promises';

import { selectRegistryAuthorityStorage } from './registry-authority-host';
import { measureVerifiedFilesystem } from './registry-capacity';
import {
  describeRegistryClientAttempt,
  requireRegistryClientAttempt,
  requireRegistryClientAttemptContext,
} from './registry-client-attempt';
import { openRegistryClientAttemptStore } from './registry-client-attempt-store';
import {
  createRegistryClientCompletion,
  type RegistryClientCompletion,
} from './registry-client-completion';
import { planRegistryClientPulls } from './registry-client-plan';
import { assertRegistryClientWorker, createRegistryClientExecutor } from './registry-client-pull';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryClientInstallation,
  requireRegistryRecoveryInstallation,
} from './registry-maintenance-installation';
import { runRegistryMaintenanceServer } from './registry-maintenance-server';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { completeRegistryOperation } from './registry-operation-completion';

export interface RegistryClientVerificationInput {
  readonly installed: RegistryMaintenanceInstallation;
  readonly journal: RegistryMaintenanceJournal;
  readonly scope: 'current' | 'recovery';
  readonly descriptor: 3;
  readonly scratch: {
    readonly path: string;
    readonly receiptPath: string;
    readonly storageId: string;
    readonly maximumBytes: number;
    readonly maximumInodes: number;
  };
}

/**
 * Internal fixed-root action body inside the fresh bounded namespace. Its caller authenticates
 * canonical ownership and stopped-writer/controller exclusion before bootstrap; no request JSON
 * selects paths, profiles or executables. Plan all stored platforms, own a fresh readonly server
 * and actual clients, then reap server/authentication, rehash the physical plan and revalidate
 * empty scratch before producing a nonsecret completion. Only the exact owned successful-stop
 * sentinel is controlled; cancellation, changed content or any cleanup error prevents completion.
 * The outside root launcher must still verify namespace/scope teardown before forwarding it.
 */
export async function verifyRegistryClientImages(
  input: RegistryClientVerificationInput,
  signal: AbortSignal,
): Promise<RegistryClientCompletion> {
  await assertRegistryClientWorker(signal);
  const { installed, journal } = input;
  const owned = journal.maintenance,
    evidence = journal.maintenanceEvidence;
  if (
    owned === null ||
    evidence?.operationId !== owned.operationId ||
    evidence.backup === null ||
    !journal.fenced
  )
    throw new Error('Client verification requires canonical fenced snapshot ownership');
  const backup = evidence.backup;
  const storage =
    input.scope === 'current'
      ? selectRegistryAuthorityStorage(journal.enrollment, installed)
      : requireRegistryRecoveryInstallation(installed);
  const profile = {
    authority: { directory: installed.journalPath, descriptor: input.descriptor },
    registryPath: storage.path,
    otherStores: [
      installed.ordinary.path,
      ...(installed.recovery.state === 'enrolled'
        ? [installed.recovery.path, installed.recovery.stagedJournalPath]
        : []),
    ],
    scratch: input.scratch,
    token: owned.token,
  };
  const pull = await createRegistryClientExecutor(profile, signal);
  const attemptStore = await openRegistryClientAttemptStore(input.scratch.path);
  return completeRegistryOperation(
    async () => {
      const attempt = await attemptStore.read();
      if (attempt === null) throw new Error('Client worker has no durable scratch/scope ownership');
      const empty = async () => {
        await pull.admit({ bytes: 1, inodes: 1 }, signal);
        // Proof: worker-pool-call removal starts the readonly server with unresolved scratch in registry-client-verification.test.ts.
        await attemptStore.assertEmpty(attempt);
      };
      await empty();
      const scratch = await measureVerifiedFilesystem(
        input.scratch.path,
        input.scratch.receiptPath,
      );
      const source: RegistryMaintenanceJournal = {
        ...journal,
        enrollment: {
          ...journal.enrollment,
          storageId: storage.storageId,
          registryPath: storage.path,
          maximumBytes: storage.maximumBytes,
        },
      };
      const plan = await planRegistryClientPulls(source, scratch.allocationUnitBytes, signal);
      // Proof: worker-facts-call removal starts the readonly server with changed plan/profile/token in registry-client-verification.test.ts.
      requireRegistryClientAttempt(
        attempt,
        describeRegistryClientAttempt({
          plan,
          owner: {
            operationId: owned.operationId,
            registryId: installed.registryId,
            snapshotId: backup.snapshotId,
            scope: input.scope,
          },
          token: owned.token,
          client: requireRegistryClientInstallation(installed),
        }),
      );
      const [cgroup, bootId, machineId] = await Promise.all([
        readFile('/proc/self/cgroup', 'utf8'),
        readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
        readFile('/etc/machine-id', 'utf8'),
      ]);
      // Proof: worker-context-call removal starts the readonly server in a foreign or future context in registry-client-verification.test.ts.
      requireRegistryClientAttemptContext(attempt, {
        cgroup,
        bootId: bootId.trim(),
        machineId: machineId.trim(),
        now: new Date().toISOString(),
      });

      const stop = new AbortController();
      const success = new Error('Owned client verification server completion');
      const coverage: { verified: boolean } = { verified: false };
      try {
        await runRegistryMaintenanceServer({
          installed,
          storage,
          action: 'readonly',
          token: owned.token,
          descriptor: input.descriptor,
          signal: AbortSignal.any([signal, stop.signal]),
          ready: async () => {
            for (const request of plan.pulls) await pull(request, signal);
            signal.throwIfAborted();
            coverage.verified = true;
            stop.abort(success);
          },
        });
      } catch (cause) {
        if (cause !== success || !coverage.verified) throw cause;
      }
      signal.throwIfAborted();
      if (!coverage.verified)
        throw new Error('Client verification server ended without full coverage');
      const current = await planRegistryClientPulls(source, scratch.allocationUnitBytes, signal);
      if (JSON.stringify(current) !== JSON.stringify(plan))
        throw new Error('Physical client plan changed during actual pulls');
      await empty();
      if ((await readdir('/run/puni-registry-maintenance')).length !== 0)
        throw new Error('Client verification authentication cleanup is incomplete');
      signal.throwIfAborted();
      return createRegistryClientCompletion(
        plan,
        {
          operationId: owned.operationId,
          registryId: installed.registryId,
          snapshotId: backup.snapshotId,
          scope: input.scope,
        },
        new Date().toISOString(),
      );
    },
    () => attemptStore.close(),
  );
}
