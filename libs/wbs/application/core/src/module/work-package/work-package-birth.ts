import { DEFAULT_ESTIMATE_RULE } from '@wbs/domain';

import type { Step } from '../../ports/step-store';
import type { NewWorkPackage } from '../../ports/work-package-store';
import type { WriteStamp } from '../../ports/write-stamp';
/** Captures the package's one new identity; actual steps belong to its birth owner's catalogue. */
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
    // Materialized catalogue values are part of this birth, not a later edit.
    revision: 0,
    createdAt: stamp.at,
  };
  // Proof: phantom-identities restores Dev/QA minting; all six real adapter
  // service birth owners consume extra Clock identities instead of one.
  const steps: Step[] = [];
  return { workPackage, steps };
}
