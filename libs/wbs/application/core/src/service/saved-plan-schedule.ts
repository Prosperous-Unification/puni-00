/**
 * Compatibility re-export: saved-plan scheduling moved into the Saved plans module.
 *
 * Kept because `service/service-boundaries.test.ts` names this path and
 * `@wbs/core`'s barrel still deep-imports it. It goes when every importer names
 * the module.
 */
export * from '../module/saved-plans/saved-plan-schedule';
