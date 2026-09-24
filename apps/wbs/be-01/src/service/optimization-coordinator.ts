/**
 * Compatibility re-export: the Optimization coordinator moved into its own
 * sealed module, and the spawn, child and outcome-event types it declared moved
 * into that module's contract.
 *
 * Kept because `app.ts`, `dev/local-solver-spawner.ts`,
 * `controller/project.controller.test.ts`, `services.db.test.ts` and the
 * optimization database tests import this path.
 * It goes when every importer names the module.
 */
export * from '../module/optimization/contract';
export * from '../module/optimization/optimization.feature';
