import { link, lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { createNamespaceFixture } from '../fixtures/namespace-audit';
import {
  fenceBackends as runFenceBackends,
  fenceBackendsUnderOwner,
  inspectBackendFence as runInspectBackendFence,
} from './backend-exclusion';
import { assertNoBackendFence } from './backend-fence';
import { excludeManagedDependencies } from './dependency-activation-owner';
import type { RunDocker } from './docker-deadline';
import type { DockerExec } from './docker-exec';
import { assertNoEdgeOwner } from './edge-admission';
import { withDependencyOwner } from './edge-ownership';
import { type EnvLayout, envLayout } from './env';
import { fenceGateways, fenceGatewaysUnderOwner } from './gateway-exclusion';
import { withLock } from './lock';
import { verifyContainerNamespace } from './mount-audit';
import { GROUP_PROGRAM } from './mount-exec-program';

const id = 'a'.repeat(64);
const imageId = `sha256:${'b'.repeat(64)}`;
const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
const sha = 'd'.repeat(40);
const namespaces = new Map<string, typeof verifyContainerNamespace>();
function namespaceFor(layout: EnvLayout): typeof verifyContainerNamespace {
  const namespace = namespaces.get(layout.root);
  if (namespace === undefined) throw new Error('missing fixture namespace binding');
  return namespace;
}
async function fenceBackends(
  layout: EnvLayout,
  sourceSha: string,
  runner: RunDocker,
  totalMs = 60000,
) {
  return await runFenceBackends(layout, sourceSha, runner, totalMs, namespaceFor(layout));
}
async function inspectBackendFence(layout: EnvLayout, runner: RunDocker) {
  return await runInspectBackendFence(layout, runner, namespaceFor(layout));
}

async function refuses(promise: Promise<unknown>, message?: string): Promise<void> {
  let refused = false;
  try {
    await promise;
  } catch (cause) {
    refused = true;
    expect(cause).toBeInstanceOf(Error);
    if (message !== undefined) expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

async function fixture() {
  const root = scratchSync('gateway-exclusion-');
  const layout = { ...envLayout('prod'), root, stateDir: root };
  await mkdir(`${root}/db`);
  await writeFile(`${root}/db/wbs.db`, 'sqlite fixture');
  const container = {
    Id: id,
    Name: '/be-01-blue',
    Image: imageId,
    Mounts: [{ Type: 'bind', Source: `${root}/db`, Destination: '/data', RW: true }],
    Config: {
      Env: ['DB_PATH=/data/wbs.db'],
      Image: image,
      Labels: { 'com.docker.compose.service': 'be-01-blue', 'com.docker.compose.project': 'wbs' },
    },
    HostConfig: {
      Init: true,
      PidMode: '',
      Privileged: false,
      CapAdd: null,
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
      NetworkMode: 'wbs-net',
    },
    NetworkSettings: { Networks: { 'wbs-net': { NetworkID: 'e'.repeat(64) } } },
    RestartCount: 0,
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      Dead: false,
      OOMKilled: false,
      Pid: 123,
      Status: 'running',
      StartedAt: '2026-10-23T00:00:00.000000000Z',
      FinishedAt: '0001-01-01T00:00:00Z',
      ExitCode: 0,
      Error: '',
    },
  };
  const gateway = structuredClone(container);
  gateway.Id = '9'.repeat(64);
  gateway.Name = '/gw-01-blue';
  gateway.Config.Image = image.replace('wbs-be-01', 'wbs-gw-01');
  gateway.Config.Labels['com.docker.compose.service'] = 'gw-01-blue';
  gateway.Mounts = [];
  gateway.Config.Env = [];
  const containers = [container, gateway];
  const calls: string[][] = [];
  let absent = false;
  let fault: (args: string[]) => void | Promise<void> = () => undefined;
  const runner: RunDocker = async (args) => {
    calls.push(args);
    await fault(args);
    if (args[0] === 'ps')
      return containers
        .filter((entry) => !absent || entry === gateway)
        .map((entry) => entry.Id)
        .join('\n');
    if (args[0] === 'inspect')
      return JSON.stringify(containers.filter((entry) => !absent || entry === gateway));
    if (args[0] === 'image')
      return args.includes('--format')
        ? imageId
        : JSON.stringify([{ Id: imageId, Config: { Entrypoint: null } }]);
    if (args[0] === 'update') {
      const target = containers.find((entry) => entry.Id === args.at(-1));
      if (target === undefined) throw new Error('missing update identity');
      target.HostConfig.RestartPolicy.Name = 'no';
      return target.Id;
    }
    if (args[0] === 'stop') {
      const target = containers.find((entry) => entry.Id === args.at(-1));
      if (target === undefined) throw new Error('missing stop identity');
      Object.assign(target.State, {
        Running: false,
        Pid: 0,
        Status: 'exited',
        FinishedAt: '2026-10-23T01:00:00.000000000Z',
      });
      return id;
    }
    throw new Error(`unexpected Docker call ${args.join(' ')}`);
  };
  const mountedNamespaces = new Map<string, Awaited<ReturnType<typeof createNamespaceFixture>>>();
  const boundDirectories = new Map<string, string>();
  const namespaceCalls: { id: string; databasePath: string | null }[] = [];
  async function bindNamespace(identity: string, mode = 'managed-match') {
    const proof = await createNamespaceFixture(
      mode,
      `${root}/db/wbs.db`,
      `${root}/namespace-${identity}`,
    );
    const directory = await lstat(`${root}/db`, { bigint: true });
    boundDirectories.set(identity, `${String(directory.dev)}:${String(directory.ino)}`);
    mountedNamespaces.set(identity, proof);
    return proof;
  }
  await bindNamespace(id);
  namespaces.set(
    root,
    async (
      subject,
      destinations,
      database,
      candidate,
      docker,
      databasePath,
      bounds,
      execDocker,
    ) => {
      if (subject === null || typeof subject !== 'object')
        throw new Error('fixture namespace subject absent');
      const identity: unknown = Reflect.get(subject, 'Id');
      if (typeof identity !== 'string') throw new Error('fixture namespace identity absent');
      if (databasePath === undefined) throw new Error('fixture namespace mode absent');
      namespaceCalls.push({ id: identity, databasePath });
      let proof = mountedNamespaces.get(identity);
      if (proof === undefined) {
        if (databasePath === null)
          throw new Error('unmanaged namespace needs actual mounted adapter fixture');
        proof = await bindNamespace(identity);
      }
      const bound = boundDirectories.get(identity);
      if (bound === undefined) throw new Error('fixture lost bound directory identity');
      let directory: string | undefined;
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = `${root}/${entry.name}`;
        const metadata = await lstat(candidate, { bigint: true });
        if (`${String(metadata.dev)}:${String(metadata.ino)}` === bound) {
          directory = candidate;
          break;
        }
      }
      if (directory === undefined)
        throw new Error('fixture cannot resolve retained directory bind');
      // Preserve the inode of the bound directory across Source rebinds, while reflecting file creation/removal within it.
      if (databasePath !== null)
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
          const target = `${proof.root}/namespace/data/wbs.db${suffix}`;
          try {
            await unlink(target);
          } catch (cause) {
            if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT')
              throw cause;
          }
          try {
            await link(`${directory}/wbs.db${suffix}`, target);
          } catch (cause) {
            if (
              suffix !== '' &&
              cause instanceof Error &&
              'code' in cause &&
              cause.code === 'ENOENT'
            )
              continue;
            throw cause;
          }
        }
      const inspect: RunDocker = async (args, signal) => {
        const output = await docker(args, signal);
        if (args[0] !== 'inspect' || args[1] !== '--format') return output;
        const parsed: unknown = JSON.parse(output);
        if (!Array.isArray(parsed)) return output;
        const member: unknown = parsed.find(
          (entry: unknown) =>
            entry !== null && typeof entry === 'object' && Reflect.get(entry, 'Id') === identity,
        );
        if (member === undefined) throw new Error('fixture namespace target replaced');
        return JSON.stringify(member);
      };
      await verifyContainerNamespace(
        subject,
        destinations,
        database,
        candidate,
        inspect,
        databasePath,
        bounds,
        execDocker ?? proof.exec,
      );
    },
  );
  const execCalls: string[][] = [];
  const exec: DockerExec = async (args, nonce, consume, signal) => {
    const proof = mountedNamespaces.get(args[4] ?? '');
    if (proof === undefined) throw new Error('missing owned namespace fixture');
    const intents = (await readdir(root))
      .filter((name) => /^edge-owner-.*-intent.json$/.test(name))
      .sort();
    const latest = intents.at(-1);
    if (latest === undefined) throw new Error('owned exec intent missing');
    expect(await readFile(`${root}/${latest}`, 'utf8')).toContain(nonce);
    execCalls.push(args);
    await proof.exec(args, nonce, consume, signal);
  };
  await fenceGateways(layout, sha, runner);
  calls.length = 0;
  return {
    gateway,
    exec,
    execCalls,
    bindNamespace,
    namespaceCalls,
    root,
    layout,
    container,
    containers,
    calls,
    runner,
    setAbsent: () => {
      absent = true;
    },
    setFault: (inject: typeof fault) => {
      fault = inject;
    },
  };
}

test('fences both backend colours after fresh gateway exclusion and binds database identity', async () => {
  const f = await fixture();
  const green = structuredClone(f.container);
  green.Id = 'f'.repeat(64);
  green.Name = '/be-01-green';
  green.Config.Labels['com.docker.compose.service'] = 'be-01-green';
  f.containers.push(green);
  const receipt = await fenceBackends(f.layout, sha, f.runner);
  expect(receipt.cohort.blue?.id).toBe(id);
  expect(receipt.cohort.green?.id).toBe(green.Id);
  expect(
    f.namespaceCalls.some((call) => call.id === id && call.databasePath === '/data/wbs.db'),
  ).toBe(true);
  expect(
    f.namespaceCalls.some((call) => call.id === green.Id && call.databasePath === '/data/wbs.db'),
  ).toBe(true);
  expect(f.calls.filter((call) => ['update', 'stop'].includes(call[0] ?? ''))).toEqual([
    ['update', '--restart=no', id],
    ['update', '--restart=no', green.Id],
    ['stop', '--time', '10', id],
    ['stop', '--time', '10', green.Id],
  ]);
  expect(await inspectBackendFence(f.layout, f.runner)).toEqual(receipt);
  await refuses(assertNoBackendFence(f.root));
  expect(f.gateway.State.Running).toBe(false);
});

for (const fault of [
  'missing-gateway',
  'resumed-gateway',
  'empty-backends',
  'foreign-database',
  'duplicate-db-path',
  'unmanaged-writer',
  'shadowed-wal',
] as const) {
  test(`refuses ${fault} before backend publication or effects`, async () => {
    const f = await fixture();
    if (fault === 'missing-gateway')
      await Bun.file(`${f.root}/dependency-gateway-complete.json`).delete();
    if (fault === 'resumed-gateway') f.gateway.State.Pid = 42;
    if (fault === 'empty-backends') f.setAbsent();
    if (fault === 'foreign-database') {
      const green = structuredClone(f.container);
      green.Id = 'f'.repeat(64);
      green.Name = '/be-01-green';
      green.Config.Labels['com.docker.compose.service'] = 'be-01-green';
      green.Config.Env = ['DB_PATH=/data/foreign.db'];
      await writeFile(`${f.root}/db/foreign.db`, 'foreign');
      f.containers.push(green);
    }
    if (fault === 'duplicate-db-path') f.container.Config.Env.push('DB_PATH=/data/wbs.db');
    if (fault === 'unmanaged-writer') {
      const writer = structuredClone(f.container);
      writer.Id = 'f'.repeat(64);
      writer.Name = '/foreign';
      writer.Config.Labels['com.docker.compose.service'] = 'foreign';
      writer.Config.Image = 'foreign:latest';
      f.containers.push(writer);
    }
    if (fault === 'shadowed-wal')
      f.container.Mounts.push({
        Type: 'bind',
        Source: `${f.root}/db`,
        Destination: '/data/wbs.db-wal',
        RW: true,
      });
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
    expect((await readdir(f.root)).some((name) => name.startsWith('dependency-backend'))).toBe(
      false,
    );
  });
}

for (const fault of [
  'skipped-restart',
  'skipped-stop',
  'replacement',
  'restart-drift',
  'database-drift',
  'gateway-drift',
  'completion-drift',
  'interruption',
  'timeout',
] as const) {
  test(`retains evidence and refuses ${fault}`, async () => {
    const f = await fixture();
    let changed = false;
    const runner: RunDocker = async (args, signal) => {
      if (fault === 'skipped-restart' && args[0] === 'update') return id;
      if (fault === 'skipped-stop' && args[0] === 'stop') return id;
      if (args[0] === 'stop' && fault === 'interruption') throw new Error('injected interruption');
      if (args[0] === 'stop' && fault === 'timeout') return await new Promise(() => undefined);
      const output = await f.runner(args, signal);
      if (args[0] === 'update' && !changed) {
        changed = true;
        if (fault === 'replacement') f.container.Id = '8'.repeat(64);
        if (fault === 'restart-drift') f.container.State.StartedAt = '2026-10-23T00:01:00Z';
        if (fault === 'database-drift') f.container.Config.Env = ['DB_PATH=/data/foreign.db'];
        if (fault === 'gateway-drift') f.gateway.HostConfig.RestartPolicy.Name = 'always';
      }
      if (
        fault === 'completion-drift' &&
        args[0] === 'ps' &&
        (await readdir(f.root)).includes('dependency-backend-complete.json')
      )
        f.container.State.Pid = 42;
      return output;
    };
    await refuses(fenceBackends(f.layout, sha, runner, fault === 'timeout' ? 1000 : 60000));
    expect(await readFile(`${f.root}/dependency-backend-intent.json`, 'utf8')).toContain(id);
    expect(f.calls.some((call) => ['start', 'restart', 'rm'].includes(call[0] ?? ''))).toBe(false);
    if (fault === 'skipped-restart') expect(f.calls.some((call) => call[0] === 'stop')).toBe(false);
    await refuses(inspectBackendFence(f.layout, f.runner));
  });
}

for (const companion of [
  'dependency-backend-fence.json',
  'dependency-backend-intent.json',
  'dependency-backend-complete.json',
]) {
  test(`ordinary admission and new fence reject retained ${companion}`, async () => {
    const f = await fixture();
    await writeFile(`${f.root}/${companion}`, '{}');
    await refuses(assertNoBackendFence(f.root));
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect(f.calls).toEqual([]);
  });
}

test('read-only inspection rejects changed intent bytes and gateway evidence bytes', async () => {
  for (const file of ['dependency-backend-intent.json', 'dependency-gateway-complete.json']) {
    const f = await fixture();
    await fenceBackends(f.layout, sha, f.runner);
    const path = `${f.root}/${file}`;
    await writeFile(path, (await readFile(path, 'utf8')) + ' ');
    await refuses(inspectBackendFence(f.layout, f.runner));
  }
});

test('backend executor and inspector own the actual deploy lock', async () => {
  const f = await fixture();
  await withLock(`${f.root}/deploy.lock`, async () => {
    await refuses(fenceBackends(f.layout, sha, f.runner), 'deploy lock held');
    await refuses(inspectBackendFence(f.layout, f.runner), 'deploy lock held');
  });
  expect(f.calls).toEqual([]);
});

test('every backend effect follows readable durable intent and marker', async () => {
  const f = await fixture();
  let effects = 0;
  f.setFault(async (args) => {
    if (!['update', 'stop'].includes(args[0] ?? '')) return;
    const marker = await readFile(`${f.root}/dependency-backend-fence.json`, 'utf8');
    const intent = await readFile(`${f.root}/dependency-backend-intent.json`, 'utf8');
    expect(marker).toBe('{"format":"dependency-backend-fence","version":1}\n');
    expect(intent).toContain(id);
    effects++;
  });
  await fenceBackends(f.layout, sha, f.runner);
  expect(effects).toBe(2);
});

for (const fault of [
  'marker-only',
  'intent-only',
  'completion-only',
  'missing-intent',
  'extra-intent-field',
  'wrong-intent-version',
  'wrong-intent-attempt',
  'foreign-intent-root',
  'extra-completion-field',
  'changed-database',
  'missing-gateway-binding',
  'malformed-gateway-binding',
] as const) {
  test(`inspection refuses strict retained backend state ${fault}`, async () => {
    const f = await fixture();
    await fenceBackends(f.layout, sha, f.runner);
    const marker = `${f.root}/dependency-backend-fence.json`;
    const intent = `${f.root}/dependency-backend-intent.json`;
    const completion = `${f.root}/dependency-backend-complete.json`;
    if (fault === 'marker-only') {
      await Bun.file(intent).delete();
      await Bun.file(completion).delete();
    }
    if (fault === 'intent-only') {
      await Bun.file(marker).delete();
      await Bun.file(completion).delete();
    }
    if (fault === 'completion-only') {
      await Bun.file(marker).delete();
      await Bun.file(intent).delete();
    }
    if (fault === 'missing-intent') await Bun.file(intent).delete();
    if (!['marker-only', 'intent-only', 'completion-only', 'missing-intent'].includes(fault)) {
      const path = fault === 'extra-completion-field' ? completion : intent;
      const record = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      if (fault === 'extra-intent-field' || fault === 'extra-completion-field')
        record['extra'] = true;
      if (fault === 'wrong-intent-version') record['version'] = 2;
      if (fault === 'wrong-intent-attempt') record['attempt'] = '-'.repeat(36);
      if (fault === 'foreign-intent-root') record['root'] = '/foreign';
      if (fault === 'missing-gateway-binding') delete record['gateway'];
      if (fault === 'malformed-gateway-binding')
        record['gateway'] = { markerSha256: 'bad', intentSha256: 'bad', completionSha256: 'bad' };
      if (fault === 'changed-database')
        record['cohort'] = { blue: { database: { host: '/foreign' } }, green: null };
      const contents = JSON.stringify(record);
      await writeFile(path, contents);
      if (path === intent) {
        const completed = JSON.parse(await readFile(completion, 'utf8')) as Record<string, unknown>;
        completed['intentSha256'] = new Bun.CryptoHasher('sha256').update(contents).digest('hex');
        await writeFile(completion, JSON.stringify(completed));
      }
    }
    await refuses(inspectBackendFence(f.layout, f.runner));
  });
}

test('inspection refuses replaced main file at the same database path', async () => {
  const f = await fixture();
  await fenceBackends(f.layout, sha, f.runner);
  await rename(`${f.root}/db/wbs.db`, `${f.root}/db/replaced.db`);
  await writeFile(`${f.root}/db/wbs.db`, 'replaced');
  await refuses(inspectBackendFence(f.layout, f.runner));
});

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  test(`refuses an unmanaged writable hardlink of database${suffix} outside its directory`, async () => {
    const f = await fixture();
    await mkdir(`${f.root}/foreign`);
    if (suffix !== '') await writeFile(`${f.root}/db/wbs.db${suffix}`, 'sidecar');
    await link(`${f.root}/db/wbs.db${suffix}`, `${f.root}/foreign/alias.db`);
    const foreign = structuredClone(f.container);
    foreign.Id = 'f'.repeat(64);
    foreign.Name = '/foreign';
    foreign.Config.Image = 'foreign:latest';
    foreign.Config.Labels['com.docker.compose.service'] = 'foreign';
    foreign.Mounts = [
      { Type: 'bind', Source: `${f.root}/foreign/alias.db`, Destination: '/data/wbs.db', RW: true },
    ];
    f.containers.push(foreign);
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
    expect(f.namespaceCalls.some((call) => call.databasePath === null)).toBe(false);
  });
}
for (const suffix of ['-wal', '-shm', '-journal']) {
  test(`refuses a directory in the SQLite ${suffix} sidecar path`, async () => {
    const f = await fixture();
    await mkdir(`${f.root}/db/wbs.db${suffix}`);
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
  });
}

for (const budget of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`refuses invalid total Docker budget ${String(budget)} before observation`, async () => {
    const f = await fixture();
    await refuses(fenceBackends(f.layout, sha, f.runner, budget));
    expect(f.calls).toEqual([]);
  });
}

for (const fault of [
  'new-member',
  'missing-member',
  'mount-drift',
  'pid-drift',
  'start-drift',
  'restart-drift',
] as const) {
  test(`refuses complete inventory ${fault} after namespace admission before intent`, async () => {
    const f = await fixture();
    await mkdir(`${f.root}/foreign-logs`);
    const foreign = structuredClone(f.container);
    foreign.Id = 'f'.repeat(64);
    foreign.Name = '/foreign';
    foreign.Config.Image = 'foreign:latest';
    foreign.Config.Labels['com.docker.compose.service'] = 'foreign';
    foreign.Mounts = [];
    if (fault !== 'new-member') f.containers.push(foreign);
    let inventories = 0;
    f.setFault((args) => {
      if (args[0] !== 'ps' || ++inventories !== 4) return;
      if (fault === 'new-member') f.containers.push(foreign);
      if (fault === 'missing-member') f.containers.pop();
      if (fault === 'mount-drift')
        foreign.Mounts = [
          { Type: 'bind', Source: `${f.root}/foreign-logs`, Destination: '/logs', RW: false },
        ];
      if (fault === 'pid-drift') foreign.State.Pid = 456;
      if (fault === 'start-drift') foreign.State.StartedAt = '2026-10-23T01:00:00Z';
      if (fault === 'restart-drift') foreign.RestartCount = 1;
    });
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect((await readdir(f.root)).some((name) => name.startsWith('dependency-backend'))).toBe(
      false,
    );
    expect(f.calls.some((args) => ['update', 'stop'].includes(args[0] ?? ''))).toBe(false);
  });
}

test('refuses a missing full-inventory inspected bystander before backend intent', async () => {
  const f = await fixture();
  const foreign = structuredClone(f.container);
  foreign.Id = 'f'.repeat(64);
  foreign.Name = '/foreign';
  foreign.Config.Image = 'foreign:latest';
  foreign.Config.Labels['com.docker.compose.service'] = 'foreign';
  foreign.Mounts = [];
  f.containers.push(foreign);
  const runner: RunDocker = async (args, signal) =>
    args[0] === 'inspect'
      ? JSON.stringify(f.containers.filter((member) => member !== foreign))
      : await f.runner(args, signal);
  await refuses(fenceBackends(f.layout, sha, runner));
  expect((await readdir(f.root)).some((name) => name.startsWith('dependency-backend'))).toBe(false);
});

test('refuses a foreign full-inventory inspected ID before backend intent', async () => {
  const f = await fixture();
  const runner: RunDocker = async (args, signal) =>
    args[0] === 'inspect'
      ? JSON.stringify(
          f.containers.map((member) =>
            member === f.container ? { ...member, Id: '8'.repeat(64) } : member,
          ),
        )
      : await f.runner(args, signal);
  await refuses(fenceBackends(f.layout, sha, runner));
  expect((await readdir(f.root)).some((name) => name.startsWith('dependency-backend'))).toBe(false);
});

for (const colors of ['blue-only', 'two-colour-distinct-family', 'hardlinked-family-directory']) {
  test(`managed actual namespace refuses rebound Source ${colors} before intent`, async () => {
    const f = await fixture();
    await rename(`${f.root}/db`, `${f.root}/retained-db`);
    await mkdir(`${f.root}/db`);
    if (colors === 'hardlinked-family-directory')
      await link(`${f.root}/retained-db/wbs.db`, `${f.root}/db/wbs.db`);
    else await writeFile(`${f.root}/db/wbs.db`, 'replacement family');
    if (colors === 'two-colour-distinct-family') {
      const green = structuredClone(f.container);
      green.Id = 'f'.repeat(64);
      green.Name = '/be-01-green';
      green.Config.Labels['com.docker.compose.service'] = 'be-01-green';
      f.containers.push(green);
      await f.bindNamespace(green.Id);
    }
    await refuses(fenceBackends(f.layout, sha, f.runner));
    expect((await readdir(f.root)).some((name) => name.startsWith('dependency-backend'))).toBe(
      false,
    );
    expect(f.calls.some((args) => ['update', 'stop'].includes(args[0] ?? ''))).toBe(false);
  });
}

test('live owner excludes real managed gateway/backend once and retains all evidence', async () => {
  const f = await fixture();
  for (const name of ['fence', 'intent', 'complete'])
    await unlink(`${f.root}/dependency-gateway-${name}.json`);
  f.gateway.State.Running = true;
  f.gateway.State.Pid = 123;
  f.gateway.State.Status = 'running';
  f.gateway.HostConfig.RestartPolicy.Name = 'unless-stopped';
  let effects = 0;
  const runner: RunDocker = async (args, signal) => {
    if (['update', 'stop'].includes(args[0] ?? '')) {
      const names = await readdir(f.root);
      const intents = names.filter((name) => /^edge-owner-.*-intent.json$/.test(name)).sort();
      const latest = intents.at(-1);
      if (latest === undefined) throw new Error('owner intent missing');
      expect(await readFile(`${f.root}/${latest}`, 'utf8')).toContain(
        args.at(-1) ?? 'missing target',
      );
      effects++;
    }
    return f.runner(args, signal);
  };
  await withDependencyOwner(
    { sha, layouts: [f.layout] },
    async (owner) => {
      await refuses(
        fenceGatewaysUnderOwner(owner, f.layout, 'f'.repeat(40), runner, performance.now() + 60000),
        'SHA differs',
      );
      await fenceGatewaysUnderOwner(owner, f.layout, sha, runner, performance.now() + 60000);
      await fenceBackendsUnderOwner(
        owner,
        f.layout,
        sha,
        runner,
        performance.now() + 60000,
        namespaceFor(f.layout),
        f.exec,
      );
      await refuses(
        withLock(`${f.root}/deploy.lock`, () => Promise.resolve(undefined)),
        'lock held',
      );
    },
    f.root,
  );
  expect(effects).toBe(4);
  expect(f.execCalls.some((args) => args.at(11) === GROUP_PROGRAM)).toBe(true);
  expect(f.execCalls.some((args) => args.at(11) !== GROUP_PROGRAM)).toBe(true);
  const readbacks = await Promise.all(
    (await readdir(f.root))
      .filter((name) => /^edge-owner-.*-readback.json$/.test(name))
      .map((name) => readFile(`${f.root}/${name}`, 'utf8')),
  );
  expect(readbacks.some((receipt) => receipt.includes('DONE') && receipt.includes('REAPED'))).toBe(
    true,
  );
  expect(f.gateway.State.Running).toBe(false);
  expect(f.container.State.Running).toBe(false);
  await refuses(assertNoEdgeOwner(f.root), 'admission closed');
  expect(await readFile(`${f.root}/dependency-backend-complete.json`, 'utf8')).toContain(id);
  expect(f.calls.some((args) => ['start', 'restart', 'rm', 'exec'].includes(args[0] ?? ''))).toBe(
    false,
  );
});

test('dedicated coordinator reports only managed exclusion and keeps pending marker', async () => {
  const f = await fixture();
  for (const name of ['fence', 'intent', 'complete'])
    await unlink(`${f.root}/dependency-gateway-${name}.json`);
  const completion = await excludeManagedDependencies(
    { sha, layouts: [f.layout] },
    f.runner,
    namespaceFor(f.layout),
    f.root,
    f.exec,
  );
  expect(completion.state).toBe('managed-excluded');
  expect(completion.activation).toBe('blocked');
  expect(completion.unresolved).toContain('solver');
  await refuses(assertNoEdgeOwner(f.root), 'admission closed');
  expect(f.container.State.Running).toBe(false);
});

test('owner marker loss after namespace scanner prevents cleanup exec and backend completion', async () => {
  const f = await fixture();
  let executions = 0;
  const exec: DockerExec = async (args, nonce, consume, signal) => {
    executions++;
    await f.exec(args, nonce, consume, signal);
    await writeFile(`${f.root}/edge-owner.pending`, 'lost during namespace exec');
  };
  await refuses(
    withDependencyOwner(
      { sha, layouts: [f.layout] },
      async (owner) => {
        await fenceBackendsUnderOwner(
          owner,
          f.layout,
          sha,
          f.runner,
          performance.now() + 60000,
          namespaceFor(f.layout),
          exec,
        );
      },
      f.root,
    ),
  );
  expect(executions).toBe(1);
  expect(await Bun.file(`${f.root}/dependency-backend-complete.json`).exists()).toBe(false);
  expect(await Bun.file(`${f.root}/dependency-backend-intent.json`).exists()).toBe(false);
  const intents = (await readdir(f.root))
    .filter((name) => /^edge-owner-.*-intent.json$/.test(name))
    .sort();
  const last = intents.at(-1);
  if (last === undefined) throw new Error('scanner intent missing');
  expect(await readFile(`${f.root}/${last}`, 'utf8')).toContain('exec');
  expect(await Bun.file(`${f.root}/${last.replace('-intent', '-readback')}`).exists()).toBe(false);
  expect(await readFile(`${f.root}/edge-owner.pending`, 'utf8')).toBe('lost during namespace exec');
});

test('owner namespace cannot complete when initialized scanner reap evidence is absent', async () => {
  const f = await fixture();
  const exec: DockerExec = (args, nonce, consume, signal) => {
    let skipsNonce = false;
    return f.exec(
      args,
      nonce,
      (token) => {
        if (skipsNonce) {
          skipsNonce = false;
          return false;
        }
        if (token === 'REAPED') {
          skipsNonce = true;
          return false;
        }
        return consume(token);
      },
      signal,
    );
  };
  await refuses(
    withDependencyOwner(
      { sha, layouts: [f.layout] },
      async (owner) => {
        await fenceBackendsUnderOwner(
          owner,
          f.layout,
          sha,
          f.runner,
          performance.now() + 60000,
          namespaceFor(f.layout),
          exec,
        );
      },
      f.root,
    ),
  );
  expect(f.execCalls.length).toBeGreaterThan(0);
  expect(await Bun.file(`${f.root}/dependency-backend-complete.json`).exists()).toBe(false);
  expect(f.calls.some((args) => ['update', 'stop'].includes(args[0] ?? ''))).toBe(false);
  expect(await Bun.file(`${f.root}/edge-owner.pending`).exists()).toBe(true);
});

test('source context survives every owner backend observation and final inspection', async () => {
  const { withSourceDevExcluded } = await import('./source-dev-exclusion');
  const { sourceFixture } = await import('../fixtures/source-dev');
  const { sourceDevContract } = await import('./env');
  const { inspectBackendFenceUnderOwner } = await import('./backend-exclusion');
  const f = await fixture();
  await mkdir(`${f.root}/dev`);
  const dev = { ...envLayout('dev'), root: `${f.root}/dev`, stateDir: `${f.root}/dev` };
  const source = sourceFixture();
  source.Id = '7'.repeat(64);
  source.Mounts = sourceDevContract(dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  f.containers.push(source as unknown as typeof f.container);
  const deadline = performance.now() + 60000;
  await withDependencyOwner(
    { sha, layouts: [f.layout, dev] },
    async (owner) => {
      await withSourceDevExcluded(
        owner,
        { prod: f.layout, dev },
        sha,
        f.runner,
        deadline,
        async (token) => {
          await fenceBackendsUnderOwner(
            owner,
            f.layout,
            sha,
            f.runner,
            deadline,
            namespaceFor(f.layout),
            f.exec,
            token,
          );
          await inspectBackendFenceUnderOwner(
            owner,
            f.layout,
            sha,
            f.runner,
            deadline,
            token,
            namespaceFor(f.layout),
            f.exec,
          );
        },
      );
    },
    f.root,
  );
  expect(f.container.State.Running).toBe(false);
  await refuses(inspectBackendFence(f.layout, f.runner), 'unmanaged namespace');
});

test('combined coordinator retains solver tmpfs and source members throughout awaited protected work', async () => {
  const { excludeSourceAndManagedDependencies } = await import('./dependency-activation-owner');
  const { createSourceSolverFixture } = await import('../fixtures/source-solver');
  const { sourceFixture } = await import('../fixtures/source-dev');
  const { sourceDevContract } = await import('./env');
  const f = await fixture();
  const solver = await createSourceSolverFixture(f.root);
  for (const name of ['fence', 'intent', 'complete'])
    await unlink(`${f.root}/dependency-gateway-${name}.json`);
  Object.assign(f.gateway.State, { Running: true, Pid: 100, Status: 'running' });
  f.gateway.HostConfig.RestartPolicy.Name = 'unless-stopped';
  const dev = solver.layouts.dev;
  await mkdir(`${f.root}/caddy`);
  const site = (host: string, body: string) =>
    `${host} {\n respond "${body}"\n import access-log\n}\n`;
  await writeFile(
    `${f.root}/caddy/Caddyfile`,
    'import log-redact.caddy\nimport site.caddy\nimport site-dev.caddy\nimport registry.caddy\n',
  );
  await writeFile(`${f.root}/caddy/log-redact.caddy`, '(access-log) {\n log\n}\n');
  await writeFile(`${f.root}/caddy/site.caddy`, site('prod.owner.test', 'prod'));
  await writeFile(`${f.root}/caddy/site-dev.caddy`, site('dev.owner.test', 'dev'));
  await writeFile(`${f.root}/caddy/registry.caddy`, site('registry.owner.test', 'registry'));
  const prod = {
    ...f.layout,
    siteAddress: 'prod.owner.test',
    siteCaddyPath: `${f.root}/caddy/site.caddy`,
  };
  const selectedDev = {
    ...dev,
    siteAddress: 'dev.owner.test',
    siteCaddyPath: `${f.root}/caddy/site-dev.caddy`,
  };
  const adapt = async () => ({
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [':8080'],
            routes: await Promise.all(
              ['prod', 'dev', 'registry'].map(async (label) => {
                const name =
                  label === 'prod'
                    ? 'site.caddy'
                    : label === 'dev'
                      ? 'site-dev.caddy'
                      : 'registry.caddy';
                const closed = (await readFile(`${f.root}/caddy/${name}`, 'utf8')).includes(
                  'WBS dependency maintenance',
                );
                return {
                  match: [{ host: [`${label}.owner.test`] }],
                  handle: [
                    {
                      handler: 'subroute',
                      routes: [
                        {
                          handle: [
                            {
                              handler: 'static_response',
                              body: closed ? 'WBS dependency maintenance' : label,
                              status_code: closed ? 503 : 200,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  terminal: true,
                };
              }),
            ),
          },
        },
      },
    },
  });
  let live = await adapt();
  const edge = {
    Id: 'e'.repeat(64),
    Name: '/wbs-caddy-1',
    Path: 'caddy',
    Args: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
    Image: imageId,
    Config: { Env: [], Image: 'caddy:2', Labels: {} },
    HostConfig: {},
    NetworkSettings: { Networks: {} },
    RestartCount: 0,
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      Pid: 100,
      StartedAt: '2026-10-23T00:00:00Z',
    },
    Mounts: [{ Type: 'bind', Source: `${f.root}/caddy`, Destination: '/etc/caddy', RW: false }],
  };
  const source = sourceFixture();
  source.Id = '7'.repeat(64);
  Reflect.set(source.Config, 'Env', ['COMPOSED_PRIVATE_SENTINEL=secret']);
  source.Mounts = sourceDevContract(selectedDev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  const solverInventory: unknown = JSON.parse(
    await solver.ports.runDocker(['inspect', '8'.repeat(64)]),
  );
  if (!Array.isArray(solverInventory) || solverInventory.length !== 1)
    throw new Error('missing solver fixture');
  const retained = solverInventory[0] as typeof f.container;
  Object.assign(edge.HostConfig, { Init: true, PidMode: '', Privileged: false, CapAdd: null });
  const edgeProof = await f.bindNamespace(edge.Id, 'none');
  await mkdir(`${edgeProof.root}/namespace/etc`);
  await rename(`${edgeProof.root}/namespace/config`, `${edgeProof.root}/namespace/etc/caddy`);
  await writeFile(
    `${edgeProof.root}/mountinfo`,
    (await readFile(`${edgeProof.root}/mountinfo`, 'utf8')).replaceAll('/config', '/etc/caddy'),
  );
  f.containers.push(
    source as unknown as typeof f.container,
    retained,
    edge as unknown as typeof f.container,
  );
  const events: string[] = [];
  const runner: RunDocker = async (args, signal) => {
    if (args[0] === 'exec') {
      if (args.includes('adapt')) return JSON.stringify(await adapt());
      if (args.includes('reload')) {
        live = await adapt();
        events.push('ingress');
        return '';
      }
      if (args.includes('wget')) return JSON.stringify(live);
    }
    if (args[0] === 'inspect' && (args[1] === edge.Id || args[1] === 'wbs-caddy-1'))
      return JSON.stringify([edge]);
    if (args[0] === 'stop' && args.at(-1) === source.Id) events.push('source');
    if (args[0] === 'inspect') {
      const current: unknown = JSON.parse(await solver.ports.runDocker(['inspect', retained.Id]));
      if (!Array.isArray(current) || current.length !== 1)
        throw new Error('missing fresh solver fixture');
      Object.assign(retained, current[0]);
    }
    return f.runner(args, signal);
  };
  const runHost = solver.ports.runHost;
  const ports: typeof solver.ports = {
    ...solver.ports,
    runHost: (command, signal) => {
      if (command.kind === 'stop') events.push('solver');
      return runHost(command, signal);
    },
  };
  let entered = false;
  const completion = await excludeSourceAndManagedDependencies(
    { sha, layouts: [prod, selectedDev] },
    solver.pins,
    ports,
    runner,
    performance.now() + 60000,
    async () => {
      entered = true;
      await refuses(
        withLock(`${f.root}/solver-runtime.lock`, () => Promise.resolve()),
        'lock held',
      );
      await Promise.resolve();
      expect(source.State.Running).toBe(false);
      expect(f.container.State.Running).toBe(false);
      return 'protected';
    },
    namespaceFor(f.layout),
    f.exec,
    f.root,
  );
  expect(completion).toEqual({
    state: 'source-managed-excluded',
    activation: 'blocked',
    value: 'protected',
  });
  expect(entered).toBe(true);
  expect(events.slice(0, 3)).toEqual(['ingress', 'solver', 'source']);
  expect(f.containers).toContain(retained);
  expect(f.namespaceCalls.some((call) => call.id === retained.Id)).toBe(false);
  expect(f.calls.some((args) => args[0] === 'rm')).toBe(false);
  for (const directory of [f.root, selectedDev.stateDir])
    for (const name of await readdir(directory))
      if (name.endsWith('.json'))
        expect(await readFile(`${directory}/${name}`, 'utf8')).not.toContain(
          'COMPOSED_PRIVATE_SENTINEL',
        );
});
