import { constants } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { isPromise } from 'node:util/types';

import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as actions from './registry-maintenance-actions';
import { RegistryTagObservation, RegistryTagRequest } from './registry-tag-observation.fixture';

const request = RegistryTagRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalActions = { ...actions };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync;
const uid = Object.getOwnPropertyDescriptor(process, 'getuid'),
  kill = Object.getOwnPropertyDescriptor(process, 'kill');
if (uid === undefined || !uid.configurable || kill === undefined)
  throw new Error('Missing isolated tag process descriptors');
const directory = await originalFiles.mkdtemp('/tmp/task8-tag-observation-');
const manifests = join(directory, 'docker/registry/v2/repositories/retained/expired/_manifests');
const digest = 'sha256:' + 'a'.repeat(64),
  tag = join(manifests, 'tags/expired/current/link'),
  revision = join(manifests, 'revisions/sha256', 'a'.repeat(64), 'link');
const originalMode = ['private-mode', 'mode-drift', 'restore-noop', 'restore-widen'].includes(
  request.fault,
)
  ? 0o600
  : request.fault === 'unsupported-mode'
    ? 0o666
    : 0o644;
const records: unknown[] = [],
  probes: unknown[] = [],
  readyModes: number[] = [],
  restoreStates: boolean[] = [];
const files: Awaited<ReturnType<typeof originalFiles.open>>[] = [];
let ready = false,
  terminal = false,
  opened = false,
  spawned = false,
  reads = 0;
const failure = new Error('private injected dispatch failure');
let finish: ((code: number) => void) | undefined;
const exited = new Promise<number>((resolve) => {
  finish = resolve;
});
const child: {
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  exited: Promise<number>;
} = { pid: 123, exitCode: null, signalCode: null, exited };
const refuseEffect = () => {
  throw new Error('Unexpected tag observation effect');
};
const spawn = new Proxy(nativeSpawn, {
  apply() {
    spawned = true;
    return child;
  },
});
const finishChild = (code: number) => {
  if (finish === undefined) throw new Error('Missing modeled tag exit capability');
  finish(code);
};
let observed: typeof RegistryTagObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await originalFiles.mkdir(join(manifests, 'tags/expired/current'), { recursive: true });
  await originalFiles.mkdir(join(manifests, 'revisions/sha256', 'a'.repeat(64)), {
    recursive: true,
  });
  await originalFiles.writeFile(
    tag,
    request.fault === 'bytes' ? 'sha256:' + 'b'.repeat(64) : digest,
  );
  await originalFiles.writeFile(revision, digest);
  const prepared = await originalFiles.open(tag, constants.O_RDONLY);
  await completeRegistryFixture(async () => {
    await prepared.chmod(originalMode);
  }, [
    async () => {
      await prepared.close();
    },
  ]);
  const input = {
    request: {
      action: request.fault === 'caller-action' ? 'collect' : 'serve-deletion',
      operationId: 'owned',
    },
    installed: {
      distribution: { path: '/pinned/registry' },
      deletionConfiguration: { path: '/pinned/deletion.json' },
      journalPath: '/journal',
      ordinary: { path: directory, storageId: 'storage' },
    },
    journal: {
      enrollment: { registryId: 'registry', registryPath: directory, storageId: 'storage' },
      maintenance: { phase: 'deleting' },
      maintenanceEvidence: {
        operationId: 'owned',
        backup:
          request.fault === 'backup'
            ? null
            : {
                registryId: 'registry',
                registryPath: directory,
                storageId: 'storage',
                journalPath: '/journal',
              },
        plan: JSON.stringify({
          retireRevisions: [
            { repository: request.fault === 'plan' ? 'wrong' : 'retained/expired', digest },
          ],
        }),
        deletions: [
          {
            repository: 'retained/expired',
            digest,
            tags: ['expired'],
            state: request.fault === 'pending-state' ? 'accepted' : 'pending',
          },
        ],
      },
    },
    async ready(_message: string) {
      ready = true;
      readyModes.push((await originalFiles.lstat(tag)).mode & 0o777);
      if (request.fault === 'ready-failure') throw failure;
    },
  };
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: new Proxy(originalFiles.readFile, {
      apply(read, receiver, args: unknown[]) {
        const path = args[0];
        if (path === '/proc/1/cmdline')
          return invokeRegistryCallback(() =>
            request.fault === 'caller-namespace'
              ? 'PRIVATE_FOREIGN_NAMESPACE'
              : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0' +
                (request.fault === 'restore-kill-mode'
                  ? 'prove-restore-kill'
                  : request.fault === 'recovery-mode'
                    ? 'prove-tag-recovery'
                    : 'prove-tag-cleanup') +
                '\0',
          );
        if (path === '/proc/123/status')
          return invokeRegistryCallback(
            () =>
              `Uid:\t${request.fault === 'server-uid' ? '0\t0\t0\t0' : '59001\t59001\t59001\t59001'}\nGid:\t59001\t59001\t59001\t59001\n`,
          );
        if (path !== revision || args[1] !== 'utf8') throw new Error('Unexpected tag content read');
        const pending: unknown = Reflect.apply(read, receiver, args);
        if (!isPromise(pending)) throw new Error('Missing real tag read Promise');
        return pending;
      },
    }),
    async open(...args: Parameters<typeof originalFiles.open>) {
      if (request.fault === 'open') throw failure;
      if (
        args[0] !== tag ||
        args[1] !== (constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      )
        throw new Error('Unexpected owned tag open');
      const file = await originalFiles.open(...args);
      files.push(file);
      opened = true;
      return {
        async stat() {
          const metadata = await file.stat();
          return Object.assign(metadata, {
            uid: request.fault === 'owner' ? 1 : 59001,
            gid: 59001,
          });
        },
        async read(buffer: Uint8Array, offset: number, length: number, position: number) {
          const captured = await file.read(buffer, offset, length, position);
          reads++;
          if (request.fault === 'changed-after' && reads === 2) buffer.fill(98);
          return captured;
        },
        async chmod(bits: number) {
          if (bits !== 0) {
            restoreStates.push(terminal);
            if (request.fault === 'restore-failure' || request.fault === 'restore-only')
              throw new Error('fixed restore failure');
          }
          if (bits !== 0 && request.fault === 'restore-noop') return;
          await file.chmod(bits !== 0 && request.fault === 'restore-widen' ? 0o644 : bits);
        },
        async close() {
          await file.close();
          if (request.fault === 'close' || request.fault === 'close-only')
            throw new Error('fixed close failure');
        },
      };
    },
    lstat: new Proxy(originalFiles.lstat, {
      apply(stat, receiver, args: unknown[]) {
        if (args[0] !== tag && args[0] !== revision)
          throw new Error('Unexpected tag metadata path');
        if (request.fault === 'revision-access' && args[0] === revision)
          return Promise.reject(
            Object.assign(new Error('fixed revision access'), { code: 'EACCES' }),
          );
        const pending: unknown = Reflect.apply(stat, receiver, args);
        if (!isPromise(pending)) throw new Error('Missing real tag metadata Promise');
        return pending;
      },
    }),
    appendFile(path: string, bytes: string, options: unknown) {
      return invokeRegistryCallback(() => {
        if (
          path !== '/root/task8-fixture/deletion-fault.log' ||
          JSON.stringify(options) !== '{"mode":384}'
        )
          throw new Error('Unexpected tag receipt append');
        if (['reporter', 'reporter-after', 'report-only'].includes(request.fault))
          throw new Error('fixed reporter failure');
        const record: unknown = JSON.parse(bytes);
        records.push(record);
      });
    },
    writeFile: refuseEffect,
    mkdir: refuseEffect,
    rm: refuseEffect,
    unlink: refuseEffect,
    rename: refuseEffect,
  }));
  await mock.module('./registry-maintenance-actions', () => ({
    ...originalActions,
    async executeRegistryHostAction(
      actual: Parameters<typeof actions.executeRegistryHostAction>[0],
    ) {
      if (['dispatch', 'reporter', 'close'].includes(request.fault)) {
        terminal = true;
        throw failure;
      }
      Bun.spawn(['/pinned/registry', 'serve', '/pinned/deletion.json'], {
        uid: 59001,
        gid: 59001,
        detached: true,
      });
      if (request.fault === 'mode-drift') {
        const changed = await originalFiles.open(tag, constants.O_RDONLY);
        await completeRegistryFixture(async () => {
          await changed.chmod(0o644);
        }, [
          async () => {
            await changed.close();
          },
        ]);
      }
      if (request.fault === 'changed-before') {
        await originalFiles.unlink(tag);
        await originalFiles.writeFile(tag, digest);
        const replacement = await originalFiles.open(tag, constants.O_RDONLY);
        await completeRegistryFixture(async () => {
          await replacement.chmod(0o644);
        }, [
          async () => {
            await replacement.close();
          },
        ]);
      }
      try {
        if (request.fault !== 'ready-missing') await actual.ready('ready');
      } catch (cause) {
        terminal = true;
        child.exitCode = 1;
        finishChild(1);
        throw cause;
      }
      if (request.fault !== 'not-unlinked') await originalFiles.unlink(revision);
      terminal = true;
      if (request.fault !== 'server-unconfirmed') {
        if (request.fault === 'server-signaled') child.signalCode = 'SIGKILL';
        else child.exitCode = 0;
        finishChild(request.fault === 'server-signaled' ? 137 : 0);
      }
      if (request.fault === 'reporter-after' || request.fault === 'restore-failure') throw failure;
      return 'verified';
    },
  }));
  Object.defineProperty(process, 'getuid', {
    ...uid,
    value: () => (request.fault === 'caller' ? 1 : 0),
  });
  process.kill = new Proxy(process.kill.bind(process), {
    apply(_kill, _receiver, args: unknown[]) {
      probes.push(args);
      if (args[0] !== -123 || args[1] !== 0) throw new Error('Unexpected modeled tag group probe');
      if (request.fault === 'group-alive') return true;
      throw Object.assign(new Error('fixed group observation'), {
        code: request.fault === 'group-access' ? 'EPERM' : 'ESRCH',
      });
    },
  });
  Bun.spawn = spawn;
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  const { failRegistryTagCleanupFixture, describeRegistryTagFailure } =
    await import('./registry-deletion-fault.fixture');
  // Boundary: the test models only fields consumed before/inside its replaced host action. Reflective invocation avoids claiming that this deliberately partial fixture is a fully validated installation or journal.
  let completion: { state: 'fulfilled'; value: unknown } | { state: 'rejected'; cause: unknown };
  try {
    const pending: unknown = Reflect.apply(failRegistryTagCleanupFixture, undefined, [input]);
    if (!isPromise(pending)) throw new Error('Tag helper did not return native Promise');
    completion = { state: 'fulfilled', value: await pending };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  observed = RegistryTagObservation.assert({
    state: completion.state,
    value: completion.state === 'fulfilled' ? completion.value : null,
    message: cause instanceof Error ? cause.message : null,
    isOriginalFailure: completion.state === 'rejected' && cause === failure,
    isAggregateError: cause instanceof AggregateError,
    hasOriginalFirst: members.at(0) === failure,
    diagnostic: describeRegistryTagFailure(cause),
    records,
    ready,
    opened,
    spawned,
    readyModes,
    restoreStates,
    hasClosedDescriptor: files.every((file) => file.fd === -1),
    hasRestoredSpawn: Bun.spawn === spawn,
    finalMode: (await originalFiles.lstat(tag)).mode & 0o777,
    originalMode,
    directory,
    probes,
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
  async () => {
    for (const file of files) if (file.fd !== -1) await file.close();
  },
  async () => {
    await originalFiles.rm(directory, { recursive: true });
  },
]);
console.log(JSON.stringify(RegistryTagObservation.assert(observed)));
