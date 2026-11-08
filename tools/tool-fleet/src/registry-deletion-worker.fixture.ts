import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { isPromise } from 'node:util/types';

import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import {
  RegistryDeletionObservation,
  RegistryDeletionRequest,
} from './registry-deletion-observation.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as indexReaders from './registry-index-authority.fixture';
import * as guard from './registry-maintenance-guard.fixture';
import * as host from './registry-maintenance-host.fixture';
import * as journal from './registry-managed-journal';

const request = RegistryDeletionRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalReaders = { ...indexReaders },
  originalJournal = { ...journal },
  originalGuard = { ...guard },
  originalHost = { ...host };
const nativeFetch = globalThis.fetch,
  nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeLog = console.log;
const directory = await originalFiles.mkdtemp('/tmp/task8-deletion-controller-');
const registry = join(directory, 'registry'),
  journalPath = join(directory, 'journal'),
  home = join(directory, 'fixture'),
  config = join(directory, 'config');
const records: unknown[] = [],
  requests: string[] = [],
  requestedModes: string[] = [],
  guardModes: string[] = [],
  ownedWrites: string[] = [];
let guardCloses = 0;
const content = new Map<string, string>();
for (const label of [
  'expired-root',
  'expired-blob-a',
  'expired-blob-b',
  'expired-blob-c',
  'index-root',
  'index-child-a',
  'index-child-b',
  'index-blob-a',
  'index-blob-b',
  'index-blob-c',
  'index-blob-d',
]) {
  const bytes = 'owned deletion content: ' + label;
  content.set('sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes);
}
const digests = [...content.keys()];
const expired = {
  kind: 'expired',
  operationId: 'expired-op',
  repository: 'retained/expired',
  root: digests[0],
  manifests: [digests[0]],
  blobs: digests.slice(1, 4),
};
const protectedIndex = {
  kind: 'protected',
  operationId: 'protected-op',
  repository: 'retained/index',
  root: digests[4],
  manifests: digests.slice(4, 7),
  blobs: digests.slice(7, 11),
};
const before = {
  schemaVersion: 4,
  protections: [{ roots: [protectedIndex.root] }],
  bundles: [{ original: true }],
};
const after = {
  ...before,
  bundles: request.fault === 'provenance' ? [] : before.bundles,
  maintenance: { phase: 'failed' },
  fenced: request.fault !== 'unfenced',
  maintenanceEvidence: {
    operationId: 'native-host-retire',
    backup: request.fault === 'backup' ? null : { snapshotId: 'verified' },
    retained: [{ repository: 'retained/index', digest: digests[5] }],
    deletions: [
      { digest: expired.root, state: request.fault === 'accepted' ? 'accepted' : 'pending' },
    ],
  },
  retirements: [],
};
const originalMode =
  request.fault === 'original-mode-invalid' ? 0o666 : request.fault === 'none' ? 0o644 : 0o600;
const nativeReceipt =
  request.mode === 'unsafe-gc'
    ? { unsafeGc: { started: true, pid: 123, exitCode: request.fault === 'gc-exit' ? 1 : 0 } }
    : {
        tagCleanup: {
          injected: true,
          revisionAbsent: true,
          tagUnchanged: true,
          modeRestored: true,
          originalMode,
          restoredMode: request.fault === 'restored-mode-differs' ? 0o644 : originalMode,
          serverPid: 123,
          serverTerminal: true,
          serverExitCode: 137,
          serverSignal: 'SIGKILL',
          groupAbsent: true,
        },
      };
const tag = join(
  registry,
  'docker/registry/v2/repositories/retained/expired/_manifests/tags/expired/current/link',
);
const revision = (repository: string, digest: string) =>
  join(
    registry,
    'docker/registry/v2/repositories',
    repository,
    '_manifests/revisions/sha256',
    digest.slice(7),
    'link',
  );
const remap = (path: unknown): string => {
  if (typeof path !== 'string') throw new Error('Unexpected deletion fixture path type');
  if (
    path === '/root/task8-fixture/admission' ||
    path === '/root/task8-fixture/actions.log' ||
    path === '/root/task8-fixture/deletion-fault.log'
  )
    return join(home, path.slice('/root/task8-fixture/'.length));
  if (
    [
      '/etc/puni/ordinary-writer.json',
      '/etc/puni/registry-deletion-protected.json',
      '/etc/puni/registry-fixture-retirement-clock.json',
    ].includes(path)
  )
    return join(config, path.slice('/etc/puni/'.length));
  if (
    path === join(journalPath, 'journal.json') ||
    path === tag ||
    path === revision('retained/expired', expired.root) ||
    path === revision('retained/index', digests[5])
  )
    return path;
  throw new Error('Unexpected deletion fixture filesystem access');
};
const refuseEffect = () => {
  throw new Error('Unexpected native deletion effect');
};
let observed: typeof RegistryDeletionObservation.infer | undefined;
await completeRegistryFixture(async () => {
  for (const path of [registry, journalPath, home, config, join(tag, '..')])
    await originalFiles.mkdir(path, { recursive: true });
  await originalFiles.writeFile(tag, expired.root, {
    mode: request.fault === 'actual-mode-differs' ? 0o644 : originalMode,
  });
  await originalFiles.chmod(tag, request.fault === 'actual-mode-differs' ? 0o644 : originalMode);
  await originalFiles.writeFile(join(journalPath, 'journal.json'), JSON.stringify(before));
  await originalFiles.writeFile(join(home, 'actions.log'), 'baseline\n');
  if (request.fault === 'child-present') {
    const path = revision('retained/index', digests[5]);
    await originalFiles.mkdir(join(path, '..'), { recursive: true });
    await originalFiles.writeFile(path, digests[5]);
  }
  await mock.module('node:fs/promises', () => ({
    ...originalFiles,
    readFile: new Proxy(originalFiles.readFile, {
      apply(read, receiver, args: unknown[]) {
        const pending: unknown = Reflect.apply(read, receiver, [remap(args[0]), ...args.slice(1)]);
        if (!isPromise(pending)) throw new Error('Missing native filesystem Promise');
        return pending;
      },
    }),
    lstat: new Proxy(originalFiles.lstat, {
      apply(stat, receiver, args: unknown[]) {
        const pending: unknown = Reflect.apply(stat, receiver, [remap(args[0]), ...args.slice(1)]);
        if (!isPromise(pending)) throw new Error('Missing native filesystem Promise');
        return pending;
      },
    }),
    writeFile: new Proxy(originalFiles.writeFile, {
      apply(write, receiver, args: unknown[]) {
        const path = remap(args[0]);
        ownedWrites.push(path);
        const pending: unknown = Reflect.apply(write, receiver, [path, ...args.slice(1)]);
        if (!isPromise(pending)) throw new Error('Missing native filesystem Promise');
        return pending;
      },
    }),
  }));
  await mock.module('./registry-maintenance-host.fixture', () => ({
    ...originalHost,
    prepareRegistryHostFixture: () =>
      invokeRegistryCallback(() => ({ installed: { ordinary: { path: registry }, journalPath } })),
  }));
  await mock.module('./registry-index-authority.fixture', () => ({
    ...originalReaders,
    prepareRegistryIndexReaders: () => invokeRegistryCallback(() => undefined),
  }));
  await mock.module('./registry-managed-journal', () => ({
    ...originalJournal,
    parseRegistryCommandResponse: (value: unknown) => value,
  }));
  await mock.module('./registry-maintenance-guard.fixture', () => ({
    ...originalGuard,
    startRegistryFixtureGuard: () =>
      invokeRegistryCallback(() => ({
        waitMode: (mode: string) =>
          invokeRegistryCallback(() => {
            guardModes.push(mode);
          }),
        close: () =>
          invokeRegistryCallback(() => {
            guardCloses++;
          }),
      })),
  }));
  globalThis.fetch = new Proxy(nativeFetch, {
    apply(_fetch, _receiver, args: unknown[]) {
      return invokeRegistryCallback(() => {
        if (typeof args[0] !== 'string') throw new Error('Unexpected deletion content request');
        const url = new URL(args[0]);
        if (
          url.origin !== 'http://127.0.0.1:5052' ||
          !url.pathname.startsWith('/v2/retained/index/')
        )
          throw new Error('Unexpected deletion content endpoint');
        const digest = url.pathname.split('/').at(-1);
        if (digest === undefined || !content.has(digest))
          throw new Error('Unexpected deletion content identity');
        requests.push(url.pathname);
        return new Response(
          request.fault === 'protected-content' ? 'changed protected content' : content.get(digest),
          { status: request.fault === 'protected-status' ? 404 : 200 },
        );
      });
    },
  });
  Bun.spawn = new Proxy(nativeSpawn, { apply: refuseEffect });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  console.log = (text: string) => {
    records.push(JSON.parse(text));
  };
  const http = (status: number) =>
    'task8-population-http:' +
    JSON.stringify({
      pending: 0,
      truncated: false,
      events: [
        {
          started: 1,
          finished: 2,
          method: 'DELETE',
          path: 'manifest',
          endpoint: 'ordinary',
          status,
          transport: 'none',
        },
      ],
    }) +
    '\n';
  const run = async (command: string) => {
    requestedModes.push(command);
    if (command === 'deletion-retire') {
      await originalFiles.writeFile(join(journalPath, 'journal.json'), JSON.stringify(after));
      await originalFiles.appendFile(
        join(home, 'actions.log'),
        'backup-verify:completed\n' +
          (request.mode === 'unsafe-gc'
            ? request.fault === 'early-failure'
              ? 'serve-readonly:entered\ncollect:completed\n'
              : 'collect:completed\nserve-readonly:entered\n'
            : '') +
          (request.fault === 'restore-service' ? 'restore-service:entered\n' : ''),
      );
      await originalFiles.writeFile(
        join(home, 'deletion-fault.log'),
        JSON.stringify(nativeReceipt) + '\n',
      );
      return {
        code: request.fault === 'owner-success' ? 0 : 1,
        stdout: '',
        stderr:
          (request.fault === 'unknown-cause'
            ? 'task8-deletion-retained:unknown\n'
            : 'task8-deletion-retained:missing-child-revision\n') +
          http(request.fault === 'http' ? 404 : 500),
      };
    }
    if (command.startsWith('deletion-publish-'))
      return {
        code: 0,
        stdout: JSON.stringify(command.endsWith('expired') ? expired : protectedIndex),
        stderr: http(202),
      };
    const responses: Readonly<Record<string, string | undefined>> = {
      initialize: 'initialized',
      backup: 'verified-native-backup',
      'index-reopen': 'population-writable-permitted',
      'deletion-protect': 'index-explicitly-protected',
    };
    const output = responses[command];
    if (output === undefined) throw new Error('Unexpected modeled owner command');
    return { code: 0, stdout: output, stderr: '' };
  };
  const { proveRegistryDeletionHost } = await import('./registry-maintenance-deletion.native');
  let completion: { state: 'fulfilled' } | { state: 'rejected'; cause: unknown };
  try {
    await proveRegistryDeletionHost(run, request.mode);
    completion = { state: 'fulfilled' };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  observed = RegistryDeletionObservation.assert({
    state: completion.state,
    message:
      completion.state === 'rejected' && completion.cause instanceof Error
        ? completion.cause.message
        : null,
    records,
    nativeReceipt,
    guardCloses,
    guardModes,
    requests,
    requestedModes,
    ownedWrites,
  });
}, [
  async () => {
    console.log = nativeLog;
    globalThis.fetch = nativeFetch;
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-maintenance-host.fixture', () => originalHost);
    await mock.module('./registry-index-authority.fixture', () => originalReaders);
    await mock.module('./registry-managed-journal', () => originalJournal);
    await mock.module('./registry-maintenance-guard.fixture', () => originalGuard);
  },
  async () => {
    await originalFiles.rm(directory, { recursive: true });
  },
]);
console.log(JSON.stringify(RegistryDeletionObservation.assert(observed)));
