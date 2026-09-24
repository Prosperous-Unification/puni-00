/**
 * Compatibility re-export: Project moved into its own sealed module.
 *
 * Kept because delivery (`http/project.routes.ts`, `http/saved-plan.routes.ts`,
 * `http/solution.routes.ts`), `module/saved-plans/save-plan.ts`, test fixtures,
 * `@wbs/core`'s barrel and be-01's own deep-import shim name this path. It goes
 * when every importer names the module.
 */
export * from '../module/project/project.resource';
