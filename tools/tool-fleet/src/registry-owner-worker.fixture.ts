import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import { mock } from 'bun:test';

import * as interruptions from './registry-backup-interruption.native';
import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as diagnostics from './registry-guard-observation.fixture';
import {
  RegistryOwnerObservation,
  RegistryOwnerObservationRequest,
} from './registry-owner-observation.fixture';

const request = RegistryOwnerObservationRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalInterruptions = { ...interruptions },
  originalDiagnostics = { ...diagnostics };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeLog = console.log;
const killDescriptor = Object.getOwnPropertyDescriptor(process, 'kill');
if (killDescriptor === undefined) throw new Error('Missing isolated process kill descriptor');
const output: string[] = [],
  kills: string[] = [],
  reads: string[] = [];
const failures = new Map<string, unknown>();
const slots =
  request.fault === 'all'
    ? ['owner-exit', 'stdout', 'stderr', 'monitor']
    : request.fault === 'no-fault'
      ? []
      : ['monitor'];
for (const slot of slots) {
  if (request.fault === 'opaque-monitor') {
    failures.set(slot, undefined);
    continue;
  }
  const failure = Object.assign(new Error('PRIVATE_TOKEN_MUST_NOT_REFLECT'), { code: 'EACCES' });
  failure.stack =
    'Error: PRIVATE_TOKEN_MUST_NOT_REFLECT\n    at fixed (/usr/local/libexec/puni-registry-maintenance/proof.js:123:45)';
  failures.set(slot, failure);
}
const observationFailure = new Error('fixed diagnostic failed');
const loggerFailure = new Error('fixed logger failed');
let release: (() => void) | undefined;
let hasObservedHeldCompletion = false;
const stream = (slot: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      if (request.fault === 'delayed-' + slot) {
        release = () => {
          controller.close();
          hasObservedHeldCompletion = true;
        };
        return;
      }
      if (failures.has(slot)) controller.error(failures.get(slot));
      else controller.close();
    },
  });
const createChild = () => {
  const exited =
    request.fault === 'delayed-exit'
      ? new Promise<number>((resolve) => {
          release = () => {
            hasObservedHeldCompletion = true;
            resolve(1);
          };
        })
      : invokeRegistryCallback(() => {
          if (failures.has('owner-exit')) throw failures.get('owner-exit');
          return 1;
        });
  return {
    pid: 123,
    exited,
    stdout: stream('stdout'),
    stderr: stream('stderr'),
    kill(signal: string) {
      kills.push(signal);
    },
  };
};
let spawnCommand: string[] = [],
  spawnOptions: unknown = null,
  monitorOwner: unknown = null;
const refuseEffect = () => {
  throw new Error('Unexpected owner observation effect');
};
let observed: typeof RegistryOwnerObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile(path: string, encoding: unknown) {
      return invokeRegistryCallback(() => {
        reads.push(path);
        if (path !== '/proc/123/stat' || encoding !== 'utf8')
          throw new Error('Unexpected owner proc input');
        return '123 (bun) ' + ['S', ...Array<string>(18).fill('1'), '456'].join(' ');
      });
    },
    open: refuseEffect,
    writeFile: refuseEffect,
    appendFile: refuseEffect,
    rename: refuseEffect,
    rm: refuseEffect,
    mkdir: refuseEffect,
    unlink: refuseEffect,
  }));
  await mock.module('./registry-backup-interruption.native', () => ({
    ...originalInterruptions,
    interruptRegistryBackup(mode: string, owner: unknown) {
      return invokeRegistryCallback(() => {
        if (mode !== 'owner-eof') throw new Error('Unexpected owner interrupt mode');
        monitorOwner = owner;
        if (failures.has('monitor')) throw failures.get('monitor');
        return undefined;
      });
    },
  }));
  await mock.module('./registry-guard-observation.fixture', () => ({
    ...originalDiagnostics,
    describeRegistryGuardObservationFailure(cause: unknown) {
      if (request.fault === 'formatter') throw observationFailure;
      return originalDiagnostics.describeRegistryGuardObservationFailure(cause);
    },
  }));
  Bun.spawn = new Proxy(nativeSpawn, {
    apply(_spawn, _receiver, args: unknown[]) {
      spawnCommand = type('string[]').assert(args[0]);
      spawnOptions = args[1];
      return createChild();
    },
  });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  process.kill = new Proxy(process.kill.bind(process), { apply: refuseEffect });
  console.log = (...args: unknown[]) => {
    if (args.length !== 1 || typeof args[0] !== 'string')
      throw new Error('Unexpected owner diagnostic arguments');
    if (request.fault === 'logger') throw loggerFailure;
    output.push(args[0]);
  };
  const { runNativeOwner } = await import('./registry-maintenance-host.native');
  let hasSettled = false;
  const pending = runNativeOwner(
    'backup-interruption',
    request.fault === 'no-fault' ? undefined : 'owner-eof',
  ).then(
    (value) => {
      hasSettled = true;
      return { state: 'fulfilled' as const, value };
    },
    (cause: unknown) => {
      hasSettled = true;
      return { state: 'rejected' as const, cause };
    },
  );
  let hasSettledBeforeRelease: boolean | null = null;
  if (request.fault.startsWith('delayed-')) {
    if (release === undefined) throw new Error('Missing held owner completion');
    await Bun.sleep(20);
    hasSettledBeforeRelease = hasSettled;
    release();
  }
  const completion = await pending;
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const failureSlots = members.map((member) => {
    if (member === observationFailure) return 'formatter';
    if (member === loggerFailure) return 'logger';
    for (const [slot, failure] of failures) if (member === failure) return slot;
    return 'unexpected';
  });
  observed = RegistryOwnerObservation.assert({
    state: completion.state,
    isAggregateError: cause instanceof AggregateError,
    failureSlots,
    output,
    hasSettledBeforeRelease,
    hasObservedHeldCompletion,
    kills,
    reads,
    spawnCommand,
    spawnOptions,
    monitorOwner:
      monitorOwner === null
        ? null
        : {
            ...type({ pid: 'number', startTicks: 'string', kill: 'Function' }).assert(monitorOwner),
            kill: 'modeled',
          },
    value:
      completion.state === 'fulfilled'
        ? { ...completion.value, worker: completion.value.worker ?? null }
        : null,
  });
}, [
  async () => {
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    Object.defineProperty(process, 'kill', killDescriptor);
    console.log = nativeLog;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-backup-interruption.native', () => originalInterruptions);
    await mock.module('./registry-guard-observation.fixture', () => originalDiagnostics);
  },
]);
console.log(JSON.stringify(RegistryOwnerObservation.assert(observed)));
