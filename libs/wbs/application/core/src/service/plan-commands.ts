/**
 * Compatibility re-export: Plan commands moved into its own sealed module.
 *
 * Kept because `http/work-item.routes.ts`, `testing/writes-fixture.ts`,
 * `compose.test.ts`, `use-cases/admission.test.ts`,
 * `libs/wbs/application/core/testing/portable-composition.ts`, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/plan-commands/plan-commands.feature';
