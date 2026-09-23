/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and delivery still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/bounded-replay-sweep/retention-timer';
