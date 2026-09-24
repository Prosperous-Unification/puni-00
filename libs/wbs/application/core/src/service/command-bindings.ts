/**
 * Compatibility re-export: the command bindings moved into the Plan commands module.
 *
 * Kept because `@wbs/core`'s barrel still deep-imports this path and
 * `service/service-boundaries.test.ts` lists it. It goes when neither does.
 */
export * from '../module/plan-commands/command-bindings';
