import { rejects } from 'node:assert/strict';
import { fstatSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

type WaitingChild = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** Joins every original observation before propagating read failure or returning captured values. */
async function joinChild(
  exited: Promise<number>,
  stdout: Promise<string>,
  stderr: Promise<string>,
) {
  // Proof: fail-fast Promise.all makes the pending-originals rejection test finish before
  // the controlled original exit and stdout settle; allSettled restores its refusal oracle.
  const [exit, out, err] = await Promise.allSettled([exited, stdout, stderr]);
  if (exit.status !== 'fulfilled' || out.status !== 'fulfilled' || err.status !== 'fulfilled')
    throw new AggregateError(
      [exit, out, err].flatMap((observation) =>
        observation.status === 'rejected' ? [observation.reason as unknown] : [],
      ),
      'original child observations failed',
    );
  return { exit: exit.value, stdout: out.value, stderr: err.value };
}

test('a failed child observation retains original exit and sibling stream settlement', async () => {
  const exit = Promise.withResolvers<number>();
  const stdout = Promise.withResolvers<string>();
  const failure = new Error('original stderr observation failed');
  let finished = false;
  const completion = joinChild(exit.promise, stdout.promise, Promise.reject(failure)).then(
    () => {
      finished = true;
      return undefined;
    },
    (cause: unknown) => {
      finished = true;
      return cause;
    },
  );
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(finished).toBe(false);
    exit.resolve(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(finished).toBe(false);
    stdout.resolve('original stdout');
    const refusal = await completion;
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError))
      throw new Error('original observation failure absent');
    expect(refusal.errors).toEqual([failure]);
  } finally {
    // Emergency completion follows the pending oracle; it cannot supply its proof.
    exit.resolve(0);
    stdout.resolve('original stdout');
    await completion;
  }
});

/**
 * Spawns argv detached, so POSIX setsid() makes the original child its own session and
 * process-group leader, then owns its exit and both pipes before readiness can fail.
 * Cooperative release is the normal path and never replaces a reader. Only the PID this
 * factory itself created names the group it may signal; no caller supplies a group or child.
 */
function spawnOwnedWaitingChild(
  argv: string[],
  release: string,
  env?: Record<string, string | undefined>,
) {
  const child: WaitingChild = Bun.spawn(argv, {
    ...(env === undefined ? {} : { env }),
    // Proof: omitting detached kept the release-failure regression's bounded observer at
    // finished false, exiting 1 before emergency rescue; byte-exact restoration passes.
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const group = child.pid;
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const settled = Promise.allSettled([child.exited, stdout, stderr] as const);
  const releaseWritten = Promise.withResolvers<undefined>();
  let observationsSettled = false;
  void settled.then(() => {
    observationsSettled = true;
  });
  return {
    child,
    settled,
    releaseWritten: releaseWritten.promise,
    async run(body: () => Promise<void>): Promise<void> {
      let outcome: { status: 'returned' } | { status: 'failed'; cause: unknown } = {
        status: 'returned',
      };
      try {
        await body();
      } catch (cause) {
        outcome = { status: 'failed', cause };
      }
      const primary: unknown[] = outcome.status === 'failed' ? [outcome.cause] : [];
      // Proof: moving the body before cleanup coverage fails both real forced-READY release
      // oracles before outer rescue; restoring coverage settles the original children.
      const failures: unknown[] = [];
      try {
        await writeFile(release, 'release');
        releaseWritten.resolve(undefined);
      } catch (cause) {
        failures.push(cause);
        // Pending observations mean a group member may still hold the lock and both pipes;
        // flock's forked Bash is outside a parent-only kill, so signal the whole owned group.
        if (!observationsSettled) {
          try {
            // Proof: omitting this kill, or signalling only the flock wrapper PID, kept the
            // release-failure observer at finished false, exiting 1 before emergency rescue.
            process.kill(-group, 'SIGKILL');
            failures.push(new Error('owned waiting group terminated after release failed'));
          } catch (signalFailure) {
            // ESRCH means no owned member remains, so the join below settles. Any other kill(2)
            // error may leave members alive: the original exit and pipes are then unjoinable,
            // so report them as not joined now instead of awaiting observations forever.
            const groupAbsent =
              signalFailure instanceof Error &&
              'code' in signalFailure &&
              signalFailure.code === 'ESRCH';
            if (!groupAbsent)
              throw new AggregateError(
                [...primary, ...failures, signalFailure],
                'owned waiting group termination failed; original observations not joined',
                { cause: signalFailure },
              );
          }
        }
      }
      // Proof: bypassing this join makes the release-ACK/finish-permit regression observe
      // run completed while original child exit and both EOF remain pending, before rescue.
      const outcomes = await settled;
      for (const observation of outcomes)
        if (observation.status === 'rejected') failures.push(observation.reason);
      if (failures.length !== 0)
        throw new AggregateError([...primary, ...failures], 'waiting child cleanup failed');

      if (outcome.status === 'failed') throw outcome.cause;
    },
  };
}

type WaitingOwner = ReturnType<typeof spawnOwnedWaitingChild>;

test('original waiting child remains owned after its release acknowledgment', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-release-join-'));
  roots.push(state);
  const ready = join(state, 'ready');
  const release = join(state, 'release');
  const acknowledgment = join(state, 'release-ack');
  const finish = join(state, 'finish');
  const owned = spawnOwnedWaitingChild(
    [
      'flock',
      '-n',
      join(state, 'edge.lock'),
      'bash',
      '-c',
      'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done; touch "$3"; while [ ! -e "$4" ]; do sleep 0.01; done; printf "original stdout"; printf "original stderr" >&2',
      'hold',
      ready,
      release,
      acknowledgment,
      finish,
    ],
    release,
  );
  const primary = new Error('forced readiness body failure');
  let finished = false;
  let observationsSettled = false;
  void owned.settled.then(() => {
    observationsSettled = true;
  });
  const completion = owned
    .run(async () => {
      for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
        await Bun.sleep(5);
      expect(await Bun.file(ready).exists()).toBe(true);
      throw primary;
    })
    .then(
      () => {
        finished = true;
        return undefined;
      },
      (cause: unknown) => {
        finished = true;
        return cause;
      },
    );
  try {
    await owned.releaseWritten;
    for (let attempt = 0; attempt < 100 && !(await Bun.file(acknowledgment).exists()); attempt++)
      await Bun.sleep(5);
    expect(await Bun.file(acknowledgment).exists()).toBe(true);
    // Child ACK proves it consumed release, but its separate finish gate retains exit/both EOF.
    // One event-loop turn drains promise reactions; elapsed time grants no readiness credit.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(owned.child.exitCode).toBeNull();
    expect(observationsSettled).toBe(false);
    expect(finished).toBe(false);
    await writeFile(finish, 'finish');
    expect(await completion).toBe(primary);
    const [exit, stdout, stderr] = await owned.settled;
    expect(exit).toEqual({ status: 'fulfilled', value: 0 });
    expect(stdout).toEqual({ status: 'fulfilled', value: 'original stdout' });
    expect(stderr).toEqual({ status: 'fulfilled', value: 'original stderr' });
  } finally {
    // Emergency rescue follows the pending oracle and never supplies its passing join.
    await writeFile(release, 'release');
    await writeFile(finish, 'finish');
    await owned.settled;
    await completion;
  }
});

test('release-write failure terminates the original owned flock group before reporting', async () => {
  const state = await mkdtemp(join(tmpdir(), 'edge-release-failure-'));
  roots.push(state);
  const signals = join(state, 'signals');
  await mkdir(signals);
  const lock = join(state, 'edge.lock');
  const ready = join(state, 'ready');
  const release = join(signals, 'release');
  const owned = spawnOwnedWaitingChild(
    [
      'flock',
      '-n',
      lock,
      'bash',
      '-c',
      'printf %s "$$" > "$1.part"; mv "$1.part" "$1"; while [ ! -e "$2" ]; do sleep 0.01; done',
      'hold',
      ready,
      release,
    ],
    release,
  );
  const primary = new Error('forced body failure before an unwritable release');
  let finished = false;
  let observationsSettled = false;
  let settledAtCompletion = false;
  void owned.settled.then(() => {
    observationsSettled = true;
  });
  const completion = owned
    .run(async () => {
      for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
        await Bun.sleep(5);
      expect(await Bun.file(ready).exists()).toBe(true);
      // The waiting Bash is flock's forked descendant: signalling only the flock PID would
      // leave that descendant holding the lock and both original pipes.
      expect(Number(await Bun.file(ready).text())).not.toBe(owned.child.pid);
      await rmdir(signals);
      throw primary;
    })
    .then(
      () => {
        settledAtCompletion = observationsSettled;
        finished = true;
        return undefined;
      },
      (cause: unknown) => {
        settledAtCompletion = observationsSettled;
        finished = true;
        return cause;
      },
    );
  const hasFinished = () => finished;
  try {
    // Bounded failure observer with its own budget; no existing READY poll budget changes.
    for (let attempt = 0; attempt < 200 && !hasFinished(); attempt++) await Bun.sleep(5);
    expect(finished).toBe(true);
    expect(settledAtCompletion).toBe(true);
    const refusal = await completion;
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError)) throw new Error('release failure was not retained');
    expect(refusal.errors).toHaveLength(3);
    expect(refusal.errors[0]).toBe(primary);
    expect(refusal.errors[1]).toHaveProperty('code', 'ENOENT');
    expect(String(refusal.errors[2])).toBe(
      'Error: owned waiting group terminated after release failed',
    );
    const [exit, stdout, stderr] = await owned.settled;
    expect(exit.status).toBe('fulfilled');
    expect(stdout).toEqual({ status: 'fulfilled', value: '' });
    expect(stderr).toEqual({ status: 'fulfilled', value: '' });
    // A free lock proves no forked Bash descendant survived the owner's termination.
    const contender = Bun.spawn(['flock', '-n', lock, 'true'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const contention = await joinChild(
      contender.exited,
      new Response(contender.stdout).text(),
      new Response(contender.stderr).text(),
    );
    expect(contention.exit).toBe(0);
  } finally {
    // Emergency rescue follows the failing or passing oracle and never supplies its proof.
    await mkdir(signals, { recursive: true });
    await writeFile(release, 'release');
    await owned.settled;
    await completion;
  }
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

/** Spawns the manual-dev contention holder's exact argv through the detached owning factory. */
function spawnManualEdgeHolder(state: string): WaitingOwner {
  return spawnOwnedWaitingChild(
    [
      'flock',
      '-n',
      join(state, 'edge.lock'),
      'bash',
      '-c',
      'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done',
      'hold',
      join(state, 'ready'),
      join(state, 'release'),
    ],
    join(state, 'release'),
  );
}

for (const flavor of ['flock', 'configure', 'manual'] as const)
  test(`failed READY observation settles the original ${flavor} child and streams`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'edge-ready-failure-'));
    roots.push(state);
    const release = join(state, 'release');
    const absentReady = join(state, 'absent-ready');
    let owned: WaitingOwner;
    if (flavor === 'configure') {
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
      owned = spawnOwnedWaitingChild(
        await command('tools/tool-bootstrap/src/configure.sh', state),
        release,
        { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
      );
    } else if (flavor === 'manual') {
      owned = spawnManualEdgeHolder(state);
    } else {
      owned = spawnOwnedWaitingChild(
        [
          'flock',
          '-n',
          join(state, 'edge.lock'),
          'bash',
          '-c',
          'touch "$1"; while [ ! -e "$2" ]; do sleep 0.01; done; printf "stdout-settled"; printf "stderr-settled" >&2',
          'hold',
          join(state, 'ready'),
          release,
        ],
        release,
      );
    }
    let readinessFailure: unknown;
    try {
      const failure = await owned
        .run(async () => {
          for (let attempt = 0; attempt < 100 && !(await Bun.file(absentReady).exists()); attempt++)
            await Bun.sleep(5);
          expect(await Bun.file(join(state, 'ready')).exists()).toBe(true);
          try {
            expect(await Bun.file(absentReady).exists()).toBe(true);
          } catch (cause) {
            readinessFailure = cause;
            throw cause;
          }
        })
        .then(
          () => undefined,
          (cause: unknown) => cause,
        );
      expect(readinessFailure).toBeInstanceOf(Error);
      expect(failure).toBe(readinessFailure);
      expect(await Bun.file(release).exists()).toBe(true);
      const [exit, stdout, stderr] = await owned.settled;
      expect(exit.status).toBe('fulfilled');
      expect(stdout.status).toBe('fulfilled');
      expect(stderr.status).toBe('fulfilled');
      if (
        exit.status !== 'fulfilled' ||
        stdout.status !== 'fulfilled' ||
        stderr.status !== 'fulfilled'
      )
        throw new Error('original waiting child did not settle');
      if (flavor === 'configure') {
        expect(exit.value).not.toBe(0);
        expect(stderr.value).toContain('must run as root');
      } else if (flavor === 'manual') {
        expect(exit.value).toBe(0);
        expect(stdout.value).toBe('');
        expect(stderr.value).toBe('');
      } else {
        expect(exit.value).toBe(0);
        expect(stdout.value).toBe('stdout-settled');
        expect(stderr.value).toBe('stderr-settled');
      }
    } finally {
      // The RED oracle above must run before this fixture-only emergency rescue.
      // Rescue never counts as the cleanup path being proved.
      if (!(await Bun.file(release).exists())) await writeFile(release, 'release');
      await owned.settled;
    }
  });

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
    const owned = spawnOwnedWaitingChild(
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
      join(state, 'release'),
    );
    await owned.run(async () => {
      for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
        await Bun.sleep(5);
      expect(await Bun.file(ready).exists()).toBe(true);
      const child = Bun.spawn(await command(launcher, state), {
        env: { ...process.env, WBS_EDGE_STATE: state },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const { stderr: childStderr, exit: childExit } = await joinChild(
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      );
      expect(childStderr).toMatch(
        /shared edge lock held|deploy lock held|existing canonical lock held/,
      );
      expect(childExit).not.toBe(0);
    });
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
  const owned = spawnOwnedWaitingChild(
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
    join(state, 'release'),
  );
  await owned.run(async () => {
    for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
      await Bun.sleep(5);
    expect(await Bun.file(ready).exists()).toBe(true);
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
    const { stderr: childStderr, exit: childExit } = await joinChild(
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    );
    expect(childStderr).toContain('shared edge lock held');
    expect(childExit).not.toBe(0);
  });
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
  const owned = spawnOwnedWaitingChild(
    await command('tools/tool-bootstrap/src/configure.sh', state),
    release,
    { ...process.env, WBS_EDGE_STATE: state, PATH: `${commands}:${executablePath}` },
  );
  await owned.run(async () => {
    for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
      await Bun.sleep(5);
    expect(await Bun.file(ready).exists()).toBe(true);
    for (const environment of ['prod', 'dev']) {
      const swap = Bun.spawn(await command('tools/tool-remote-scripts/src/swap.ts', state), {
        env: { ...process.env, WBS_EDGE_STATE: state, WBS_ENV: environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const { stderr: swapStderr, exit: swapExit } = await joinChild(
        swap.exited,
        new Response(swap.stdout).text(),
        new Response(swap.stderr).text(),
      );
      expect(swapStderr).toMatch(/deploy lock held|existing canonical lock held/);
      expect(swapExit).not.toBe(0);
    }
    const bootstrap = Bun.spawn(await command('tools/tool-bootstrap/src/bootstrap.sh', state), {
      env: { ...process.env, WBS_EDGE_STATE: state },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const { stderr: bootstrapStderr, exit: bootstrapExit } = await joinChild(
      bootstrap.exited,
      new Response(bootstrap.stdout).text(),
      new Response(bootstrap.stderr).text(),
    );
    expect(bootstrapStderr).toContain('shared edge lock held');
    expect(bootstrapExit).not.toBe(0);
  });
  expect(await owned.child.exited).not.toBe(0);
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
  const owned = spawnManualEdgeHolder(state);
  await owned.run(async () => {
    for (let attempt = 0; attempt < 100 && !(await Bun.file(ready).exists()); attempt++)
      await Bun.sleep(5);
    expect(await Bun.file(ready).exists()).toBe(true);
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
    const { exit: childExit } = await joinChild(
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    );
    expect(childExit).toBe(75);
    expect(await Bun.file(join(state, 'fetched')).exists()).toBe(false);
    expect(await Bun.file(join(state, 'poll.lock')).exists()).toBe(false);
  });
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
