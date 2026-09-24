/**
 * Compatibility re-export: the Solver supervisor client moved into its own
 * sealed repository module.
 *
 * Kept because `apps/wbs/be-01/scripts/solver-supervisor-image-client.ts` and
 * `apps/wbs/be-01/scripts/solver-supervisor-orphan-client.ts` call
 * `connectSolverSupervisor` through this path. It goes when both name the
 * module.
 */
export * from '../module/solver-supervisor/solver-supervisor.repository';
