import type { BigIntStats, Stats } from 'node:fs';
import * as nativeFilesModule from 'node:fs/promises';

import { mock } from 'bun:test';

import { FixtureOwnership } from './edge-init-owner';

/** Installs a fixed tenant-only owner view before production modules load in an isolated child. */
export async function installTenantFixtureOwnership(
  root: string,
  fault?: 'receipt-directory-owner-mismatch' | 'credential-owner-mismatch',
): Promise<void> {
  const nativeFiles = { ...nativeFilesModule };
  const ownership = new FixtureOwnership(root, 'tenant-root');
  function modeled<T extends Stats | BigIntStats>(path: string, metadata: T): T {
    const observed = ownership.path(path, metadata);
    if (
      (fault === 'receipt-directory-owner-mismatch' &&
        process.env['EDGE_INIT_RECOVERY_OWNER_READ'] === '1' &&
        path === root + '/receipts') ||
      (fault === 'credential-owner-mismatch' && path === root + '/credentials.json')
    )
      Object.defineProperty(observed, 'uid', {
        value: typeof observed.uid === 'bigint' ? 1001n : 1001,
      });
    return observed;
  }
  process.getuid = () => 1000;
  process.geteuid = () => 1000;
  await mock.module('node:fs/promises', () => ({
    ...nativeFiles,
    lstat: async (path: string, options?: { bigint?: boolean }) =>
      modeled(
        path,
        options?.bigint
          ? await nativeFiles.lstat(path, { bigint: true })
          : await nativeFiles.lstat(path),
      ),
    stat: async (path: string, options?: { bigint?: boolean }) =>
      modeled(
        path,
        options?.bigint
          ? await nativeFiles.stat(path, { bigint: true })
          : await nativeFiles.stat(path),
      ),
    open: async (
      path: string,
      ...arguments_: Parameters<typeof nativeFiles.open> extends [unknown, ...infer Rest]
        ? Rest
        : never
    ) => {
      const descriptor = await nativeFiles.open(path, ...arguments_);
      const fd = descriptor.fd;
      const ownerToken = ownership.track(fd, path);
      const nativeStat = descriptor.stat.bind(descriptor);
      const nativeClose = descriptor.close.bind(descriptor);
      Object.defineProperty(descriptor, 'stat', {
        value: async (options?: { bigint?: boolean }) =>
          ownership.fd(
            fd,
            options?.bigint ? await nativeStat({ bigint: true }) : await nativeStat(),
          ),
      });
      Object.defineProperty(descriptor, 'close', {
        value: async () => {
          try {
            await nativeClose();
          } finally {
            ownership.forget(fd, ownerToken);
          }
        },
      });
      return descriptor;
    },
  }));
}
