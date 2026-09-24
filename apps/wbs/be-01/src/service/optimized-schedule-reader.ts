/**
 * Compatibility re-export: the optimized schedule reader moved into the
 * Optimization module as its private support.
 *
 * Kept because `controller/work-item.controller.test.ts` and the plan-read
 * tests under `service/` import this path. It goes when every importer names
 * the module.
 */
export * from '../module/optimization/optimized-schedule-reader';
