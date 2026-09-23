import type { SavedPlanService, SavedPlanServiceOptions } from './saved-plans.feature';

/**
 * What a host must supply to install {@link savedPlansModule}.
 *
 * Exactly {@link SavedPlanServiceOptions}, unchanged by the move: the digest,
 * scheduler, id and clock callbacks, the optional quota and the two stores.
 *
 * **Preserved K3 debt.** `plans` (`SavedPlanStore`, `ports/saved-plan-store.ts`)
 * and `capture` (`SavedPlanCaptureStore`, `ports/saved-plan-capture-store.ts`)
 * are repository ports, not resource-service contracts: `SavedPlanService`
 * reads and writes saved-plan rows and captures the live plan through them
 * directly. This extraction moves the file; it does not close that debt.
 * Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`,
 * the same disposition Plan import's and Authentication's own requirements
 * record for their preserved direct-store calls.
 */
export type SavedPlansRequirements = SavedPlanServiceOptions;

/**
 * What installing {@link savedPlansModule} adds to a host graph.
 *
 * One export, `savedPlans`. The composition root's `plans` name stays an alias
 * of this same instance rather than a second export: the requirement key
 * `plans` already names the saved-plan store, and a second binding would be a
 * second place a duplicate `SavedPlanService` could be constructed.
 */
export interface SavedPlansExports {
  readonly savedPlans: SavedPlanService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching the five earlier core modules; the wiki
 * module identifier is `module.application.saved-plans` and the label drops
 * the `module.` prefix.
 */
export const SAVED_PLANS_LABEL = 'application.saved-plans';
