/**
 * Compatibility re-export: Working plan moved into the Plan commands module, private to it.
 *
 * Kept because `@wbs/core`'s barrel still exports `createWorkingPlan`, which
 * `libs/wbs/adapters/store-sqlite/src/working-plan-order.db.test.ts` builds over a real SQLite
 * source. It goes when that test reaches Working plan through Plan commands.
 */
export * from '../module/plan-commands/working-plan.resource';
