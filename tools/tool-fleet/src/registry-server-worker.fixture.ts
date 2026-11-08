import { constants } from 'node:fs';
import * as filesystem from 'node:fs/promises';

import { type } from 'arktype';
import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import * as installation from './registry-maintenance-installation';
import * as lifetime from './registry-maintenance-process';
import {
  RegistryServerObservation,
  RegistryServerObservationRequest,
} from './registry-server-observation.fixture';
import * as streams from './registry-stream';

const request = RegistryServerObservationRequest.assert(JSON.parse(process.argv.at(2) ?? 'null'));
const originalFiles = { ...filesystem },
  originalInstallation = { ...installation };
const originalLifetime = { ...lifetime },
  originalStreams = { ...streams };
const nativeSpawn = Bun.spawn,
  nativeSpawnSync = Bun.spawnSync,
  nativeFetch = globalThis.fetch;
const nativePassword = Bun.password;
const hashDescriptor = Object.getOwnPropertyDescriptor(nativePassword, 'hash');
if (hashDescriptor === undefined) throw new Error('Missing worker password descriptor');
const primary: unknown =
  request.primary === 'error'
    ? new Error('owned exact server failure')
    : request.primary === 'undefined'
      ? undefined
      : request.primary === 'null'
        ? null
        : 'owned cancellation';
const cleanupFailure = new Error('owned authentication cleanup failure');
const observations: string[] = [],
  cleanupPaths: string[] = [],
  authWrites: string[] = [];
let active = false,
  requests = 0,
  pipeSettlements = 0,
  hasSettledBeforeCleanup = true;
let authClosed = false,
  listenerChecks = 0;
let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
let spawnCommand: string[] = [];
let spawnOptions: unknown = null;
const pin = {
  apiVersion: 'v1',
  kind: 'Node',
  name: 'modeled',
  namespace: null,
  uid: 'modeled',
  owner: null,
  specificationSha256: 'a'.repeat(64),
};
const artifact = (path: string) => ({ path, sha256: 'a'.repeat(64) });
const storage = {
  path: '/owned',
  storageId: '00000000-0000-4000-8000-000000000001',
  identityReceipt: '/modeled/receipt',
  maximumBytes: 1024,
  pvc: pin,
  pv: pin,
  guard: pin,
  deployment: pin,
};
const installed = installation.RegistryMaintenanceInstallation.assert({
  schemaVersion: 1,
  registryId: 'modeled',
  maintenanceOwner: 'modeled',
  journalPath: '/var/lib/puni-registry/journal/contents',
  journalIdentityReceipt: '/var/lib/puni-registry/journal/identities/journal.receipt',
  journalMaximumBytes: 1024,
  journalPvc: pin,
  journalPv: pin,
  machineId: 'a'.repeat(32),
  node: pin,
  controller: pin,
  service: pin,
  serviceSelector: {},
  kubernetes: artifact('/modeled/k3s'),
  managementKubeconfig: artifact('/modeled/management'),
  productionKubeconfig: artifact('/modeled/production'),
  distribution: artifact('/pinned/registry'),
  readonlyConfiguration: artifact('/modeled/readonly'),
  deletionConfiguration: artifact('/modeled/deletion'),
  backupConfiguration: artifact('/modeled/backup'),
  backupWorker: artifact('/modeled/worker'),
  owners: [pin, pin, pin, pin],
  sources: [pin, pin].map((resource) => ({
    resource,
    revision: 'modeled',
    digest: 'sha256:' + 'a'.repeat(64),
  })),
  ordinary: storage,
  recovery: { state: 'unenrolled' },
});
const configuration = {
  version: 0.1,
  log: { level: 'error' },
  storage: {
    filesystem: { rootdirectory: '/owned' },
    delete: { enabled: request.action !== 'readonly' },
    maintenance: {
      readonly: { enabled: request.action === 'readonly' },
      uploadpurging: { enabled: false },
    },
  },
  http: { addr: '127.0.0.1:5051' },
  auth: {
    htpasswd: {
      realm: 'puni-registry-maintenance',
      path: '/run/puni-registry-maintenance/auth.htpasswd',
    },
  },
};
const refuseEffect = () => {
  throw new Error('Unexpected server fixture effect');
};
const metadata = () => ({
  ino: 1,
  uid: 0,
  gid: 59001,
  mode: 0o750,
  nlink: 1,
  isFile: () => true,
  isDirectory: () => true,
});
const checkSettled = () => {
  const settled =
    request.family === 'native'
      ? child !== undefined && (child.exitCode !== null || child.signalCode !== null)
      : !active;
  hasSettledBeforeCleanup =
    hasSettledBeforeCleanup && settled && pipeSettlements === (request.phase === 'spawn' ? 0 : 2);
};
const files = {
  ...originalFiles,
  readFile(path: string, encoding: unknown) {
    return invokeRegistryCallback(() => {
      if (path !== '/proc/net/tcp' || encoding !== 'utf8')
        throw new Error('Unexpected server proc read');
      listenerChecks++;
      return 'header\n 0: 0100007F:13BB 00000000:0000 0A 0:0 0:0 0 0 0 987\n';
    });
  },
  readdir(path: string) {
    return invokeRegistryCallback(() => {
      const pid = request.family === 'native' ? child?.pid : 123;
      if (path !== `/proc/${String(pid)}/fd`) throw new Error('Unexpected server descriptors');
      return ['9'];
    });
  },
  readlink(path: string) {
    return invokeRegistryCallback(() => {
      const pid = request.family === 'native' ? child?.pid : 123;
      if (path !== `/proc/${String(pid)}/fd/9`) throw new Error('Unexpected server socket link');
      return 'socket:[987]';
    });
  },
  lstat(path: string) {
    return invokeRegistryCallback(() => {
      if (path === '/run/puni-registry-maintenance') return metadata();
      if (path !== '/run/puni-registry-maintenance/auth.htpasswd')
        throw new Error('Unexpected server metadata');
      checkSettled();
      cleanupPaths.push(path);
      observations.push('metadata');
      if (request.fault === 'metadata') throw cleanupFailure;
      return { ...metadata(), ino: request.fault === 'identity' ? 2 : 1 };
    });
  },
  realpath(path: string) {
    return invokeRegistryCallback(() => {
      if (path !== '/run/puni-registry-maintenance') throw new Error('Unexpected server realpath');
      return path;
    });
  },
  open(path: string, flags: unknown, mode: unknown) {
    return invokeRegistryCallback(() => {
      if (
        path !== '/run/puni-registry-maintenance/auth.htpasswd' ||
        flags !==
          (constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW) ||
        mode !== 0o640
      )
        throw new Error('Unexpected server auth open');
      observations.push('authentication');
      return {
        chmod(mode: number) {
          return invokeRegistryCallback(() => {
            if (mode !== 0o640) throw new Error('Unexpected server auth mode');
          });
        },
        writeFile(text: string) {
          return invokeRegistryCallback(() => {
            authWrites.push(text);
          });
        },
        sync() {
          return Promise.resolve();
        },
        stat() {
          return Promise.resolve({ ino: 1 });
        },
        close() {
          return invokeRegistryCallback(() => {
            authClosed = true;
          });
        },
      };
    });
  },
  chown(path: string, uid: unknown, gid: unknown) {
    return invokeRegistryCallback(() => {
      if (path !== '/run/puni-registry-maintenance/auth.htpasswd' || uid !== 0 || gid !== 59001)
        throw new Error('Unexpected server auth ownership');
    });
  },
  unlink(path: string) {
    return invokeRegistryCallback(() => {
      if (path !== '/run/puni-registry-maintenance/auth.htpasswd')
        throw new Error('Unexpected server unlink');
      checkSettled();
      cleanupPaths.push(path);
      observations.push('unlink');
      if (request.fault === 'unlink') throw cleanupFailure;
    });
  },
  writeFile: refuseEffect,
  appendFile: refuseEffect,
  mkdir: refuseEffect,
  rm: refuseEffect,
  rename: refuseEffect,
};
let observed: typeof RegistryServerObservation.infer | undefined;
await completeRegistryFixture(async () => {
  await mock.module('node:fs/promises', () => files);
  await mock.module('./registry-maintenance-installation', () => ({
    ...originalInstallation,
    verifyRegistryHostArtifact(artifact: { path: string }) {
      return invokeRegistryCallback(() => {
        if (!['/pinned/registry', '/modeled/deletion', '/modeled/readonly'].includes(artifact.path))
          throw new Error('Unexpected server artifact');
        return Buffer.from(JSON.stringify(configuration));
      });
    },
  }));
  await mock.module('./registry-maintenance-process', () => ({
    ...originalLifetime,
    awaitMaintenanceChild(
      owned: Parameters<typeof lifetime.awaitMaintenanceChild>[0],
      signal: AbortSignal,
    ) {
      if (request.family === 'native') return originalLifetime.awaitMaintenanceChild(owned, signal);
      if (request.action === 'collect') {
        active = false;
        observations.push('settled');
        return Promise.resolve();
      }
      return new Promise<{ cause: unknown }>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            active = false;
            observations.push('settled');
            resolve({ cause: signal.reason });
          },
          { once: true },
        );
      }).then(({ cause }) => {
        throw cause;
      });
    },
  }));
  await mock.module('./registry-stream', () => ({
    ...originalStreams,
    async consumeRegistryStream(...args: Parameters<typeof streams.consumeRegistryStream>) {
      await originalStreams.consumeRegistryStream(...args);
      pipeSettlements++;
    },
  }));
  Bun.password.hash = new Proxy(nativePassword.hash.bind(nativePassword), {
    apply(_hash, _receiver, args: unknown[]) {
      if (args[0] !== '11111111-1111-4111-8111-111111111111')
        throw new Error('Unexpected server auth token');
      return Promise.resolve('modeled-bcrypt');
    },
  });
  Bun.spawn = new Proxy(nativeSpawn, {
    apply(_spawn, _receiver, args: unknown[]) {
      spawnCommand = type('string[]').assert(args[0]);
      spawnOptions = args[1];
      observations.push('spawn');
      if (request.phase === 'spawn') throw primary;
      active = true;
      if (request.family === 'native') {
        child = nativeSpawn(
          [process.execPath, '-e', '/* task8-owned-tag-server */ setInterval(() => {}, 1000)'],
          { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return child;
      }
      return {
        pid: 123,
        exitCode: null,
        stdout: new ReadableStream({
          start(stream) {
            stream.close();
          },
        }),
        stderr: new ReadableStream({
          start(stream) {
            stream.close();
          },
        }),
      };
    },
  });
  Bun.spawnSync = new Proxy(nativeSpawnSync, { apply: refuseEffect });
  globalThis.fetch = new Proxy(nativeFetch, {
    apply(_fetch, _receiver, args: unknown[]) {
      if (args[0] !== 'http://127.0.0.1:5051/v2/') throw new Error('Unexpected server endpoint');
      return Promise.resolve(new Response('', { status: requests++ === 0 ? 200 : 401 }));
    },
  });
  const { runRegistryMaintenanceServer } = await import('./registry-maintenance-server');
  let completion: { state: 'fulfilled' } | { state: 'rejected'; cause: unknown };
  try {
    await runRegistryMaintenanceServer({
      installed,
      storage: installed.ordinary,
      action: request.action,
      token: '11111111-1111-4111-8111-111111111111',
      descriptor: 3,
      signal: AbortSignal.timeout(8000),
      ready() {
        observations.push('ready');
        return invokeRegistryCallback(() => {
          throw primary;
        });
      },
    });
    completion = { state: 'fulfilled' };
  } catch (cause) {
    completion = { state: 'rejected', cause };
  }
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const secondary = members.at(1);
  let code: number | null = null,
    signal: string | null = null,
    groupAbsent: boolean | null = null;
  if (request.family === 'native') {
    if (child === undefined) throw new Error('Missing owned native server child');
    code = await child.exited;
    signal = child.signalCode;
    groupAbsent = false;
    try {
      process.kill(-child.pid, 0);
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH'))
        throw failure;
      groupAbsent = true;
    }
  }
  observed = RegistryServerObservation.assert({
    state: completion.state,
    isOriginalFailure: completion.state === 'rejected' && cause === primary,
    isAggregateError: cause instanceof AggregateError,
    hasOriginalFirst: members.length > 0 && members[0] === primary,
    hasCleanupSecond: members.length > 1 && secondary === cleanupFailure,
    hasCleanupCause: cause instanceof AggregateError && cause.cause === cleanupFailure,
    hasIdentityCause: cause instanceof AggregateError && cause.cause === secondary,
    memberCount: members.length,
    cleanupMessage: secondary instanceof Error ? secondary.message : null,
    observations,
    cleanupPaths,
    hasSettledBeforeCleanup,
    pipeSettlements,
    requests,
    code,
    signal,
    groupAbsent,
    spawnCommand,
    spawnOptions,
    authWrites,
    authClosed,
    listenerChecks,
  });
}, [
  async () => {
    if (child !== undefined) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await Promise.race([
        child.exited,
        Bun.sleep(2000).then(() => {
          throw new Error('Owned server worker rescue deadline');
        }),
      ]);
    }
  },
  async () => {
    Bun.spawn = nativeSpawn;
    Bun.spawnSync = nativeSpawnSync;
    globalThis.fetch = nativeFetch;
    Object.defineProperty(nativePassword, 'hash', hashDescriptor);
    await mock.module('node:fs/promises', () => originalFiles);
    await mock.module('./registry-maintenance-installation', () => originalInstallation);
    await mock.module('./registry-maintenance-process', () => originalLifetime);
    await mock.module('./registry-stream', () => originalStreams);
  },
]);
console.log(JSON.stringify(RegistryServerObservation.assert(observed)));
