import { readFile, readlink } from 'node:fs/promises';

import { RegistryBackupAttempt } from './registry-backup-attempt';

/**
 * Local origin exclusion is valid only under a newly acquired SAME canonical authority, in the
 * exact recorded machine/boot/PID namespace with matching mounted proc. The previous worker and
 * every restic child retain that lock description through death; acquisition is an additional
 * lifetime boundary, never a substitute for these fresh process checks. Any present PID (even
 * reused/zombie), permission failure or different origin refuses. Independent-host recovery must
 * supply a separately trusted restart-excluding origin fence; network failure is never death.
 */
export async function proveRegistryBackupOriginStopped(
  attempt: RegistryBackupAttempt,
  pid: number,
  read: (path: string) => Promise<string> = (path) =>
    ['/proc/self', '/proc/self/ns/pid'].includes(path) ? readlink(path) : readFile(path, 'utf8'),
): Promise<void> {
  RegistryBackupAttempt.assert(attempt);
  // Proof (modeled reads): input omission falsely proves eight invalid lock PIDs stopped in registry-backup-origin.test.ts.
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647)
    throw new Error('Invalid backup lock process identity');
  const origin = async () => {
    const [machine, boot, namespace, procSelf] = await Promise.all([
      read('/etc/machine-id'),
      read('/proc/sys/kernel/random/boot_id'),
      read('/proc/self/ns/pid'),
      read('/proc/self'),
    ]);
    // Proof: remote/boot/namespace/ancestor-proc and malformed/missing identity negatives passed the RED no-op.
    if (
      ![attempt.guardian.machineId, attempt.guardian.machineId + '\n'].includes(machine) ||
      ![attempt.guardian.bootId, attempt.guardian.bootId + '\n'].includes(boot) ||
      namespace !== attempt.guardian.pidNamespace ||
      procSelf !== String(process.pid)
    )
      throw new Error('Backup origin cannot be proved stopped from this local proc view');
  };
  const absent = async (selected: number) => {
    try {
      await read(`/proc/${String(selected)}/stat`);
    } catch (cause) {
      // Only kernel absence of this exact process is modeled; EACCES/IO/malformed roots remain refusal.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
      throw cause;
    }
    throw new Error('Backup guardian or lock process is still present');
  };
  for (let observation = 0; observation < 2; observation++) {
    await origin();
    // Proof: live/unreadable guardian and lock PID plus PID/origin races all pass without these repeated observations.
    await absent(attempt.guardian.pid);
    await absent(pid);
  }
  // Proof (modeled reads): final-read omission accepts six third-epoch origin/I/O faults and skips the third epoch in registry-backup-origin.test.ts.
  await origin();
}
