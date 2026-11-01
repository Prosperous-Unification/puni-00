import { rejects } from 'node:assert/strict';
import { fstatSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  controllerAccountPlugin,
  copyControllerBun,
  mapControllerShell,
  verifyControllerFile,
} from './fixtures/controller-account';
import { requireInheritedEdgeLock } from './lib/edge-admission';
import { initializeOrdinaryEdgePolicy } from './lib/edge-policy';
import { readPhase } from './lib/phase';
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

const readers = new Map<string, Promise<{ bun: string; reader: string }>>();
async function prepareInstalledReader(state: string): Promise<{ bun: string; reader: string }> {
  const existing = readers.get(state);
  if (existing !== undefined) return existing;
  const preparation = (async () => {
    const bun = join(state, 'fixed-bun');
    const reader = join(state, 'fixed-reader.js');
    copyControllerBun(bun);
    const compilation = await Bun.build({
      entrypoints: [join(repository, 'tools/tool-remote-scripts/src/solver-supervisor.ts')],
      target: 'bun',
      plugins: [
        controllerAccountPlugin(),
        {
          name: 'owned-controller-layout',
          setup(build) {
            build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => {
              const source = await Bun.file(file.path).text();
              const anchor = "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';";
              if (source.split(anchor).length !== 2)
                throw new Error('production state anchor differs');
              return {
                contents: source.replace(
                  anchor,
                  `export const SOLVER_READER_STATE = ${JSON.stringify(state)};`,
                ),
                loader: 'ts',
              };
            });
          },
        },
      ],
    });
    const output = compilation.outputs.at(0);
    if (!compilation.success || compilation.outputs.length !== 1 || output === undefined)
      throw new Error('actual owned reader compilation failed');
    await writeFile(reader, new Uint8Array(await output.arrayBuffer()), { mode: 0o755 });
    verifyControllerFile(reader);
    return { bun, reader };
  })();
  readers.set(state, preparation);
  return preparation;
}
async function command(launcher: string, state: string): Promise<string[]> {
  await writeFile(join(state, 'edge.lock'), '', { flag: 'a' });
  if (launcher.endsWith('.ts'))
    return [
      process.execPath,
      join(repository, launcher),
      ...(launcher.endsWith('/swap.ts') ? ['be', '--execute'] : ['--locked', 'a'.repeat(40)]),
    ];
  const installed = await prepareInstalledReader(state);
  const source = await readFile(join(repository, launcher), 'utf8');
  const script = join(state, launcher.split('/').at(-1)!);
  for (const anchor of [
    '/home/puni1/.local/lib/wbs-solver/bun',
    '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js',
  ])
    if (source.split(anchor).length !== 2)
      throw new Error(`fixed shell layout anchor differs: ${anchor}`);
  await writeFile(
    script,
    mapControllerShell(source)
      .replaceAll('/home/puni1/.local/lib/wbs-solver/bun', installed.bun)
      .replaceAll('/home/puni1/.local/lib/wbs-solver/solver-supervisor.js', installed.reader),
  );
  return [launcher.includes('tool-bootstrap') ? 'sh' : 'bash', script];
}

async function readManualOperation(state: string): Promise<string> {
  await writeFile(join(state, 'edge.lock'), '', { flag: 'a' });
  const installed = await prepareInstalledReader(state);
  const source = await readFile(join(repository, 'bin/dev-deploy.sh'), 'utf8');
  const invocation = source
    .split('\n')
    .find((line) => line.includes('flock /home/puni1/wbs-dev/state/poll.lock bash -c'));
  if (invocation === undefined) throw new Error('manual deploy SSH writer invocation missing');
  const literal = invocation
    .trim()
    .slice(0, -1)
    .trim()
    .replaceAll('/home/puni1/wbs/state', state)
    .replaceAll('/home/puni1/wbs-dev/state/poll.lock', join(state, 'poll.lock'))
    .replaceAll('/home/puni1/.local/lib/wbs-solver/bun', installed.bun)
    .replaceAll('/home/puni1/.local/lib/wbs-solver/solver-supervisor.js', installed.reader);
  const child = Bun.spawn(['bash', '-c', `printf %s ${literal}`], {
    env: { ...process.env, SHA: 'a'.repeat(40), BUN_VERSION: '1.4.4' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  if ((await child.exited) !== 0 || stderr !== '')
    throw new Error(`manual command construction failed: ${stderr}`);
  return mapControllerShell(stdout);
}

for (const launcher of launchers) {
  for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
    test(`${launcher} refuses ${marker} before launching any writer`, async () => {
      const state = await mkdtemp(join(tmpdir(), 'edge-admission-'));
      roots.push(state);
      await writeFile(join(state, marker), 'malformed retained owner');
      const child = Bun.spawn(await command(launcher, state), {
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
      const child = Bun.spawn(await command(launcher, state), {
        env: { ...process.env, WBS_EDGE_STATE: state },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(child.stderr).text()).toMatch(
        /shared edge lock held|deploy lock held|existing canonical lock held/,
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
    const child = Bun.spawn(await command(launcher, state), {
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
    const child = Bun.spawn(await command('tools/tool-remote-scripts/src/swap.ts', state), {
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
      ...(await command('tools/tool-remote-scripts/src/swap.ts', state)),
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
        ...(await command('tools/tool-remote-scripts/src/swap.ts', state)),
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
  await writeFile(
    join(state, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: state,
    }),
  );
  const configure = Bun.spawn(await command('tools/tool-bootstrap/src/configure.sh', state), {
    env: { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
    await Bun.sleep(5);
  expect(await Bun.file(ready).exists()).toBe(true);
  try {
    for (const environment of ['prod', 'dev']) {
      const swap = Bun.spawn(await command('tools/tool-remote-scripts/src/swap.ts', state), {
        env: { ...process.env, WBS_EDGE_STATE: state, WBS_ENV: environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(swap.stderr).text()).toMatch(
        /deploy lock held|existing canonical lock held/,
      );
      expect(await swap.exited).not.toBe(0);
    }
    const bootstrap = Bun.spawn(await command('tools/tool-bootstrap/src/bootstrap.sh', state), {
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
      const child = Bun.spawn(await command(launcher, state), {
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
    await writeFile(join(state, 'edge.lock'), '');
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
  const remote = await readManualOperation(state);
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
    const remote = await readManualOperation(state);
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

test('direct swap refuses active policy before later host IO', async () => {
  const state = await mkdtemp(join(tmpdir(), 'swap-active-admission-'));
  roots.push(state);
  await writeFile(join(state, 'edge.lock'), 'edge sentinel');
  await writeFile(
    join(state, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: state,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
  );
  const previous = process.env['WBS_EDGE_STATE'];
  process.env['WBS_EDGE_STATE'] = state;
  try {
    let reached = false;
    const downstream = async (): Promise<never> => {
      await Promise.resolve();
      reached = true;
      throw new Error('downstream IO sentinel');
    };
    await rejects(
      execute({ tier: 'fe', from: null, to: 'blue', steps: [] }, 'image', 'sha', {
        barrierStateDir: state,
        sh: downstream,
        readPhase: downstream,
        writePhase: downstream,
        writeAtomic: downstream,
      }),
      /ordinary controller/,
    );
    expect(reached).toBe(false);
    expect(await readFile(join(state, 'edge.lock'), 'utf8')).toBe('edge sentinel');
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
  }
});

test('actual bootstrap refuses an unprepared fixed reader before running any candidate writer', async () => {
  const state = await mkdtemp(join(tmpdir(), 'bootstrap-unprepared-'));
  roots.push(state);
  await writeFile(join(state, 'edge.lock'), 'edge sentinel');
  const commands = join(state, 'commands');
  await mkdir(commands);
  await writeFile(join(commands, 'id'), '#!/bin/sh\nprintf "0\\n"\n', { mode: 0o755 });
  await writeFile(
    join(commands, 'apt-get'),
    '#!/bin/sh\nprintf called > "$WBS_EDGE_STATE/writer-called"\nexit 42\n',
    { mode: 0o755 },
  );
  const source = await readFile(join(repository, 'tools/tool-bootstrap/src/bootstrap.sh'), 'utf8');
  const script = join(state, 'bootstrap.sh');
  await writeFile(script, source.replaceAll('/home/puni1/wbs/state', state));
  const child = Bun.spawn(['sh', script], {
    env: {
      ...process.env,
      WBS_EDGE_STATE: state,
      PATH: `${commands}:${String(process.env['PATH'])}`,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const code = await child.exited;
  expect(code).not.toBe(0);
  expect(await Bun.file(join(state, 'writer-called')).exists()).toBe(false);
  expect(stderr).toMatch(/fixed installed controller reader|reader preparation/);
  expect(stdout).not.toContain('apt update');
  expect(await readFile(join(state, 'edge.lock'), 'utf8')).toBe('edge sentinel');
});

test('actual manual launcher refuses active policy before fetch or poll-lock creation', async () => {
  const state = await mkdtemp(join(tmpdir(), 'manual-active-policy-'));
  roots.push(state);
  await writeFile(
    join(state, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: state,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
  );
  const remote = await readManualOperation(state);
  const commands = join(state, 'commands');
  await mkdir(commands);
  await writeFile(
    join(commands, 'git'),
    '#!/bin/sh\nprintf called > "$WBS_EDGE_STATE/fetched"\nexit 42\n',
    { mode: 0o755 },
  );
  const child = Bun.spawn(['bash', '-c', remote], {
    env: {
      ...process.env,
      WBS_EDGE_STATE: state,
      PATH: `${commands}:${String(process.env['PATH'])}`,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).not.toBe(0);
  expect(await Bun.file(join(state, 'fetched')).exists()).toBe(false);
  expect(await Bun.file(join(state, 'poll.lock')).exists()).toBe(false);
  expect(stderr).toContain('ordinary controller');
});

test('actual bootstrap closes the original installed reader identity after its real policy check before writer effects', async () => {
  const state = await mkdtemp(join(tmpdir(), 'bootstrap-reader-drift-'));
  roots.push(state);
  const argv = await command('tools/tool-bootstrap/src/bootstrap.sh', state);
  const installed = await prepareInstalledReader(state);
  await writeFile(
    join(state, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: state,
    }),
  );
  const commands = join(state, 'commands');
  await mkdir(commands);
  await writeFile(join(commands, 'id'), '#!/bin/sh\nprintf "0\\n"\n', { mode: 0o755 });
  await writeFile(
    join(commands, 'apt-get'),
    '#!/bin/sh\nprintf called > "$WBS_EDGE_STATE/writer-called"\nexit 42\n',
    { mode: 0o755 },
  );
  const hook = join(state, 'owned-read-pause.ts');
  await writeFile(
    hook,
    `import * as fs from 'node:fs/promises';import{mock}from'bun:test';const open=fs.open;let paused=false;mock.module('node:fs/promises',()=>({...fs,open:async(path,...options)=>{const descriptor=await open(path,...options);if(!paused&&path===${JSON.stringify(join(state, 'edge-policy.json'))}){paused=true;await fs.writeFile(${JSON.stringify(join(state, 'reader-entered'))},'entered');while(!await Bun.file(${JSON.stringify(join(state, 'reader-release'))}).exists())await Bun.sleep(10);}return descriptor;}}));`,
  );
  const child = Bun.spawn(argv, {
    env: {
      ...process.env,
      WBS_EDGE_STATE: state,
      PATH: `${commands}:${String(process.env['PATH'])}`,
      BUN_OPTIONS: '--preload=' + hook,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const outputTask = new Response(child.stdout).text();
  const errorTask = new Response(child.stderr).text();
  try {
    for (
      let attempt = 0;
      attempt < 300 && !(await Bun.file(join(state, 'reader-entered')).exists());
      attempt++
    )
      await Bun.sleep(10);
    expect(await Bun.file(join(state, 'reader-entered')).text()).toBe('entered');
    const bytes = await readFile(installed.reader);
    await import('node:fs/promises').then((fs) =>
      fs.rename(installed.reader, join(state, 'original-reader')),
    );
    await writeFile(installed.reader, bytes, { mode: 0o755 });
    await writeFile(join(state, 'reader-release'), 'release');
    const stdout = await outputTask;
    const stderr = await errorTask;
    const code = await child.exited;
    expect(await Bun.file(join(state, 'writer-called')).exists()).toBe(false);
    expect(code).not.toBe(0);
    expect(stderr).toContain('installed controller reader changed');
    expect(stdout).not.toContain('apt update');
  } finally {
    await writeFile(join(state, 'reader-release'), 'release');
    await child.exited;
    await outputTask;
    await errorTask;
  }
}, 10000);

for (const fault of ['stat-failure', 'hash-failure', 'hash-empty'] as const) {
  test(`actual bootstrap refuses ${fault} inside a conditional source before any writer`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'bootstrap-tool-fault-'));
    roots.push(state);
    const argv = await command('tools/tool-bootstrap/src/bootstrap.sh', state);
    const script = argv[1];
    await writeFile(
      join(state, 'edge-policy.json'),
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'ordinary',
        edgeState: state,
      }),
    );
    const commands = join(state, 'commands');
    await mkdir(commands);
    await writeFile(join(commands, 'id'), '#!/bin/sh\nprintf "0\\n"\n', { mode: 0o755 });
    // Reaching the downstream sentinel terminates this owned shell so no provisioning can follow it.
    await writeFile(
      join(commands, 'apt-get'),
      '#!/bin/sh\nprintf called > "$WBS_EDGE_STATE/writer-called"\nkill -TERM "$PPID"\nexit 42\n',
      { mode: 0o755 },
    );
    const tool = fault === 'stat-failure' ? 'stat' : 'sha256sum';
    const behavior = fault === 'hash-empty' ? 'exit 0' : `/usr/bin/${tool} "$@"\nexit 42`;
    await writeFile(
      join(commands, tool),
      `#!/bin/sh\nprintf delivered > "$WBS_EDGE_STATE/tool-fault-delivered"\n${behavior}\n`,
      { mode: 0o755 },
    );
    const child = Bun.spawn(
      ['bash', '-c', 'if . "$1"; then exit 0; else exit $?; fi', 'owned', script],
      {
        env: {
          ...process.env,
          WBS_EDGE_STATE: state,
          PATH: `${commands}:${String(process.env['PATH'])}`,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    await new Response(child.stdout).text();
    await new Response(child.stderr).text();
    const code = await child.exited;
    expect(await Bun.file(join(state, 'tool-fault-delivered')).text()).toBe('delivered');
    expect(await Bun.file(join(state, 'writer-called')).exists()).toBe(false);
    expect(code).not.toBe(0);
  });
}

test('direct swap executor retains original edge description throughout paused owned IO', async () => {
  const state = await mkdtemp(join(tmpdir(), 'direct-swap-interval-'));
  roots.push(state);
  const lock = join(state, 'edge.lock');
  const phase = join(state, 'owned.phase');
  await writeFile(lock, '');
  await writeFile(phase, 'committed\n');
  await initializeOrdinaryEdgePolicy(state);
  await writeFile(lock, 'original edge bytes');
  expect(await readFile(lock, 'utf8')).toBe('original edge bytes');
  const openingLock = await lstat(lock, { bigint: true });
  let releasePause: (() => void) | undefined;
  const pause = new Promise<void>((release) => {
    releasePause = release;
  });
  if (releasePause === undefined) throw new Error('owned pause was not initialized');
  const release = releasePause;
  const previousState = process.env['WBS_EDGE_STATE'];
  const previousDescriptor = process.env['WBS_EDGE_LOCK_FD'];
  process.env['WBS_EDGE_STATE'] = state;
  delete process.env['WBS_EDGE_LOCK_FD'];
  let entered = false;
  let settled = false;
  let observedPhase: Awaited<ReturnType<typeof readPhase>> | undefined;
  let binding: { descriptor: number; device: string; inode: string } | undefined;
  const unexpected = (): Promise<never> => Promise.reject(new Error('unexpected external IO port'));
  const invocation = execute(
    { tier: 'fe', from: null, to: 'blue', steps: [] },
    'owned-image',
    'owned-sha',
    {
      barrierStateDir: state,
      sh: unexpected,
      writePhase: unexpected,
      writeAtomic: unexpected,
      readPhase: async () => {
        const inherited = await requireInheritedEdgeLock();
        if (inherited.stateDirectory !== state)
          throw new Error('direct invocation inherited another state');
        const original = fstatSync(inherited.descriptor, { bigint: true });
        binding = {
          descriptor: inherited.descriptor,
          device: String(original.dev),
          inode: String(original.ino),
        };
        await writeFile(join(state, 'io-entered'), 'owned protected IO');
        entered = true;
        await pause;
        observedPhase = await readPhase(phase);
        return observedPhase;
      },
    },
  ).then(
    () => {
      settled = true;
      return { status: 'fulfilled' as const };
    },
    (cause: unknown) => {
      settled = true;
      return { status: 'rejected' as const, cause };
    },
  );
  const contend = async () => {
    const child = Bun.spawn(['flock', '-n', lock, 'sh', '-c', 'exit 0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [stdout, stderr, exit] = await Promise.allSettled([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ] as const);
    if (
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled' ||
      exit.status !== 'fulfilled'
    ) {
      console.error(
        '[direct interval fixture] HOLD: original contender wait/read/EOF remains unknown',
      );
      for (;;) await Bun.sleep(1000);
    }
    expect(child.signalCode).toBeNull();
    expect(stdout.value + stderr.value).toBe('');
    return exit.value;
  };
  const hasEntered = () => entered;
  const hasSettled = () => settled;
  try {
    for (let attempt = 0; attempt < 200 && !hasEntered() && !hasSettled(); attempt++)
      await Bun.sleep(5);
    expect(entered).toBe(true);
    expect(await readFile(join(state, 'io-entered'), 'utf8')).toBe('owned protected IO');
    expect(binding).toMatchObject({
      device: String(openingLock.dev),
      inode: String(openingLock.ino),
    });
    expect(binding?.descriptor).toBeGreaterThanOrEqual(3);
    expect(settled).toBe(false);
    expect(observedPhase).toBeUndefined();
    const blocked = await contend();
    expect(blocked).toBe(1);
    expect(settled).toBe(false);
    release();
    const outcome = await invocation;
    if (outcome.status === 'rejected') throw outcome.cause;
    expect(settled).toBe(true);
    expect(observedPhase).toBe('committed');
    const available = await contend();
    expect(available).toBe(0);
    expect(await readFile(lock, 'utf8')).toBe('original edge bytes');
    console.log(
      '[direct interval fixture] ' +
        JSON.stringify({
          binding,
          blocked,
          available,
          invocation: outcome.status,
          contenderExitAndBothEOF: true,
        }),
    );
  } finally {
    release();
    try {
      await invocation;
    } finally {
      if (previousState === undefined) delete process.env['WBS_EDGE_STATE'];
      else process.env['WBS_EDGE_STATE'] = previousState;
      if (previousDescriptor === undefined) delete process.env['WBS_EDGE_LOCK_FD'];
      else process.env['WBS_EDGE_LOCK_FD'] = previousDescriptor;
    }
  }
});
