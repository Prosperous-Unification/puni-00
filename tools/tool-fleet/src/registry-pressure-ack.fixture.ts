import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';

import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

/** Read only a fixed current fixture instance/request through its nonblocking bounded descriptor boundary. Callers establish their private topology before any read; metadata belongs to UID/GID59001 even when PID1 observes it. The removable prior ACK additionally requires the exact named device/inode before any bytes return. Missing/unreadable records and required close failures propagate unchanged. */
export function readRegistryPressureRecord(
  path:
    | '/var/lib/puni-registry/registry/contents/.authority-instance'
    | '/var/lib/puni-registry/journal/contents/readonly.request',
): Promise<string>;
export function readRegistryPressureRecord(
  path: '/var/lib/puni-registry/registry/contents/.authority-readonly',
  expected: { dev: number; ino: number },
): Promise<string>;
export async function readRegistryPressureRecord(
  path:
    | '/var/lib/puni-registry/registry/contents/.authority-instance'
    | '/var/lib/puni-registry/registry/contents/.authority-readonly'
    | '/var/lib/puni-registry/journal/contents/readonly.request',
  expected?: { dev: number; ino: number },
) {
  // Proof (modeled open): removing NOFOLLOW reaches ACK writes through either instance/request symlink.
  // Proof (modeled FIFO): omitting NONBLOCK needs the independent 50ms writer rescue before metadata refusal.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let failure: { cause: unknown } | undefined;
  try {
    const metadata = await file.stat();
    // Proof (modeled caller): metadata removal reads invalid records before later size refusal, or accepts their bytes.
    if (
      !metadata.isFile() ||
      metadata.uid !== 59001 ||
      metadata.gid !== 59001 ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o7777) !== 0o600 ||
      metadata.size < 1 ||
      metadata.size > 256
    )
      throw new Error('Untrusted current ACK record metadata');
    // Proof (coupled modeled reader/epoch): removing identity binding permits unlink of a different named inode/device; missing identity also becomes accepted.
    if (
      path === '/var/lib/puni-registry/registry/contents/.authority-readonly' &&
      (metadata.dev !== expected?.dev || metadata.ino !== expected.ino)
    )
      throw new Error('Prior ACK descriptor differs from named removal target');
    const bytes = Buffer.alloc(257);
    const consumed = await file.read(bytes, 0, bytes.length, 0);
    // Proof (modeled caller): removal accepts valid record bytes despite changed descriptor size.
    if (consumed.bytesRead !== metadata.size)
      throw new Error('Current ACK record changed or exceeds bound');
    return bytes.subarray(0, consumed.bytesRead).toString('utf8');
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    // Proof (modeled caller): removing close leaves record descriptors open; injected read/close failures preserve both causes.
    try {
      await file.close();
    } catch (cause) {
      if (failure !== undefined)
        // Boundary: required record close must retain both the original read failure and close failure.
        // eslint-disable-next-line no-unsafe-finally
        throw new AggregateError([failure.cause, cause], 'ACK record and close failed', {
          // Boundary: the caught close failure remains in errors while the original failure stays primary.
          // eslint-disable-next-line preserve-caught-error
          cause: failure.cause,
        });
      // Boundary: a close-only failure cannot become a successful record read.
      // eslint-disable-next-line no-unsafe-finally
      throw cause;
    }
  }
}

/**
 * Attempt a fresh allocation for the current fixture-writer instance and actual authority
 * revocation request as UID59001. The parent separately binds this fresh instance to its
 * owned writer lifetime; a closed publication guard's instance is never reused. This fixed
 * probe exercises filesystem allocation, not the production startup shell's ACK path.
 * Existing ACK files and all errors except actual Error/ENOSPC refuse. A failed allocation
 * is left in place for independent observation and outer teardown, never silently retried.
 */
export async function proveRegistryPressureAcknowledgement(
  installed: RegistryMaintenanceInstallation,
) {
  // Proof (modeled caller): removing admission accepts wrong UID/GID, PID1 selector and store path.
  if (
    process.getuid?.() !== 59001 ||
    process.getgid?.() !== 59001 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents'
  )
    throw new Error('ACK allocation requires exact fixture owner and store');

  const instance = await readRegistryPressureRecord(
    '/var/lib/puni-registry/registry/contents/.authority-instance',
  );
  const request = await readRegistryPressureRecord(
    '/var/lib/puni-registry/journal/contents/readonly.request',
  );
  const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const current = new RegExp('^(' + uuid + ') (' + uuid + ')\\n$').exec(instance);
  const revocation = new RegExp('^(' + uuid + ') (' + uuid + ') (' + uuid + ')\\n$').exec(request);
  // Proof (modeled caller): removal accepts malformed instance/request/boot and mismatched current instance or boot.
  if (
    current === null ||
    revocation === null ||
    !new RegExp('^' + uuid + '\\n$').test(boot) ||
    revocation[2] !== current[1] ||
    revocation[3] !== current[2] ||
    boot !== current[2] + '\n'
  )
    throw new Error('ACK request is not bound to the current fixture instance and boot');
  const receipt = {
    requestSha256: createHash('sha256').update(request).digest('hex'),
    instanceSha256: createHash('sha256').update(instance).digest('hex'),
    allocation: 'ENOSPC' as const,
  };
  let acknowledgement: Awaited<ReturnType<typeof open>>;
  try {
    // Proof (modeled open): removing O_EXCL accepts an existing ACK as a fresh allocation witness.
    acknowledgement = await open(
      installed.ordinary.path + '/.authority-readonly',
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (cause) {
    // Proof (modeled caller): removing open errno classification reports EEXIST/EACCES as exhaustion.
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
    return { ...receipt, stage: 'open' as const };
  }
  let failure: { cause: unknown } | undefined;
  try {
    let exhausted = false;
    try {
      await acknowledgement.writeFile(request);
    } catch (cause) {
      // Proof (modeled caller): removing write errno classification reports unknown and non-Error failures as exhaustion.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
      exhausted = true;
    }
    // Proof (modeled caller): removal labels a successful full ACK write as ENOSPC.
    if (!exhausted) throw new Error('Current fixture ACK allocation unexpectedly succeeded');
    return { ...receipt, stage: 'write' as const };
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    // Proof (modeled caller): removing close leaves the ACK descriptor open; aggregate removal loses its original write failure.
    try {
      await acknowledgement.close();
    } catch (cause) {
      if (failure !== undefined)
        // Boundary: required ACK close must retain both the original write failure and close failure.
        // eslint-disable-next-line no-unsafe-finally
        throw new AggregateError([failure.cause, cause], 'ACK allocation and close failed', {
          // Boundary: the caught close failure remains in errors while the original failure stays primary.
          // eslint-disable-next-line preserve-caught-error
          cause: failure.cause,
        });
      // Boundary: a close-only failure cannot become a successful allocation witness.
      // eslint-disable-next-line no-unsafe-finally
      throw cause;
    }
  }
}
