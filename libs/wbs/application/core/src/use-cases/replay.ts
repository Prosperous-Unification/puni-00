/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `use-cases/admission.test.ts` imports this relative path
 * directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/realtime/realtime.feature';
