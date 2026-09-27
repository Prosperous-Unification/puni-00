import type { SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
import type { SavedPlanStore } from '../../ports/saved-plan-store';
import type { SavedPlanService, SavedPlanServiceOptions } from './saved-plans.feature';

/**
 * What a host must supply to install {@link savedPlansModule}.
 *
 * The host supplies both stores to one private SavedPlanResource. The feature
 * depends on that resource for capture, persistence, integrity and touch rights.
 */
export type SavedPlansRequirements = Omit<SavedPlanServiceOptions, 'resource'> & {
  readonly capture: SavedPlanCaptureStore;
  readonly plans: SavedPlanStore;
};

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
