import { constants } from 'node:fs';
import { lstat, open, readdir, readFile, readlink, stat, statfs } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { completeRegistryOperation } from './registry-operation-completion';
import { assertUnprivilegedProcess } from './registry-process-privileges';

/** Observed process capability, not inferred registry readonly state. No arbitrary process is killed by this audit. */
export interface RegistryWriter {
  pid: number;
  reason: 'registry-runtime' | 'writable-mount-alias' | 'writable-descriptor' | 'writable-mapping';
}
const missing = (cause: unknown) =>
  cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (cause) {
    if (missing(cause)) return true;
    throw cause;
  }
}
const device = (encoded: number | bigint) => {
  const identity = BigInt(encoded);
  return `${String(((identity >> 8n) & 0xfffn) | ((identity >> 32n) & 0xfffff000n))}:${String((identity & 0xffn) | ((identity >> 12n) & 0xffffff00n))}`;
};
function mounts(serialized: string) {
  return serialized
    .trim()
    .split('\n')
    .map((line) => {
      const fields = line.split(' ');
      const separator = fields.indexOf('-');
      const id = fields.at(0);
      const identity = fields.at(2);
      const root = fields.at(3);
      const path = fields.at(4);
      const options = fields.at(5);
      // Proof: removing mount-ID validation certifies the malformed process row in the census tests.
      if (
        separator < 6 ||
        id === undefined ||
        !/^[1-9][0-9]*$/.test(id) ||
        identity === undefined ||
        !/^\d+:\d+$/.test(identity) ||
        root === undefined ||
        path === undefined ||
        options === undefined
      )
        throw new Error('Incomplete process mount observation');
      return {
        id,
        identity,
        root,
        path: path.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
          String.fromCharCode(Number.parseInt(octal, 8)),
        ),
        writable: options.split(',').includes('rw'),
      };
    });
}

/**
 * Prove absence independently of registry acknowledgements. Inspect every process's writable
 * mount aliases, descriptors and shared mappings, plus any registry executable. The installed
 * adapter always uses kernel /proc; the final argument is a read-only process-census fixture port.
 * The auditor selects the storage descriptor's kernel mount ID, validates its path/device, and
 * closes it before scanning. Covered mounts can share paths and devices with the visible mount.
 * A disappearing process/descriptor is modeled only after confirming its absence; unreadability
 * never means none.
 * A chroot can expose an empty mount table. It is admitted only with root/cwd at the same
 * directory (device, inode and held kernel mount ID) on the host root filesystem, outside
 * storage, and no directory descriptor that
 * could reach hidden mounts. Other filesystems can expose proc-style magic links;
 * an empty view also requires a confirmed single task, since threads can unshare fs state;
 * its initial/final status samples must establish nonzero UIDs, no effective/permitted/ambient
 * capabilities and NoNewPrivs, excluding current capabilities and exec privilege regain.
 * Namespace, anonymous-inode and PID filesystem descriptors refuse before device filtering:
 * their retained authority can invalidate confinement independently of current credentials.
 * Pipes, FIFOs, sockets, ordinary files and shared mappings still receive the writer audit.
 * Path identity and credential samples alone do not establish complete isolation.
 * Root/cwd observations use read-only directory descriptors; unreadable directories refuse.
 * Both are closed before the descriptor census, including when opening the second one fails.
 * @see https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h
 */
export async function readRegistryWriters(
  storagePath: string,
  binaryPath: string,
  proc = '/proc',
): Promise<RegistryWriter[]> {
  const storage = await open(storagePath, 'r');
  const { identity, host } = await completeRegistryOperation(
    async () => {
      const identity = device((await storage.stat()).dev);
      const information = await readFile(`/proc/self/fdinfo/${String(storage.fd)}`, 'utf8');
      // Proof: absent/unreadable fdinfo refuses; mount-row fallback certifies missing/malformed IDs,
      // and allowing a newline after mnt_id certifies the multiline fault in the census tests.
      const mountId = /^mnt_id:[ \t]+([1-9][0-9]*)$/m.exec(information)?.at(1);
      if (mountId === undefined) throw new Error('Missing registry storage descriptor mount ID');
      // Proof: selecting the first covered same-path/device row falsely reports a writable alias
      // in the duplicate-mountpoint census test. The actual descriptor ID selects the visible row.
      const host = mounts(await readFile(join(proc, 'self/mountinfo'), 'utf8')).find(
        (mount) => mount.id === mountId,
      );
      // Proof: removing either path/device constraint certifies the corresponding faulty mount row.
      if (
        host?.identity !== identity ||
        (storagePath !== host.path &&
          !storagePath.startsWith(`${host.path === '/' ? '' : host.path}/`))
      )
        throw new Error('Registry mount is absent from process namespace');
      return { identity, host };
    },
    // Proof: omitting close fails real descriptor lifetime/pre-census checks; the dual fault
    // retains observation then close errors with the observation as cause in the census tests.
    () => storage.close(),
  );
  const processes = (await readdir(proc)).filter((name) => /^[1-9]\d*$/.test(name));
  if (processes.length > 100000) throw new Error('Process census exceeds bound');
  const writers: RegistryWriter[] = [];
  for (const processId of processes) {
    const directory = join(proc, processId);
    const observe = async (): Promise<RegistryWriter['reason'] | undefined> => {
      let executable: string;
      try {
        executable = await readlink(join(directory, 'exe'));
      } catch (cause) {
        if (!missing(cause)) throw cause;
        const status = await readFile(join(directory, 'status'), 'utf8');
        if (/^Kthread:\s+1$/m.test(status)) return undefined;
        // Proof: the native pthread_exit fixture was certified absent with this group check removed;
        // its zombie leader retained a live worker and writable descriptor. Missing/contradictory
        // Threads/task evidence also refuses in registry-maintenance-writers.test.ts.
        const dead = (observed: string) =>
          /^State:\s+Z\b/m.test(observed) && /^Threads:\s+1$/m.test(observed);
        if (dead(status)) {
          const threads = await readdir(join(directory, 'task'));
          if (
            threads.length === 1 &&
            threads[0] === processId &&
            dead(await readFile(join(directory, 'status'), 'utf8'))
          )
            return undefined;
        }
        throw new Error('Live process executable observation is unavailable', { cause });
      }
      if (
        executable === binaryPath ||
        basename(executable).replace(/ \(deleted\)$/, '') === 'registry'
      )
        return 'registry-runtime';
      const serializedMounts = await readFile(join(directory, 'mountinfo'), 'utf8');
      const isEmptyView = serializedMounts === '';
      const status = isEmptyView ? await readFile(join(directory, 'status'), 'utf8') : undefined;
      if (status !== undefined) {
        // Proof: removing this assertion opens the absent root instead of rejecting NoNewPrivs0
        // in the privilege test that requires evidence before isolation-path observations.
        assertUnprivilegedProcess(status);
        const root = await open(
          join(directory, 'root'),
          constants.O_RDONLY | constants.O_DIRECTORY,
        );
        await completeRegistryOperation(
          async () => {
            const cwd = await open(
              join(directory, 'cwd'),
              constants.O_RDONLY | constants.O_DIRECTORY,
            );
            await completeRegistryOperation(
              async () => {
                // Proof: pathname-stat mutations bypass the modeled owned descriptor stat failures
                // in the root/stat and cwd/stat subprocess cases; both descriptors remain real.
                const rootIdentity = await root.stat({ bigint: true });
                const cwdIdentity = await cwd.stat({ bigint: true });
                const hostRoot = await stat('/', { bigint: true });
                const readMountId = async (descriptor: number) => {
                  // Proof: modeled absent/unreadable root/cwd fdinfo must refuse; falling back to
                  // the other real descriptor certifies absence. Using fixture /proc breaks normal cases.
                  const information = await readFile(
                    `/proc/self/fdinfo/${String(descriptor)}`,
                    'utf8',
                  );
                  // Proof: modeled missing/malformed IDs fail a descriptor fallback mutation;
                  // modeled multiline IDs fail when horizontal whitespace becomes general whitespace.
                  const mountId = /^mnt_id:[ \t]+([1-9][0-9]*)$/m.exec(information)?.at(1);
                  if (mountId === undefined)
                    throw new Error('Missing empty-view descriptor mount ID');
                  return mountId;
                };
                const rootMountId = await readMountId(root.fd);
                const cwdMountId = await readMountId(cwd.fd);
                // Proof: native root/cwd/filesystem cases retain the existing device/inode guards.
                // Removing mount equality certifies absence in modeled same-inode alias cases;
                // an actual bind-alias sentinel-write proof remains pending.
                if (
                  rootIdentity.dev !== hostRoot.dev ||
                  device(rootIdentity.dev) === identity ||
                  rootIdentity.dev !== cwdIdentity.dev ||
                  rootIdentity.ino !== cwdIdentity.ino ||
                  rootMountId !== cwdMountId
                )
                  throw new Error(
                    'Empty process mount visibility retains unverified filesystem reachability',
                  );
              },
              // Proof: skipping/unawaiting this close fails real descriptor disappearance and
              // pre-census checks. Modeled stat/read plus two-close faults preserve every cause.
              () => cwd.close(),
            );
          },
          // Proof: skipping/unawaiting this close fails lifetime/pre-census cases; modeled second
          // open plus root-close failures preserve both errors, with no descriptor census.
          () => root.close(),
        );
      }
      // Proof: a writable alias is detected even with no open content descriptor.
      if (
        (isEmptyView ? [] : mounts(serializedMounts)).some(
          (mount) =>
            mount.identity === identity &&
            mount.writable &&
            (mount.path !== host.path || mount.root !== host.root),
        )
      )
        return 'writable-mount-alias';
      for (const descriptor of await readdir(join(directory, 'fd'))) {
        if (!/^\d+$/.test(descriptor)) throw new Error('Unknown process descriptor entry');
        const path = join(directory, 'fd', descriptor);
        let current: Awaited<ReturnType<typeof stat>>;
        try {
          current = await stat(path);
        } catch (cause) {
          if (missing(cause) && (await absent(path))) continue;
          throw cause;
        }
        // Proof: native directory and ancestor writers survive a removed guard or one moved below
        // device filtering; the ancestor descriptor belongs to a different filesystem from storage.
        if (isEmptyView && current.isDirectory())
          throw new Error('Empty process mount visibility retains a directory descriptor');
        if (isEmptyView) {
          let type: bigint;
          try {
            type = (await statfs(path, { bigint: true })).type;
          } catch (cause) {
            // Proof: skipping absence confirmation admits modeled ENOENT for a retained descriptor;
            // accepting EACCES admits unreadable-after-disappearance. Removing recovery fails disappearance.
            if (missing(cause) && (await absent(path))) continue;
            throw cause;
          }
          // Proof: removing bigint, positive or uint32 validation admits the corresponding modeled
          // missing/number, zero/negative or overflow statfs samples in the writer census tests.
          if (typeof type !== 'bigint' || type <= 0n || type > 0xffff_ffffn)
            throw new Error('Incomplete process descriptor filesystem observation');
          // Proof: removing each class or filtering by storage device first admits actual namespace,
          // eventfd or pidfd descriptors in the writer tests. These prove class refusal, not setns escape.
          if (type === 0x6e73_6673n || type === 0x0904_1934n || type === 0x5049_4446n)
            throw new Error('Empty process mount visibility retains opaque descriptor authority');
        }
        if (device(current.dev) !== identity) continue;
        let information: string;
        try {
          information = await readFile(join(directory, 'fdinfo', descriptor), 'utf8');
        } catch (cause) {
          if (missing(cause) && (await absent(path))) continue;
          throw cause;
        }
        const flags = /^flags:\s+([0-7]+)$/m.exec(information)?.at(1);
        // Proof: absent and unreadable flags for a still-present descriptor both refuse, rather than certifying no writers.
        if (flags === undefined) throw new Error('Missing process descriptor flags');
        if ((BigInt(`0o${flags}`) & 3n) !== 0n) return 'writable-descriptor';
      }
      for (const mapping of (await readFile(join(directory, 'maps'), 'utf8'))
        .split('\n')
        .filter((line) => line.length > 0)) {
        const fields = mapping.split(/\s+/);
        const permissions = fields.at(1);
        const mappedDevice = fields.at(3);
        if (
          permissions === undefined ||
          mappedDevice === undefined ||
          !/^[a-f0-9]+:[a-f0-9]+$/.test(mappedDevice)
        )
          throw new Error('Incomplete process mapping observation');
        const parts = mappedDevice.split(':').map((part) => String(Number.parseInt(part, 16)));
        // Proof: the native mapping uses trackfd=False; removing this check certifies its actual
        // shared write absent without an accidental duplicate writable descriptor masking the fault.
        if (parts.join(':') === identity && permissions[1] === 'w' && permissions[3] === 's')
          return 'writable-mapping';
      }
      // Proof: the native thread unshares CLONE_FS and retains storage cwd while its leader
      // enters an unrelated chroot; removing this task proof certifies its actual write absent.
      if (status !== undefined) {
        const single = (status: string) => /^Threads:\s+1$/m.test(status);
        const tasks = await readdir(join(directory, 'task'));
        const finalStatus = await readFile(join(directory, 'status'), 'utf8');
        // Proof: removing this assertion certifies five modeled changed final-status profiles
        // (UID/CapEff/CapPrm/CapAmb/NoNewPrivs) in registry-process-privileges.test.ts.
        assertUnprivilegedProcess(finalStatus);
        if (!single(status) || tasks.length !== 1 || tasks[0] !== processId || !single(finalStatus))
          throw new Error('Empty process mount visibility requires one observed thread');
      }
      return undefined;
    };
    try {
      const reason = await observe();
      if (reason !== undefined) writers.push({ pid: Number(processId), reason });
    } catch (cause) {
      if (missing(cause) && (await absent(directory))) continue;
      throw new Error('Registry process writer census is incomplete', { cause });
    }
  }
  return writers;
}
