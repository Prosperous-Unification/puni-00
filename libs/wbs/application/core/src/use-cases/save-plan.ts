/**
 * Compatibility re-export: the save-plan use case moved into the Saved plans module.
 *
 * Kept because `http/saved-plan.routes.ts`, `use-cases/admission.test.ts`,
 * `compose.test.ts` and `libs/wbs/application/core/testing/portable-composition.ts`
 * import this relative path directly and `@wbs/core`'s barrel still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/saved-plans/save-plan';
