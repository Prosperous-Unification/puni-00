/**
 * Compatibility re-export: Plan import moved into its own sealed module.
 *
 * Kept because `service/prepare-import.test.ts` deep-imports this path by
 * relative import. It goes when every importer names the module.
 */
export * from '../module/plan-import/prepare-import';
