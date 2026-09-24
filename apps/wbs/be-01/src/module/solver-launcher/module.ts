import { DiBag } from 'di-bag';

import {
  SOLVER_LAUNCHER_LABEL,
  type SolverLauncher,
  type SolverLauncherRequirements,
} from './contract';
import {
  readInstalledSolverVersion,
  readRuntimeSolverVersion,
  type SolverLauncherSpawn,
  type SolverVersionProbe,
  spawnSolverLauncher,
} from './solver-launcher.repository';

/**
 * The Solver launcher as a sealed DI Bag module.
 *
 * Only `solverLauncher` is exported. `launcherSeams` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `backend.solver-launcher/launcherSeams` rather than
 * against an anonymous binding. Both seams are registered even when absent,
 * as `undefined`, the way Saved plans registers its optional quota.
 *
 * The module registers no disposer: it holds two borrowed seams and no
 * process. A spawned launcher belongs to its caller, whose lifecycle drains
 * and kills it.
 */
export const solverLauncherModule = DiBag.createBuilder()
  .register({
    launcherSeams: DiBag.fromSyncFactory(
      ({
        probe,
        spawn,
      }: {
        probe: SolverVersionProbe | undefined;
        spawn: SolverLauncherSpawn | undefined;
      }): SolverLauncherRequirements => ({ probe, spawn }),
    ),
  })
  .register({
    solverLauncher: DiBag.fromSyncFactory(
      ({ launcherSeams }: { launcherSeams: SolverLauncherRequirements }): SolverLauncher => ({
        // Proof (2026-09-23): calling `readInstalledSolverVersion()` without the installed probe
        // left `reads the installed version through the probe installSolverLauncher wires` failing
        // (6 pass, 1 fail) on `Executable not found in $PATH: "wbs-solver-launcher"`: the Bun
        // default ran instead of the supplied probe.
        readInstalledVersion: () => readInstalledSolverVersion(launcherSeams.probe),
        readRuntimeVersion: (nodeEnv) =>
          readRuntimeSolverVersion(nodeEnv, undefined, launcherSeams.probe),
        spawn: (request) => spawnSolverLauncher(request, launcherSeams.spawn),
      }),
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['solverLauncher', 'launcherSeams']` left the
  // private-binding, graph-label and missing-requirement assertions failing (4 pass, 3 fail):
  // `resolve('launcherSeams')` did not throw, `inspectGraph()` reported bare `launcherSeams`, and
  // the DI failure named that bare key instead of the module label.
  // Proof (2026-09-23): dropping `{ label: SOLVER_LAUNCHER_LABEL }` left only the two label
  // assertions failing (5 pass, 2 fail): `inspectGraph()` reported `launcherSeams` unlabelled, and
  // the missing-requirement message named `launcherSeams` instead of
  // `backend.solver-launcher/launcherSeams`.
  .buildModule(['solverLauncher'], { label: SOLVER_LAUNCHER_LABEL });
