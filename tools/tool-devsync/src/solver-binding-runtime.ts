import { isAbsolute, join, resolve } from 'node:path';

import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  writeAtomic,
} from '@wbs/deploy-contract';

import type { TargetSolverBindingDependencies } from './solver-binding-host';

const LIVE_SOURCE_ROOT = '/home/puni1/wbs-dev/src';
const HOST_STATE_ROOT = '/home/puni1/wbs-dev/state';
const REGISTRY_ENV = '/home/puni1/wbs/.env';
const HOST_INPUT_MAX_BYTES = 256 * 1024;

export interface SolverBindingRuntimeInvocation {
  cwd: string;
  argv: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export interface SolverBindingRuntimeIo {
  read(path: string): Promise<Uint8Array>;
  command(
    invocation: SolverBindingRuntimeInvocation,
  ): Promise<{ exitCode: number; stderr: string }>;
  writeAtomic(path: string, contents: string): Promise<void>;
}

export interface SolverBindingRuntimeTarget {
  root: string;
  bunPath: string;
  sourceSha: string;
  compatibilityIdentity: string;
}

export interface TargetSolverBindingRuntime {
  statePath: string;
  configPath: string;
  dependencies: TargetSolverBindingDependencies;
}

async function command(
  invocation: SolverBindingRuntimeInvocation,
): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn([...invocation.argv], {
    cwd: invocation.cwd,
    env: { ...process.env, ...invocation.env },
    stdout: 'inherit',
    stderr: 'pipe',
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { exitCode, stderr };
}

const DEFAULT_IO: SolverBindingRuntimeIo = {
  read: async (path) =>
    new Uint8Array(
      await Bun.file(path)
        .slice(0, HOST_INPUT_MAX_BYTES + 1)
        .arrayBuffer(),
    ),
  command,
  writeAtomic: (path, contents) => writeAtomic(path, contents),
};

async function requireCommand(
  label: string,
  invocation: SolverBindingRuntimeInvocation,
  io: SolverBindingRuntimeIo,
): Promise<void> {
  const output = await io.command(invocation);
  if (output.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${String(output.exitCode)}): ${output.stderr.trim()}`);
  }
}

/** Supplies the h2puni-only file and command boundary for one target clone. */
export function createTargetSolverBindingRuntime(
  target: SolverBindingRuntimeTarget,
  io: SolverBindingRuntimeIo = DEFAULT_IO,
): TargetSolverBindingRuntime {
  if (!isAbsolute(target.root) || resolve(target.root) !== target.root) {
    throw new Error('solver binding runtime root must be an absolute normalized path');
  }
  if (!isAbsolute(target.bunPath)) {
    throw new Error('solver binding runtime Bun path must be absolute');
  }
  if (!/^[0-9a-f]{40}$/.test(target.sourceSha)) {
    throw new Error('solver binding runtime source SHA is invalid');
  }
  if (!/^[0-9a-f]{64}$/.test(target.compatibilityIdentity)) {
    throw new Error('solver binding runtime compatibility identity is invalid');
  }

  const statePath = join(
    HOST_STATE_ROOT,
    `solver-preparation.${target.compatibilityIdentity}.json`,
  );
  const configPath = join(
    HOST_STATE_ROOT,
    `solver-supervisor.${target.compatibilityIdentity}.json`,
  );
  const releasePath = join(target.root, 'dist/tool-dagger/release.json');
  const materializer = join(
    target.root,
    'tools/tool-remote-scripts/src/materialize-solver-supervisor-config.ts',
  );
  const installer = join(target.root, 'tools/tool-remote-scripts/src/install-solver-supervisor.ts');

  const run = (label: string, argv: readonly string[], env?: Readonly<Record<string, string>>) =>
    requireCommand(label, { cwd: target.root, argv, ...(env === undefined ? {} : { env }) }, io);

  return {
    statePath,
    configPath,
    dependencies: {
      readRegistryEnv: () => io.read(REGISTRY_ENV),
      readInstalledConfig: () => io.read(SOLVER_SUPERVISOR_CONFIG),
      publish: async (sourceSha, registryPassword) => {
        await run(
          'solver image publish',
          [
            join(target.root, 'bin/with-heavy-lock.sh'),
            '--',
            'env',
            `WBS_SHA=${sourceSha}`,
            target.bunPath,
            'run',
            join(target.root, 'tools/tool-dagger/src/main.ts'),
            'be',
          ],
          { REGISTRY_PASS: registryPassword },
        );
        return io.read(releasePath);
      },
      materialize: (config) =>
        run('solver config materialization', [
          target.bunPath,
          materializer,
          `--blue-image=${config.blueImage}`,
          `--green-image=${config.greenImage}`,
          `--dev-solver-image=${config.devSolverImage}`,
          `--dev-source-sha=${config.devSourceSha}`,
          `--output=${configPath}`,
          '--replace',
        ]),
      install: async () => {
        await run('solver supervisor bundle build', [
          target.bunPath,
          'x',
          'nx',
          'run',
          'tool-remote-scripts:build',
        ]);
        await run('solver supervisor install', [
          target.bunPath,
          installer,
          '--host=h2puni',
          `--config=${configPath}`,
          '--execute',
        ]);
      },
      preflight: (binding) =>
        run('solver supervisor preflight', [
          SOLVER_SUPERVISOR_BUN,
          SOLVER_SUPERVISOR_BUNDLE.remote,
          '--preflight=dev',
          `--config=${SOLVER_SUPERVISOR_CONFIG}`,
          `--solver-image=${binding.image}`,
        ]),
      checkpoint: (state) => io.writeAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`),
      reset: (sourceSha) =>
        run('dev checkout reset', [
          'git',
          '-C',
          LIVE_SOURCE_ROOT,
          'reset',
          '--hard',
          '--quiet',
          sourceSha,
        ]),
    },
  };
}
