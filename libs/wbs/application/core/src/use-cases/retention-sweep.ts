/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `use-cases/admission.test.ts` imports this relative path
 * directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/bounded-replay-sweep/bounded-replay-sweep.feature';
