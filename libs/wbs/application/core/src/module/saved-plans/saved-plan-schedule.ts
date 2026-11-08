import { type Elsewhere, type Schedule, schedule } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { PlanInputReads } from '../../ports/saved-plan-capture-values';
import { prepareCapturedScheduleParts } from '../../service/schedule-parts';
import type { SavedPlanResource } from './saved-plan.resource';

/**
 * Derive historical canonical inputs through the same preparation as live reads.
 * Captures have no actual dates. Project settings, typed dependencies, holds and
 * optional elsewhere bookings come exclusively from the detached observation.
 * Cycles remain scheduling failures; this boundary does not hide them.
 */
export function scheduleInputOfCaptured(
  reads: PlanInputReads,
  elsewhere?: Elsewhere,
): ScheduleInput {
  return prepareCapturedScheduleParts(reads, elsewhere).input;
}

/** Schedules the canonical input derived from detached capture reads. */
export function schedulePlanInput(reads: PlanInputReads, elsewhere?: Elsewhere): Schedule {
  const input = scheduleInputOfCaptured(reads, elsewhere);
  return schedule(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.deadlines,
    input.typed,
    undefined,
    // Proof: omitting this argument places the captured assigned slice at 0 instead of 5.
    input.elsewhere,
    input.resourceCapacities,
  );
}

/** One project's captured plan input and the dates computed from it. */
export interface CapturedPlan {
  readonly reads: PlanInputReads;
  readonly planned: Schedule;
}

/**
 * Capture a project's plan input, then schedule it — in that order, with the
 * read snapshot released in between.
 *
 * The ordering is the guarantee, so it is written as two statements rather than
 * as one expression: {@link SavedPlanCaptureRepository.readPlanInput} commits
 * its transaction and closes its connection before it returns, and only then
 * does anything schedule. No database handle this call opened is live while
 * {@link schedulePlanInput} runs.
 *
 * `schedulePlan` is injected for the same reason `openConnection` is injected
 * into the capture: it is the seam a test observes the *instant* of the
 * scheduling call through. A test that only checks the connection count before
 * and after would stay green if a later edit moved the scheduling inside the
 * transaction, which is the one thing this row exists to forbid.
 */
export async function captureAndSchedulePlan(
  capture: Pick<SavedPlanResource, 'capturePlan'>,
  projectId: string,
  schedulePlan: (reads: PlanInputReads) => Schedule = schedulePlanInput,
): Promise<CapturedPlan | null> {
  const reads = await capture.capturePlan(projectId);
  if (reads === null) return null;
  return { reads, planned: schedulePlan(reads) };
}
