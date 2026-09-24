/**
 * Compatibility re-export: Calendar marker moved into its own sealed module.
 *
 * Kept because delivery (`http/calendar-marker.routes.ts`, `http/project.routes.ts`),
 * test fixtures, two rows of `ports/sideways-type-boundaries.test.ts`, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/calendar-marker/calendar-marker.resource';
