import { DiBag } from 'di-bag';

import type { SolverSupervisorExports, SolverSupervisorRequirements } from './contract';
import { solverSupervisorModule } from './module';

/**
 * Installs {@link solverSupervisorModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of the Supervisor can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link SolverSupervisorExports}, so the module's
 * tests enumerate what this function returns.
 */
export function installSolverSupervisor(
  requirements: SolverSupervisorRequirements,
): SolverSupervisorExports {
  const bag = DiBag.createBuilder()
    .installModule(solverSupervisorModule)
    .register({
      unix: DiBag.fromSyncFactory(() => requirements.unix),
      callerId: DiBag.fromSyncFactory(() => requirements.callerId),
      searchWorkers: DiBag.fromSyncFactory(() => requirements.searchWorkers),
      memoryLimitMb: DiBag.fromSyncFactory(() => requirements.memoryLimitMb),
      connect: DiBag.fromSyncFactory(() => requirements.connect),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned launcher port kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  return { spawner: bag.resolve('spawner') };
}
