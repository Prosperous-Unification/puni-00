/**
 * Compatibility re-export: Capacity moved into its own sealed module.
 *
 * Kept because `service/plan-commands.ts`, `@wbs/core`'s barrel and be-01's own
 * deep-import shim name this path. It goes when every importer names the
 * module.
 */
export * from '../module/capacity/capacity.resource';
