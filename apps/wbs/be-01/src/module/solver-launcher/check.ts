import { DiBag } from 'di-bag';

import type { SolverLauncherExports, SolverLauncherRequirements } from './contract';
import { solverLauncherModule } from './module';

/**
 * Installs {@link solverLauncherModule} over supplied seams and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of the Solver
 * launcher can reach a private binding or a host key through it. The type
 * checker does not enforce that on its own: an object with an extra property
 * returned through a variable still satisfies {@link SolverLauncherExports},
 * so the module's tests enumerate what this function returns.
 */
export function installSolverLauncher(
  requirements: SolverLauncherRequirements,
): SolverLauncherExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([solverLauncherModule])
    .withServices({
      probe: DiBag.createProvider(() => requirements.probe, { factoryReturnKind: 'sync-value' }),
      spawn: DiBag.createProvider(() => requirements.spawn, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  // Proof (2026-09-23): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (6 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  // Proof (2026-09-23): attaching `resolve` to the returned launcher kept the key list correct but
  // made the no-resolver assertion receive false (6 pass, 1 fail), with `wbs-be-01:typecheck` at
  // exit 0.
  return { solverLauncher: bag.resolve('solverLauncher') };
}
