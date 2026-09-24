import type { ReservedSpawner } from '../optimization/contract';
import type { SolverSupervisorSpawnerOptions } from './solver-supervisor-spawner';

/**
 * What a host must supply to install {@link solverSupervisorModule}.
 *
 * Exactly {@link SolverSupervisorSpawnerOptions}, unchanged by the move: the
 * host supervisor's Unix socket, this backend's caller identity, the child's
 * worker and memory requests, and an optional connector a test replaces.
 * Image, Docker and systemd authority stay with the host.
 *
 * **K5 by the map's carve-out.** This is a repository adapter: it imports the
 * Supervisor wire protocol from `@wbs/contracts`, `node:buffer`, `di-bag` and
 * its own files. Its one edge above is the neutral spawn port it implements,
 * declared in the Optimization contract — never the Optimization feature or
 * its private support — which the backend module map sanctions and
 * `apps/wbs/be-01/src/module-boundaries.test.ts` watches; its end state is a
 * neutral `ports/` location.
 */
export type SolverSupervisorRequirements = SolverSupervisorSpawnerOptions;

/** What installing {@link solverSupervisorModule} adds to a host graph. */
export interface SolverSupervisorExports {
  /** The already-adapted launcher port the Optimization coordinator spawns through. */
  readonly spawner: ReservedSpawner;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.solver-supervisor`, and the label
 * drops the `module.` prefix.
 */
export const SOLVER_SUPERVISOR_LABEL = 'backend.solver-supervisor';
