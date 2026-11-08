import { realpath, stat } from 'node:fs/promises';

import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
} from './solver-supervisor-install-contract';

interface SolverExecutionIdentity {
  readonly executable: string;
  readonly kernelExecutable: string;
  readonly executableIdentity: string;
  readonly kernelIdentity: string;
  readonly module: string;
  readonly argv: readonly string[];
}

/** Compares observed execution facts; no caller-supplied context reaches the production self-observer. */
export function assertSolverExecutionIdentity(observed: SolverExecutionIdentity): void {
  // Proof: actual-self-identity omission failed to refuse the wrong executable; built CLI test failed (exit 1).
  if (
    observed.executable !== SOLVER_SUPERVISOR_BUN ||
    observed.kernelExecutable !== SOLVER_SUPERVISOR_BUN ||
    observed.executableIdentity !== observed.kernelIdentity ||
    !/^[0-9]+:[0-9]+$/.test(observed.executableIdentity) ||
    observed.module !== SOLVER_SUPERVISOR_BUNDLE.remote ||
    JSON.stringify(observed.argv) !==
      JSON.stringify([
        SOLVER_SUPERVISOR_BUN,
        SOLVER_SUPERVISOR_BUNDLE.remote,
        `--config=${SOLVER_SUPERVISOR_CONFIG}`,
        '--admission=policy',
      ])
  )
    throw new Error(
      'solver restoration executing identity differs from fixed installed entrypoint',
    );
}

/** Kernel executable, bundled module and actual argv only; source-unbundled restoring startup is unsupported. */
export async function assertExecutingSolver(): Promise<void> {
  const executable = await realpath(process.execPath);
  const kernelExecutable = await realpath('/proc/self/exe');
  const executableStat = await stat(process.execPath, { bigint: true });
  const kernelStat = await stat('/proc/self/exe', { bigint: true });
  assertSolverExecutionIdentity({
    executable,
    kernelExecutable,
    executableIdentity: `${String(executableStat.dev)}:${String(executableStat.ino)}`,
    kernelIdentity: `${String(kernelStat.dev)}:${String(kernelStat.ino)}`,
    module: await realpath(import.meta.path),
    argv: process.argv,
  });
}
