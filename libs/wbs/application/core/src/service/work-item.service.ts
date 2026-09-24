/**
 * Compatibility re-export: Work item moved into its own sealed module.
 *
 * Kept because delivery (`http/project.routes.ts`, `http/work-item.routes.ts`),
 * Plan commands, Plan import, Saved plans' `saved-plan-schedule.ts`, the test
 * harness and `testing/available-work-item-service.ts`, `@wbs/core`'s barrel and
 * be-01's own deep-import shim name this path. It goes when every importer names
 * the module.
 */
export * from '../module/work-item/work-item.resource';
