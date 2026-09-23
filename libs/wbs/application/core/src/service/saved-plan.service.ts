/**
 * Compatibility re-export: Saved plans moved into its own sealed module.
 *
 * Kept because `http/saved-plan.routes.ts` and `service/service-boundaries.test.ts`
 * name this path and `@wbs/core`'s barrel still deep-imports it. It goes when
 * every importer names the module.
 */
export * from '../module/saved-plans/saved-plans.feature';
