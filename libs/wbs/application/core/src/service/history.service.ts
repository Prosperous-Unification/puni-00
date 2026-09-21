/**
 * Compatibility re-export: Plan history moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and delivery still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/plan-history/plan-history.feature';
