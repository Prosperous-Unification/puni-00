import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, statfs, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import {
  admitPublication,
  type PublicationEnvelope,
  type RegistryCapacity,
} from './registry-policy';

/** Production lease/poll contract shared with the pinned shell supervisor and host monitor. */
export const registryPermitSeconds = 30;
export const registryRenewalSeconds = 10;
const registryPollSeconds = 1;
const registryStartupGraceSeconds = 4;
const acknowledgementSeconds =
  registryPermitSeconds + registryPollSeconds + registryStartupGraceSeconds;

/** Kernel counters stay exact until their complete relationships and safe conversion are checked. */
export interface FilesystemCounters {
  readonly bsize: bigint;
  readonly blocks: bigint;
  readonly bfree: bigint;
  readonly bavail: bigint;
  readonly files: bigint;
  readonly ffree: bigint;
}

/** Separate physical allocation, UID-available capacity and blocks reserved from the service UID. */
export function accountFilesystem(status: FilesystemCounters) {
  // Proof: inconsistent counters and unsafe integer negatives failed with these guards removed.
  for (const counter of Object.values(status))
    if (typeof counter !== 'bigint' || counter < 0n) throw new Error('Unknown filesystem counter');
  if (
    status.bsize <= 0n ||
    status.blocks <= 0n ||
    status.files <= 0n ||
    status.bfree > status.blocks ||
    status.bavail > status.bfree ||
    status.ffree > status.files
  )
    throw new Error('Inconsistent filesystem counters');
  const safe = (count: bigint): number => {
    if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Unsafe filesystem count');
    return Number(count);
  };
  return {
    allocationUnitBytes: safe(status.bsize),
    usableBytes: safe((status.blocks - (status.bfree - status.bavail)) * status.bsize),
    usedBytes: safe((status.blocks - status.bfree) * status.bsize),
    availableBytes: safe(status.bavail * status.bsize),
    reservedBytes: safe((status.bfree - status.bavail) * status.bsize),
    totalInodes: safe(status.files),
    usedInodes: safe(status.files - status.ffree),
  };
}

/** Synchronous admission accepts only measurements completed within five seconds of the decision. */
export function requireFreshCapacity(input: unknown, now: number): RegistryCapacity {
  const Receipt = type({ measuredAt: 'number.safe', capacity: 'unknown' });
  const receipt = Receipt(input);
  // Proof: stale/future/unknown measurement negatives failed when freshness validation was absent.
  if (
    receipt instanceof type.errors ||
    !Number.isSafeInteger(now) ||
    receipt.measuredAt > now ||
    now - receipt.measuredAt > 5000
  )
    throw new Error('Unknown or stale registry measurement');
  admitPublication({
    capacity: receipt.capacity,
    reservations: [],
    envelope: { bytes: 0, inodes: 0 },
  });
  // The admission boundary above validates every RegistryCapacity field before this conversion.
  return receipt.capacity as RegistryCapacity;
}

/** Scratch reservations have independent limits and remain charged in the registry envelope. */
export function admitScratch(envelope: PublicationEnvelope, limit: PublicationEnvelope): void {
  // Proof: absent inode envelope was admitted before explicit field validation; byte/inode oversizing negatives fail without the limit.
  for (const count of [envelope.bytes, envelope.inodes, limit.bytes, limit.inodes])
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Malformed scratch envelope');
  if (envelope.bytes > limit.bytes || envelope.inodes > limit.inodes)
    throw new Error('Insufficient scratch budget');
}

/** Read fresh BigInt kernel counters; throws on unrepresentable or inconsistent accounting. */
export async function measureFilesystem(path: string) {
  return accountFilesystem(await statfs(path, { bigint: true }));
}

/** Derived permission operations are called only while the canonical journal flock is held. */
export interface RegistryWritePermit {
  isFresh(): Promise<boolean>;
  prepare(serialized: string, reopen: boolean): Promise<void>;
  publish(serialized: string): Promise<void>;
  revoke(): Promise<void>;
  confirmReadonly?(): Promise<void>;
}

async function readBootClock() {
  const [boot, uptime] = await Promise.all([
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    readFile('/proc/uptime', 'utf8'),
  ]);
  const seconds = Number(uptime.split(' ')[0]);
  if (!/^[0-9a-f-]{36}$/.test(boot.trim()) || !Number.isFinite(seconds) || seconds < 0)
    throw new Error('Unknown boot clock');
  return { boot: boot.trim(), seconds };
}

const digest = (serialized: string) => createHash('sha256').update(serialized).digest('hex');

/**
 * Thirty-second, boot/monotonic-time-bound permission derived from validated canonical state.
 * A two-hash transition spans atomic journal replacement without interrupting an admitted upload.
 * Absence is a modeled write prohibition; malformed existing permission throws. Neither permit
 * creation nor renewal is a journal writer: the authority invokes these under its single flock.
 */
export function createWritePermit(
  directory: string,
  measure: () => Promise<RegistryCapacity>,
  registryPath?: string,
): RegistryWritePermit {
  const path = join(directory, 'writable.permit');
  let prepared: { boot: string; issued: number; expires: number } | undefined;
  let revocation: string | undefined;
  const syncDirectory = async () => {
    const descriptor = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await descriptor.sync();
    } finally {
      await descriptor.close();
    }
  };
  const write = async (hashes: readonly string[]) => {
    if (prepared === undefined) throw new Error('No prepared writable permission');
    const replacement = join(directory, `permit-${randomUUID()}`);
    const descriptor = await open(
      replacement,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await descriptor.writeFile(
        `1 ${prepared.boot} ${String(prepared.issued)} ${String(prepared.expires)} ${hashes.join(' ')}\n`,
      );
      await descriptor.sync();
    } finally {
      await descriptor.close();
    }
    await rename(replacement, path);
    await syncDirectory();
  };
  const isFresh = async () => {
    let status;
    try {
      status = await lstat(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
      throw cause;
    }
    if (
      !status.isFile() ||
      status.uid !== process.getuid?.() ||
      (status.mode & 0o777) !== 0o600 ||
      status.nlink !== 1 ||
      status.size > 256
    )
      throw new Error('Malformed writable permission metadata');
    const permit = await readFile(path, 'utf8');
    const fields = /^1 ([0-9a-f-]{36}) (\d+) (\d+) ([0-9a-f]{64}) ([0-9a-f]{64})\n$/.exec(permit);
    if (fields === null) throw new Error('Malformed writable permission');
    const clock = await readBootClock();
    const issued = Number(fields[2]);
    const expires = Number(fields[3]);
    const canonical = digest(await readFile(join(directory, 'journal.json'), 'utf8'));
    return (
      fields[1] === clock.boot &&
      issued <= clock.seconds &&
      expires > clock.seconds &&
      expires - issued === registryPermitSeconds &&
      (canonical === fields[4] || canonical === fields[5])
    );
  };
  return {
    isFresh,
    async prepare(serialized, reopen) {
      if (!reopen && !(await isFresh()))
        throw new Error('Writable permission requires explicit reopen');
      const started = await readBootClock();
      const capacity = await measure();
      const clock = await readBootClock();
      if (clock.boot !== started.boot || clock.seconds - started.seconds > 1)
        throw new Error('Stale permit measurement');
      const admission = admitPublication({
        capacity,
        reservations: [],
        envelope: { bytes: 0, inodes: 0 },
      });
      if (admission.pressure === 'fenced') throw new Error('Pressure forbids writable permission');
      prepared = {
        boot: clock.boot,
        issued: Math.floor(started.seconds),
        expires: Math.floor(started.seconds) + registryPermitSeconds,
      };
      const next = digest(serialized);
      await write([
        reopen ? next : digest(await readFile(join(directory, 'journal.json'), 'utf8')),
        next,
      ]);
    },
    async publish(serialized) {
      await write([digest(serialized), digest(serialized)]);
    },
    async revoke() {
      // Proof: a failed second revocation previously reused the first acknowledgement; the current-request test caught it.
      revocation = undefined;
      try {
        await unlink(path);
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
      await syncDirectory();
      if (registryPath !== undefined) {
        const instancePath = join(registryPath, '.authority-instance');
        const status = await lstat(instancePath);
        if (
          !status.isFile() ||
          status.uid !== process.getuid?.() ||
          (status.mode & 0o777) !== 0o600 ||
          status.nlink !== 1 ||
          status.size > 128
        )
          throw new Error('Unconfirmed fencing: invalid supervisor instance');
        const instance = (await readFile(instancePath, 'utf8')).trim();
        if (!/^[0-9a-f-]{36} [0-9a-f-]{36}$/.test(instance))
          throw new Error('Unconfirmed fencing: malformed supervisor instance');
        revocation = `${randomUUID()} ${instance}`;
        const request = await open(
          join(directory, 'readonly.request'),
          constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await request.writeFile(`${revocation}\n`);
          await request.sync();
        } finally {
          await request.close();
        }
        await syncDirectory();
      }
    },
    ...(registryPath === undefined
      ? {}
      : {
          async confirmReadonly() {
            if (revocation === undefined) throw new Error('No correlated revocation request');
            // Proof (real files/elapsed): shortening this window to one iteration fails the stale-ACK grace test near1s; restored behavior refuses after35s. No supervisor process is modeled as running in that test.
            for (let attempt = 0; attempt < acknowledgementSeconds; attempt += 1) {
              const path = join(registryPath, '.authority-readonly');
              try {
                const status = await lstat(path);
                if (
                  !status.isFile() ||
                  status.uid !== process.getuid?.() ||
                  (status.mode & 0o777) !== 0o600 ||
                  status.nlink !== 1 ||
                  status.size > 256
                )
                  throw new Error('Malformed readonly acknowledgement');
                // Proof: stale nonce acknowledgement stays pending until the exact current request is observed.
                if ((await readFile(path, 'utf8')) === `${revocation}\n`) return;
              } catch (cause) {
                if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
                  throw cause;
              }
              await Bun.sleep(1000);
            }
            throw new Error('Unconfirmed live fencing: supervisor acknowledgement missing');
          },
        }),
  };
}

/** Root-owned enrollment receipt binds an ext4 mount's device, FSID and actual maximum. */
export async function measureVerifiedFilesystem(path: string, receiptPath: string) {
  if ((await realpath(path)) !== path) throw new Error('Filesystem path is not canonical');
  const receipt = await lstat(receiptPath);
  // Proof: changing the receipt owner refuses admission; removing this guard admits that exact fault.
  if (
    !receipt.isFile() ||
    receipt.uid !== 0 ||
    receipt.gid !== 0 ||
    (receipt.mode & 0o777) !== 0o644 ||
    receipt.nlink !== 1 ||
    receipt.size > 256
  )
    throw new Error('Untrusted filesystem identity receipt');
  const fields = /^(\d+:\d+) ([1-9]\d*) ([0-9a-f-]{36}) ([0-9a-f]+)\n$/.exec(
    await readFile(receiptPath, 'utf8'),
  );
  if (fields === null) throw new Error('Malformed filesystem identity receipt');
  const maximumBytes = BigInt(fields[2]);
  if (maximumBytes > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Unsafe enforced filesystem maximum');
  const child = Bun.spawn(['/usr/bin/stat', '-f', '-c', '%i', path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, fsid, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Filesystem identity measurement failed: ${stderr}`);
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(' '));
  const mount = mounts
    .filter((fields) => {
      const mountPath = fields.at(4);
      return mountPath !== undefined && (path === mountPath || path.startsWith(`${mountPath}/`));
    })
    .sort((left, right) => (right.at(4)?.length ?? 0) - (left.at(4)?.length ?? 0))
    .at(0);
  // Proof: substituting the registry receipt refuses scratch; removing identity refusal admits it.
  if (
    mount?.[2] !== fields[1] ||
    mount[mount.indexOf('-') + 1] !== 'ext4' ||
    fsid.trim() !== fields[4]
  )
    throw new Error('Filesystem identity mismatch');
  const counters = await statfs(path, { bigint: true });
  // Proof: a 16 MiB receipt for the 32 MiB fixture is refused; removing this bound admits it.
  if (counters.blocks * counters.bsize > maximumBytes)
    throw new Error('Filesystem exceeds enforced maximum');
  const measured = accountFilesystem(counters);
  return { ...measured, identity: fields[3], maximumBytes: Number(maximumBytes) };
}

/**
 * Builder export staging uses its own enrolled bounded filesystem. Exclusions must come from
 * trusted builder enrollment: host root plus every co-located registry/journal filesystem.
 * The publishing adapter proves cross-host separation; this primitive never ignores an absent
 * excluded path or accepts a claim that a missing path is remote. Missing measurements throw.
 */
export async function admitBuilderScratch(input: {
  path: string;
  receiptPath: string;
  excludedPaths: readonly string[];
  envelope: PublicationEnvelope;
}) {
  const scratch = await measureVerifiedFilesystem(input.path, input.receiptPath);
  const identity = (await lstat(input.path)).dev;
  // Proof: pointing scratch at the actual registry volume is refused; removing alias refusal admits it.
  for (const path of new Set(['/', ...input.excludedPaths]))
    if ((await lstat(path)).dev === identity)
      throw new Error('Scratch aliases a protected filesystem');
  admitScratch(input.envelope, {
    bytes: Math.max(
      0,
      Number((BigInt(Math.min(scratch.maximumBytes, scratch.usableBytes)) * 9n + 9n) / 10n) -
        scratch.usedBytes -
        1,
    ),
    inodes: Math.max(
      0,
      Number((BigInt(scratch.totalInodes) * 9n + 9n) / 10n) - scratch.usedInodes - 1,
    ),
  });
  return scratch;
}
