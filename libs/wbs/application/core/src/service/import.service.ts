/**
 * Compatibility re-export: Plan import moved into its own sealed module.
 *
 * Kept because `http/import.routes.ts`, `testing/import-service-source-contract.ts`
 * and `testing/writes-fixture.ts` deep-import this path by relative import, and
 * the store-sqlite and store-memory adapters reach `import-service-source-contract.ts`
 * through `@wbs/core/testing/import-service-source-contract`. It goes when every
 * importer names the module.
 */
export * from '../module/plan-import/plan-import.feature';
