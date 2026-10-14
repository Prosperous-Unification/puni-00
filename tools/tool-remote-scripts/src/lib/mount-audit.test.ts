import { link, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { inspectBackendWriters } from '../swap';
import { ROOT } from './docker';

const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
async function auditFixture(fault = 'none') {
  const root = await mkdtemp(join(tmpdir(), 'mount-audit-'));
  const database = join(root, 'data/wbs.db');
  await mkdir(join(root, 'data'));
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    await Bun.write(`${database}${suffix}`, 'family');
  const sources = ['caddy_data', 'caddy_config', 'logs', 'registry_data'].map((name) =>
    join(root, name),
  );
  for (const source of sources) {
    await mkdir(join(source, 'nested'), { recursive: true });
    await Bun.write(join(source, 'nested/ordinary'), 'unrelated');
  }
  const source = sources[fault.startsWith('logs-') ? 2 : 0];
  if (fault.includes('hardlink:'))
    await link(
      `${database}${fault.slice(fault.indexOf('hardlink:') + 9)}`,
      join(source, 'nested/alias'),
    );
  if (fault === 'symlink') await symlink(database, join(source, 'nested/alias'));
  if (fault === 'nonregular-family') {
    await rm(database);
    await mkdir(database);
  }
  const commands: string[][] = [];
  const identities = ['a'.repeat(64), 'b'.repeat(64)];
  const containers = [
    {
      Id: identities[0],
      Name: '/wbs-caddy-1',
      Mounts: sources.slice(0, 3).map((source, index) => ({
        Type: index === 2 ? 'bind' : 'volume',
        Source: source,
        Destination: index === 2 ? '/var/log/caddy' : index === 0 ? '/data' : '/config',
        RW: true,
      })),
    },
    {
      Id: identities[1],
      Name: '/wbs-registry-1',
      Mounts: [{ Type: 'volume', Source: sources[3], Destination: '/var/lib/registry', RW: true }],
    },
  ];
  const runDocker = async (args: string[]) => {
    commands.push(args);
    if (args[0] === 'ps') return identities.join('\n');
    if (args[0] === 'inspect') return JSON.stringify(containers);
    if (args[0] === 'image') {
      if (fault === 'helper-absent') throw new Error('Docker helper image unavailable');
      return image;
    }
    if (args[0] !== 'run') throw new Error('unexpected Docker mutation');
    expect(args).toContain('--read-only');
    expect(args).toContain('128m');
    expect(args).toContain('16');
    expect(args).toContain('none');
    expect(args).toContain('ALL');
    expect(args).toContain('DAC_READ_SEARCH');
    expect(args).toContain('no-new-privileges');
    expect(args).toContain('never');
    expect(args).toContain(image);
    if (fault === 'helper-absent') throw new Error('Docker helper image unavailable');
    if (fault === 'helper-failure') throw new Error('Docker audit failed');
    if (fault === 'malformed') return '{}';
    if (fault === 'malformed-json') return 'invalid';
    if (fault === 'oversized-receipt') return '{"version":1,"complete":true,"nodes":100001}';
    if (fault === 'incomplete') return '{"version":1,"complete":false,"nodes":3}';
    const mount = args.find((argument) => argument.includes('target=/audit'));
    if (mount === undefined) throw new Error('test did not observe read-only audit bind');
    expect(mount.endsWith(',readonly')).toBe(true);
    const auditSource = mount.slice('type=bind,source='.length, mount.indexOf(',target='));
    const position = args.indexOf(image);
    const childArgs = args
      .slice(position + 1)
      .map((argument) =>
        argument === '/audit'
          ? auditSource
          : argument === '/database'
            ? join(root, 'data')
            : argument,
      );
    if (fault === 'oversized') childArgs[1] = childArgs[1]?.replace('100000', '1') ?? '';
    if (fault === 'depth') childArgs[1] = childArgs[1]?.replace('64', '0') ?? '';
    if (fault === 'timeout')
      childArgs[1] =
        childArgs[1]
          ?.replace('15000', '10')
          .replace(
            'await lstat(current.path',
            'await new Promise(() => {}); await lstat(current.path',
          ) ?? '';
    if (fault === 'nested-device-hardlink:')
      childArgs[1] =
        childArgs[1]?.replace(
          'const identity = await lstat(current.path, { bigint: true });',
          'const identity = await lstat(current.path, { bigint: true }); if (identity.isDirectory()) identity.dev = -1n;',
        ) ?? '';
    if (fault === 'unreadable')
      childArgs[1] =
        childArgs[1]?.replace(
          'await readdir(current.path)',
          "await Promise.reject(new Error('EACCES audit directory'))",
        ) ?? '';
    const child = Bun.spawn(['bun', ...childArgs], { stdout: 'pipe', stderr: 'pipe' });
    const observation = setTimeout(() => {
      child.kill();
    }, 500);
    try {
      const output = await new Response(child.stdout).text();
      const failure = await new Response(child.stderr).text();
      if ((await child.exited) !== 0) throw new Error(`audit helper failed: ${failure}`);
      return output;
    } finally {
      clearTimeout(observation);
    }
  };
  const resolve = (path: string) => {
    if (sources.some((source, index) => index !== 2 && path === source))
      return Promise.reject(
        Object.assign(new Error('host volume traversal denied'), { code: 'EACCES' }),
      );
    return realpath(path.replace(`${ROOT}/data`, join(root, 'data')));
  };
  return { root, database, runDocker, resolve, commands };
}

test('normal shipped Caddy and registry writable mounts pass complete read-only Docker inode audits', async () => {
  const fixture = await auditFixture();
  try {
    expect(
      (await inspectBackendWriters(fixture.runDocker, fixture.database, fixture.resolve, image))
        .size,
    ).toBe(0);
    expect(fixture.commands.filter((args) => args[0] === 'run')).toHaveLength(4);
    expect(fixture.commands.some((args) => args[0] === 'stop')).toBe(false);
  } finally {
    await rm(fixture.root, { recursive: true });
  }
});

for (const fault of [
  'hardlink:',
  'hardlink:-wal',
  'hardlink:-shm',
  'hardlink:-journal',
  'logs-hardlink:',
  'logs-hardlink:-wal',
  'logs-hardlink:-shm',
  'logs-hardlink:-journal',
  'nested-device-hardlink:',
  'nonregular-family',
  'symlink',
  'helper-absent',
  'helper-failure',
  'malformed',
  'malformed-json',
  'oversized-receipt',
  'incomplete',
  'oversized',
  'depth',
  'timeout',
  'unreadable',
]) {
  test(`production directory audit refuses ${fault} without stopping unrelated containers`, async () => {
    const fixture = await auditFixture(fault);
    try {
      let refusal = '';
      try {
        await inspectBackendWriters(fixture.runDocker, fixture.database, fixture.resolve, image);
      } catch (cause) {
        refusal = cause instanceof Error ? cause.message : String(cause);
      }
      expect(refusal).not.toBe('');
      if (fault === 'timeout') expect(refusal).toContain('deadline exceeded');
      if (fault === 'oversized') expect(refusal).toContain('entry limit');
      if (fault === 'depth') expect(refusal).toContain('depth limit');
      if (fault === 'helper-absent')
        expect(fixture.commands.some((args) => args[0] === 'image')).toBe(true);
      else expect(fixture.commands.some((args) => args[0] === 'run')).toBe(true);
      expect(fixture.commands.some((args) => args[0] === 'stop')).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true });
    }
  });
}
