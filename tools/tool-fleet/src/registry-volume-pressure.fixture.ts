import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';

import { measureVerifiedFilesystem } from './registry-capacity';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

/**
 * Fill only the fixed disposable 128 MiB registry volume. The retained filler is outside
 * snapshotted contents but shares their actual device; the independent journal and root
 * must differ. A large write can fail while smaller allocations fit: reduce write size
 * through one byte, accepting only actual ENOSPC at that final size. The byte ceiling
 * and 256-call ceiling bound both allocation and partial-write convergence.
 * ENOSPC must come from a real write, never an inferred capacity counter.
 * Errors retain the file for outer namespace teardown; this function never releases pressure.
 */
export async function fillRegistryFixtureVolume(installed: RegistryMaintenanceInstallation) {
  // Proof (modeled caller): root/PID/selector guard removal returns a false pressure receipt for each forbidden topology.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
  )
    throw new Error('Volume pressure requires exact owned PID1 fixture');
  const contents = '/var/lib/puni-registry/registry/contents';
  const volume = '/var/lib/puni-registry/registry';
  const path = volume + '/task8-full-volume.fill';
  const maximum = 128 * 1024 ** 2;
  // Proof (modeled caller): path/receipt/installed-bound removal admits those three invalid inputs.
  if (
    installed.ordinary.path !== contents ||
    installed.ordinary.identityReceipt !==
      '/var/lib/puni-registry/journal/identities/registry.receipt' ||
    installed.ordinary.maximumBytes !== maximum
  )
    throw new Error('Volume pressure fixture paths or bound differ');
  const capacity = await measureVerifiedFilesystem(contents, installed.ordinary.identityReceipt);
  // Proof (modeled caller): removal admits foreign identity and oversized measured bound.
  if (capacity.identity !== installed.ordinary.storageId || capacity.maximumBytes !== maximum)
    throw new Error('Volume pressure filesystem identity differs');
  const [parent, registry, journal, root] = await Promise.all([
    lstat(volume),
    lstat(contents),
    lstat(installed.journalPath),
    lstat('/'),
  ]);
  // Proof (modeled caller): removal admits parent device/directory drift and root/journal aliasing.
  if (
    !parent.isDirectory() ||
    !registry.isDirectory() ||
    parent.dev !== registry.dev ||
    registry.dev === journal.dev ||
    registry.dev === root.dev
  )
    throw new Error('Volume pressure aliases an independent filesystem');
  // Proof (modeled open contract): omitting O_EXCL accepts an existing filler; EACCES preserves its cause without closing an unowned descriptor.
  const filler = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let failure: { cause: unknown } | undefined;
  try {
    const original = await filler.stat();
    // Proof (modeled caller): metadata removal admits invalid ownership/type/mode/link/size; wrong device receives three writes before later refusal.
    if (
      !original.isFile() ||
      original.dev !== registry.dev ||
      original.uid !== 0 ||
      original.gid !== 0 ||
      original.nlink !== 1 ||
      (original.mode & 0o7777) !== 0o600 ||
      original.size !== 0
    )
      throw new Error('Volume filler identity is not owned');
    const bytes = Buffer.alloc(1024 * 1024, 0x5a);
    let written = 0;
    let exhausted = false;
    let chunk = bytes.length;
    let attempts = 0;
    // Proof (modeled writes): attempt-limit omission reaches the independent 257th call; byte-limit omission issues a 129th zero-length attempt after the cap, before later refusal.
    while (written < maximum && attempts < 256) {
      attempts++;
      const requested = Math.min(chunk, maximum - written);
      try {
        const write = await filler.write(bytes.subarray(0, requested));
        // Proof (modeled caller): removal accepts zero progress; weakening the current request bound accepts an oversized tail and a false pressure receipt.
        if (
          !Number.isSafeInteger(write.bytesWritten) ||
          write.bytesWritten <= 0 ||
          write.bytesWritten > requested
        )
          throw new Error('Volume filler write made invalid progress');
        written += write.bytesWritten;
      } catch (cause) {
        // Proof (modeled caller): removing errno classification reports exhaustion for unknown and non-Error tail write failures.
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
        // Proof (modeled residual allocator): omission leaves 4207 bytes; stopping at 4096 leaves 111 bytes despite a pressure receipt.
        if (chunk > 1) {
          chunk = Math.max(1, Math.floor(chunk / 2));
          continue;
        }
        exhausted = true;
        break;
      }
    }
    // Proof (modeled caller): removal reports pressure without ENOSPC or without any allocated filler bytes.
    if (!exhausted || written === 0)
      throw new Error('Volume filler did not observe bounded ENOSPC');
    // Proof (modeled caller): removing sync ignores the injected flush failure and returns a receipt.
    await filler.sync();
    const [terminal, named] = await Promise.all([filler.stat(), lstat(path)]);
    // Proof (modeled caller): removal accepts changed descriptor/path inode or size after allocation.
    if (
      terminal.dev !== original.dev ||
      terminal.ino !== original.ino ||
      terminal.size !== written ||
      named.dev !== original.dev ||
      named.ino !== original.ino ||
      named.size !== written
    )
      throw new Error('Volume filler changed during allocation');
    return {
      device: original.dev,
      inode: original.ino,
      bytes: written,
      enospc: true as const,
      outsideContents: true as const,
    };
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    // Proof (modeled caller): removing close leaves the modeled descriptor unclosed; close refusal remains fatal.
    try {
      await filler.close();
    } catch (cause) {
      // Proof (modeled caller): dropping aggregation loses the original write failure when close also fails.
      if (failure !== undefined)
        // Boundary: close is required; throw retains the original write failure and this close failure.
        // eslint-disable-next-line no-unsafe-finally
        throw new AggregateError([failure.cause, cause], 'Volume pressure and close failed', {
          // Boundary: the original failure stays primary; the caught close error is retained in errors.
          // eslint-disable-next-line preserve-caught-error
          cause: failure.cause,
        });
      // Boundary: a close-only failure cannot become a successful pressure receipt.
      // eslint-disable-next-line no-unsafe-finally
      throw cause;
    }
  }
}
