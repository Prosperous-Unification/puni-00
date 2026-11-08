import { readlink } from 'node:fs/promises';
import { hostname } from 'node:os';

import { dlopen, ptr } from 'bun:ffi';

import { admitRegistryBackup } from './registry-backup-admission';
import {
  readRegistryBackupGuardian,
  RegistryBackupAction,
  requireRegistryBackupAttempt,
} from './registry-backup-attempt';
import { requireRegistryBackupLockReservation } from './registry-backup-locks';
import { requireRegistryBackupNamespace } from './registry-backup-namespace';
import {
  type OpenRegistryBackupVersions,
  openRegistryBackupVersions,
} from './registry-backup-provider';
import {
  executeRegistryBackupAction,
  type RegistryBackupAdmissionPort,
} from './registry-maintenance-backup';
import { superviseRegistryMaintenance } from './registry-maintenance-control';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import { readRegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { installMaintenanceReaper } from './registry-maintenance-process';

/**
 * Fixed internal root worker, launched only by the pinned unshare UTS command. One inherited
 * authority FD3, one kept-open control pipe, no argv/config/environment selectors. Provider
 * credentials remain root-only. The guardian supervises the whole existing group; the worker
 * independently reacts to its pipe EOF and deadline, and catches SIGINT until restic is reaped.
 */
export async function runRegistryBackupWorkerMain(
  admit: RegistryBackupAdmissionPort,
  openVersions: OpenRegistryBackupVersions = openRegistryBackupVersions,
): Promise<string> {
  if (process.argv.length !== 2 || process.getuid?.() !== 0 || process.getgid?.() !== 0)
    throw new Error('Backup worker requires its fixed root installation');
  const installed = await readRegistryMaintenanceInstallation();
  installMaintenanceReaper();
  const interrupted = new AbortController();
  const interrupt = () => {
    interrupted.abort(new Error('Fixed backup worker interrupted'));
  };
  process.on('SIGINT', interrupt);
  try {
    const receipt = await superviseRegistryMaintenance({
      directory: installed.journalPath,
      uid: 59001,
      descriptor: 3,
      input: Bun.stdin.stream(),
      deadlineMs: 3600000,
      interrupt: interrupted.signal,
      execute: async (request, signal, journal) => {
        const action =
          request.action === 'backup-reconcile'
            ? request.action
            : RegistryBackupAction.assert(request.action);
        const guardian = await readRegistryBackupGuardian(process.ppid);
        const attempt = journal.maintenanceEvidence?.backupAttempts.find(
          (attempt) => attempt.guardian.pid === guardian.pid,
        );
        if (action === 'backup-reconcile') {
          requireRegistryBackupLockReservation(
            journal.maintenanceEvidence?.backupReconciliation,
            journal.maintenanceEvidence?.backupAttempts ?? [],
            request.operationId,
            installed.backupConfiguration.sha256,
            journal.revision,
          );
        } else {
          if (attempt === undefined) throw new Error('Fixed worker lacks its durable guardian');
          requireRegistryBackupAttempt(attempt, {
            ...request,
            action,
            guardian,
            registryId: installed.registryId,
            configurationSha256: installed.backupConfiguration.sha256,
            journalRevision: journal.revision,
          });
        }
        const [self, parent] = await Promise.all([
          readlink('/proc/self/ns/uts'),
          readlink(`/proc/${String(guardian.pid)}/ns/uts`),
        ]);
        requireRegistryBackupNamespace(self, parent);
        signal.throwIfAborted();
        if (action !== 'backup-reconcile') {
          if (attempt === undefined) throw new Error('Lost backup nonce');
          const native = dlopen('libc.so.6', {
            sethostname: { args: ['ptr', 'usize'], returns: 'i32' },
          });
          try {
            const name = Buffer.from(attempt.utsHostname);
            if (
              native.symbols.sethostname(ptr(name), name.length) !== 0 ||
              hostname() !== attempt.utsHostname
            )
              throw new Error('Cannot bind private backup hostname to durable attempt');
          } finally {
            native.close();
          }
        }
        signal.throwIfAborted();
        return executeRegistryBackupAction({
          action,
          installed,
          journal,
          descriptor: 3,
          signal,
          admit,
          lifetime: 'worker',
          openVersions,
        });
      },
    });
    return receipt;
  } finally {
    process.off('SIGINT', interrupt);
    // FD3 is closed by process exit, never explicitly unlocked; guardian still retains its copy.
  }
}

if (import.meta.main) {
  try {
    console.log(
      JSON.stringify({
        kind: 'complete',
        receipt: await runRegistryBackupWorkerMain(admitRegistryBackup),
      }),
    );
  } catch (cause) {
    console.log(
      JSON.stringify({
        kind: 'failed',
        code: cause instanceof RegistryMaintenanceRefusal ? cause.code : 'effect-failed',
      }),
    );
    process.exitCode = 1;
  }
}
