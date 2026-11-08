import * as filesystem from 'node:fs/promises';

import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import * as capacity from './registry-capacity';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import {
  RegistryInodePressureObservation,
  RegistryInodePressureRequest,
} from './registry-inode-pressure-observation.fixture';

const request = RegistryInodePressureRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalCapacity = { ...capacity };
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  pid = Object.getOwnPropertyDescriptor(process, 'pid');
if (uid === undefined || pid === undefined)
  throw new Error('Missing inode fixture process descriptors');
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync;
const commands: unknown[] = [];
let verifying = false,
  verified = false;
let mkdirs = 0,
  opens = 0,
  closes = 0,
  created = 0,
  measured = 0;
const primary: unknown =
  request.fault === 'open-opaque'
    ? { code: 'ENOSPC' }
    : request.fault === 'open-hidden-code'
      ? new Proxy(Object.assign(new Error('PRIVATE allocation'), { code: 'ENOSPC' }), {
          has: (failure, key) => (key === 'code' ? false : Reflect.has(failure, key)),
        })
      : Object.assign(new Error('PRIVATE allocation'), {
          code:
            request.fault === 'open-existing'
              ? 'EEXIST'
              : request.fault === 'open-access'
                ? 'EACCES'
                : 'EIO',
        });
const closing = new Error('PRIVATE close');
let releaseClose: (() => void) | undefined;
const heldClose = new Promise<void>((resolve) => {
  releaseClose = resolve;
});
let settledBeforeClose: boolean | null = null,
  openedBeforeClose: number | null = null;
const volume = '/var/lib/puni-registry/registry',
  contents = volume + '/contents',
  filler = volume + '/task8-full-volume.fill',
  journal = '/var/lib/puni-registry/journal/contents';
const installed = {
  ordinary: {
    path: request.fault === 'path' ? '/foreign' : contents,
    identityReceipt:
      request.fault === 'receipt'
        ? '/foreign'
        : '/var/lib/puni-registry/journal/identities/registry.receipt',
    storageId: 'owned',
    maximumBytes: request.fault === 'maximum' ? 129 * 1024 ** 2 : 128 * 1024 ** 2,
  },
  journalPath: journal,
};
const directory = () => ({
  dev: request.fault === 'directory-device' ? 11 : 10,
  ino:
    (request.fault === 'terminal-directory' && measured > 1) ||
    (request.fault === 'verify-directory' && verifying)
      ? 92
      : 91,
  uid: request.fault === 'directory-owner' ? 1 : 0,
  gid: request.fault === 'directory-group' ? 1 : 0,
  nlink: request.fault === 'directory-links' ? 3 : 2,
  mode: request.fault === 'directory-mode' ? 0o40755 : 0o40700,
  size: 4096,
  isDirectory: () => request.fault !== 'directory-kind',
});
const rejectEffect = () => {
  throw new Error('Unexpected inode fixture effect');
};
const categories = new Map([
  ['Inode pressure requires exact owned PID1 fixture', 'topology'],
  ['Inode pressure fixture paths or bound differ', 'installation'],
  ['Inode pressure filesystem identity or counters differ', 'measurement'],
  ['Inode pressure aliases an independent filesystem', 'separation'],
  ['Inode filler directory identity is not owned', 'directory'],
  ['Inode filler file identity is not owned', 'file'],
  ['Inode filler did not observe bounded ENOSPC', 'exhaustion'],
  ['Inode exhaustion is not independent of free byte capacity', 'terminal'],
  ['Inode filler directory changed during allocation', 'directory-changed'],
  ['Inode filler directory census changed', 'census'],
  ['Inode filler file was replaced', 'file-replaced'],
]);
let observed: typeof RegistryInodePressureObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: (path: string, encoding: unknown) =>
      invokeRegistryCallback(() => {
        if (path !== '/proc/1/cmdline' || encoding !== 'utf8')
          throw new Error('Unexpected inode fixture proc input');
        return (
          '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0' +
          (request.fault === 'selector' ? 'foreign' : 'prove-volume-full') +
          '\0'
        );
      }),
    mkdir: (path: string, options: unknown) =>
      invokeRegistryCallback(() => {
        commands.push({ action: 'mkdir', path, options });
        mkdirs++;
        if (path !== filler || JSON.stringify(options) !== '{"mode":448}')
          throw new Error('Unexpected inode directory creation');
        if (request.fault === 'mkdir') throw primary;
      }),
    lstat: (path: string) =>
      invokeRegistryCallback(() => {
        if (path === filler) return directory();
        if (path.startsWith(filler + '/')) {
          const name = path.slice(filler.length + 1);
          if (!/^[0-9]{5}$/.test(name) || Number(name) >= created)
            throw new Error('Unknown inode fixture file');
          if (verifying && request.fault === 'verify-read') throw primary;
          return {
            dev: 10,
            ino: 100 + Number(name) + (verifying && request.fault === 'verify-swap' ? 1 : 0),
            uid: verifying && request.fault === 'verify-metadata' ? 1 : 0,
            gid: 0,
            nlink: 1,
            mode: 0o100600,
            size: 0,
            isFile: () => true,
          };
        }
        if (![volume, contents, journal, '/'].includes(path))
          throw new Error('Unexpected inode metadata input');
        return {
          dev:
            path === journal
              ? request.fault === 'journal-device'
                ? 10
                : 20
              : path === '/'
                ? request.fault === 'root-device'
                  ? 10
                  : 30
                : path === volume && request.fault === 'parent-device'
                  ? 11
                  : 10,
          isDirectory: () =>
            !(path === volume && request.fault === 'parent-kind') &&
            !(path === contents && request.fault === 'registry-kind'),
        };
      }),
    readdir: (path: string) =>
      invokeRegistryCallback(() => {
        if (path !== filler) throw new Error('Unexpected inode fixture census');
        const names = Array.from({ length: created }, (_, index) => String(index).padStart(5, '0'));
        if (verifying && request.fault === 'verify-missing') names.pop();
        if (verifying && request.fault === 'verify-extra') names.push('foreign');
        if (verifying && request.fault === 'verify-name') names[0] = 'foreign';
        return names.reverse();
      }),
    open: (path: string, flags: number, mode: unknown) =>
      invokeRegistryCallback(() => {
        commands.push({ action: 'open', path, flags, mode });
        opens++;
        if (path !== filler + '/' + String(created).padStart(5, '0') || mode !== 0o600)
          throw new Error('Unexpected inode allocation input');
        if (opens > 9) throw new Error('Independent inode allocation call rescue');
        if (
          ['open-existing', 'open-access'].includes(request.fault) ||
          (created === 4 &&
            ['open-error', 'open-opaque', 'open-hidden-code'].includes(request.fault))
        )
          throw primary;
        if (
          (created === 4 && request.fault !== 'no-exhaustion') ||
          request.fault === 'zero-created'
        )
          throw Object.assign(new Error('owned ENOSPC'), { code: 'ENOSPC' });
        const inode = 100 + created;
        created++;
        return {
          stat: () =>
            invokeRegistryCallback(() => ({
              dev: request.fault === 'file-device' ? 11 : 10,
              ino: inode,
              uid: request.fault === 'file-owner' ? 1 : 0,
              gid: request.fault === 'file-group' ? 1 : 0,
              nlink: request.fault === 'file-links' ? 2 : 1,
              mode: ['file-mode', 'file-close'].includes(request.fault) ? 0o100644 : 0o100600,
              size: request.fault === 'file-size' ? 1 : 0,
              isFile: () => request.fault !== 'file-kind',
            })),
          close: () =>
            invokeRegistryCallback(() => {
              closes++;
              if (['close', 'file-close'].includes(request.fault)) throw closing;
              if (request.fault === 'held-close' && closes === 1) return heldClose;
              return undefined;
            }),
        };
      }),
    writeFile: rejectEffect,
    appendFile: rejectEffect,
    unlink: rejectEffect,
    rm: rejectEffect,
    rename: rejectEffect,
  }));
  await mock.module('./registry-capacity', () => ({
    ...originalCapacity,
    measureVerifiedFilesystem: (path: string, receipt: string) =>
      invokeRegistryCallback(() => {
        if (path !== contents || receipt !== installed.ordinary.identityReceipt)
          throw new Error('Unexpected inode measurement input');
        measured++;
        const total =
          request.fault === 'zero-inodes'
            ? 0
            : request.fault === 'excess-inodes'
              ? 16385
              : request.fault === 'terminal-total' && measured > 1
                ? 9
                : 8;
        return {
          identity:
            request.fault === 'identity' || (request.fault === 'terminal-identity' && measured > 1)
              ? 'foreign'
              : 'owned',
          maximumBytes:
            request.fault === 'measured-maximum' ||
            (request.fault === 'terminal-maximum' && measured > 1)
              ? 129 * 1024 ** 2
              : 128 * 1024 ** 2,
          totalInodes: total,
          usedInodes:
            request.fault === 'preexisting-full'
              ? total
              : measured === 1
                ? 3
                : request.fault === 'terminal-inodes' ||
                    (request.fault === 'verify-free-inode' && verifying)
                  ? 7
                  : total,
          availableBytes:
            (request.fault === 'terminal-free-bytes' && measured > 1) ||
            (request.fault === 'verify-bytes' && verifying)
              ? 0
              : 64 * 1024 ** 2,
        };
      }),
  }));
  Object.defineProperty(process, 'getuid', {
    ...uid,
    value: () => (request.fault === 'uid' ? 1 : 0),
  });
  Object.defineProperty(process, 'pid', { ...pid, value: request.fault === 'pid' ? 2 : 1 });
  Bun.spawn = new Proxy(nativeSpawn, { apply: rejectEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: rejectEffect });
  let completion: { state: 'fulfilled'; receipt: unknown } | { state: 'rejected'; cause: unknown };
  try {
    const { fillRegistryFixtureInodes } = await import('./registry-inode-pressure.fixture');
    let settled = false;
    const pending = fillRegistryFixtureInodes(installed).finally(() => {
      settled = true;
    });
    if (request.fault === 'held-close') {
      await Bun.sleep(20);
      settledBeforeClose = settled;
      openedBeforeClose = opens;
      if (releaseClose === undefined) throw new Error('Missing held close release');
      releaseClose();
    }
    const receipt = await pending;
    if (request.fault.startsWith('verify')) {
      verifying = true;
      await receipt.verify();
      verified = true;
    }
    completion = { state: 'fulfilled', receipt };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  observed = RegistryInodePressureObservation.assert({
    state: completion.state,
    category: cause instanceof Error ? (categories.get(cause.message) ?? 'other') : 'other',
    isPrimary: completion.state === 'rejected' && cause === primary,
    isClose: completion.state === 'rejected' && cause === closing,
    isAggregate: cause instanceof AggregateError,
    hasCloseMember: members.includes(closing),
    hasFirstCause:
      cause instanceof AggregateError && members.length > 0 && cause.cause === members[0],
    mkdirs,
    opens,
    closes,
    created,
    measured,
    verified,
    settledBeforeClose,
    openedBeforeClose,
    commands,
    receipt: completion.state === 'fulfilled' ? completion.receipt : null,
  });
}, [
  async () => {
    Object.defineProperty(process, 'getuid', uid);
    Object.defineProperty(process, 'pid', pid);
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-capacity', () => originalCapacity);
  },
]);
console.log(JSON.stringify(RegistryInodePressureObservation.assert(observed)));
