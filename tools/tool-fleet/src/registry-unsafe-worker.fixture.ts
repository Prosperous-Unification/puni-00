import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as actions from './registry-maintenance-actions';
import {
  RegistryUnsafeObservation,
  RegistryUnsafeRequest,
} from './registry-unsafe-observation.fixture';

const request = RegistryUnsafeRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalActions = { ...actions };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync;
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  kill = Object.getOwnPropertyDescriptor(process, 'kill');
if (uid === undefined || !uid.configurable || kill === undefined)
  throw new Error('Missing unsafe worker process descriptors');
const commands: unknown[][] = [],
  records: unknown[] = [];
const failure: unknown =
  request.fault === 'null-admission'
    ? null
    : request.fault === 'undefined-admission'
      ? undefined
      : request.fault === 'opaque-admission'
        ? { code: 'owned-admission' }
        : new Error('private injected dispatch failure');
const reporter = new Error('fixed report failure');
const options: { uid: number; gid: number; stdio: ['ignore', 'pipe', 'pipe', number] } = {
  uid: 59001,
  gid: 59001,
  stdio: ['ignore', 'pipe', 'pipe', 3],
};
let finish: ((code: number) => void) | undefined;
const pendingExit = new Promise<number>((resolve) => {
  finish = resolve;
});
const child = {
  pid: request.fault === 'invalid-pid' ? 0 : 123,
  exitCode: request.fault === 'unterminated' ? null : request.fault === 'exit' ? 1 : 0,
  exited:
    request.fault === 'unterminated'
      ? pendingExit
      : Promise.resolve(request.fault === 'exit' ? 1 : 0),
};
let hasForwardedInput = false,
  hasReturnedChild = false;
const refuseEffect = () => {
  throw new Error('Unexpected unsafe worker effect');
};
const spawn = new Proxy(nativeSpawn, {
  apply(_spawn, _receiver, args: unknown[]) {
    commands.push(args);
    if (request.fault === 'spawn') throw failure;
    return child;
  },
});
// Boundary: only action and the two artifact paths are consumed by this fixture before the modeled authority call. This partial input is not installation or journal authority evidence.
const input = {
  request: { action: request.fault === 'action' ? 'fence' : 'collect' },
  installed: {
    distribution: { path: '/pinned/registry' },
    deletionConfiguration: { path: '/pinned/deletion.json' },
  },
} as Parameters<typeof actions.executeRegistryHostAction>[0];
const Receipt = type({
  unsafeGc: { started: 'boolean', pid: 'number | null', exitCode: 'number | null', '+': 'reject' },
  '+': 'reject',
});
let observed: typeof RegistryUnsafeObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile(path: string, encoding: unknown) {
      return invokeRegistryCallback(() => {
        if (path !== '/proc/1/cmdline' || encoding !== 'utf8')
          throw new Error('Unexpected unsafe proc input');
        return request.fault === 'topology'
          ? '/wrong'
          : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-unsafe-gc\0';
      });
    },
    appendFile(path: string, bytes: string, options: unknown) {
      return invokeRegistryCallback(() => {
        if (
          path !== '/root/task8-fixture/deletion-fault.log' ||
          JSON.stringify(options) !== '{"mode":384}'
        )
          throw new Error('Unexpected unsafe receipt boundary');
        if (request.fault === 'reporter' || request.fault === 'reporter-only') throw reporter;
        records.push(Receipt.assert(JSON.parse(bytes)));
      });
    },
    open: refuseEffect,
    lstat: refuseEffect,
    writeFile: refuseEffect,
    mkdir: refuseEffect,
    rm: refuseEffect,
    unlink: refuseEffect,
    rename: refuseEffect,
  }));
  await mock.module('./registry-maintenance-actions', () => ({
    ...originalActions,
    async executeRegistryHostAction(actual: unknown) {
      hasForwardedInput = actual === input;
      if (
        [
          'admission',
          'reporter',
          'null-admission',
          'undefined-admission',
          'opaque-admission',
        ].includes(request.fault)
      )
        throw failure;
      if (request.fault === 'no-child') return 'verified';
      const returned = Bun.spawn(
        [
          '/pinned/registry',
          'garbage-collect',
          request.fault === 'argv' ? '/wrong' : '/pinned/deletion.json',
        ],
        options,
      );
      hasReturnedChild = returned === child;
      if (request.fault === 'duplicate')
        Bun.spawn(['/pinned/registry', 'garbage-collect', '/pinned/deletion.json'], options);
      if (request.fault !== 'unterminated') await returned.exited;
      return 'verified';
    },
  }));
  Object.defineProperty(process, 'getuid', {
    ...uid,
    value: () => (request.fault === 'root' ? 1 : 0),
  });
  process.kill = new Proxy(process.kill.bind(process), { apply: refuseEffect });
  Bun.spawn = spawn;
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  const { collectRegistryUnsafeFixture } = await import('./registry-deletion-fault.fixture');
  const pending = collectRegistryUnsafeFixture(input).then(
    (value) => ({ state: 'fulfilled' as const, value }),
    (cause: unknown) => ({ state: 'rejected' as const, cause }),
  );
  let settlementBeforeRelease: 'fulfilled' | 'rejected' | 'pending' | null = null;
  if (request.fault === 'unterminated') {
    if (finish === undefined) throw new Error('Missing pending unsafe exit capability');
    settlementBeforeRelease = await Promise.race([
      pending.then((completion) => completion.state),
      Bun.sleep(50).then(() => 'pending' as const),
    ]);
    finish(0);
  }
  const completion = await pending;
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  observed = RegistryUnsafeObservation.assert({
    state: completion.state,
    value: completion.state === 'fulfilled' ? completion.value : null,
    message: cause instanceof Error ? cause.message : null,
    isOriginalFailure: completion.state === 'rejected' && cause === failure,
    isAggregateError: cause instanceof AggregateError,
    hasOriginalFirst: members.length > 0 && members[0] === failure,
    hasReporterSecond: members.at(1) === reporter,
    hasReporterCause: cause instanceof AggregateError && cause.cause === reporter,
    isReporterFailure: cause === reporter,
    memberCount: members.length,
    commands,
    records,
    hasForwardedInput,
    hasForwardedOptions: commands.every((command) => command[1] === options),
    hasReturnedChild,
    hasRestoredSpawn: Bun.spawn === spawn,
    settlementBeforeRelease,
  });
}, [
  async () => {
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    Object.defineProperty(process, 'getuid', uid);
    Object.defineProperty(process, 'kill', kill);
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-maintenance-actions', () => originalActions);
  },
]);
console.log(JSON.stringify(RegistryUnsafeObservation.assert(observed)));
