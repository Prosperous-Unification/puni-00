import { closeSync, constants, openSync } from 'node:fs';
import { chmod, lstat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { initialHandoffLayout } from './fixtures/initial-handoff';
import { withDependencyOwner, withOwnerSolverRuntime } from './lib/edge-ownership';
import { initializeOrdinaryEdgePolicy } from './lib/edge-policy';
import { envLayout } from './lib/env';
import { withCanonicalLock } from './lib/lock';

const executable = resolve(import.meta.dir, 'solver-supervisor.ts');
const preload = resolve(import.meta.dir, 'fixtures/solver-runtime-transport.ts');
const initialLayout = resolve(import.meta.dir, 'fixtures/initial-handoff.ts');
const image = `registry.example/wbs@sha256:${'a'.repeat(64)}`;

async function fixture() {
  const directory = scratchSync('solver-runtime-cli-');
  await writeFile(`${directory}/edge.lock`, '');
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
      [
        process.execPath,
        '--preload',
        initialLayout,
        ...(transport ? ['--preload', preload] : []),
        program,
        ...argv,
      ],
      {
        env: {
          ...process.env,
          TEST_INITIAL_HANDOFF_LAYOUT: 'owned',
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
    expect(await child.exited).toBe(78);
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
  const build = await Bun.build({
    entrypoints: [executable],
    target: 'bun',
    plugins: [initialHandoffLayout(directory)],
  });
  expect(build.success).toBe(true);
  const output = build.outputs[0];
  await writeFile(bundle, await output.text());
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  const retained = spawn(false, [`--config=${directory}/absent.json`], bundle);
  expect(await retained.exited).toBe(78);
  expect(await new Response(retained.stderr).text()).toContain('admission closed');
  await unlink(`${directory}/edge-owner.pending`);
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

for (const fault of [
  'missing',
  'unreadable',
  'active',
  'restoring',
  'pending',
  'owner',
  'occupied',
  'valid',
] as const) {
  test(`actual policy CLI ${fault} reaches only its admitted boundary`, async () => {
    const { directory, spawn } = await fixture();
    const path = `${directory}/edge-policy.json`;
    if (fault !== 'missing')
      await writeFile(
        path,
        JSON.stringify({
          format: 'dependency-edge-policy',
          version: 1,
          phase: fault === 'active' || fault === 'restoring' ? fault : 'ordinary',
          edgeState: directory,
        }),
      );
    if (fault === 'unreadable') await chmod(path, 0);
    if (fault === 'pending' || fault === 'owner')
      await writeFile(
        `${directory}/${fault === 'pending' ? 'edge-owner.pending' : 'edge-owner.json'}`,
        'retained',
      );
    const run = async () => {
      const child = spawn(false, [
        `--config=${directory}/absent-config.json`,
        '--admission=policy',
      ]);
      expect(await child.exited).toBe(fault === 'owner' || fault === 'pending' ? 78 : 1);
      const stderr = await new Response(child.stderr).text();
      if (fault === 'valid') expect(stderr).toContain('absent-config.json');
      else {
        expect(stderr).not.toContain('absent-config.json');
        expect(stderr).toContain(
          fault === 'occupied'
            ? 'lock held'
            : fault === 'owner' || fault === 'pending'
              ? 'admission closed'
              : fault === 'active'
                ? 'unknown or missing fields'
                : fault === 'restoring'
                  ? 'invalid restoring edge policy'
                  : 'edge-policy.json',
        );
      }
      expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
    };
    try {
      if (fault === 'occupied') await withCanonicalLock(`${directory}/solver-runtime.lock`, run);
      else await run();
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
  });
}

test('actual read-only policy preflight never reads config or takes runtime lifetime lock', async () => {
  const { directory, spawn } = await fixture();
  const absent = spawn(false, ['--check-edge-policy']);
  expect(await absent.exited).toBe(1);
  expect(await new Response(absent.stderr).text()).toContain('edge-policy.json');
  await writeFile(
    `${directory}/edge-policy.json`,
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: directory,
    }),
  );
  await withCanonicalLock(`${directory}/solver-runtime.lock`, async () => {
    const child = spawn(false, ['--check-edge-policy']);
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toContain('ordinary edge policy ok');
  });
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  const refused = spawn(false, ['--check-edge-policy']);
  expect(await refused.exited).toBe(78);
  expect(await new Response(refused.stderr).text()).toContain('admission closed');
  expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
});

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  test(`actual policy CLI holds lifetime admission until ${signal}`, async () => {
    const { directory, spawn } = await fixture();
    await writeFile(
      `${directory}/edge-policy.json`,
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'ordinary',
        edgeState: directory,
      }),
    );
    const child = spawn(true, [`--config=${directory}/config.json`, '--admission=policy']);
    try {
      await until(() => Bun.file(`${directory}/docker.calls`).exists());
      await until(() =>
        lstat(`${directory}/s.sock`).then(
          (socket) => socket.isSocket(),
          () => false,
        ),
      );
      await refuses(
        withCanonicalLock(`${directory}/solver-runtime.lock`, () => Promise.resolve()),
        'lock held',
      );
    } finally {
      child.kill(signal);
      await child.exited;
    }
    await withCanonicalLock(`${directory}/solver-runtime.lock`, () => Promise.resolve());
  });
}

for (const admission of ['legacy', 'policy'])
  for (const marker of ['edge-owner.pending', 'edge-owner.json'])
    test(`controlled ${admission} refusal wins over simultaneous runtime occupancy for ${marker}`, async () => {
      const { directory, spawn } = await fixture();
      await writeFile(`${directory}/${marker}`, 'retained');
      await withCanonicalLock(`${directory}/solver-runtime.lock`, async () => {
        const child = spawn(false, [
          `--config=${directory}/absent.json`,
          ...(admission === 'policy' ? ['--admission=policy'] : []),
        ]);
        expect(await child.exited).toBe(78);
        expect(await new Response(child.stderr).text()).toContain('admission closed');
      });
    });

for (const admission of ['legacy', 'policy'])
  for (const permission of [0o333, 0o444])
    test(`actual ${admission} CLI unreadable state ${permission.toString(8)} remains ordinary failure with marker`, async () => {
      const { directory, spawn } = await fixture();
      await writeFile(`${directory}/edge-owner.pending`, 'retained');
      await chmod(directory, permission);
      try {
        const child = spawn(false, [
          `--config=${directory}/absent.json`,
          ...(admission === 'policy' ? ['--admission=policy'] : []),
        ]);
        expect(await child.exited).toBe(1);
        expect(await new Response(child.stderr).text()).not.toContain('admission closed');
      } finally {
        await chmod(directory, 0o700);
      }
    });

for (const fault of [
  "new Error('shared edge owner admission closed: retained marker')",
  "{ reason: 'retained-edge-owner' }",
  '42',
])
  test(`actual CLI startup callback fault ${fault} remains ordinary failure`, async () => {
    const { directory } = await fixture();
    const injection = `${directory}/callback.ts`;
    await writeFile(
      injection,
      `import { mock } from 'bun:test'; mock.module(${JSON.stringify(resolve(import.meta.dir, 'lib/solver-supervisor-runtime.ts'))}, () => ({ startSolverSupervisor() { throw ${fault}; } }));`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        initialLayout,
        '--preload',
        injection,
        executable,
        `--config=${directory}/config.json`,
      ],
      {
        env: { ...process.env, TEST_INITIAL_HANDOFF_LAYOUT: 'owned', WBS_EDGE_STATE: directory },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await child.exited).toBe(1);
  });

test('actual CLI malformed configuration remains ordinary failure', async () => {
  const { directory, spawn } = await fixture();
  await writeFile(`${directory}/config.json`, '{');
  expect(await spawn().exited).toBe(1);
});

test('actual CLI unknown argument remains ordinary failure before retained marker inspection', async () => {
  const { directory, spawn } = await fixture();
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  expect(await spawn(false, ['--unknown']).exited).toBe(1);
});

for (const admission of ['legacy', 'policy'])
  test(`actual ${admission} CLI symlink state remains ordinary failure with marker`, async () => {
    const { directory } = await fixture();
    const { symlink } = await import('node:fs/promises');
    await writeFile(`${directory}/edge-owner.pending`, 'retained');
    const alias = `${directory}-alias`;
    await symlink(directory, alias);
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        initialLayout,
        executable,
        `--config=${directory}/absent.json`,
        ...(admission === 'policy' ? ['--admission=policy'] : []),
      ],
      {
        env: { ...process.env, TEST_INITIAL_HANDOFF_LAYOUT: 'owned', WBS_EDGE_STATE: alias },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).not.toContain('admission closed');
    await unlink(alias);
  });

for (const admission of ['legacy', 'policy'])
  test(`actual ${admission} CLI refuses a marker published after precheck before runtime acquisition`, async () => {
    const { directory } = await fixture();
    await writeFile(
      `${directory}/edge-policy.json`,
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'ordinary',
        edgeState: directory,
      }),
    );
    const injection = `${directory}/raced-marker.ts`;
    await writeFile(
      injection,
      `import { mock } from 'bun:test'; import * as fs from 'node:fs'; const open = fs.openSync; const write = fs.writeFileSync; mock.module('node:fs', () => ({...fs, openSync(path, ...args) { if(path === ${JSON.stringify(`${directory}/solver-runtime.lock`)}) write(${JSON.stringify(`${directory}/edge-owner.pending`)}, 'retained'); return open(path,...args); }}));`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        initialLayout,
        '--preload',
        injection,
        executable,
        `--config=${directory}/absent.json`,
        ...(admission === 'policy' ? ['--admission=policy'] : []),
      ],
      {
        env: { ...process.env, TEST_INITIAL_HANDOFF_LAYOUT: 'owned', WBS_EDGE_STATE: directory },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await child.exited).toBe(78);
    expect(await new Response(child.stderr).text()).toContain('admission closed');
  });

for (const admission of [
  'ordinary',
  'missing-descriptor',
  'foreign-descriptor',
  'independent-description',
  'missing-policy',
  'invalid-policy',
  'restoring-policy',
  'active-policy',
  'unknown-policy',
  'committed-marker',
  'pending-marker',
] as const) {
  test(`actual inherited refusal-only reader ${admission} terminates before config and service effects`, async () => {
    const { directory } = await fixture();
    await initializeOrdinaryEdgePolicy(directory);
    if (admission === 'missing-policy') await unlink(`${directory}/edge-policy.json`);
    if (admission === 'invalid-policy') await writeFile(`${directory}/edge-policy.json`, '{}');
    if (['restoring-policy', 'active-policy', 'unknown-policy'].includes(admission))
      await writeFile(
        `${directory}/edge-policy.json`,
        JSON.stringify({
          format: 'dependency-edge-policy',
          version: 1,
          phase:
            admission === 'restoring-policy'
              ? 'restoring'
              : admission === 'active-policy'
                ? 'active'
                : 'unknown',
          edgeState: directory,
          ownerPublicationSha256: 'a'.repeat(64),
          restorationIntent: { name: 'restore.json', sha256: 'b'.repeat(64) },
        }),
      );
    if (admission === 'committed-marker')
      await writeFile(`${directory}/edge-owner.json`, 'retained');
    if (admission === 'pending-marker')
      await writeFile(`${directory}/edge-owner.pending`, 'retained');
    const compilation = await Bun.build({
      entrypoints: [executable],
      target: 'bun',
      plugins: [
        {
          name: 'fixed-reader-fixture',
          setup(build) {
            build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => ({
              contents: (await Bun.file(file.path).text()).replace(
                "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';",
                `export const SOLVER_READER_STATE = ${JSON.stringify(directory)};`,
              ),
              loader: 'ts',
            }));
          },
        },
      ],
    });
    const output = compilation.outputs.at(0);
    if (!compilation.success || output === undefined || compilation.outputs.length !== 1)
      throw new Error('fixed reader fixture build failed');
    const fixedReader = `${directory}/fixed-reader.js`;
    await writeFile(fixedReader, new Uint8Array(await output.arrayBuffer()));
    const foreign = `${directory}/foreign.lock`;
    await writeFile(foreign, '');
    await withCanonicalLock(`${directory}/edge.lock`, async (descriptor) => {
      const independent =
        admission === 'foreign-descriptor' || admission === 'independent-description'
          ? openSync(
              admission === 'foreign-descriptor' ? foreign : `${directory}/edge.lock`,
              constants.O_RDONLY,
            )
          : undefined;
      try {
        const inherited = independent ?? descriptor;
        const child = Bun.spawn(
          [
            process.execPath,
            '--preload',
            initialLayout,
            fixedReader,
            '--check-edge-policy-inherited',
          ],
          {
            env: {
              ...process.env,
              TEST_INITIAL_HANDOFF_LAYOUT: 'owned',
              WBS_EDGE_STATE: directory,
              ...(admission === 'missing-descriptor' ? {} : { WBS_EDGE_LOCK_FD: '3' }),
            },
            stdio:
              admission === 'missing-descriptor'
                ? ['ignore', 'pipe', 'pipe']
                : ['ignore', 'pipe', 'pipe', inherited],
          },
        );
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(child.signalCode).toBe(null);
        if (admission === 'ordinary') {
          expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
          expect(stdout).toContain('inherited ordinary edge policy ok');
        } else {
          expect(code).not.toBe(0);
          expect(stdout).toBe('');
        }
        expect(await Bun.file(`${directory}/docker.calls`).exists()).toBe(false);
        expect(await Bun.file(`${directory}/s.sock`).exists()).toBe(false);
      } finally {
        if (independent !== undefined) closeSync(independent);
      }
    });
  });
}

test('production inherited reader refuses a valid foreign state root and held descriptor', async () => {
  const { directory } = await fixture();
  await initializeOrdinaryEdgePolicy(directory);
  await withCanonicalLock(`${directory}/edge.lock`, async (descriptor) => {
    const child = Bun.spawn(
      [process.execPath, '--preload', initialLayout, executable, '--check-edge-policy-inherited'],
      {
        env: {
          ...process.env,
          TEST_INITIAL_HANDOFF_LAYOUT: 'owned',
          WBS_EDGE_STATE: directory,
          WBS_EDGE_LOCK_FD: '3',
        },
        stdio: ['ignore', 'pipe', 'pipe', descriptor],
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('requires fixed canonical state');
  });
});
