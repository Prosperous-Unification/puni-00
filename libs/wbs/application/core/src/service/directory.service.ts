/**
 * Compatibility re-export: Directory moved into its own sealed module.
 *
 * Kept because delivery (`http/directory.routes.ts`, `http/project.routes.ts`),
 * `module/plan-import/plan-import.feature.ts`, `service/plan-commands.ts`,
 * `@wbs/core`'s barrel and be-01's own deep-import shim name this path. It goes
 * when every importer names the module.
 */
export * from '../module/directory/directory.resource';
