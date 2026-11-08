import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile } from 'node:fs/promises';

import { type } from 'arktype';

import { measureVerifiedFilesystem } from './registry-capacity';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

interface RegistryPressureStorage {
  ordinary: Pick<
    RegistryMaintenanceInstallation['ordinary'],
    'path' | 'identityReceipt' | 'storageId' | 'maximumBytes'
  >;
  journalPath: string;
}

/** Consume only the disposable 128 MiB registry filesystem's inodes with empty files outside snapshotted contents. At most 16384 file creations are allowed. ENOSPC must occur at open after successful allocations, with every inode consumed and at least 64 MiB still available. The independent journal and host root must use different devices. Every created descriptor is closed even on metadata failure; all files remain owned by outer namespace teardown. The returned verify method rechecks kernel pressure, directory identity and the exact owned inode of every empty file before and after later operations. This is a fixture allocator, not evidence of a physical limit until run on the owned ext4 volume. */
export async function fillRegistryFixtureInodes(installed: RegistryPressureStorage) {
  // Proof (modeled topology): individual UID, PID and exact selector omissions fail their named inode-pressure cases.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
  )
    throw new Error('Inode pressure requires exact owned PID1 fixture');
  const contents = '/var/lib/puni-registry/registry/contents';
  const volume = '/var/lib/puni-registry/registry';
  const path = volume + '/task8-full-volume.fill';
  const maximum = 128 * 1024 ** 2;
  // Proof (modeled installation): wrong path/receipt/maximum each reaches allocation when its corresponding clause is removed.
  if (
    installed.ordinary.path !== contents ||
    installed.ordinary.identityReceipt !==
      '/var/lib/puni-registry/journal/identities/registry.receipt' ||
    installed.ordinary.maximumBytes !== maximum
  )
    throw new Error('Inode pressure fixture paths or bound differ');
  const initial = await measureVerifiedFilesystem(contents, installed.ordinary.identityReceipt);
  // Proof (modeled measurement): independent identity/maximum/inode-cap/full clauses fail their named cases when removed. The zero-counter case binds early refusal, not unsafe admission.
  if (
    initial.identity !== installed.ordinary.storageId ||
    initial.maximumBytes !== maximum ||
    initial.totalInodes > 16384 ||
    initial.usedInodes >= initial.totalInodes
  )
    throw new Error('Inode pressure filesystem identity or counters differ');
  const [parent, registry, journal, root] = await Promise.all([
    lstat(volume),
    lstat(contents),
    lstat(installed.journalPath),
    lstat('/'),
  ]);
  // Proof (modeled devices): kind, parent-device and root/journal alias omissions fail before allocations in the normal helper.
  if (
    !parent.isDirectory() ||
    !registry.isDirectory() ||
    parent.dev !== registry.dev ||
    registry.dev === journal.dev ||
    registry.dev === root.dev
  )
    throw new Error('Inode pressure aliases an independent filesystem');
  // Proof (modeled mkdir): changing the requested mode fails the exact private-directory boundary case; mkdir failure preserves its identity.
  await mkdir(path, { mode: 0o700 });
  const readDirectory = async () => {
    const metadata = await lstat(path);
    // Proof (modeled metadata): each kind/device/owner/group/link/mode removal admits its corresponding invalid directory.
    if (
      !metadata.isDirectory() ||
      metadata.dev !== registry.dev ||
      metadata.uid !== 0 ||
      metadata.gid !== 0 ||
      metadata.nlink !== 2 ||
      (metadata.mode & 0o7777) !== 0o700
    )
      throw new Error('Inode filler directory identity is not owned');
    return metadata;
  };
  const original = await readDirectory();
  const readFileInode = (metadata: Stats) => {
    // Proof (modeled metadata): independent file-kind/device/owner/group/link/mode/size removals fail their named cases, including required close. Retained-file validation uses this same predicate.
    if (
      !metadata.isFile() ||
      metadata.dev !== registry.dev ||
      metadata.uid !== 0 ||
      metadata.gid !== 0 ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o7777) !== 0o600 ||
      metadata.size !== 0
    )
      throw new Error('Inode filler file identity is not owned');
    return metadata.ino;
  };
  const inodes: number[] = [];
  let exhausted = false;
  // Proof (modeled allocator): allowing one extra iteration issues nine opens instead of the declared eight before the final exhaustion refusal.
  while (inodes.length < initial.totalInodes) {
    let file: Awaited<ReturnType<typeof open>>;
    try {
      // Proof (modeled open): each flag omission changes the exact captured syscall argument; existing/access failures never close an unowned descriptor. This is not a kernel symlink proof.
      file = await open(
        path + '/' + String(inodes.length).padStart(5, '0'),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (cause) {
      // Proof (modeled late failures): Error-shape, code-presence and ENOSPC classification removals falsely accept the opaque/hidden-code/EIO failures after four successful allocations.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
      exhausted = true;
      break;
    }
    // Proof (modeled descriptor lifetime): lost result-await fails the receipt case; unforwarded close Promise permits another allocation/receipt before the held close; skipped close loses four closures.
    inodes.push(
      await completeRegistryFixture(
        async () => readFileInode(await file.stat()),
        [() => file.close()],
      ),
    );
  }
  // Proof (modeled allocator): removing either requirement falsely accepts no-exhaustion or zero-created; no inferred counter substitutes for the actual open error.
  if (!exhausted || inodes.length === 0)
    throw new Error('Inode filler did not observe bounded ENOSPC');
  const verify = async () => {
    const terminal = await measureVerifiedFilesystem(contents, installed.ordinary.identityReceipt);
    // Proof (modeled terminal counters): each identity/maximum/total/full-inode/free-byte omission admits its matching bad measurement; later released inode/byte pressure also refuses.
    if (
      terminal.identity !== initial.identity ||
      terminal.maximumBytes !== maximum ||
      terminal.totalInodes !== initial.totalInodes ||
      terminal.usedInodes !== terminal.totalInodes ||
      terminal.availableBytes < maximum / 2
    )
      throw new Error('Inode exhaustion is not independent of free byte capacity');
    // Proof (modeled named directory): substituting the original metadata or dropping inode comparison admits the replaced terminal directory.
    const named = await readDirectory();
    if (named.ino !== original.ino)
      throw new Error('Inode filler directory changed during allocation');
    // Proof (modeled retained census): extra-entry, wrong-name, replaced-inode, bad-metadata and unreadable-entry cases fail the corresponding count/name/identity/validator/read omissions. Unsorted enumeration refuses the otherwise valid reversed fixture.
    const names = (await readdir(path)).sort();
    if (names.length !== inodes.length) throw new Error('Inode filler directory census changed');
    for (const [index, inode] of inodes.entries()) {
      const name = String(index).padStart(5, '0');
      if (names[index] !== name) throw new Error('Inode filler directory census changed');
      if (readFileInode(await lstat(path + '/' + name)) !== inode)
        throw new Error('Inode filler file was replaced');
    }
    return { directorySize: named.size, availableBytes: terminal.availableBytes };
  };
  // Proof (modeled initial call): returning cached counters instead of this verification admits the bad terminal inode count before the caller receives a pressure witness.
  const verified = await verify();
  return {
    device: registry.dev,
    inode: original.ino,
    directorySize: verified.directorySize,
    files: inodes.length,
    totalInodes: initial.totalInodes,
    availableBytes: verified.availableBytes,
    enospc: true as const,
    outsideContents: true as const,
    verify,
  };
}

export type RegistryPressureAllocation = 'bytes' | 'inodes';

/** Parse the required private PID1 rehearsal allocation mode. Missing or unknown input refuses before the controller is invoked; ordinary owner and production entrypoints do not use this fixture environment variable. */
export function parseRegistryPressureAllocation(input: unknown): RegistryPressureAllocation {
  // Proof (actual parser): replacing admission with the unchecked input accepts the unknown allocation case; missing and malformed inputs also refuse.
  return type("'bytes'|'inodes'").assert(input);
}
