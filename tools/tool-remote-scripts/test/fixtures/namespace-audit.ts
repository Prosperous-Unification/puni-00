import { chmod, link, mkdir, mkdtemp, rename, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect } from 'bun:test';

import type { DockerExec } from '../../src/lib/docker-exec';
import { CENSUS_PROGRAM, GROUP_PROGRAM } from '../../src/lib/mount-exec-program';

function deviceOf(device: bigint): string {
  return (
    (((device & 0xfff00n) >> 8n) | ((device & 0xfffff00000000000n) >> 32n)).toString() +
    ':' +
    ((device & 0xffn) | ((device & 0xffffff00000n) >> 12n)).toString()
  );
}
export async function createNamespaceFixture(
  fault = 'none',
  databaseOverride?: string,
  rootOverride?: string,
) {
  const root = rootOverride ?? (await mkdtemp(join(tmpdir(), 'exec-namespace-')));
  await mkdir(root, { recursive: true });
  const database = databaseOverride ?? join(root, 'family/wbs.db');
  if (databaseOverride === undefined) {
    await mkdir(join(root, 'family'));
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await Bun.write(`${database}${suffix}`, 'family');
  }
  const boundDirectory = await stat(dirname(database), { bigint: true });
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
  if (
    [
      'managed-match',
      'managed-directory-mismatch',
      'managed-directory-entry-missing',
      'host-directory-race',
    ].includes(fault)
  )
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      try {
        await link(`${database}${suffix}`, `${namespace}/data/wbs.db${suffix}`);
      } catch (cause) {
        if (suffix !== '' && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
          continue;
        throw cause;
      }
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
    const program = args.at(11);
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
    const argumentsForProgram = args.slice(12).map((argument) =>
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
    for (let position = 0; position < tokens.length; position += 1) {
      if (tokens[position] !== 'ENTRY' || tokens[position + 1] !== `${namespace}/data`) continue;
      const identity =
        fault === 'managed-directory-mismatch'
          ? await stat(`${namespace}/data`, { bigint: true })
          : boundDirectory;
      tokens[position + 2] =
        `${identity.dev.toString()}:${identity.ino.toString()}:${identity.mode.toString(16)}`;
      if (fault === 'managed-directory-entry-missing') {
        tokens.splice(position, 3);
        const completed = tokens.lastIndexOf('DONE');
        const count = tokens[completed + 2];
        tokens[completed + 2] = String(Number(count) - 1);
      }
      break;
    }

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
    if (fault === 'host-directory-race' && program === CENSUS_PROGRAM) {
      const parent = dirname(database);
      await rename(parent, parent + '.held');
      await mkdir(parent);
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        await link(`${parent}.held/wbs.db${suffix}`, `${database}${suffix}`);
    }
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
