import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { mock } from 'bun:test';

import { proveRegistryDockerPull } from './registry-docker-pull.native';
import { awaitMaintenanceChild, installMaintenanceReaper } from './registry-maintenance-process';

const mode = process.argv.at(2);
const allowed = new Set([
  'success',
  'error',
  'aggregate',
  'undefined',
  'null',
  'string',
  'operation-report',
  'summary-report',
  'diagnostics-report',
  'exit',
  'exit+diagnostics-report',
  'signal',
  'signal+summary-report',
  'operation-report+diagnostics-report+summary-report',
  'stdout',
  'stderr',
  'stdout+stderr',
  'spawn',
  'stubborn',
]);
if (mode === undefined || !allowed.has(mode)) throw new Error('Unknown Docker completion case');
const faults = new Set(mode.split('+'));
const original = { ...filesystem };
const directory = await original.mkdtemp('/tmp/task8-docker-completion-');
await original.mkdir(join(directory, 'contents'), { mode: 0o700 });
const base = '/var/lib/puni-registry/recovery/registry/contents';
const mapPath = (path: string) => {
  if (path === base || path.startsWith(base + '/'))
    return join(directory, 'contents') + path.slice(base.length);
  if (path === '/root/task8-fixture/docker-client') return join(directory, 'client');
  throw new Error('Unexpected Docker completion host path');
};
const primary: unknown =
  mode === 'undefined'
    ? undefined
    : mode === 'null'
      ? null
      : mode === 'string'
        ? 'private Docker failure'
        : mode === 'aggregate'
          ? new AggregateError([new Error('private nested')], 'private Docker aggregate')
          : new Error('private Docker failure');
const operationReport = new Error('private operation report');
const summaryReport = new Error('private summary report');
const engineReport = new Error('private engine report');
const signaling = new Error('private signaling observation');
const stdoutFailure = new Error('private stdout failure');
const stderrFailure = new Error('private stderr failure');
await mock.module('node:fs/promises', () => ({
  ...original,
  async readFile(path: string) {
    return path === '/etc/task8-namespace'
      ? 'owned-private-proof\n'
      : await original.readFile(mapPath(path), 'utf8');
  },
  async readdir(path: string) {
    return await original.readdir(mapPath(path));
  },
  async lstat(path: string) {
    const metadata = await original.lstat(mapPath(path));
    // Boundary: synthetic root eligibility also models ownership; directory kind/device and all file bytes remain actual private filesystem observations.
    return Object.assign(metadata, { uid: 0 });
  },
  async mkdir(path: string, options: Parameters<typeof original.mkdir>[1]) {
    return await original.mkdir(mapPath(path), options);
  },
  async writeFile(
    path: string,
    contents: string,
    options: Parameters<typeof original.writeFile>[2],
  ) {
    await original.writeFile(mapPath(path), contents, options);
  },
}));
const payloads = new Map<string, Uint8Array<ArrayBuffer>>();
const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const knownBlobs: string[] = [];
const configurations = new Map<string, { digest: string; layers: string[] }>();
const platforms = ['amd64', 'arm64'].map((architecture) => {
  const layers = ['a', 'b'].map((letter) => 'sha256:' + letter.repeat(64));
  const configuration = encode({
    architecture,
    os: 'linux',
    rootfs: { type: 'layers', diff_ids: layers },
  });
  const configDigest = hash(configuration);
  knownBlobs.push(configDigest);
  configurations.set(architecture, { digest: configDigest, layers });
  payloads.set('/blobs/' + configDigest, configuration);
  const manifest = encode({
    schemaVersion: 2,
    config: {
      digest: configDigest,
      size: configuration.length,
      mediaType: 'application/vnd.oci.image.config.v1+json',
    },
    layers: layers.map((digest) => ({
      digest,
      size: 1,
      mediaType: 'application/vnd.oci.image.layer.v1.tar',
    })),
  });
  const digest = hash(manifest);
  payloads.set('/manifests/' + digest, manifest);
  return {
    digest,
    size: manifest.length,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    platform: { architecture, os: 'linux' },
  };
});
const index = encode({ schemaVersion: 2, manifests: platforms });
const root = hash(index);
payloads.set('/manifests/' + root, index);
const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
const pid = Object.getOwnPropertyDescriptor(process, 'pid');
if (uid === undefined || pid === undefined || !uid.configurable || !pid.configurable)
  throw new Error('Required isolated process descriptors unavailable');
const spawn = Bun.spawn;
const fetch = globalThis.fetch;
const log = console.log;
const children: ReturnType<typeof spawn>[] = [];
const commands: ReturnType<typeof spawn>[] = [];
const readiness = new Map<number, string>();
const platformsVerified: string[] = [];
const terminalCodes = new Map<number, number>();
const drains: Promise<void>[] = [];
installMaintenanceReaper();
const failAfterEof = (stream: ReadableStream<Uint8Array>, cause: Error) => {
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        reader.releaseLock();
        controller.error(cause);
      } else controller.enqueue(chunk.value);
    },
    async cancel(reason: unknown) {
      await reader.cancel(reason);
    },
  });
};
// Boundary: only this isolated child models fixture root/PID1 eligibility, private paths, HTTP and the fixed executable identities. Kernel UID/namespaces are unchanged. Real owned subprocess groups and production reaping/stream logic remain active.
Object.defineProperty(process, 'getuid', { ...uid, value: () => 0 });
Object.defineProperty(process, 'pid', { ...pid, value: 1 });
Bun.spawn = new Proxy(spawn, {
  apply(_spawn, _receiver, arguments_: unknown[]) {
    const command = arguments_.at(0);
    if (Array.isArray(command) && command[0] === '/opt/task8-docker/docker') {
      if (mode !== 'success' || command[1] !== '--host' || typeof command[2] !== 'string')
        throw new Error('Unexpected substitute Docker command');
      const match = /\/docker-(amd64|arm64)\/docker\.sock$/.exec(command[2]);
      const architecture = match?.at(1);
      if (architecture === undefined)
        throw new Error('Substitute Docker command has no owned architecture');
      const configuration = configurations.get(architecture);
      if (configuration === undefined) throw new Error('Substitute Docker config is absent');
      let output: string;
      if (
        command.length === 6 &&
        command[3] === 'info' &&
        command[4] === '--format' &&
        command[5] === '{{json .}}'
      ) {
        output = JSON.stringify({
          Driver: 'vfs',
          Images: 0,
          Containers: 0,
          DockerRootDir: base + '/docker-' + architecture + '/docker',
        });
      } else if (
        command.length === 7 &&
        command[3] === 'pull' &&
        command[4] === '--platform' &&
        command[5] === 'linux/' + architecture &&
        command[6] === '127.0.0.1:5052/retained/index@' + root
      ) {
        output = '';
      } else if (
        command.length === 6 &&
        command[3] === 'image' &&
        command[4] === 'inspect' &&
        command[5] === '127.0.0.1:5052/retained/index@' + root
      ) {
        output = JSON.stringify([
          {
            Id: configuration.digest,
            Architecture: architecture,
            Os: 'linux',
            RootFS: { Type: 'layers', Layers: configuration.layers },
            RepoDigests: ['127.0.0.1:5052/retained/index@' + root],
          },
        ]);
      } else throw new Error('Unrecognized substitute Docker command');
      // Boundary: a fixed printf child supplies synthetic CLI bytes with real subprocess/stream completion; no Docker executable or daemon is used.
      const child = Reflect.apply(spawn, Bun, [
        ['/usr/bin/printf', '%s', output],
        arguments_.at(1),
      ]) as ReturnType<typeof spawn>;
      commands.push(child);
      drains.push(
        child.exited.then((code) => {
          terminalCodes.set(child.pid, code);
        }),
      );
      return child;
    }
    if (
      !Array.isArray(command) ||
      command.length !== 3 ||
      typeof command[0] !== 'string' ||
      (command[0] !== '/opt/task8-docker/containerd' && command[0] !== '/opt/task8-docker/dockerd')
    )
      throw new Error('Unexpected Docker completion executable');
    const role = command[0].endsWith('/containerd') ? 'containerd' : 'dockerd';
    const match =
      typeof command[2] === 'string'
        ? /\/docker-(amd64|arm64)\/(?:containerd\.toml|daemon\.json)$/.exec(command[2])
        : null;
    const architecture = match?.at(1);
    if (architecture === undefined) throw new Error('Substitute engine has no owned architecture');
    if (role === 'dockerd' && mode === 'spawn') throw primary;
    type({ detached: 'true', stdin: "'ignore'", stdout: "'pipe'", stderr: "'pipe'" }).assert(
      arguments_.at(1),
    );
    // Boundary: captured Bun.spawn with verified pipe/detached options returns the actual owned Subprocess; Reflect.apply erases that native overload.
    const child = Reflect.apply(spawn, Bun, [
      [
        process.execPath,
        new URL('./registry-docker-engine.fixture.ts', import.meta.url).pathname,
        role,
        mode,
        directory,
        architecture,
      ],
      arguments_.at(1),
    ]) as ReturnType<typeof spawn>;
    children.push(child);
    readiness.set(child.pid, join(directory, role + '-' + architecture + '.ready'));
    drains.push(
      child.exited.then((code) => {
        terminalCodes.set(child.pid, code);
      }),
    );
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream))
      throw new Error('Owned engine pipes unavailable');
    const stdout =
      role === 'containerd' && faults.has('stdout')
        ? failAfterEof(child.stdout, stdoutFailure)
        : child.stdout;
    const stderr =
      role === 'containerd' && faults.has('stderr')
        ? failAfterEof(child.stderr, stderrFailure)
        : child.stderr;
    return new Proxy(child, {
      get(target, property): unknown {
        if (property === 'stdout') return stdout;
        if (property === 'stderr') return stderr;
        if (property === 'kill')
          return (...signals: unknown[]) => {
            Reflect.apply(target.kill.bind(target), undefined, signals);
            if (role === 'containerd' && faults.has('signal')) throw signaling;
          };
        return Reflect.get(target, property, target);
      },
    });
  },
});
const waitReady = async () => {
  const deadline = Date.now() + 5000;
  for (const child of children.slice(-2)) {
    const marker = readiness.get(child.pid);
    if (marker === undefined) throw new Error('Missing owned readiness marker');
    for (;;) {
      try {
        if ((await original.readFile(marker, 'utf8')) !== 'ready')
          throw new Error('Substitute readiness bytes differ');
        break;
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
      }
      if (Date.now() >= deadline || terminalCodes.has(child.pid))
        throw new Error('Substitute engine readiness failed');
      await Bun.sleep(5);
    }
  }
};
globalThis.fetch = new Proxy(fetch, {
  apply(_fetch, _receiver, arguments_: unknown[]) {
    const request = arguments_.at(0);
    if (request === 'http://localhost/_ping')
      return waitReady().then(async () => {
        if (mode === 'success') {
          const current = children.at(-1);
          const marker = current === undefined ? undefined : readiness.get(current.pid);
          const architecture = marker?.includes('-amd64.ready')
            ? 'amd64'
            : marker?.includes('-arm64.ready')
              ? 'arm64'
              : undefined;
          if (architecture === undefined)
            throw new Error('Missing selected substitute architecture');
          const layerRoot = join(directory, 'contents/docker-' + architecture + '/docker/vfs/dir');
          for (const [layer, names] of [
            ['shared', ['shared.txt']],
            ['release', ['release.txt', 'shared.txt']],
          ] as const) {
            const path = join(layerRoot, layer);
            await original.mkdir(path, { recursive: true, mode: 0o700 });
            for (const name of names)
              await original.writeFile(
                join(path, name),
                name === 'shared.txt' ? 'retained shared layer\n' : 'release 4\n',
                { flag: 'wx', mode: 0o600 },
              );
          }
          return new Response('OK');
        }
        // Boundary: nullish/primitive rejections deliberately exercise exact rejection preservation in the actual Docker caller.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(primary);
      });
    if (
      typeof request !== 'string' ||
      !request.startsWith('http://127.0.0.1:5052/v2/retained/index')
    )
      throw new Error('Unexpected Docker completion request');
    const bytes = payloads.get(request.slice('http://127.0.0.1:5052/v2/retained/index'.length));
    if (bytes === undefined) throw new Error('Missing synthetic Docker content');
    return Promise.resolve(new Response(bytes));
  },
});
console.log = (serialized: unknown) => {
  if (typeof serialized !== 'string') throw new Error('Unexpected Docker completion diagnostic');
  if (serialized.includes('"dockerPlatform"'))
    platformsVerified.push(
      type({ dockerPlatform: "'amd64'|'arm64'" }).assert(JSON.parse(serialized)).dockerPlatform,
    );
  if (serialized.includes('"dockerFailure"') && faults.has('operation-report'))
    throw operationReport;
  if (serialized.includes('"dockerCleanup"') && faults.has('summary-report')) throw summaryReport;
  if (serialized.includes('"ownedDockerDiagnostic"') && faults.has('diagnostics-report'))
    throw engineReport;
};
let completion: { state: 'returned' } | { state: 'threw'; cause: unknown };
const started = performance.now();
try {
  await proveRegistryDockerPull(root, knownBlobs);
  completion = { state: 'returned' };
} catch (cause) {
  completion = { state: 'threw', cause };
} finally {
  Object.defineProperty(process, 'getuid', uid);
  Object.defineProperty(process, 'pid', pid);
  Bun.spawn = spawn;
  globalThis.fetch = fetch;
  console.log = log;
}
const elapsedMs = performance.now() - started;
const groupExists = (child: ReturnType<typeof spawn>) => {
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ESRCH') throw cause;
    return false;
  }
};
try {
  const owned = [...children, ...commands];
  const groupsAbsent = owned.every((child) => !groupExists(child));
  const terminal = owned.every((child) => terminalCodes.has(child.pid));
  const cause = completion.state === 'threw' ? completion.cause : undefined;
  const compound = cause instanceof AggregateError && cause !== primary;
  const members: unknown = completion.state === 'returned' ? [] : compound ? cause.errors : [cause];
  if (!Array.isArray(members)) throw new Error('Invalid Docker completion members');
  const label = (failure: unknown): string => {
    if (failure === primary) return 'primary';
    if (failure === operationReport) return 'operation-report';
    if (failure === summaryReport) return 'summary-report';
    if (failure === engineReport) return 'diagnostics-report';
    if (failure === signaling) return 'signal';
    if (failure === stdoutFailure) return 'stdout';
    if (failure === stderrFailure) return 'stderr';
    if (failure instanceof AggregateError) {
      const nested: unknown = failure.errors;
      if (Array.isArray(nested) && nested.includes(stdoutFailure)) return 'stdout';
      if (Array.isArray(nested) && nested.includes(stderrFailure)) return 'stderr';
    }
    if (failure instanceof Error && failure.name === 'AbortError') return 'abort';
    if (
      failure instanceof Error &&
      /^Fixed maintenance child failed \(exit (17|70|143)\)$/.test(failure.message)
    )
      return 'child-exit';
    return 'unexpected';
  };
  const failures: string[] = members.map((failure: unknown) => label(failure));
  const report = {
    rejected: completion.state === 'threw',
    elapsedMs,
    compound,
    failures,
    originalCause: compound && Object.hasOwn(cause, 'cause') && cause.cause === primary,
    singleExact: !compound && cause === primary,
    groupsAbsent,
    terminal,
    engines: children.length,
    platforms: platformsVerified,
  };
  // Rescue only already-created native capabilities after observing the caller's cleanup outcome; rescue never changes the recorded outcome.
  for (const child of [...children, ...commands]) {
    if (groupExists(child)) {
      const stopped = new AbortController();
      const refusal = new Error('Owned substitute rescue');
      stopped.abort(refusal);
      try {
        await awaitMaintenanceChild(child, stopped.signal);
      } catch (cause) {
        if (cause !== refusal) throw cause;
      }
    }
  }
  await Promise.all(drains);
  if ([...children, ...commands].some(groupExists))
    throw new Error('Owned substitute group survived rescue');
  await original.rm(directory, { recursive: true });
  log(JSON.stringify(report));
} catch (cause) {
  for (const child of [...children, ...commands]) {
    if (groupExists(child)) {
      child.kill('SIGKILL');
      await child.exited;
    }
  }
  await original.rm(directory, { recursive: true });
  throw cause;
}
