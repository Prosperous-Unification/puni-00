/**
 * Compatibility re-export: the Solver launcher moved into its own sealed module.
 *
 * Kept because `dev/local-solver-spawner.ts`, `services.db.test.ts` and
 * `service/solver-child-lifecycle.db.test.ts` import this path. It goes when
 * every importer names the module.
 */
export * from '../module/solver-launcher/solver-launcher.repository';
