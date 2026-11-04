import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import * as ffi from 'bun:ffi';
import { mock } from 'bun:test';

import * as attempts from './registry-backup-attempt';
import {
  RegistryBackupDeadlineObservation,
  RegistryBackupDeadlineRequest,
} from './registry-backup-deadline-observation.fixture';
import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as journal from './registry-journal';

const request = RegistryBackupDeadlineRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const fault = request.family === 'deadline' ? request.fault : 'normal';
const originalFiles = { ...filesystem },
  originalFfi = { ...ffi },
  originalAttempts = { ...attempts },
  originalJournal = { ...journal };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeSleep = Bun.sleep,
  nativePerformance = globalThis.performance,
  nativeLog = console.log,
  nativeKill = process.kill.bind(process);
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  pid = Object.getOwnPropertyDescriptor(process, 'pid'),
  kill = Object.getOwnPropertyDescriptor(process, 'kill');
if (
  uid === undefined ||
  pid === undefined ||
  kill === undefined ||
  !uid.configurable ||
  !pid.configurable
)
  throw new Error('Missing configurable interruption identity descriptors');
const home = '/root/task8-fixture',
  directory = '/var/lib/puni-registry/journal/contents';
const lock = Buffer.from('owned modeled ciphertext'),
  lockId = createHash('sha256').update(lock).digest('hex');
const resticCommand = [
  '/root/.puni/tools/restic-0.19.1',
  '--no-cache',
  'backup',
  '--json',
  '--host',
  'registry',
  '--tag',
  'puni-registry-owned',
  '--',
  '/registry',
  directory,
  '',
].join('\0');
const snapshot = {
  schemaVersion: 4,
  enrollment: { registryId: 'registry', registryPath: '/registry' },
  maintenanceEvidence: {
    backupAttempts: [
      {
        action: 'backup-snapshot',
        state: 'prepared',
        id: 'owned',
        operationId: 'owned',
        guardian: { pid: 10, startTicks: '10' },
      },
    ],
  },
};
const JournalInput = type({
  state: {
    schemaVersion: '4',
    enrollment: { registryId: 'string', registryPath: 'string' },
    maintenanceEvidence: {
      backupAttempts: type({
        action: "'backup-snapshot'",
        state: "'prepared'",
        id: 'string',
        operationId: 'string',
        guardian: { pid: 'number', startTicks: 'string' },
      }).array(),
    },
  },
});
const output: string[] = [],
  roles: string[] = [],
  kills: string[] = [],
  signals: unknown[] = [],
  writes: unknown[] = [],
  paths: string[] = [];
let clock = 0,
  selected = false,
  armed = false,
  stopped = false,
  waiting = false,
  rescuing = false,
  resticRescueObserved = false,
  reaping = false,
  reaped = false,
  groupAbsent = false,
  ownerReads = 0,
  descriptorReads = 0,
  selectedGuardianReads = 0,
  ffiOpens = 0,
  ffiCloses = 0,
  reapReads = 0;
let guardianFailure: { cause: unknown } | undefined;
const injected = Object.assign(new Error('PRIVATE_INJECTED'), { code: 'EACCES' });
const bypass = new Error('Unobserved guardian kill reached');
const absent = () => Object.assign(new Error('owned modeled process absent'), { code: 'ENOENT' });
const errno = new Int32Array([10]),
  address = originalFfi.ptr(errno);
const refuseEffect = () => {
  throw new Error('Unexpected native interruption effect');
};
function readProcessStatus(processId: number) {
  if (processId === 40) {
    ownerReads++;
    if (waiting && clock >= 130000) rescuing = true;
    if (fault === 'owner' && ownerReads > 1) throw injected;
    return 'State:\tS (owned)\nUid:\t59001\t59001\t59001\t59001\nGid:\t59001\t59001\t59001\t59001\n';
  }
  if (processId === 10 && selected && !armed) selectedGuardianReads++;
  const rejectedRole =
    request.family === 'role' &&
    processId === 10 &&
    selected &&
    (request.role === 'selected-guardian' ? !armed : stopped && descriptorReads === 1);
  const state = processId === 30 && stopped ? (rescuing && fault === 'state' ? 'S' : 'T') : 'S';
  const pending =
    processId === 30 && waiting && (fault === 'normal' || (rescuing && fault === 'late-interrupt'));
  return `State:\t${state} (owned)\nUid:\t${rejectedRole ? '1\t1\t1\t1' : '0\t0\t0\t0'}\nGid:\t0\t0\t0\t0\nSigPnd:\t0000000000000000\nShdPnd:\t000000000000000${pending ? '2' : '0'}\n`;
}
function readProcessStat(processId: number) {
  if (rescuing && processId === 30) resticRescueObserved = true;
  if (rescuing && processId === 20 && fault === 'worker-read' && !resticRescueObserved)
    throw injected;
  if (processId === 20 && reaping) {
    reapReads++;
    if (fault !== 'reap' || reapReads > 1) throw absent();
  }
  const changed =
    rescuing &&
    ((processId === 10 && fault === 'guardian') ||
      (processId === 20 && fault === 'worker') ||
      (processId === 30 && fault === 'restic'));
  const parent = processId === 20 ? 10 : processId === 30 ? 20 : 1,
    group = processId === 30 ? 20 : processId;
  return (
    String(processId) +
    ' (owned) ' +
    [
      processId === 30 && stopped ? 'T' : 'S',
      String(parent),
      String(group),
      ...Array<string>(16).fill('1'),
      changed ? String(processId + 1000) : String(processId),
    ].join(' ')
  );
}
function readFailureLog() {
  if (!reaped && (fault === 'oversize' || fault === 'schema'))
    return (
      JSON.stringify({
        action: fault === 'oversize' ? 'x'.repeat(4097) : 'serve-readonly',
        ownSignalAborted: true,
        rootDeadline: false,
        ownerCancellation: true,
        other: false,
        ...(fault === 'schema' ? { extra: true } : {}),
      }) + '\n'
    );
  if (fault === 'malformed') return 'bad\n';
  if ((!reaped && fault !== 'pre-failure') || fault === 'missing-post') return '';
  const line =
    JSON.stringify({
      action: 'backup-snapshot',
      ownSignalAborted: fault !== 'not-aborted',
      rootDeadline: fault === 'root-deadline',
      ownerCancellation: fault !== 'not-owner',
      other: fault === 'other',
    }) + '\n';
  return fault === 'duplicate' ? line + line : line;
}
function readInput(path: string): string | Buffer {
  paths.push(path);
  if (path === directory + '/journal.json') return JSON.stringify(snapshot);
  if (path === home + '/workers/20.json')
    return JSON.stringify({ pid: 20, parent: 10, startTicks: '20' });
  if (path === '/proc/20/task/20/children') return '30';
  if (path === '/proc/30/task/30/status') return readProcessStatus(30);
  if (path === home + '/repository/locks/' + lockId) {
    selected = true;
    return lock;
  }
  if (path === '/proc/20/fdinfo/3') return 'lock: 1: FLOCK ADVISORY WRITE 20 00:01:9 0 EOF\n';
  if (path === home + '/failure.log') return readFailureLog();
  if (path === '/proc/self/ns/pid') return 'pid:[4026531836]';
  if (path === '/proc/self') return String(process.pid);
  if (path === '/proc/sys/kernel/random/boot_id') return '22222222-2222-4222-8222-222222222222\n';
  if (path === '/etc/machine-id') return 'b'.repeat(32) + '\n';
  const matched = /^\/proc\/(10|20|30|40)\/(stat|status|cmdline)$/.exec(path);
  if (matched === null) throw new Error('Unexpected modeled interruption read');
  const processId = Number(matched[1]),
    field = matched[2];
  if (field === 'stat') return readProcessStat(processId);
  if (field === 'status') return readProcessStatus(processId);
  if (processId === 10)
    return process.execPath + '\0/usr/local/libexec/puni-registry-maintenance/host.js\0';
  if (processId === 20)
    return process.execPath + '\0/usr/local/libexec/puni-registry-maintenance/backup-worker.js\0';
  if (processId === 30) return resticCommand;
  return (
    process.execPath +
    '\0/usr/local/libexec/puni-registry-maintenance/proof.js\0backup-interruption\0'
  );
}
let observed: typeof RegistryBackupDeadlineObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    open: refuseEffect,
    appendFile: refuseEffect,
    mkdir: refuseEffect,
    rename: refuseEffect,
    rm: refuseEffect,
    unlink: refuseEffect,
    readFile(path: unknown, encoding: unknown) {
      return invokeRegistryCallback(() => {
        const name = type('string').assert(path);
        if (
          name === home + '/repository/locks/' + lockId
            ? encoding !== undefined
            : encoding !== 'utf8'
        )
          throw new Error('Unexpected modeled interruption encoding');
        return readInput(name);
      });
    },
    readlink(path: unknown) {
      return invokeRegistryCallback(() => {
        const name = type('string').assert(path);
        if (!['/proc/self/ns/pid', '/proc/self'].includes(name))
          throw new Error('Unexpected modeled process link');
        return readInput(name);
      });
    },
    readdir(path: unknown) {
      return invokeRegistryCallback(() => {
        if (path === home + '/workers') return ['20.json'];
        if (path === '/proc/20/task') return ['20'];
        if (path === '/proc/30/task') return ['30'];
        if (path === home + '/repository/locks') return [lockId];
        throw new Error('Unexpected modeled interruption census');
      });
    },
    stat(path: unknown) {
      return invokeRegistryCallback(() => {
        if (path === directory + '/authority.lock') return { dev: 7, ino: 9 };
        if (path !== '/proc/20/fd/3') throw new Error('Unexpected modeled descriptor');
        descriptorReads++;
        if (fault === 'descriptor' && descriptorReads > 1) throw injected;
        return { dev: 7, ino: 9 };
      });
    },
    writeFile(path: unknown, bytes: unknown, options: unknown) {
      return invokeRegistryCallback(() => {
        if (
          path !== '/etc/puni/registry-backup-fault.json' ||
          bytes !== '{"worker":20,"startTicks":"20"}' ||
          JSON.stringify(options) !== '{"mode":420,"flag":"wx"}'
        )
          throw new Error('Unexpected modeled fault enrollment');
        writes.push({ path, bytes, options });
        armed = true;
      });
    },
  }));
  await mock.module('./registry-journal', () => ({
    ...originalJournal,
    executeRegistryCommand: refuseEffect,
    parseRegistryCommandResponse: (input: unknown) => JournalInput.assert(input),
  }));
  await mock.module('./registry-backup-attempt', () => ({
    ...originalAttempts,
    async readRegistryBackupGuardian(
      ...args: Parameters<typeof attempts.readRegistryBackupGuardian>
    ) {
      try {
        return await originalAttempts.readRegistryBackupGuardian(...args);
      } catch (cause) {
        guardianFailure = { cause };
        throw cause;
      }
    },
  }));
  await mock.module('bun:ffi', () => ({
    ...originalFfi,
    dlopen(library: unknown, symbols: unknown) {
      if (
        library !== 'libc.so.6' ||
        JSON.stringify(symbols) !==
          '{"waitpid":{"args":["i32","ptr","i32"],"returns":"i32"},"__errno_location":{"args":[],"returns":"ptr"}}'
      )
        throw new Error('Unexpected modeled native waitpid request');
      ffiOpens++;
      reaping = true;
      return {
        symbols: {
          waitpid(processId: number, state: unknown, options: number) {
            if (processId !== 20 || state !== null || options !== 1)
              throw new Error('Unexpected modeled worker waitpid');
            if (fault === 'reap') throw injected;
            return -1;
          },
          __errno_location: () => address,
        },
        close() {
          ffiCloses++;
          if (groupAbsent) reaped = true;
        },
      };
    },
  }));
  Object.defineProperty(process, 'pid', { ...pid, value: fault === 'caller-pid' ? 2 : 1 });
  Object.defineProperty(process, 'getuid', {
    ...uid,
    value: () => (fault === 'caller-uid' ? 1 : 0),
  });
  globalThis.performance = new Proxy(nativePerformance, {
    get(target, key): unknown {
      return key === 'now' ? () => clock : Reflect.get(target, key, target);
    },
  });
  Bun.spawn = new Proxy(nativeSpawn, { apply: refuseEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  Bun.sleep = new Proxy(nativeSleep, {
    apply() {
      return invokeRegistryCallback(() => {
        clock += 3000;
        if (clock > 150000) throw new Error('modeled local loop rescue');
      });
    },
  });
  process.kill = new Proxy(nativeKill, {
    apply(_kill, _receiver, args: unknown[]) {
      signals.push(args);
      if (args[0] === 30 && args[1] === 'SIGSTOP') {
        stopped = true;
        return true;
      }
      if (args[0] === -20 && args[1] === 0) {
        groupAbsent = true;
        throw Object.assign(new Error('modeled group absent'), { code: 'ESRCH' });
      }
      if (args[0] === 10 && args[1] === 'SIGKILL') throw bypass;
      throw new Error('Unexpected modeled interruption signal');
    },
  });
  console.log = (line: string) => {
    if (fault === 'reporter') throw injected;
    output.push(line);
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed === 'object' && parsed !== null && 'backupProcessObservation' in parsed)
      roles.push(
        type({ backupProcessObservation: { role: 'string' } }).assert(parsed)
          .backupProcessObservation.role,
      );
  };
  const { interruptRegistryBackup } = await import('./registry-backup-interruption.native');
  const owner = {
    pid: 40,
    startTicks: '40',
    kill(signal?: number | string) {
      if (signal !== 'SIGTERM') throw new Error('Unexpected modeled authority signal');
      kills.push(signal);
    },
  };
  let completion: { state: 'fulfilled'; value: unknown } | { state: 'rejected'; cause: unknown };
  try {
    completion = {
      state: 'fulfilled',
      value: await interruptRegistryBackup(
        request.family === 'deadline' ? 'deadline' : 'guardian-eof',
        owner,
        () => reaped && fault !== 'owner-live',
        () =>
          invokeRegistryCallback(() => {
            waiting = true;
          }),
      ),
    };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const first = members.at(0);
  observed = RegistryBackupDeadlineObservation.assert({
    state: completion.state,
    value: completion.state === 'fulfilled' ? completion.value : null,
    message: cause instanceof Error ? cause.message : null,
    isAggregateError: cause instanceof AggregateError,
    hasMissingFirst:
      first instanceof Error &&
      first.message === 'Root maintenance deadline did not interrupt owned backup',
    hasInjectedMember: members.includes(injected),
    isExactGuardianFailure:
      completion.state === 'rejected' &&
      guardianFailure !== undefined &&
      cause === guardianFailure.cause,
    memberMessages: members.map((member) => (member instanceof Error ? member.message : null)),
    output,
    roles,
    kills,
    signals,
    writes,
    paths,
    reaped,
    ownerReads,
    descriptorReads,
    selectedGuardianReads,
    ffiOpens,
    ffiCloses,
    clock,
  });
}, [
  async () => {
    Object.defineProperty(process, 'pid', pid);
    Object.defineProperty(process, 'getuid', uid);
    Object.defineProperty(process, 'kill', kill);
    globalThis.performance = nativePerformance;
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    Bun.sleep = nativeSleep;
    console.log = nativeLog;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('bun:ffi', () => originalFfi);
    await mock.module('./registry-journal', () => originalJournal);
    await mock.module('./registry-backup-attempt', () => originalAttempts);
  },
]);
console.log(JSON.stringify(RegistryBackupDeadlineObservation.assert(observed)));
