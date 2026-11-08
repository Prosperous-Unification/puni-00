import { appendFileSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { isPromise } from 'node:util/types';

import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';

const fault = process.argv.at(2);
if (
  fault === undefined ||
  ![
    'valid',
    'missing-mode',
    'opposite-mode',
    'wrong-root',
    'missing-field',
    'no-alias',
    'duplicate-alias',
  ].includes(fault)
)
  throw new Error('Unknown isolated alias check');
const original = { ...filesystem };
const directory = await original.mkdtemp('/tmp/task8-alias-check-');
const receipt = join(directory, 'requests');
await original.writeFile(receipt, '', { flag: 'wx', mode: 0o600 });
const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
const pid = Object.getOwnPropertyDescriptor(process, 'pid');
if (uid === undefined || pid === undefined || !uid.configurable || !pid.configurable)
  throw new Error('Required isolated process descriptors unavailable');
let writable = false;
await mock.module('node:fs/promises', () => ({
  ...original,
  stat(path: string) {
    if (path !== '/owned/storage' && path !== '/var/lib/registry')
      return Promise.reject(new Error('Unexpected alias stat path'));
    return original.stat(directory);
  },
  readFile(path: string) {
    return invokeRegistryCallback(() => {
      if (path === '/etc/task8-namespace') return 'owned-private-proof\n';
      if (path !== '/proc/self/mountinfo') throw new Error('Unexpected alias read path');
      const root = fault === 'wrong-root' ? '/foreign' : '/contents';
      const alias = fault === 'no-alias' ? '/foreign' : '/var/lib/registry';
      const flags =
        fault === 'missing-mode'
          ? 'relatime'
          : fault === 'opposite-mode'
            ? 'ro,rw'
            : writable
              ? 'rw'
              : 'ro';
      const line =
        '1 0 0:1 ' +
        root +
        ' ' +
        alias +
        (fault === 'missing-field' ? '' : ' ' + flags + ' - ext4 owned ' + flags) +
        '\n';
      return fault === 'duplicate-alias' ? line + line : line;
    });
  },
}));
const spawn = Bun.spawn;
const spawnSync = Bun.spawnSync;
const stopped = new Error('owned launch boundary stop');
// Boundary: only eligibility, mountinfo and privileged command effects are modeled. Both alias stat calls use the same real private directory; no mount/setpriv/guard executable can run.
Object.defineProperty(process, 'getuid', { ...uid, value: () => 0 });
Object.defineProperty(process, 'pid', { ...pid, value: 1 });
Bun.spawnSync = new Proxy(spawnSync, {
  apply(_spawn, _receiver, arguments_: unknown[]) {
    const command = arguments_.at(0);
    if (
      !Array.isArray(command) ||
      command.length !== 4 ||
      command[0] !== '/usr/bin/mount' ||
      command[1] !== '-o' ||
      command[3] !== '/var/lib/registry' ||
      (command[2] !== 'remount,bind,rw' && command[2] !== 'remount,bind,ro')
    )
      throw new Error('Unexpected alias privileged command');
    writable = command[2] === 'remount,bind,rw';
    appendFileSync(receipt, (writable ? 'writable' : 'readonly') + '\n');
    return { exitCode: 0 };
  },
});
Bun.spawn = new Proxy(spawn, {
  apply(_spawn, _receiver, arguments_: unknown[]) {
    const command = arguments_.at(0);
    if (!Array.isArray(command) || command[0] !== '/usr/bin/setpriv')
      throw new Error('Unexpected alias launch command');
    throw stopped;
  },
});
let state: 'returned' | 'launch-stopped' | 'refused' | 'unexpected';
try {
  // Boundary: this starter consumes only ordinary.path/distribution.path before the forced launch stop. Full installation validation is not part of this scoped alias test.
  const pending: unknown = Reflect.apply(startRegistryFixtureGuard, undefined, [
    { ordinary: { path: '/owned/storage' }, distribution: { path: '/owned/registry' } },
  ]);
  if (!isPromise(pending)) throw new Error('Guard starter did not return its native Promise');
  await pending;
  state = 'returned';
} catch (cause) {
  state =
    cause === stopped
      ? 'launch-stopped'
      : cause instanceof Error &&
          cause.message === 'Owned registry alias identity or access mode differs'
        ? 'refused'
        : 'unexpected';
} finally {
  Object.defineProperty(process, 'getuid', uid);
  Object.defineProperty(process, 'pid', pid);
  Bun.spawn = spawn;
  Bun.spawnSync = spawnSync;
}
const requests = (await original.readFile(receipt, 'utf8'))
  .split('\n')
  .filter((line) => line !== '');
await original.rm(directory, { recursive: true });
console.log(JSON.stringify({ state, readonly: !writable, requests }));
