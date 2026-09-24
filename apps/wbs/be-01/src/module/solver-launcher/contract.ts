import type {
  SolverLauncherRequest,
  SolverLauncherSpawn,
  SolverVersionProbe,
  SpawnedSolverLauncher,
} from './solver-launcher.repository';

/**
 * What a host may supply to install {@link solverLauncherModule}: the two
 * process seams the moved functions already take as parameters.
 *
 * Both are optional, and an absent seam is registered as `undefined`, so the
 * moved functions fall back to their own Bun defaults — `Bun.spawnSync` for the
 * version probe and `Bun.spawn` for the launcher — exactly as their direct
 * callers get today. The source-module read of `readRuntimeSolverVersion` is
 * not a requirement: no caller outside the moved file's own tests supplies it.
 *
 * **No K3 or K5 debt.** This is a repository adapter: it imports `node:fs`,
 * `di-bag` and its own files, nothing above it. be-01 has no type-identity
 * boundary check that would prove it (task 1.6's note), so this is a reading,
 * not a watched rule.
 */
export interface SolverLauncherRequirements {
  readonly probe?: SolverVersionProbe;
  readonly spawn?: SolverLauncherSpawn;
}

/** The launcher boundary one installation hands out, over that installation's seams. */
export interface SolverLauncher {
  /** `readInstalledSolverVersion` over the installed probe. */
  readonly readInstalledVersion: () => string;
  /** `readRuntimeSolverVersion` over the installed probe and the real solver source module. */
  readonly readRuntimeVersion: (nodeEnv: string | undefined) => string;
  /** `spawnSolverLauncher` over the installed process seam. */
  readonly spawn: (request: SolverLauncherRequest) => SpawnedSolverLauncher;
}

/** What installing {@link solverLauncherModule} adds to a host graph. */
export interface SolverLauncherExports {
  readonly solverLauncher: SolverLauncher;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.solver-launcher`, and the label
 * drops the `module.` prefix.
 */
export const SOLVER_LAUNCHER_LABEL = 'backend.solver-launcher';
