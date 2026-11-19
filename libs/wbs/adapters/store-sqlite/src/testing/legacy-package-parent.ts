import type { Clock } from '@wbs/core/ports/clock';
import type { WorkPackageWithSteps } from '@wbs/core/ports/work-package-read';
import type { NewWorkPackage, WorkPackageStore } from '@wbs/core/ports/work-package-store';
import { STARTING_STEPS } from '@wbs/core/module/work-package/work-package.resource';
import {
  DEFAULT_ESTIMATE_RULE,
  NO_ALLOWANCE,
  STEP_POSITION_STEP,
  suggestStepCodes,
} from '@wbs/domain';

import { openDatabase } from '../db';

/** Seeds the explicitly named parent in an organization this fixture already holds. */
export function seedPackageParent(path: string, organizationId: string, projectId: string): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
      projectId,
      organizationId,
      projectId,
    ]);
  } finally {
    sqlite.close(true);
  }
}

/** Seeds one named legacy organization and its named parent in a known fresh current fixture. */
export function seedLegacyPackageParent(
  path: string,
  organizationId: string,
  projectId: string,
): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('INSERT INTO organization(id,name,legacy,created_at) VALUES(?,?,1,1)', [
      organizationId,
      organizationId,
    ]);
    sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
      projectId,
      organizationId,
      projectId,
    ]);
  } finally {
    sqlite.close(true);
  }
}

/** Seeds a trusted current fixture birth; real request admission is outside this raw store boundary. */
export async function seedOrganizationPackage(
  store: WorkPackageStore,
  clock: Clock,
  organizationId: string,
  projectId: string,
  actorId: string,
  name: string,
): Promise<WorkPackageWithSteps> {
  const stamp = clock.stampFor(actorId);
  const draft: NewWorkPackage = {
    id: clock.newId(),
    name,
    projectId,
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: DEFAULT_ESTIMATE_RULE.pertWeights,
    estimateRounding: DEFAULT_ESTIMATE_RULE.rounding,
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: stamp.at,
  };
  const codes = suggestStepCodes(STARTING_STEPS, new Set());
  const steps = STARTING_STEPS.map((stepName, place) => ({
    id: clock.newId(),
    workPackageId: draft.id,
    name: stepName,
    position: (place + 1) * STEP_POSITION_STEP,
    code: codes[place],
    allowancePercent: NO_ALLOWANCE,
    estimateUnit: 'workdays' as const,
  }));
  const workPackage = await store.createInOrganization(draft, steps, stamp, organizationId, {
    id: clock.newId(),
    auditId: clock.newId(),
  });
  if (typeof workPackage === 'string')
    throw new Error(`fixture package birth refused: ${workPackage}`);
  return { workPackage, steps };
}
