/**
 * Compatibility re-export: saved-plan integrity moved into the Saved plans module.
 *
 * Kept because `http/saved-plan.routes.ts` imports this relative path directly
 * and `@wbs/core`'s barrel still deep-imports it. It goes when every importer
 * names the module.
 */
export * from '../module/saved-plans/saved-plan-integrity';
