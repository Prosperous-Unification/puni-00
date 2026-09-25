import { DiBag } from 'di-bag';

import type { ReservedSpawner } from '../optimization/contract';
import { SOLVER_SUPERVISOR_LABEL } from './contract';
import {
  solverSupervisorSpawner,
  type SolverSupervisorSpawnerOptions,
} from './solver-supervisor-spawner';

/**
 * The Solver supervisor as a sealed DI Bag module.
 *
 * Only `spawner` is exported: the request/attempt mapper
 * (`solver-supervisor-spawner.ts`) already adapted to the Optimization
 * contract's launcher port. The mapper is this module's private support, and
 * `connectSolverSupervisor` stays a TypeScript diagnostic and test surface of
 * `solver-supervisor.repository.ts`, not a second DI service.
 * `supervisorOptions` stays private to each installation, so a host cannot
 * name it — resolving it answers `DI_BAG_UNKNOWN_SERVICE_KEY` — and a
 * requirement the host forgot is reported against
 * `backend.solver-supervisor/supervisorOptions` rather than against an
 * anonymous binding. The optional connector is registered even when absent,
 * as `undefined`, so the mapper keeps its own Unix-socket default.
 *
 * The module registers no disposer: each attempt's socket belongs to the
 * coordinator's lifecycle, which drains, kills and awaits it.
 */
export const solverSupervisorModule = DiBag.createBuilder()
  .withServices({
    supervisorOptions: DiBag.createProvider(
      ({
        unix,
        callerId,
        searchWorkers,
        memoryLimitMb,
        connect,
      }: {
        unix: string;
        callerId: string;
        searchWorkers: number;
        memoryLimitMb: number;
        connect: SolverSupervisorSpawnerOptions['connect'];
      }): SolverSupervisorSpawnerOptions => ({
        unix,
        callerId,
        // Proof (2026-09-24): handing the mapper `searchWorkers: 1` instead of the supplied
        // request left `hands the reserved attempt to the connector installSolverSupervisor wires`
        // failing (4 pass, 1 fail): the wire request carried `"searchWorkers": 1`.
        searchWorkers,
        memoryLimitMb,
        connect,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    spawner: DiBag.createProvider(
      ({
        supervisorOptions,
      }: {
        supervisorOptions: SolverSupervisorSpawnerOptions;
      }): ReservedSpawner => solverSupervisorSpawner(supervisorOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['spawner', 'supervisorOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('supervisorOptions')` did not throw, `inspectGraph()` reported bare
  // `supervisorOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: SOLVER_SUPERVISOR_LABEL }` left only the two label
  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `supervisorOptions`
  // unlabelled, and the missing-requirement message named `supervisorOptions` instead of
  // `backend.solver-supervisor/supervisorOptions`.
  .buildModule({ exportedServiceKeys: ['spawner'], moduleLabel: SOLVER_SUPERVISOR_LABEL });
