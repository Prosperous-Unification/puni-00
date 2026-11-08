import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import {
  RegistryGuardProcessObservation,
  RegistryGuardProcessRequest,
} from './registry-guard-process.fixture';
import type { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import * as lifetime from './registry-maintenance-process';

const request = RegistryGuardProcessRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalLifetime = { ...lifetime };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeFetch = globalThis.fetch;
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  pid = Object.getOwnPropertyDescriptor(process, 'pid');
if (uid === undefined || pid === undefined || !uid.configurable || !pid.configurable)
  throw new Error('Required isolated guard descriptors unavailable');
const failure: unknown =
  request.fault === 'non-error'
    ? { code: 'ESRCH' }
    : Object.assign(
        new Error('owned exact guard failure'),
        request.fault === 'unknown'
          ? {}
          : {
              code:
                request.fault === 'enoent'
                  ? 'ENOENT'
                  : request.fault === 'eacces'
                    ? 'EACCES'
                    : request.fault === 'eperm'
                      ? 'EPERM'
                      : 'ESRCH',
            },
      );
const seen: string[] = [],
  kills: string[] = [],
  mounts: string[] = [];
let writable = false,
  armed = false,
  censusReads = 0,
  statReads = 0;
let spawnCommand: string[] = [];
let settleExit: ((code: number) => void) | undefined;
let signalCode: string | null = null;
const exited = new Promise<number>((resolve) => {
  settleExit = resolve;
});
const endChild = () => {
  if (settleExit === undefined) throw new Error('Missing modeled guard exit capability');
  signalCode = 'SIGTERM';
  settleExit(143);
};
const child = {
  pid: 123,
  stderr: undefined,
  exited,
  get signalCode() {
    return signalCode;
  },
  kill(signal: string) {
    kills.push(signal);
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL')
      throw new Error('Unexpected modeled guard signal');
    endChild();
  },
};
const refuseEffect = () => {
  throw new Error('Unexpected guard process fixture effect');
};
const read = (path: string, encoding: unknown) =>
  invokeRegistryCallback(() => {
    if (encoding !== 'utf8') throw new Error('Unexpected guard process encoding');
    if (path === '/etc/task8-namespace') return 'owned-private-proof\n';
    if (path === '/proc/self/mountinfo')
      return `1 0 0:1 /contents /var/lib/registry ${writable ? 'rw' : 'ro'} - ext4 owned ${writable ? 'rw' : 'ro'}\n`;
    if (armed) seen.push(path);
    if (path === '/proc/123/task/123/children') {
      if (armed) {
        censusReads++;
        if (request.fault === 'oversize-census') return '1'.repeat(4097);
        if (request.fault === 'multiple') return '456 789';
        if (request.fault === 'census-race' && censusReads > 1) return '789';
      }
      return '456';
    }
    const match = /^\/proc\/(456|789)\/(stat|cmdline|status|environ)$/.exec(path);
    if (match === null) throw new Error('Unexpected modeled guard proc path');
    const selected = match[1],
      name = match[2];
    if (name === 'stat') {
      if (armed) {
        statReads++;
        if (request.fault === 'exited-after' && statReads > 1) endChild();
      }
      const fields = Array<string>(20).fill('0');
      fields[0] = 'S';
      fields[19] = armed && request.fault === 'start-race' && statReads > 1 ? '124' : '123';
      return selected + ' (registry) ' + fields.join(' ');
    }
    if (name === 'cmdline') return '/pinned/registry\0serve\0/etc/puni/ordinary-writer.json\0';
    if (name === 'status')
      return (
        'Uid:\t' +
        Array<number>(4)
          .fill(armed && request.fault === 'uid' ? 0 : 59001)
          .join('\t') +
        '\n'
      );
    if (armed) {
      if (request.fault === 'exit-esrch') endChild();
      if (
        ['esrch', 'exit-esrch', 'enoent', 'eacces', 'eperm', 'unknown', 'non-error'].includes(
          request.fault,
        )
      )
        throw failure;
      if (request.fault === 'environment')
        return 'REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":true}\0REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":false}\0';
    }
    return 'REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":true}\0';
  });
let guard: Awaited<ReturnType<typeof startRegistryFixtureGuard>> | undefined;
let observed:
  | Omit<
      typeof RegistryGuardProcessObservation.infer,
      'kills' | 'mounts' | 'isReadonly' | 'spawnCommand'
    >
  | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: read,
    stat(path: string) {
      return invokeRegistryCallback(() => {
        if (path !== '/owned/storage' && path !== '/var/lib/registry')
          throw new Error('Unexpected guard alias stat');
        return { dev: 1, ino: 2, isDirectory: () => true };
      });
    },
    open: refuseEffect,
    lstat: refuseEffect,
    writeFile: refuseEffect,
    appendFile: refuseEffect,
    mkdir: refuseEffect,
    rm: refuseEffect,
    unlink: refuseEffect,
    chmod: refuseEffect,
  }));
  await mock.module('./registry-maintenance-process', () => ({
    ...originalLifetime,
    awaitMaintenanceChild() {
      return exited.then(() => {
        throw new Error('Fixed maintenance child failed (exit 143)');
      });
    },
  }));
  Object.defineProperty(process, 'getuid', { ...uid, value: () => 0 });
  Object.defineProperty(process, 'pid', { ...pid, value: 1 });
  Bun.spawn = new Proxy(nativeSpawn, {
    apply(_spawn, _receiver, args: unknown[]) {
      spawnCommand = type('string[]').assert(args[0]);
      if (spawnCommand[0] !== '/usr/bin/setpriv')
        throw new Error('Unexpected modeled guard command');
      return child;
    },
  });
  Bun.spawnSync = new Proxy(nativeSpawnSync, {
    apply(_spawn, _receiver, args: unknown[]) {
      const command = type('string[]').assert(args[0]);
      if (
        command.length !== 4 ||
        command[0] !== '/usr/bin/mount' ||
        command[1] !== '-o' ||
        command[3] !== '/var/lib/registry' ||
        !['remount,bind,rw', 'remount,bind,ro'].includes(command[2] ?? '')
      )
        throw new Error('Unexpected modeled guard remount');
      writable = command[2] === 'remount,bind,rw';
      mounts.push(writable ? 'writable' : 'readonly');
      return { exitCode: 0 };
    },
  });
  globalThis.fetch = new Proxy(nativeFetch, {
    apply(_fetch, _receiver, args: unknown[]) {
      if (args[0] !== 'http://127.0.0.1:5052/v2/') throw new Error('Unexpected modeled guard HTTP');
      return Promise.resolve(new Response('', { status: 200 }));
    },
  });
  const { startRegistryFixtureGuard } = await import('./registry-maintenance-guard.fixture');
  // Boundary: this scoped starter consumes only ordinary.path/distribution.path with proof absent. Full installation enrollment and privileged eligibility are modeled, never inferred from this partial fixture.
  const installed = {
    ordinary: { path: '/owned/storage' },
    distribution: { path: '/pinned/registry' },
  } as RegistryMaintenanceInstallation;
  guard = await startRegistryFixtureGuard(installed);
  armed = true;
  if (request.fault === 'exited-before') {
    endChild();
    await exited;
  }
  try {
    const value = await guard.observeMode();
    observed = {
      state: 'fulfilled',
      mode: value.mode,
      identity: value.identity,
      message: null,
      isOriginalFailure: false,
      seen,
    };
  } catch (cause) {
    observed = {
      state: 'rejected',
      mode: null,
      identity: null,
      message: cause instanceof Error ? cause.message : null,
      isOriginalFailure: cause === failure,
      seen,
    };
  }
}, [
  async () => {
    if (guard !== undefined) await guard.close();
  },
  async () => {
    Object.defineProperty(process, 'getuid', uid);
    Object.defineProperty(process, 'pid', pid);
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    globalThis.fetch = nativeFetch;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-maintenance-process', () => originalLifetime);
  },
]);
console.log(
  JSON.stringify(
    RegistryGuardProcessObservation.assert({
      ...observed,
      kills,
      mounts,
      isReadonly: !writable,
      spawnCommand,
    }),
  ),
);
