import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import { mock } from 'bun:test';

import * as attempts from './registry-backup-attempt';
import * as interruption from './registry-backup-interruption.native';
import {
  RegistryBackupProcessObservation,
  RegistryBackupProcessRequest,
} from './registry-backup-process-observation.fixture';
import { invokeRegistryCallback } from './registry-callback';
import * as journal from './registry-managed-journal';

const request = RegistryBackupProcessRequest.assert(
  JSON.parse(type('string').assert(process.argv.at(2))),
);
const originalFiles = { ...filesystem };
const originalAttempts = { ...attempts };
const originalJournal = { ...journal };
const nativeSpawn = Bun.spawn;
const nativeSpawnSync = Bun.spawnSync;
const nativeSleep = Bun.sleep;
const nativeKill = process.kill.bind(process);
const nativeLog = console.log.bind(console);
const failure = Object.assign(new Error('owned fixed failure'), { code: 'EACCES' });
const nonErrorFailure: unknown = {
  code: 'EACCES',
  message: 'Guardian is not a live current root process',
};
let guardianFailure: { cause: unknown } | undefined;
const paths: string[] = [];
const fileReads: { path: string; encoding: string | null }[] = [];
const linkReads: string[] = [];
const output: string[] = [];
let statReads = 0;
let selectedStats = 0;
let selectedCommands = 0;
let finished = false;
let pauses = 0;
const home = '/root/task8-fixture';
const journalPath = '/var/lib/puni-registry/journal/contents';
const lock = Buffer.from('modeled ciphertext');
const lockId = createHash('sha256').update(lock).digest('hex');
const expected = [
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
  journalPath,
  '',
].join('\0');
const state = {
  schemaVersion: 4,
  enrollment: { registryId: 'registry', registryPath: '/registry' },
  maintenanceEvidence: {
    backupAttempts: [
      {
        action: 'backup-snapshot',
        state: 'prepared',
        id: 'attempt',
        operationId: 'owned',
        guardian: { pid: 100, startTicks: '1000' },
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

function readProcessInput(path: string): string | Buffer {
  paths.push(path);
  if (path === '/proc/self') return String(process.pid);
  if (path === '/proc/self/ns/pid') return 'pid:[4026531836]';
  if (path === '/proc/sys/kernel/random/boot_id') return '22222222-2222-4222-8222-222222222222\n';
  if (path === '/etc/machine-id') return 'b'.repeat(32) + '\n';
  if (request.family === 'process-read') {
    if (path === '/proc/123/stat') {
      statReads++;
      if (request.fault === 'io') throw failure;
      if (request.fault === 'non-error-io') throw nonErrorFailure;
      const ticks =
        (request.fault === 'identity-gap' && statReads >= request.at) ||
        (request.fault === 'stat-gap' && statReads === request.at)
          ? '457'
          : '456';
      return (
        '123 (fixed) ' +
        [
          statReads >= request.at
            ? ['state', 'logger'].includes(request.fault)
              ? 'Z'
              : request.fault === 'unknown-state'
                ? 'Q'
                : 'S'
            : 'S',
          '100',
          '123',
          ...Array<string>(16).fill('1'),
          ticks,
        ].join(' ')
      );
    }
    if (path === '/proc/123/status')
      return `Uid:\t${statReads >= request.at && request.fault === 'uid' ? '1\t1\t1\t1' : '0\t0\t0\t0'}\nGid:\t${statReads >= request.at && request.fault === 'gid' ? '1\t1\t1\t1' : '0\t0\t0\t0'}\nPRIVATE_STATUS_TOKEN\n`;
    if (path === '/proc/123/cmdline') return '/fixed/PRIVATE_ARGV_TOKEN\0';
  } else {
    if (path === journalPath + '/journal.json') return JSON.stringify(state);
    if (path === home + '/workers/123.json')
      return JSON.stringify({ pid: 123, parent: 100, startTicks: '1230' });
    if (path === '/proc/123/task/123/children') return '201 202 203';
    if (path === home + '/repository/locks/' + lockId) return lock;
    const parsed = /^\/proc\/(100|123|201|202|203)\/(stat|status|cmdline)$/.exec(path);
    if (parsed !== null) {
      const pid = Number(parsed[1]);
      const field = parsed[2];
      if (field === 'stat') {
        if (pid === 203) selectedStats++;
        const processState = pid === 201 || (pid === 203 && request.fault === 'zombie') ? 'Z' : 'S';
        const parent =
          pid === 123
            ? 100
            : pid === 100
              ? 1
              : pid === 203 && request.fault === 'parent'
                ? 999
                : 123;
        const group = pid === 100 ? 100 : pid === 203 && request.fault === 'group' ? 999 : 123;
        const ticks =
          pid === 203 && request.fault === 'start' && selectedStats > 1 ? '9999' : String(pid * 10);
        return (
          `${String(pid)} (fixed) ` +
          [processState, String(parent), String(group), ...Array<string>(16).fill('1'), ticks].join(
            ' ',
          )
        );
      }
      if (field === 'status')
        return `Uid:\t${pid === 203 && request.fault === 'uid' ? '1\t1\t1\t1' : '0\t0\t0\t0'}\nGid:\t0\t0\t0\t0\n`;
      if (pid === 100)
        return process.execPath + '\0/usr/local/libexec/puni-registry-maintenance/host.js\0';
      if (pid === 123)
        return (
          process.execPath + '\0/usr/local/libexec/puni-registry-maintenance/backup-worker.js\0'
        );
      if (pid === 201) return '';
      if (pid === 202) return '/unrelated/inspection\0';
      selectedCommands++;
      if (request.fault === 'missing-once' && selectedCommands === 1)
        throw Object.assign(new Error('gone candidate'), { code: 'ENOENT' });
      if (request.fault === 'access') throw failure;
      if (request.fault === 'oversize') return 'x'.repeat(4097);
      if (request.fault === 'changed-command' && selectedCommands > 1) return '/changed/command\0';
      return expected;
    }
  }
  throw new Error('Unexpected modeled process read');
}
const refuseEffect = () => {
  throw new Error('Unexpected backup process side effect');
};
await mock.module('node:fs/promises', () => ({
  ...originalFiles,
  open: refuseEffect,
  stat: refuseEffect,
  writeFile: refuseEffect,
  appendFile: refuseEffect,
  rm: refuseEffect,
  unlink: refuseEffect,
  rename: refuseEffect,
  mkdir: refuseEffect,
  chmod: refuseEffect,
  readFile(path: unknown, encoding: unknown) {
    return invokeRegistryCallback(() => {
      const name = type('string').assert(path);
      fileReads.push({ path: name, encoding: typeof encoding === 'string' ? encoding : null });
      const isLock = request.family === 'selector' && name === home + '/repository/locks/' + lockId;
      if (isLock ? encoding !== undefined : encoding !== 'utf8')
        throw new Error('Unexpected modeled process encoding');
      return readProcessInput(name);
    });
  },
  readlink(path: unknown) {
    return invokeRegistryCallback(() => {
      const name = type('string').assert(path);
      linkReads.push(name);
      const text = readProcessInput(name);
      if (typeof text !== 'string') throw new Error('Unexpected modeled process link');
      return text;
    });
  },
  readdir(path: unknown) {
    return invokeRegistryCallback(() => {
      if (request.family !== 'selector') throw new Error('Unexpected process directory census');
      if (path === home + '/workers') return ['123.json'];
      if (path === '/proc/123/task') return ['123'];
      if (path === home + '/repository/locks') return [lockId];
      throw new Error('Unexpected process selector directory');
    });
  },
}));
await mock.module('./registry-backup-attempt', () => ({
  ...originalAttempts,
  async readRegistryBackupGuardian(
    ...arguments_: Parameters<typeof originalAttempts.readRegistryBackupGuardian>
  ) {
    try {
      return await originalAttempts.readRegistryBackupGuardian(...arguments_);
    } catch (cause) {
      guardianFailure = { cause };
      throw cause;
    }
  },
}));
await mock.module('./registry-managed-journal', () => ({
  ...originalJournal,
  executeRegistryCommand: refuseEffect,
  parseRegistryCommandResponse(input: unknown) {
    return JournalInput.assert(input);
  },
}));
const deniedSpawn = new Proxy(nativeSpawn, { apply: refuseEffect });
const deniedSpawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
const deniedKill = new Proxy(nativeKill, { apply: refuseEffect });
const modeledSleep = new Proxy(nativeSleep, {
  apply() {
    if (request.family !== 'selector') throw new Error('Unexpected process pause');
    finished = ++pauses > 1;
    return invokeRegistryCallback(() => undefined);
  },
});
let observed: unknown;
try {
  Bun.spawn = deniedSpawn;
  Bun.spawnSync = deniedSpawnSync;
  Bun.sleep = modeledSleep;
  process.kill = deniedKill;
  console.log = (...arguments_: unknown[]) => {
    if (arguments_.length !== 1) throw new Error('Unexpected process diagnostic arguments');
    if (request.family === 'process-read' && request.fault === 'logger') throw failure;
    output.push(type('string').assert(arguments_[0]));
  };
  let completion: { state: 'fulfilled'; value: unknown } | { state: 'rejected'; cause: unknown };
  try {
    completion = {
      state: 'fulfilled',
      value:
        request.family === 'process-read'
          ? await interruption.readFaultProcess(123, 'candidate-child')
          : await interruption.findBackupEffect(() => finished),
    };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const isOriginalFailure =
    completion.state === 'rejected' &&
    (request.family === 'selector'
      ? cause === failure
      : guardianFailure !== undefined && cause === guardianFailure.cause);
  const common = {
    state: completion.state,
    value: completion.state === 'fulfilled' ? completion.value : null,
    message: cause instanceof Error ? cause.message : null,
    isError: cause instanceof Error,
    isAggregateError: cause instanceof AggregateError,
    isOriginalFailure,
    hasOriginalAndLogger:
      guardianFailure !== undefined &&
      members.length === 2 &&
      members[0] === guardianFailure.cause &&
      members[1] === failure,
    paths,
    output,
  };
  observed =
    request.family === 'process-read'
      ? { ...common, family: request.family, fileReads, linkReads }
      : { ...common, family: request.family, selectedCommands };
} finally {
  Bun.spawn = nativeSpawn;
  Bun.spawnSync = nativeSpawnSync;
  Bun.sleep = nativeSleep;
  process.kill = nativeKill;
  console.log = nativeLog;
  await mock.module('node:fs/promises', () => originalFiles);
  await mock.module('./registry-backup-attempt', () => originalAttempts);
  await mock.module('./registry-managed-journal', () => originalJournal);
}
console.log(JSON.stringify(RegistryBackupProcessObservation.assert(observed)));
