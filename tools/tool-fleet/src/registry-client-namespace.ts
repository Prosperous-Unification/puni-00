import { lstat, readlink, realpath } from 'node:fs/promises';

import {
  assertRegistryClientContext,
  assertRegistryClientReadonlyRoot,
} from './registry-client-context';
import { observeRegistryClientMount, readRegistryClientMounts } from './registry-client-mounts';
import type { RegistryClientInstallation } from './registry-maintenance-installation';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { consumeRegistryStream } from './registry-stream';

export interface RegistryClientNamespaceInput {
  readonly origin: { readonly mount: string; readonly network: string; readonly pid: string };
  readonly client: Pick<
    Extract<RegistryClientInstallation, { state: 'enrolled' }>,
    'mount' | 'ip' | 'scratch'
  >;
}
/**
 * Internal bootstrap after the fixed launcher creates fresh mount/net/PID namespaces and a finite
 * systemd scope. Compare all three namespace identities to the trusted outside origin before
 * any effect. Make propagation private, expose every visible host mount read-only, and permit
 * writes only to the pre-enrolled bounded scratch bind and a 1MiB/128-inode private auth tmpfs.
 * Fixed pinned utilities receive argument arrays and the SAME FD3. Remounting never changes the
 * outside host view; the outside launcher owns namespace/scope teardown on every outcome.
 */
export async function prepareRegistryClientNamespace(
  input: RegistryClientNamespaceInput,
  signal: AbortSignal,
): Promise<void> {
  await assertRegistryClientContext(signal);
  for (const [key, name] of [
    ['mount', 'mnt'],
    ['network', 'net'],
    ['pid', 'pid'],
  ] as const) {
    const origin = input.origin[key];
    if (
      !new RegExp('^' + name + ':\\[[1-9]\\d*\\]$').test(origin) ||
      (await readlink('/proc/self/ns/' + name)) === origin
    )
      throw new Error('Registry client namespace is shared with its origin');
  }
  const scratch = input.client.scratch.path;
  if ((await realpath(scratch)) !== scratch)
    throw new Error('Client scratch bind path is not canonical');
  const metadata = await lstat(scratch);
  if (
    !metadata.isDirectory() ||
    metadata.uid !== 0 ||
    metadata.gid !== 0 ||
    (metadata.mode & 0o777) !== 0o711
  )
    throw new Error('Client scratch bootstrap requires a root-owned0711pool');
  await verifyRegistryHostArtifact(input.client.mount);
  await verifyRegistryHostArtifact(input.client.ip);
  const execute = async (path: string, argv: string[]) => {
    signal.throwIfAborted();
    const child = Bun.spawn([path, ...argv], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 3],
    });
    const interrupted = new AbortController();
    const lifetime = AbortSignal.any([signal, interrupted.signal]);
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      try {
        await consumeRegistryStream(
          stream,
          65536,
          'Client namespace utility output',
          () => undefined,
        );
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    };
    const outcomes = await Promise.allSettled([
      awaitMaintenanceChild(child, lifetime),
      drain(child.stdout),
      drain(child.stderr),
    ]);
    const failures: unknown[] = [];
    for (const outcome of outcomes)
      if (outcome.status === 'rejected') {
        const failure: unknown = outcome.reason;
        failures.push(failure);
      }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, 'Client namespace utility completion failed', {
        cause: failures[0],
      });
  };
  const mount = (...argv: string[]) =>
    execute(input.client.mount.path, ['--no-mtab', '--internal-only', ...argv]);
  await mount('--make-rprivate', '/');
  await mount('--bind', scratch, scratch);
  const mounts = await readRegistryClientMounts();
  const points = new Set<string>();
  for (const entry of mounts) {
    signal.throwIfAborted();
    const observed = await observeRegistryClientMount(entry, mounts);
    if (observed.state === 'visible') points.add(observed.mount.path);
  }
  for (const path of [...points].sort(
    (a, b) => b.split('/').length - a.split('/').length || b.length - a.length,
  ))
    await mount('-o', 'remount,bind,ro', path);
  await mount('-o', 'remount,bind,rw', scratch);
  await mount(
    '-t',
    'tmpfs',
    '-o',
    'size=1048576,nr_inodes=128,mode=0750,uid=0,gid=59001,nodev,nosuid,noexec',
    'puni-registry-client-auth',
    '/run/puni-registry-maintenance',
  );
  await execute(input.client.ip.path, ['link', 'set', 'lo', 'up']);
  await assertRegistryClientContext(signal);
  await assertRegistryClientReadonlyRoot(signal);
  const current = await readRegistryClientMounts();
  const writable = new Set<string>();
  for (const entry of current) {
    signal.throwIfAborted();
    const observed = await observeRegistryClientMount(entry, current);
    if (observed.state === 'covered') continue;
    const visible = observed.mount;
    const permitted = visible.path === scratch || visible.path === '/run/puni-registry-maintenance';
    if (visible.writable !== permitted)
      throw new Error('Client namespace has an unexpected writable mount');
    if (visible.writable) writable.add(visible.path);
  }
  if (
    writable.size !== 2 ||
    !writable.has(scratch) ||
    !writable.has('/run/puni-registry-maintenance')
  )
    throw new Error('Client namespace is missing a required writable mount');
  signal.throwIfAborted();
}
