/**
 * Compatibility re-export: the solver child lifecycle moved into the
 * Optimization module as its private support.
 *
 * Kept because `service/solver-child-lifecycle.db.test.ts`,
 * `service/optimization-coordinator.db.test.ts` and
 * `service/optimization-cancel.two-coordinator.db.test.ts` import this path.
 * It goes when every importer names the module.
 */
export * from '../module/optimization/solver-child-lifecycle';
