import * as synchronous from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { isPromise } from 'node:util/types';

import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import {
  RegistryContenderObservation,
  RegistryContenderRequest,
} from './registry-contender-observation.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as preparation from './registry-maintenance-host.fixture';
import * as journal from './registry-managed-journal';

const request = RegistryContenderRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalSynchronous = { ...synchronous },
  originalJournal = { ...journal },
  originalPreparation = { ...preparation };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeLog = console.log;
const killDescriptor = Object.getOwnPropertyDescriptor(process, 'kill');
if (killDescriptor === undefined) throw new Error('Missing contender kill descriptor');
const directory = await originalFiles.mkdtemp('/tmp/task8-contender-observer-');
const GiB = 1024 ** 3;
let measured = 0,
  permissions = 0,
  initialMeasured = 0,
  hasSetupFailure = false;
const output: string[] = [],
  probes: unknown[] = [],
  commands: string[] = [],
  writes: string[] = [];
const interrupted = new Error('owned callback failure');
const reporter = new Error('reporter failed');
const injected: unknown =
  request.family === 'acquire' && request.fault === 'opaque'
    ? { code: 'ESRCH' }
    : Object.assign(new Error('owned group probe failure'), {
        code: request.family === 'acquire' && request.fault === 'denied' ? 'EPERM' : 'EIO',
      });
const measure = {
  measureJournal() {
    return invokeRegistryCallback(() => {
      measured++;
      return {
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 4096,
        totalInodes: 100000,
        usedInodes: 10,
      };
    });
  },
  measureRegistry() {
    return invokeRegistryCallback(() => ({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 100000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    }));
  },
};
const unavailable = () => {
  permissions++;
  throw new Error('ordinary supervisor absent');
};
const refuseEffect = () => {
  throw new Error('Unexpected contender fixture effect');
};
let observed: typeof RegistryContenderObservation.infer | undefined;
await completeRegistryFixture(async () => {
  if (request.family === 'acquire') {
    await originalJournal.executeRegistryCommand(
      directory,
      {
        command: 'initialize',
        enrollment: {
          registryId: 'contender',
          storageId: 'volume',
          owners: ['owner'],
          registryPath: '/registry',
          rootPath: '/',
          maximumBytes: 50 * GiB,
          journalMaximumBytes: GiB,
        },
      },
      measure,
    );
    await originalJournal.executeRegistryCommand(
      directory,
      { command: 'upgrade-maintenance' },
      measure,
    );
    try {
      await originalJournal.runRegistryMaintenance(
        directory,
        { operationId: 'interrupted', owner: 'owner', kind: 'backup', recover: false },
        measure,
        () =>
          invokeRegistryCallback(() => {
            throw interrupted;
          }),
      );
    } catch (cause) {
      hasSetupFailure = cause === interrupted;
    }
    if (!hasSetupFailure) throw new Error('Actual journal did not retain original setup refusal');
    initialMeasured = measured;
  }
  await mock.module('node:fs', () => ({ ...originalSynchronous, openSync: refuseEffect }));
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: new Proxy(originalFiles.readFile, {
      apply(read, receiver, args: unknown[]) {
        const path = args[0];
        if (path === '/etc/puni/registry-backup-fault.json')
          return invokeRegistryCallback(() => JSON.stringify({ worker: 123, startTicks: '456' }));
        if (typeof path !== 'string' || !path.startsWith(directory + '/'))
          throw new Error('Unexpected contender read path');
        const pending: unknown = Reflect.apply(read, receiver, args);
        if (!isPromise(pending)) throw new Error('Missing native contender read Promise');
        return pending;
      },
    }),
    writeFile: new Proxy(originalFiles.writeFile, {
      apply(write, receiver, args: unknown[]) {
        const path = args[0];
        if (request.family === 'invoke') {
          if (
            path !== '/root/task8-fixture/admission' &&
            path !== '/root/task8-fixture/restic-terminal.log'
          )
            throw new Error('Unexpected contender setup write');
          writes.push(path);
          return Promise.resolve();
        }
        if (typeof path !== 'string' || !path.startsWith(directory + '/'))
          throw new Error('Unexpected contender journal write');
        const pending: unknown = Reflect.apply(write, receiver, args);
        if (!isPromise(pending)) throw new Error('Missing native contender write Promise');
        return pending;
      },
    }),
  }));
  await mock.module('./registry-managed-journal', () => ({
    ...originalJournal,
    executeRegistryCommand(
      path: string,
      ...args: Parameters<typeof journal.executeRegistryCommand> extends [string, ...infer Tail]
        ? Tail
        : never
    ) {
      if (path !== '/var/lib/puni-registry/journal/contents')
        throw new Error('Unexpected fixed contender journal');
      return originalJournal.executeRegistryCommand(directory, ...args);
    },
  }));
  await mock.module('./registry-maintenance-host.fixture', () => ({
    ...originalPreparation,
    prepareRegistryHostFixture() {
      return Promise.resolve(undefined);
    },
  }));
  Bun.spawn = new Proxy(nativeSpawn, { apply: refuseEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  process.kill = new Proxy(process.kill.bind(process), {
    apply(_kill, _receiver, args: unknown[]) {
      probes.push(args);
      if (request.family !== 'acquire' || args[0] !== -123 || args[1] !== 0)
        throw new Error('Unexpected contender group probe');
      if (request.fault === 'absent') throw Object.assign(new Error('absent'), { code: 'ESRCH' });
      if (request.fault === 'live') return undefined;
      throw injected;
    },
  });
  console.log = (...args: unknown[]) => {
    if (args.length !== 1 || typeof args[0] !== 'string')
      throw new Error('Unexpected contender diagnostic');
    if (
      request.family === 'invoke' &&
      (request.fault === 'reporter-always' ||
        (request.fault === 'reporter-once' && args[0].includes('"backupOwnerFailure"')))
    )
      throw reporter;
    output.push(args[0]);
  };
  const { contendRegistryBackup, proveRegistryBackupInterruption } =
    await import('./registry-backup-interruption.native');
  let completion: { state: 'fulfilled' } | { state: 'rejected'; cause: unknown };
  try {
    if (request.family === 'acquire')
      await contendRegistryBackup('acquire', {
        ...measure,
        permit: {
          isFresh: unavailable,
          revoke: unavailable,
          confirmReadonly: unavailable,
          prepare: unavailable,
          publish: unavailable,
        },
      });
    else
      await proveRegistryBackupInterruption('owner-eof', (command) =>
        invokeRegistryCallback(() => {
          commands.push(command);
          return {
            code: 1,
            stdout: 'PRIVATE',
            stderr: 'PRIVATE_TOKEN\nNative host fixture operation failed\n',
          };
        }),
      );
    completion = { state: 'fulfilled' };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const nested = members.at(0);
  const nestedMembers: unknown[] = nested instanceof AggregateError ? nested.errors : [];
  const isStage = (value: unknown) =>
    value instanceof Error &&
    !(value instanceof AggregateError) &&
    value.message === 'Backup interruption owner stage failed';
  observed = RegistryContenderObservation.assert({
    state: completion.state,
    message: cause instanceof Error ? cause.message : null,
    isOriginalFailure: cause === injected,
    isAggregateError: cause instanceof AggregateError,
    memberCount: members.length,
    nestedMemberCount: nestedMembers.length,
    hasStageFirst: isStage(members.at(0)),
    hasReporterSecond: members.at(1) === reporter,
    hasReporterCause: cause instanceof AggregateError && cause.cause === reporter,
    hasNestedStageFirst: isStage(nestedMembers.at(0)),
    hasNestedReporterSecond: nestedMembers.at(1) === reporter,
    hasNestedReporterCause: nested instanceof AggregateError && nested.cause === reporter,
    hasSetupFailure,
    measurements: measured - initialMeasured,
    permissions,
    output,
    probes,
    commands,
    writes,
  });
}, [
  async () => {
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    Object.defineProperty(process, 'kill', killDescriptor);
    console.log = nativeLog;
    await mock.module('node:fs', () => originalSynchronous);
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-managed-journal', () => originalJournal);
    await mock.module('./registry-maintenance-host.fixture', () => originalPreparation);
  },
  async () => {
    await originalFiles.rm(directory, { recursive: true });
  },
]);
console.log(JSON.stringify(RegistryContenderObservation.assert(observed)));
