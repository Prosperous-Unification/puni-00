import type { Schedule } from '@wbs/domain';

import type { CapturedPlan } from '../module/saved-plans/saved-plan-schedule';
import {
  captureAndSchedulePlan as captureThroughResource,
  schedulePlanInput,
} from '../module/saved-plans/saved-plan-schedule';
import type { PlanInputReads, SavedPlanCaptureStore } from '../ports/saved-plan-capture-store';

export type { CapturedPlan } from '../module/saved-plans/saved-plan-schedule';
export {
  scheduleInputOfCaptured,
  schedulePlanInput,
} from '../module/saved-plans/saved-plan-schedule';

/** Compatibility capture adapter for direct store-based scheduling callers. */
export function captureAndSchedulePlan(
  capture: SavedPlanCaptureStore,
  projectId: string,
  schedulePlan: (reads: PlanInputReads) => Schedule = (reads) =>
    schedulePlanInput(reads, new Map()),
): Promise<CapturedPlan | null> {
  return captureThroughResource(
    { capturePlan: (id) => capture.readPlanInput(id) },
    projectId,
    schedulePlan,
  );
}
