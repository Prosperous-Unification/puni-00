import { rejects } from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { execute } from './swap';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const repository = resolve(import.meta.dir, '../../..');
const launchers = [
  'bin/dev-poll.sh',
  'bin/dev-poll-sync.sh',
  'tools/tool-bootstrap/src/bootstrap.sh',
  'tools/tool-bootstrap/src/configure.sh',
  'tools/tool-remote-scripts/src/swap.ts',
  'tools/tool-devsync/src/sync.ts',
];

function command(launcher: string): string[] {
  return launcher.endsWith('.ts')
    ? [
        process.execPath,
        join(repository, launcher),
        ...(launcher.endsWith('/swap.ts') ? ['be', '--execute'] : ['--locked', 'a'.repeat(40)]),
      ]
    : [launcher.includes('tool-bootstrap') ? 'sh' : 'bash', join(repository, launcher)];
}

for (const launcher of launchers) {
  for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
    test(`${launcher} refuses ${marker} before launching any writer`, async () => {
      const state = await mkdtemp(join(tmpdir(), 'edge-admission-'));
      roots.push(state);
      await writeFile(join(state, marker), 'malformed retained owner');
      const child = Bun.spawn(command(launcher), {
        env: { ...process.env, WBS_EDGE_STATE: state },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited).not.toBe(0);
      expect(stderr).toContain('shared edge owner admission closed');
    });
  }
  test(`${launcher} refuses a concurrent shared-edge writer`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'edge-lock-'));
    roots.push(state);
    const ready = join(state, 'ready');
    const holder = Bun.spawn(
      [
        'flock',
        '-n',
        join(state, 'edge.lock'),
        'bash',
        '-c',
        'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done',
        'hold',
        ready,
        join(state, 'release'),
      ],
      { stdin: 'pipe' },
    );
    for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
      await Bun.sleep(5);
    expect(await Bun.file(ready).exists()).toBe(true);
    try {
      const child = Bun.spawn(command(launcher), {
        env: { ...process.env, WBS_EDGE_STATE: state },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(child.stderr).text()).toMatch(
        /shared edge lock held|deploy lock held/,
      );
      expect(await child.exited).not.toBe(0);
    } finally {
      await writeFile(join(state, 'release'), 'release');
      await holder.exited;
    }
  });
}

for (const launcher of ['bin/dev-poll-sync.sh', 'tools/tool-remote-scripts/src/swap.ts']) {
  test(`${launcher} preserves legacy admission without an owner marker`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'edge-legacy-'));
    roots.push(state);
    const child = Bun.spawn(command(launcher), {
      env: { ...process.env, WBS_EDGE_STATE: state },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toMatch(/usage:|is required/);
    expect(stderr).not.toContain('shared edge owner admission closed');
  });
}

for (const inherited of ['bogus', '999999', '1']) {
  test(`swap refuses a spoofed inherited descriptor ${inherited}`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'edge-inherited-'));
    roots.push(state);
    await writeFile(join(state, 'edge.lock'), '');
    const child = Bun.spawn(command('tools/tool-remote-scripts/src/swap.ts'), {
      env: { ...process.env, WBS_EDGE_STATE: state, WBS_EDGE_LOCK_FD: inherited },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toMatch(/invalid inherited|EBADF|does not name/);
    expect(stderr).not.toContain('--image-be=');
  });
}

test('swap reuses the actual inherited kernel lock without self-deadlock', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-inherited-'));
  roots.push(state);
  await writeFile(join(state, 'edge.lock'), '');
  const child = Bun.spawn(
    [
      'bash',
      '-c',
      'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8; exec "$@"',
      'inherit',
      ...command('tools/tool-remote-scripts/src/swap.ts'),
    ],
    { env: { ...process.env, WBS_EDGE_STATE: state }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await new Response(child.stderr).text()).toContain('--image-be=');
  expect(await child.exited).not.toBe(0);
});

test('separately opened inherited descriptor cannot borrow another process lock', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-independent-'));
  roots.push(state);
  const ready = join(state, 'ready');
  const holder = Bun.spawn([
    'flock',
    '-n',
    join(state, 'edge.lock'),
    'bash',
    '-c',
    'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done',
    'hold',
    ready,
    join(state, 'release'),
  ]);
  for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
    await Bun.sleep(5);
  expect(await Bun.file(ready).exists()).toBe(true);
  try {
    const child = Bun.spawn(
      [
        'bash',
        '-c',
        'exec 8<"$WBS_EDGE_STATE/edge.lock"; export WBS_EDGE_LOCK_FD=8; exec "$@"',
        'independent',
        ...command('tools/tool-remote-scripts/src/swap.ts'),
      ],
      { env: { ...process.env, WBS_EDGE_STATE: state }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await new Response(child.stderr).text()).toContain('shared edge lock held');
    expect(await child.exited).not.toBe(0);
  } finally {
    await writeFile(join(state, 'release'), 'release');
    await holder.exited;
  }
});

test('configure writer excludes concurrent prod and dev swaps and bootstrap', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-configure-'));
  roots.push(state);
  const ready = join(state, 'ready');
  const release = join(state, 'release');
  const commands = join(state, 'commands');
  await mkdir(commands);
  await writeFile(
    join(commands, 'id'),
    '#!/bin/sh\ntouch "$WBS_EDGE_STATE/ready"\nwhile [ ! -e "$WBS_EDGE_STATE/release" ]; do sleep 0.01; done\nprintf "1000\\n"\n',
    { mode: 0o755 },
  );
  const executablePath = process.env['PATH'];
  if (executablePath === undefined) throw new Error('test requires PATH');
  const configure = Bun.spawn(command('tools/tool-bootstrap/src/configure.sh'), {
    env: { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
    await Bun.sleep(5);
  expect(await Bun.file(ready).exists()).toBe(true);
  try {
    for (const environment of ['prod', 'dev']) {
      const swap = Bun.spawn(command('tools/tool-remote-scripts/src/swap.ts'), {
        env: { ...process.env, WBS_EDGE_STATE: state, WBS_ENV: environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(swap.stderr).text()).toContain('deploy lock held');
      expect(await swap.exited).not.toBe(0);
    }
    const bootstrap = Bun.spawn(command('tools/tool-bootstrap/src/bootstrap.sh'), {
      env: { ...process.env, WBS_EDGE_STATE: state },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await new Response(bootstrap.stderr).text()).toContain('shared edge lock held');
    expect(await bootstrap.exited).not.toBe(0);
  } finally {
    await writeFile(release, 'release');
    expect(await configure.exited).not.toBe(0);
  }
});

for (const launcher of ['bin/dev-poll-sync.sh', 'tools/tool-remote-scripts/src/swap.ts']) {
  for (const fault of ['unreadable', 'dangling', 'directory']) {
    test(`${launcher} refuses ${fault} owner state`, async () => {
      const state = await mkdtemp(join(tmpdir(), 'edge-owner-fault-'));
      roots.push(state);
      const marker = join(state, 'edge-owner.json');
      if (fault === 'directory') await mkdir(marker);
      else if (fault === 'dangling') await symlink(join(state, 'absent'), marker);
      else {
        await writeFile(marker, 'closed');
        await chmod(marker, 0);
      }
      const child = Bun.spawn(command(launcher), {
        env: { ...process.env, WBS_EDGE_STATE: state },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(child.stderr).text()).toContain(
        'shared edge owner admission closed',
      );
      expect(await child.exited).not.toBe(0);
    });
  }
}

test('direct swap executor refuses retained edge ownership before route effects', async () => {
  const state = await mkdtemp(join(tmpdir(), 'direct-swap-owner-'));
  roots.push(state);
  const previous = process.env['WBS_EDGE_STATE'];
  try {
    await writeFile(join(state, 'edge-owner.json'), 'closed');
    process.env['WBS_EDGE_STATE'] = state;
    await rejects(
      execute({ tier: 'fe', from: null, to: 'blue', steps: [] }, 'image', 'sha'),
      /shared edge owner admission closed/,
    );
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
  }
});

test('manual dev deploy takes edge.lock before poll.lock and cannot reach fetch while occupied', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-manual-'));
  roots.push(state);
  const source = await readFile(join(repository, 'bin/dev-deploy.sh'), 'utf8');
  const invocation = source
    .split('\n')
    .find((line) => line.includes('flock /home/puni1/wbs-dev/state/poll.lock bash -c'));
  if (invocation === undefined) throw new Error('manual deploy SSH writer invocation missing');
  const remote = invocation
    .trim()
    .slice(1, -3)
    .replaceAll('/home/puni1/wbs/state/edge.lock', join(state, 'edge.lock'))
    .replaceAll('/home/puni1/wbs-dev/state/poll.lock', join(state, 'poll.lock'));
  const ready = join(state, 'ready');
  const holder = Bun.spawn([
    'flock',
    '-n',
    join(state, 'edge.lock'),
    'bash',
    '-c',
    'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done',
    'hold',
    ready,
    join(state, 'release'),
  ]);
  for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
    await Bun.sleep(5);
  expect(await Bun.file(ready).exists()).toBe(true);
  const commands = join(state, 'commands');
  await mkdir(commands);
  await writeFile(join(commands, 'git'), '#!/bin/sh\ntouch "$WBS_EDGE_STATE/fetched"\nexit 42\n', {
    mode: 0o755,
  });
  const executablePath = process.env['PATH'];
  if (executablePath === undefined) throw new Error('test requires PATH');
  try {
    const child = Bun.spawn(['bash', '-c', remote], {
      env: { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await child.exited).toBe(75);
    expect(await Bun.file(join(state, 'fetched')).exists()).toBe(false);
    expect(await Bun.file(join(state, 'poll.lock')).exists()).toBe(false);
  } finally {
    await writeFile(join(state, 'release'), 'release');
    await holder.exited;
  }
});

for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
  test(`manual dev deploy refuses ${marker} before fetch`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'edge-manual-marker-'));
    roots.push(state);
    await writeFile(join(state, marker), 'retained');
    const source = await readFile(join(repository, 'bin/dev-deploy.sh'), 'utf8');
    const invocation = source
      .split('\n')
      .find((line) => line.includes('flock /home/puni1/wbs-dev/state/poll.lock bash -c'));
    if (invocation === undefined) throw new Error('manual deploy SSH writer invocation missing');
    const remote = invocation
      .trim()
      .slice(1, -3)
      .replaceAll('/home/puni1/wbs/state', state)
      .replaceAll('/home/puni1/wbs-dev/state/poll.lock', join(state, 'poll.lock'));
    const commands = join(state, 'commands');
    await mkdir(commands);
    await writeFile(
      join(commands, 'git'),
      '#!/bin/sh\ntouch "$WBS_EDGE_STATE/fetched"\nexit 42\n',
      { mode: 0o755 },
    );
    const executablePath = process.env['PATH'];
    if (executablePath === undefined) throw new Error('test requires PATH');
    const child = Bun.spawn(['bash', '-c', remote], {
      env: { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await new Response(child.stderr).text()).toContain('shared edge owner admission closed');
    expect(await child.exited).toBe(1);
    expect(await Bun.file(join(state, 'fetched')).exists()).toBe(false);
  });
}
