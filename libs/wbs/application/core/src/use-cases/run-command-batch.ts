/**
 * Compatibility re-export: the run-command-batch use case moved into the Plan commands module.
 *
 * Kept because `http/work-item.routes.ts`, `use-cases/admission.test.ts` and
 * `libs/wbs/application/core/testing/portable-composition.ts` import this relative
 * path directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/plan-commands/run-command-batch';
