import {
  DEFAULT_ESTIMATE_RULE,
  NO_ALLOWANCE,
  STEP_POSITION_STEP,
  suggestStepCodes,
} from '@wbs/domain';

import type { NewWorkPackage } from '../../ports/work-package-store';
import type { WriteStamp } from '../../ports/write-stamp';
/**
 * The steps a work package starts with, **in step order**. Two sets of estimates is
 * the default the product asks for; a work package that began with none would accept
 * no estimates at all until someone thought to add a step.
 */
export const STARTING_STEPS = ['Dev', 'QA'] as const;
/** Standard default birth from one already captured stamp and caller-owned identity source. */
export function prepareWorkPackageBirth(
  name: string,
  projectId: string,
  stamp: WriteStamp,
  newId: () => string,
  abbreviation?: string,
) {
  const workPackage: NewWorkPackage = {
    id: newId(),
    name,
    ...(abbreviation === undefined ? {} : { abbreviation }),
    projectId,
    restricted: false,
    // PERT is the default: it is the reason three points are collected, and
    // a work package that had to choose before it had any estimates would be
    // choosing about risk it has not met yet.
    estimateMethod: 'pert',
    // A dependency means the predecessor is finished, which is what almost
    // everybody reading a chart takes an arrow to say. The `anchor-slice`
    // rule is a hand-off convention a work package asks for; it is not what a new
    // work package should have to opt out of. Same value as the column default,
    // so a row this writes and a row the migration reached read alike.
    depReach: 'whole-item',
    // The textbook 1/4/1 and whole days rounded up — `DEFAULT_ESTIMATE_RULE`
    // rather than three literals, so a new work package and a work package the
    // migration reached (the column defaults) are the same arithmetic, and
    // there is one place to read what a work package gets when it says nothing.
    // No explicit override on an ordinary birth: the actual project chain supplies PERT.
    estimateRounding: DEFAULT_ESTIMATE_RULE.rounding,
    // Not the day it was made: a plan with no start date is an ordinary
    // state, and inventing one would put dates on screen nobody chose.
    startDate: null,
    solutionRef: null,
    // Never written to since it came into being. Its starting steps arrive
    // in the same transaction, so they are part of that beginning rather
    // than a first change to it.
    revision: 0,
    createdAt: stamp.at,
  };
  // Positions written here rather than left to the store: `create` takes the
  // seed as it is, and `STARTING_STEPS` is already an order — Dev is done
  // before QA, which is the order the schedule runs a work item's slices in.
  const codes = suggestStepCodes(STARTING_STEPS, new Set());
  const steps = STARTING_STEPS.map((stepName, place) => ({
    id: newId(),
    workPackageId: workPackage.id,
    name: stepName,
    position: (place + 1) * STEP_POSITION_STEP,
    code: codes[place],
    allowancePercent: NO_ALLOWANCE,
    estimateUnit: 'workdays' as const,
  }));

  return { workPackage, steps };
}
