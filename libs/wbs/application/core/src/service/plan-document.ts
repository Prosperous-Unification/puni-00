/**
 * Compatibility re-export: Plan document moved into its own sealed module.
 *
 * Kept because `http/import.routes.ts`, `testing/import-service-source-contract.ts`
 * and `ports/sideways-type-boundaries.test.ts`'s fifth row name this path and
 * `@wbs/core`'s barrel still deep-imports it. It goes when every importer names
 * the module.
 */
export * from '../module/plan-document/plan-document.resource';
