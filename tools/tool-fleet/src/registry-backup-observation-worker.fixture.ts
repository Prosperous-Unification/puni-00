import { constants } from 'node:fs';
import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import * as ffi from 'bun:ffi';
import { mock } from 'bun:test';

import * as interruption from './registry-backup-interruption.native';
import {
  RegistryBackupFixtureObservation,
  RegistryBackupFixtureRequest,
} from './registry-backup-observation.fixture';
import { observeRegistryBackupTerminal } from './registry-backup-terminal.fixture';
import { invokeRegistryCallback } from './registry-callback';

const request = RegistryBackupFixtureRequest.assert(
  JSON.parse(type('string').assert(process.argv.at(2))),
);
const originalFiles = { ...filesystem };
const originalFfi = { ...ffi };
const nativeSpawn = Bun.spawn;
const nativeSpawnSync = Bun.spawnSync;
const nativeKill = process.kill.bind(process);
const failure =
  request.family === 'terminal-file'
    ? Object.assign(new Error('owned fixed failure'), {
        code:
          request.fault === 'absent' ? 'ENOENT' : request.fault === 'unreadable' ? 'EACCES' : 'EIO',
      })
    : new Error('owned fixed failure');
let hasClosedHandle = false;
let hasClosedDescriptor = false;
if (
  request.family === 'reap' &&
  (request.fault === 'proc-denied' || request.fault === 'group-denied')
)
  Object.assign(failure, { code: 'EACCES' });
let reads = 0;
let errnoReads = 0;
const groups: unknown[] = [];
const records: unknown[] = [];
const commands: unknown[][] = [];
const errno = new Int32Array([request.family === 'reap' && request.fault !== 'EINVAL' ? 10 : 22]);
const address = ffi.ptr(errno);
let release: (code: number) => void = () => {
  throw new Error('Terminal resolver unavailable');
};
const exited = new Promise<number>((resolve) => {
  release = resolve;
});
const child = {
  pid: request.family === 'terminal-observer' && request.fault === 'bad-pid' ? 0 : 123,
  exited,
  signalCode:
    request.family === 'terminal-observer' && request.fault === 'bad-signal' ? 'PRIVATE' : null,
};
const command = ['/root/.puni/tools/restic-0.19.1', '--no-cache', 'backup', '--json'];
const options = { env: { FIXTURE: 'private' } };
const modeledSpawn = new Proxy(nativeSpawn, {
  apply(_spawn, _receiver, arguments_: unknown[]) {
    if (request.family !== 'terminal-observer')
      throw new Error('Unexpected backup observation spawn');
    commands.push(arguments_);
    return child;
  },
});
const deniedSpawnSync = new Proxy(nativeSpawnSync, {
  apply() {
    throw new Error('Unexpected synchronous backup observation spawn');
  },
});
const modeledKill = new Proxy(nativeKill, {
  apply(_kill, _receiver, arguments_: unknown[]) {
    if (
      request.family !== 'reap' ||
      arguments_[0] !== -123 ||
      arguments_[1] !== 0 ||
      arguments_.length !== 2
    )
      throw new Error('Unexpected backup observation signal probe');
    groups.push(arguments_);
    if (request.fault === 'group-live') return true;
    if (request.fault === 'group-denied') throw failure;
    throw Object.assign(new Error('absent group'), { code: 'ESRCH' });
  },
});
const unexpectedFile = () => {
  throw new Error('Unexpected backup observation filesystem effect');
};
await mock.module('node:fs/promises', () => ({
  ...originalFiles,
  readdir: unexpectedFile,
  readlink: unexpectedFile,
  stat: unexpectedFile,
  writeFile: unexpectedFile,
  readFile(path: unknown, encoding: unknown) {
    return invokeRegistryCallback(() => {
      if (request.family !== 'reap' || path !== '/proc/123/stat' || encoding !== 'utf8')
        throw new Error('Unexpected orphan observation read');
      reads++;
      if (request.fault === 'proc-denied') throw failure;
      if (reads === 1 && request.fault !== 'proc-absent')
        return (
          '123 (worker) ' +
          [
            'S',
            ...Array<string>(18).fill('1'),
            request.fault === 'pid-reused' ? '457' : '456',
          ].join(' ')
        );
      throw Object.assign(new Error('absent worker'), { code: 'ENOENT' });
    });
  },
  open(path: unknown, flags: unknown) {
    return invokeRegistryCallback(() => {
      if (
        request.family !== 'terminal-file' ||
        path !== '/root/task8-fixture/restic-terminal.log' ||
        flags !== (constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      )
        throw new Error('Unexpected terminal receipt open');
      if (request.fault === 'absent' || request.fault === 'unreadable') throw failure;
      return {
        stat: () =>
          invokeRegistryCallback(() => ({
            isFile: () => request.fault !== 'file-type',
            uid: request.fault === 'uid' ? 1 : 0,
            gid: request.fault === 'gid' ? 1 : 0,
            nlink: request.fault === 'links' ? 2 : 1,
            mode: request.fault === 'mode' ? 0o644 : 0o600,
            size: request.fault === 'size' ? 4097 : 1,
          })),
        readFile(encoding: unknown) {
          return invokeRegistryCallback(() => {
            if (encoding !== 'utf8') throw new Error('Unexpected terminal receipt encoding');
            if (request.fault === 'read-fails') throw failure;
            return request.fault === 'growth' ? 'x'.repeat(4097) : 'x';
          });
        },
        close: () =>
          invokeRegistryCallback(() => {
            hasClosedDescriptor = true;
          }),
      };
    });
  },
  appendFile(path: unknown, serialized: unknown, options: unknown) {
    return invokeRegistryCallback(() => {
      if (
        request.family !== 'terminal-observer' ||
        path !== '/root/task8-fixture/restic-terminal.log' ||
        JSON.stringify(options) !== JSON.stringify({ mode: 0o600 })
      )
        throw new Error('Unexpected terminal receipt write');
      if (request.fault === 'write-fails') throw failure;
      records.push(JSON.parse(type('string').assert(serialized)));
    });
  },
}));
await mock.module('bun:ffi', () => ({
  ...originalFfi,
  read: {
    ...originalFfi.read,
    i32(pointer: unknown) {
      errnoReads++;
      if (pointer === null) return 10;
      if (pointer !== address) throw new Error('Unexpected modeled errno address');
      return originalFfi.read.i32(address);
    },
  },
  dlopen(library: unknown, symbols: unknown) {
    if (
      request.family !== 'reap' ||
      library !== 'libc.so.6' ||
      JSON.stringify(symbols) !==
        JSON.stringify({
          waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
          __errno_location: { args: [], returns: 'ptr' },
        })
    )
      throw new Error('Unexpected orphan native library');
    return {
      symbols: {
        waitpid(pid: number, status: unknown, flags: number) {
          if (pid !== 123 || status !== null || flags !== 1)
            throw new Error('Unexpected exact worker waitpid');
          return -1;
        },
        __errno_location: () => (request.fault === 'null-errno' ? null : address),
      },
      close() {
        hasClosedHandle = true;
      },
    };
  },
}));

/** Observe the helper's own result before any worker rescue; unsupported fulfillment is a setup failure outside the modeled rejection path. */
async function settle(run: () => Promise<unknown>) {
  let value: unknown;
  try {
    value = await run();
  } catch (cause) {
    const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
    return {
      state: 'rejected' as const,
      value: null,
      message: cause instanceof Error ? cause.message : null,
      isError: cause instanceof Error,
      isOriginalFailure: cause === failure,
      hasOriginalMember: members.includes(failure),
    };
  }
  if (value !== undefined && typeof value !== 'string')
    throw new Error('Unexpected backup helper fulfillment');
  return {
    state: 'fulfilled' as const,
    value: value ?? null,
    message: null,
    isError: false,
    isOriginalFailure: false,
    hasOriginalMember: false,
  };
}
let observed: unknown;
try {
  Bun.spawn = modeledSpawn;
  Bun.spawnSync = deniedSpawnSync;
  process.kill = modeledKill;
  if (request.family === 'reap') {
    const completion = await settle(() =>
      interruption.reapBackupWorker({
        pid: 123,
        startTicks: '456',
        parent: 100,
        group: 123,
        command: '/pinned/worker\0',
      }),
    );
    observed = {
      ...completion,
      family: request.family,
      hasClosedHandle,
      reads,
      errnoReads,
      groups,
    };
  } else if (request.family === 'terminal-file') {
    const completion = await settle(() => interruption.readTerminalFile());
    observed = { ...completion, family: request.family, hasClosedDescriptor };
  } else {
    let hasSettled = false;
    let hasPreservedReturnedChild = false;
    const pending = settle(() =>
      observeRegistryBackupTerminal(() =>
        invokeRegistryCallback(() => {
          const returned: unknown = Bun.spawn(command, options);
          hasPreservedReturnedChild = returned === child;
          if (request.fault === 'operation-fails') throw failure;
          return 'complete';
        }),
      ),
    ).finally(() => {
      hasSettled = true;
    });
    await Bun.sleep(5);
    const hasSettledBeforeRelease = hasSettled;
    const recordsBeforeRelease = [...records];
    release(request.fault === 'bad-exit' ? 256 : 130);
    const completion = await pending;
    observed = {
      ...completion,
      family: request.family,
      workerPid: process.pid,
      hasSettledBeforeRelease,
      recordsBeforeRelease,
      records,
      hasRestoredSpawn: Bun.spawn === modeledSpawn,
      hasForwardedCommand: commands.length === 1 && commands[0]?.[0] === command,
      hasForwardedOptions: commands.length === 1 && commands[0]?.[1] === options,
      hasPreservedReturnedChild,
    };
  }
} finally {
  Bun.spawn = nativeSpawn;
  Bun.spawnSync = nativeSpawnSync;
  process.kill = nativeKill;
  await mock.module('node:fs/promises', () => originalFiles);
  await mock.module('bun:ffi', () => originalFfi);
}
console.log(JSON.stringify(RegistryBackupFixtureObservation.assert(observed)));
