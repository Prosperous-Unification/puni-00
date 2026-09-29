import { SavedPlanResource } from '../module/saved-plans/saved-plan.resource';
import {
  SavedPlanService as SavedPlansFeature,
  type SavedPlanServiceOptions as FeatureOptions,
} from '../module/saved-plans/saved-plans.feature';
import type { SavedPlanCaptureStore } from '../ports/saved-plan-capture-store';
import type { SavedPlanStore } from '../ports/saved-plan-store';

export * from '../module/saved-plans/saved-plans.feature';

/** Legacy direct-construction options retained for adapters and tests. */
export interface SavedPlanServiceOptions extends Omit<FeatureOptions, 'resource'> {
  readonly capture: SavedPlanCaptureStore;
  readonly plans: SavedPlanStore;
}

/** Compatibility construction over stores; sealed graphs install the feature directly. */
export class SavedPlanService extends SavedPlansFeature {
  constructor(options: SavedPlanServiceOptions) {
    super({
      digest: options.digest,
      scheduler: options.scheduler,
      elsewhere: options.elsewhere,
      newId: options.newId,
      now: options.now,
      ...(options.quota === undefined ? {} : { quota: options.quota }),
      resource: new SavedPlanResource({
        capture: options.capture,
        plans: options.plans,
        digest: options.digest,
      }),
    });
  }
}
