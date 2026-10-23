import { chmod, lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { withDependencyOwner, withOwnerSolverRuntime } from './lib/edge-ownership';
import { envLayout } from './lib/env';
import { withCanonicalLock } from './lib/lock';

const executable = resolve(import.meta.dir, 'solver-supervisor.ts');
const preload = resolve(import.meta.dir, 'fixtures/solver-runtime-transport.ts');
const image = `registry.example/wbs@sha256:${'a'.repeat(64)}`;

async function fixture() {
  const directory = scratchSync('solver-runtime-cli-');
  await writeFile(
    `${directory}/config.json`,
    JSON.stringify({
      socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
      maxSearchWorkers: 2,
      maxMemoryLimitMb: 512,
      pidsLimit: 128,
      maxManagedContainers: 16,
      devSourceSha: 'a'.repeat(40),
      images: [{ callerName: 'be-01-blue', callerImage: image, solverImage: image }],
    }),
  );
  await writeFile(
    `${directory}/docker`,
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$WBS_EDGE_STATE/docker.calls"
if [ -e "$WBS_EDGE_STATE/pause" ]; then
  printf entered > "$WBS_EDGE_STATE/sweep.entered"
  while [ ! -e "$WBS_EDGE_STATE/release" ]; do sleep 0.01; done
fi
`,
  );
  await chmod(`${directory}/docker`, 0o700);
  function spawn(
    transport = false,
    argv = [`--config=${directory}/config.json`],
    program = executable,
  ) {
    return Bun.spawn(
      [process.execPath, ...(transport ? ['--preload', preload] : []), program, ...argv],
      {
        env: {
          ...process.env,
          WBS_EDGE_STATE: directory,
          PATH: `${directory}:${process.env['PATH'] ?? ''}`,
          TEST_SOLVER_SOCKET: `${directory}/s.sock`,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
  }
  return { directory, spawn };
}

async function until(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('fixture convergence timeout');
    await Bun.sleep(10);
  }
}

for (const marker of ['edge-owner.pending', 'edge-owner.json']) {
  test(`actual CLI ${marker} refuses before config or orphan sweep`, async () => {
    const { directory, spawn } = await fixture();
    await writeFile(`${directory}/${marker}`, 'retained');
    const child = spawn(false, [`--config=${directory}/absent.json`]);
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain('admission closed');
    expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
  });
}

test('actual CLI read-only mapping preflight works under retained marker and runtime occupancy', async () => {
  const { directory, spawn } = await fixture();
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  await withCanonicalLock(`${directory}/solver-runtime.lock`, async () => {
    const child = spawn(false, [
      '--preflight=prod',
      `--config=${directory}/config.json`,
      '--caller-name=be-01-blue',
      `--image=${image}`,
    ]);
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toContain('mapping preflight ok');
    expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
  });
});

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  test(`actual CLI retains runtime after readiness until ${signal} with edge-held installer interval`, async () => {
    const { directory, spawn } = await fixture();
    await withCanonicalLock(`${directory}/edge.lock`, async () => {
      const child = spawn(true);
      try {
        await until(() =>
          lstat(`${directory}/s.sock`).then(
            (socket) => socket.isSocket(),
            (cause: unknown) => {
              if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
                return false;
              throw cause;
            },
          ),
        );
        await refuses(
          withCanonicalLock(`${directory}/solver-runtime.lock`, () => Promise.resolve(undefined)),
          'lock held',
        );
        const competitor = spawn(false, [`--config=${directory}/absent.json`]);
        expect(await competitor.exited).toBe(1);
        expect(await new Response(competitor.stderr).text()).toContain('lock held');
      } finally {
        child.kill(signal);
        await child.exited;
      }
      await withCanonicalLock(`${directory}/solver-runtime.lock`, () => Promise.resolve(undefined));
    });
  });
}

test('paused actual startup excludes protected owner callback until prior process exits', async () => {
  const { directory, spawn } = await fixture();
  await writeFile(`${directory}/pause`, '');
  const child = spawn(true);
  const layout = { ...envLayout('prod'), root: directory, stateDir: directory };
  try {
    await until(() => Bun.file(`${directory}/sweep.entered`).exists());
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [layout] },
      async (owner) => {
        await refuses(
          withOwnerSolverRuntime(owner, layout, async () => {
            await writeFile(`${directory}/protected`, 'wrong');
          }),
          'lock held',
        );
        expect(await Bun.file(`${directory}/protected`).exists()).toBe(false);
        await writeFile(`${directory}/release`, '');
        await until(() =>
          lstat(`${directory}/s.sock`).then(
            (socket) => socket.isSocket(),
            (cause: unknown) => {
              if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
                return false;
              throw cause;
            },
          ),
        );
        await refuses(
          withOwnerSolverRuntime(owner, layout, () => Promise.resolve(undefined)),
          'lock held',
        );
        child.kill('SIGTERM');
        await child.exited;
        await withOwnerSolverRuntime(owner, layout, async () => {
          await writeFile(`${directory}/protected`, 'after exit');
        });
        expect(await Bun.file(`${directory}/protected`).text()).toBe('after exit');
        throw new Error('interrupted owner');
      },
      directory,
    ).catch((cause: unknown) => {
      expect(String(cause)).toContain('interrupted owner');
    });
    expect(await Bun.file(`${directory}/edge-owner.pending`).text()).toContain('a'.repeat(40));
  } finally {
    child.kill();
    await child.exited;
    await writeFile(`${directory}/release`, '');
  }
});

async function refuses(
  promise: Promise<unknown>,
  message: string,
  excludes = false,
): Promise<void> {
  let refused = false;
  try {
    await promise;
  } catch (cause) {
    refused = true;
    if (excludes) expect(String(cause)).not.toContain(message);
    else expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

test('installed bundle refuses marker and occupied runtime before config; mapping remains read-only', async () => {
  const { directory, spawn } = await fixture();
  const bundle = `${directory}/supervisor.js`;
  const build = await Bun.build({ entrypoints: [executable], target: 'bun' });
  expect(build.success).toBe(true);
  const output = build.outputs[0];
  await writeFile(bundle, await output.text());
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  const retained = spawn(false, [`--config=${directory}/absent.json`], bundle);
  expect(await retained.exited).toBe(1);
  expect(await new Response(retained.stderr).text()).toContain('admission closed');
  await withCanonicalLock(`${directory}/solver-runtime.lock`, async () => {
    const occupied = spawn(false, [`--config=${directory}/absent.json`], bundle);
    expect(await occupied.exited).toBe(1);
    expect(await new Response(occupied.stderr).text()).toContain('lock held');
    const preflight = spawn(
      false,
      [
        '--preflight=prod',
        `--config=${directory}/config.json`,
        '--caller-name=be-01-blue',
        `--image=${image}`,
      ],
      bundle,
    );
    expect(await preflight.exited).toBe(0);
    expect(await new Response(preflight.stdout).text()).toContain('mapping preflight ok');
    expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
  });
});
