/**
 * Compatibility re-export: Step moved into its own sealed module.
 *
 * Kept because delivery (`http/step.routes.ts`), test fixtures, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/step/step.resource';
