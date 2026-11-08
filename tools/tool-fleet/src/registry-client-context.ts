import { constants } from 'node:fs';
import { open, readFile, readlink } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { completeRegistryOperation } from './registry-operation-completion';
/** Require procfs to report PID1 as this process; an inherited host procfs exposes foreign root/FD magic links. */
export async function assertRegistryClientProc(): Promise<void> {
  // Proof: proc-empty-red.log observes the outside-proc negative fail with this refusal removed.
  if ((await readlink('/proc/self')) !== '1')
    throw new Error('Registry client procfs does not belong to its private PID namespace');
}

/** Require the actual root PID1, loopback-only network, finite cgroup limits and readonly root view before accepting a fixed client profile. */
export async function assertRegistryClientContext(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (
    process.getuid?.() !== 0 ||
    process.getgid?.() !== 0 ||
    process.geteuid?.() !== 0 ||
    process.getegid?.() !== 0 ||
    process.pid !== 1
  )
    throw new Error('Registry client requires an owned root namespace worker');
  await assertRegistryClientProc();
  const interfaces = (await readFile('/proc/net/dev', 'utf8'))
    .trim()
    .split('\n')
    .slice(2)
    .map((line) => line.split(':')[0].trim())
    .sort();
  if (JSON.stringify(interfaces) !== JSON.stringify(['lo']))
    throw new Error('Registry client network is not isolated to loopback');
  const cgroups = (await readFile('/proc/self/cgroup', 'utf8')).trim().split('\n');
  if (cgroups.length !== 1 || !cgroups[0].startsWith('0::/'))
    throw new Error('Registry client requires a unified bounded cgroup');
  const group = cgroups[0].slice(3);
  if (
    group.length > 4096 ||
    posix.normalize(group) !== group ||
    group.split('/').some((segment) => segment === '..')
  )
    throw new Error('Malformed registry client cgroup path');
  for (const [name, maximum] of [
    ['memory.max', 512n * 1024n ** 2n],
    ['pids.max', 128n],
  ] as const) {
    const text = await readFile(join('/sys/fs/cgroup', group, name), 'utf8');
    if (!/^[1-9]\d*\n$/.test(text) || BigInt(text.trim()) > maximum)
      throw new Error('Registry client cgroup limit is absent or excessive');
  }
}
/** Prove the active root descriptor resolves to a readonly mount, rather than another hidden root entry. */
export async function assertRegistryClientReadonlyRoot(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const descriptor = await open(
    '/',
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  await completeRegistryOperation(
    async () => {
      const identity = /^mnt_id:\s+([1-9]\d*)$/m.exec(
        await readFile(`/proc/self/fdinfo/${String(descriptor.fd)}`, 'utf8'),
      );
      if (identity === null) throw new Error('Registry client root mount identity is unavailable');
      const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
        .trim()
        .split('\n')
        .map((line) => line.split(' '))
        .filter((fields) => fields[0] === identity[1]);
      if (mounts.length !== 1 || mounts[0][4] !== '/' || !mounts[0][5].split(',').includes('ro'))
        throw new Error('Registry client host root is writable');
    },
    () => descriptor.close(),
  );
}
