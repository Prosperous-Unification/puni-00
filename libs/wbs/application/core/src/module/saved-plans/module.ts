import { DiBag } from 'di-bag';

import type { Digest } from '../../ports/runtime';
import type { SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
import type { SavedPlanStore } from '../../ports/saved-plan-store';
import type { Scheduler } from '../../ports/scheduler';
import type { SavedPlanQuota } from '../../service/saved-plan-quota';
import { SAVED_PLANS_LABEL } from './contract';
import { SavedPlanService, type SavedPlanServiceOptions } from './saved-plans.feature';

/**
 * Saved plans as a sealed DI Bag module.
 *
 * Only `savedPlans` is exported. `savedPlanOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.saved-plans/savedPlanOptions` rather than
 * against an anonymous binding. `quota` is registered even when absent, as
 * `undefined`, the way Realtime registers its optional `maxEvents`: the
 * feature applies its own default limits when none is supplied.
 *
 * The module registers no disposer: `SavedPlanService` holds borrowed ports
 * and callbacks and no timer, socket or handle of its own.
 */
export const savedPlansModule = DiBag.createBuilder()
  .register({
    savedPlanOptions: DiBag.fromSyncFactory(
      ({
        digest,
        capture,
        plans,
        scheduler,
        newId,
        now,
        quota,
      }: {
        digest: Digest;
        capture: SavedPlanCaptureStore;
        plans: SavedPlanStore;
        scheduler: Scheduler;
        newId: () => string;
        now: () => number;
        quota: SavedPlanQuota | undefined;
      }): SavedPlanServiceOptions => ({
        digest,
        capture,
        plans,
        scheduler,
        newId,
        now,
        // Proof (2026-09-23): deleting this spread left `passes a supplied quota through to the
        // installed feature` failing (6 pass, 1 fail): the second save answered "saved" instead of
        // "refused", because the feature fell back to its default limits.
        ...(quota === undefined ? {} : { quota }),
      }),
    ),
  })
  .register({
    savedPlans: DiBag.fromSyncFactory(
      ({ savedPlanOptions }: { savedPlanOptions: SavedPlanServiceOptions }): SavedPlanService =>
        new SavedPlanService(savedPlanOptions),
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['savedPlans', 'savedPlanOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (4 pass, 3 fail):
  // `resolve('savedPlanOptions')` did not throw, `inspectGraph()` reported bare
  // `savedPlanOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-23): dropping `{ label: SAVED_PLANS_LABEL }` left only the two label
  // assertions failing (5 pass, 2 fail): `inspectGraph()` reported `savedPlanOptions` unlabelled,
  // and the missing-requirement message named `savedPlanOptions` instead of
  // `application.saved-plans/savedPlanOptions`.
  .buildModule(['savedPlans'], { label: SAVED_PLANS_LABEL });
