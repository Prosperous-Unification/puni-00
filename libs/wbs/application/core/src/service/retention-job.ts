/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and be-01's own
 * `retention-job.ts` re-export shim still deep-imports it through `@wbs/core`.
 * It goes when every importer names the module.
 */
export * from '../module/bounded-replay-sweep/retention-job';
