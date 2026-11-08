import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, readFile, unlink } from 'node:fs/promises';

import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { readRegistryPressureRecord } from './registry-pressure-ack.fixture';
import type { startRegistryPressureWriter } from './registry-pressure-writer.fixture';

/**
 * Rotate only the disposable fixture's existing instance before filling its filesystem, after
 * the publication guard has closed. The caller owns that ordering and the captured new writer.
 * An old ACK may legitimately be absent or name an older initialization instance. Present ACKs
 * require bounded owned records and stable path identity before unlink; their observed hash is
 * retained. This is explicit pre-fill cleanup, never pressure release or an ACK under ENOSPC.
 * The fresh instance binds the live direct writer before arming. Any failure leaves cleanup of
 * that writer to its owner; this helper neither signals it nor removes the volume filler.
 */
export async function prepareRegistryPressureEpoch(
  installed: RegistryMaintenanceInstallation,
  writer: Awaited<ReturnType<typeof startRegistryPressureWriter>>,
) {
  // Proof (modeled pre-fill): omission accepts wrong UID/PID/selector/store and performs fixed file effects.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents'
  )
    throw new Error('Pressure epoch requires fixed private PID1');
  const live = await writer.assertLive();
  // Proof (modeled pre-fill): omission accepts a captured writer whose observed PID differs before rotation.
  if (live.pid !== writer.pid || live.startTicks !== writer.startTicks)
    throw new Error('Pressure epoch writer differs before rotation');
  const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  // Proof (modeled pre-fill): omission opens and closes the descriptor before the later old-record check still refuses malformed boot.
  if (!new RegExp('^' + uuid + '\\n$').test(boot))
    throw new Error('Pressure epoch boot is malformed');
  const path = '/var/lib/puni-registry/registry/contents/.authority-instance';
  const acknowledgement = '/var/lib/puni-registry/registry/contents/.authority-readonly';
  // Proof (modeled pre-fill): omission accepts the modeled instance symlink instead of the open refusal.
  const file = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let failure: { cause: unknown } | undefined;
  try {
    const original = await file.stat();
    // Proof (modeled pre-fill): compound omission accepts wrong UID/GID/type/link count/mode; size also has later record reconciliation.
    if (
      !original.isFile() ||
      original.uid !== 59001 ||
      original.gid !== 59001 ||
      original.nlink !== 1 ||
      (original.mode & 0o7777) !== 0o600 ||
      original.size !== 74
    )
      throw new Error('Pressure epoch instance metadata differs');
    const bytes = Buffer.alloc(75);
    const read = await file.read(bytes, 0, bytes.length, 0);
    const priorInstance = bytes.subarray(0, read.bytesRead).toString('utf8');
    // Proof (modeled pre-fill): omission accepts malformed, short-read and prior-boot mismatch records.
    if (
      read.bytesRead !== original.size ||
      !new RegExp('^' + uuid + ' ' + uuid + '\\n$').test(priorInstance) ||
      priorInstance.slice(37) !== boot
    )
      throw new Error('Pressure epoch prior instance is malformed or stale');
    const named = await lstat(path);
    // Proof (modeled pre-fill): omission writes through the original descriptor before the final path check still refuses replacement.
    if (named.dev !== original.dev || named.ino !== original.ino)
      throw new Error('Pressure epoch instance path changed');
    let priorAcknowledgement: { state: 'absent' } | { state: 'removed'; sha256: string };
    let prior: Stats | undefined;
    try {
      prior = await lstat(acknowledgement);
    } catch (cause) {
      // Proof (modeled pre-fill): omission falsely treats EACCES and non-Error ENOENT as legitimate absence.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
    if (prior === undefined) priorAcknowledgement = { state: 'absent' };
    else {
      // Proof (modeled pre-fill): substituting valid bytes hides the shared reader refusal and falsely permits rotation.
      // Proof (coupled modeled caller): substituting another expected inode authorizes unlink of the named target whose bytes were never read.
      const record = await readRegistryPressureRecord(acknowledgement, {
        dev: prior.dev,
        ino: prior.ino,
      });
      // Proof (modeled pre-fill): omission permits unlink and successful rotation for malformed old ACK bytes.
      if (!new RegExp('^' + uuid + ' ' + uuid + ' ' + uuid + '\\n$').test(record))
        throw new Error('Prior fixture ACK is malformed');
      const current = await lstat(acknowledgement);
      // Proof (modeled pre-fill): omission permits unlink after the modeled named ACK inode changes.
      if (current.dev !== prior.dev || current.ino !== prior.ino)
        throw new Error('Prior fixture ACK path changed');
      // Proof (modeled pre-fill): omission loses the required old ACK removal and hides its injected syscall failure.
      await unlink(acknowledgement);
      priorAcknowledgement = {
        state: 'removed',
        sha256: createHash('sha256').update(record).digest('hex'),
      };
    }
    const instance = randomUUID() + ' ' + boot;
    // Proof (modeled pre-fill): omission accepts the unchanged instance instead of a fresh epoch.
    if (instance === priorInstance) throw new Error('Pressure epoch did not change');
    const next = Buffer.from(instance);
    const written = await file.write(next, 0, next.length, 0);
    // Proof (modeled pre-fill): omission accepts reported zero write progress despite the modeled buffer mutation.
    if (written.bytesWritten !== next.length) throw new Error('Pressure epoch write is incomplete');
    // Proof (modeled pre-fill): omission hides the injected required instance flush failure.
    await file.sync();
    // Proof (modeled pre-fill): omission accepts old instance bytes after the attempted write.
    if ((await readRegistryPressureRecord(path)) !== instance)
      throw new Error('Pressure epoch readback differs');
    const restored = await lstat(path);
    // Proof (modeled pre-fill): omission accepts a changed named inode after otherwise matching readback.
    if (restored.dev !== original.dev || restored.ino !== original.ino)
      throw new Error('Pressure epoch instance path changed after write');
    const current = await writer.assertLive();
    // Proof (modeled pre-fill): omission accepts a changed writer PID after rotation.
    if (current.pid !== live.pid || current.startTicks !== live.startTicks)
      throw new Error('Pressure epoch writer changed during rotation');
    return {
      instance,
      writer: { pid: live.pid, startTicks: live.startTicks },
      priorInstanceSha256: createHash('sha256').update(priorInstance).digest('hex'),
      priorAcknowledgement,
    };
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    try {
      // Proof (modeled pre-fill): omission leaves the descriptor unclosed and hides a required close refusal.
      await file.close();
    } catch (cause) {
      if (failure !== undefined)
        // Proof (modeled pre-fill): omission loses original failure membership in AggregateError.errors; its cause property remains.
        // Boundary: required descriptor close cannot hide the original preparation failure.
        // eslint-disable-next-line no-unsafe-finally
        throw new AggregateError(
          [failure.cause, cause],
          'Pressure epoch and descriptor close failed',
          {
            // Boundary: the caught close error remains in errors; original preparation is primary.
            // eslint-disable-next-line preserve-caught-error
            cause: failure.cause,
          },
        );
      // Boundary: required close-only refusal cannot become a successful preparation.
      // eslint-disable-next-line no-unsafe-finally
      throw cause;
    }
  }
}
