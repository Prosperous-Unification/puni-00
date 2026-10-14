import { chmod, link, mkdir, mkdtemp, rename, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { inspectBackendWriters } from '../swap';
import { ROOT } from './docker';
import type { DockerExec } from './docker-exec';
import { verifyContainerNamespace } from './mount-audit';
import { CENSUS_PROGRAM, GROUP_PROGRAM } from './mount-exec-program';

const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
function deviceOf(device: bigint): string {
  return (
    (((device & 0xfff00n) >> 8n) | ((device & 0xfffff00000000000n) >> 32n)).toString() +
    ':' +
    ((device & 0xffn) | ((device & 0xffffff00000n) >> 12n)).toString()
  );
}
async function fixture(fault = 'none') {
  const root = await mkdtemp(join(tmpdir(), 'exec-namespace-'));
  const database = join(root, 'family/wbs.db');
  await mkdir(join(root, 'family'));
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    await Bun.write(`${database}${suffix}`, 'family');
  const device = deviceOf((await stat(database, { bigint: true })).dev);
  const namespace = join(root, 'namespace');
  const destinations = ['/data', '/config', '/var/log/caddy', '/var/lib/registry'];
  const lines = ['1 0 0:999 / / rw - overlay overlay rw'];
  for (const [index, destination] of destinations.entries()) {
    await mkdir(`${namespace}${destination}/nested`, { recursive: true });
    await Bun.write(`${namespace}${destination}/nested/ordinary`, 'ordinary');
    const readonly =
      fault === 'all-ro-nested' ||
      (index === 0 && ['readonly-reader', 'nested-rw'].includes(fault));
    lines.push(
      `${(index + 2).toString()} 1 ${device} / ${destination} ${readonly ? 'ro' : 'rw'} - ext4 fixture rw`,
    );
  }
  if (fault === 'unreadable-hardlink') {
    await link(database, `${namespace}/data/nested/alias`);
    await chmod(`${namespace}/data/nested`, 0);
  }
  if (fault.startsWith('hardlink:'))
    await link(`${database}${fault.slice(9)}`, `${namespace}/data/nested/alias`);
  if (['replaced-source', 'readonly-reader', 'nested-rw', 'all-ro-nested'].includes(fault))
    await link(database, `${namespace}/data/nested/alias`);
  if (['nested-rw', 'all-ro-nested'].includes(fault))
    lines.push(`10 2 ${device} / /data/nested rw - ext4 hidden rw`);
  if (fault === 'hidden-root') {
    await mkdir(`${namespace}/hidden`);
    await link(database, `${namespace}/hidden/alias`);
    lines.push(`11 1 ${device} / /hidden rw - ext4 hidden rw`);
  }
  if (fault === 'symlink') await symlink(database, `${namespace}/data/nested/alias`);
  if (fault === 'managed-mismatch')
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await Bun.write(`${namespace}/data/wbs.db${suffix}`, 'wrong inode');
  if (fault === 'managed-match')
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await link(`${database}${suffix}`, `${namespace}/data/wbs.db${suffix}`);
  if (fault === 'main-absent') await rm(database);
  if (fault === 'main-nonregular') {
    await rm(database);
    await symlink(join(root, 'namespace/data/nested/ordinary'), database);
  }
  if (fault === 'main-unreadable') await chmod(join(root, 'family'), 0);
  if (fault === 'ambiguous-mount') lines.push(`90 1 ${device} / /data ro - ext4 shadow ro`);
  if (fault === 'declared-mount-missing') lines.pop();
  if (fault === 'root-mount-missing') lines.shift();
  const mountinfo = join(root, 'mountinfo');
  await Bun.write(mountinfo, fault === 'mountinfo-malformed' ? 'malformed' : lines.join('\n'));
  const container = {
    Id: 'a'.repeat(64),
    RestartCount: 0,
    State: { Running: true, Pid: 100, StartedAt: 'stable' },
    HostConfig: { PidMode: '', Init: true, Privileged: false, CapAdd: null as string[] | null },
  };
  if (fault === 'privileged-target') container.HostConfig.Privileged = true;
  if (fault === 'expanded-capability') container.HostConfig.CapAdd = ['SYS_ADMIN'];
  if (fault === 'missing-pid') Reflect.deleteProperty(container.State, 'Pid');
  if (fault === 'malformed-pid') Reflect.set(container.State, 'Pid', '100');
  if (fault === 'missing-init') Reflect.deleteProperty(container.HostConfig, 'Init');
  if (fault === 'private-pid-missing') Reflect.deleteProperty(container.HostConfig, 'PidMode');
  const commands: string[][] = [];
  let sessions = 0;
  let acknowledgements = 0;
  const runDocker = (args: string[]) => {
    commands.push(args);
    if (args[0] === 'image') {
      if (fault === 'image-absent') throw new Error('candidate image absent');
      return Promise.resolve(fault === 'image-malformed' ? '' : `sha256:${'c'.repeat(64)}`);
    }
    if (args[0] === 'inspect') {
      if (fault === 'inspection-unreadable') throw new Error('Docker inspect unreadable');
      if (fault === 'pid-race' && sessions > 0)
        return Promise.resolve(
          JSON.stringify({ ...container, State: { ...container.State, Pid: 101 } }),
        );
      return Promise.resolve(JSON.stringify(container));
    }
    throw new Error(`unexpected command ${args.join(' ')}`);
  };
  const exec: DockerExec = async (args, nonce, consume, signal) => {
    commands.push(args);
    const program = args.at(10);
    if (program === undefined) throw new Error('missing fixed scanner');
    const cleanup = program === GROUP_PROGRAM;
    if ((fault === 'stalled-start' && !cleanup) || (fault === 'stalled-cleanup' && cleanup)) {
      await new Promise<void>((_resolve, reject) =>
        signal?.addEventListener(
          'abort',
          () => {
            reject(new Error('exec aborted'));
          },
          { once: true },
        ),
      );
      return;
    }
    if (fault === 'tool-absent' && !cleanup) throw new Error('busybox absent');
    sessions += 1;
    const session = (1000 + sessions).toString();
    const send = (tokens: string[]) => {
      for (const token of tokens) if (consume(token)) acknowledgements += 1;
    };
    send([
      'SESSION',
      nonce,
      session,
      fault === 'session-forged' ? '9999' : session,
      session,
      '12345',
    ]);
    if (cleanup) {
      if (fault === 'group-residue') send(['MEMBER', '/proc/1001/stat', 'Z', '12345']);
      send(['DONE', nonce, '1', 'REAPED', nonce]);
      return;
    }
    let emitted = program.replaceAll('/proc/self/mountinfo', mountinfo);
    if (fault === 'entry-stat-failure' && program === CENSUS_PROGRAM)
      emitted = emitted.replace('"$path") || return 73', '"$path/absent-proof") || return 73');
    if (fault === 'mountinfo-race' && program === CENSUS_PROGRAM)
      emitted = emitted.replace('"$after" "$nonce"', '"changed" "$nonce"');
    if (fault === 'entry-limit' && program === CENSUS_PROGRAM)
      emitted = emitted.replace('100000', '1');
    if (fault === 'depth-limit' && program === CENSUS_PROGRAM)
      emitted = emitted.replace('"$depth" -lt 64', '"$depth" -lt 0');
    const argumentsForProgram = args.slice(11).map((argument) =>
      argument
        .split(' ')
        .map((path) => (path.startsWith('/') ? namespace + path : path))
        .join(' '),
    );
    const child = Bun.spawn(
      ['/usr/bin/busybox', 'sh', '-c', emitted, '--', nonce, ...argumentsForProgram],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (stderr !== '' || code !== 0)
      throw new Error(`actual scanner failed ${code.toString()}: ${stderr}`);
    const tokens = stdout.split('\0');
    expect(tokens.pop()).toBe('');
    if (fault === 'incomplete') tokens.splice(tokens.lastIndexOf('DONE'));
    if (fault === 'forged-receipt') {
      const position = tokens.lastIndexOf('DONE');
      tokens[position + 1] = 'forged';
    }
    if (fault === 'count-mismatch') {
      const position = tokens.lastIndexOf('DONE');
      tokens[position + 2] = '999';
    }
    if (fault === 'extra-frame') tokens.push('UNKNOWN');
    send(
      tokens.map((token) =>
        token.startsWith(namespace + '/') ? token.slice(namespace.length) : token,
      ),
    );
    if (fault !== 'reap-absent') send(['REAPED', nonce]);
    if (fault === 'host-family-race' && program === CENSUS_PROGRAM) {
      await rename(database, database + '.held');
      await Bun.write(database, 'replacement');
    }
  };
  return {
    root,
    database,
    destinations,
    container,
    commands,
    exec,
    runDocker,
    counters: () => ({ sessions, acknowledgements }),
  };
}

test('normal shipped mounted namespaces admit with complete initialized-session cleanup', async () => {
  const proof = await fixture();
  try {
    await verifyContainerNamespace(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      null,
      undefined,
      proof.exec,
    );
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
    expect(
      proof.commands.filter((args) => ['stop', 'restart', 'rm', 'create', 'run'].includes(args[0])),
    ).toEqual([]);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
test('effective readonly alias remains a reader', async () => {
  const proof = await fixture('readonly-reader');
  try {
    await verifyContainerNamespace(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      null,
      undefined,
      proof.exec,
    );
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
for (const fault of [
  'replaced-source',
  'nested-rw',
  'all-ro-nested',
  'hidden-root',
  'hardlink:',
  'hardlink:-wal',
  'hardlink:-shm',
  'hardlink:-journal',
  'symlink',
  'image-absent',
  'image-malformed',
  'tool-absent',
  'entry-stat-failure',
  'mountinfo-malformed',
  'mountinfo-race',
  'pid-race',
  'incomplete',
  'forged-receipt',
  'count-mismatch',
  'extra-frame',
  'reap-absent',
  'group-residue',
  'entry-limit',
  'depth-limit',
  'stalled-start',
  'stalled-cleanup',
  'session-forged',
  'host-family-race',
  'main-absent',
  'main-nonregular',
  'main-unreadable',
  'declared-mount-missing',
  'root-mount-missing',
  'ambiguous-mount',
  'privileged-target',
  'expanded-capability',
  'missing-pid',
  'malformed-pid',
  'missing-init',
  'private-pid-missing',
  'inspection-unreadable',
]) {
  test(`actual initialized namespace admission refuses ${fault}`, async () => {
    const proof = await fixture(fault);
    try {
      await refuses(
        verifyContainerNamespace(
          proof.container,
          proof.destinations,
          proof.database,
          image,
          proof.runDocker,
          null,
          { totalMs: 300, cleanupMs: 120 },
          proof.exec,
        ),
      );
    } finally {
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}
for (const fault of ['managed-match', 'managed-mismatch'])
  test(`managed actual family ${fault}`, async () => {
    const proof = await fixture(fault);
    try {
      const checked = verifyContainerNamespace(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        '/data/wbs.db',
        undefined,
        proof.exec,
      );
      if (fault === 'managed-match') await checked;
      else await refuses(checked, 'family');
    } finally {
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });

async function refuses(check: Promise<unknown>, message?: string): Promise<void> {
  let failure: unknown = null;
  try {
    await check;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(failure)).toContain(message);
}

test('production writer inventory delegates inaccessible named-volume sources to actual namespace admission and never stops unrelated services', async () => {
  const proof = await fixture();
  try {
    const hostLogs = join(proof.root, 'host-logs');
    await mkdir(hostLogs);
    const mounts = proof.destinations.map((destination, index) => ({
      Type: index === 2 ? 'bind' : 'volume',
      Source: index === 2 ? hostLogs : `/var/lib/docker/volumes/audit-${index.toString()}/_data`,
      Destination: destination,
      RW: true,
    }));
    const inventory = (args: string[]) => {
      if (args[0] === 'ps') return Promise.resolve(proof.container.Id);
      if (args[0] === 'inspect' && args[1] !== '--format')
        return Promise.resolve(
          JSON.stringify([{ ...proof.container, Name: '/wbs-caddy-1', Mounts: mounts }]),
        );
      return proof.runDocker(args);
    };
    const resolveMount = (path: string) => {
      if (path === `${ROOT}/data`) return Promise.resolve(join(proof.root, 'family'));
      if (path.startsWith('/var/lib/docker/volumes/'))
        return Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
      return Promise.resolve(path);
    };
    const writers = await inspectBackendWriters(
      inventory,
      proof.database,
      resolveMount,
      image,
      (container, destinations, database, candidate, runDocker, databasePath, bounds) =>
        verifyContainerNamespace(
          container,
          destinations,
          database,
          candidate,
          runDocker,
          databasePath,
          bounds,
          proof.exec,
        ),
    );
    expect(writers.size).toBe(0);
    expect(proof.counters().acknowledgements).toBe(4);
    expect(proof.commands.some((args) => ['stop', 'restart', 'rm'].includes(args[0]))).toBe(false);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});

test('reduced-capability census refuses unreadable directory hiding a SQLite hardlink', async () => {
  const proof = await fixture('unreadable-hardlink');
  Reflect.set(proof.container.HostConfig, 'CapDrop', ['ALL']);
  try {
    let refused = false;
    try {
      await verifyContainerNamespace(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        null,
        undefined,
        proof.exec,
      );
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      expect(String(cause)).toContain('actual scanner failed 80');
      refused = true;
    }
    expect(refused).toBe(true);
  } finally {
    await chmod(join(proof.root, 'namespace/data/nested'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
