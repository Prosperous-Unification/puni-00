import { readCatalogueId } from '@wbs/core';
import {
  readStepRetirement,
  type StepRetirement,
} from '@wbs/core/module/step-catalogue/step-retirement';

import type { MemoryStepCatalogueScope, MemoryStepCatalogueTables } from './step-catalogue';

/** Same-stage retirement evidence; the modeled active state is only an absent row in the required map. */
export function captureMemoryStepRetirementsIn(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueScope,
  organizationId: string,
): ReadonlyMap<string, StepRetirement> {
  const retirements = new Map<string, StepRetirement>();
  for (const [stepId, row] of tables.retirements) {
    const definition = tables.definitions.get(stepId);
    const actualOrganizationId =
      typeof row.organizationId === 'string' && context.organizations.has(row.organizationId)
        ? row.organizationId
        : undefined;
    if (
      row.organizationId !== organizationId &&
      definition?.organizationId !== organizationId &&
      (definition !== undefined || actualOrganizationId !== undefined)
    )
      continue;
    const actor =
      typeof row.retiredBy === 'string' ? context.usage.users.get(row.retiredBy) : undefined;
    const retirement = readStepRetirement({
      ...row,
      definitionId: definition?.id,
      definitionOrganizationId: definition?.organizationId,
      actualOrganizationId,
      actualActorId: actor?.id,
    });
    if (retirement.stepId !== readCatalogueId(stepId, 'retirement map identity'))
      throw new Error('catalogue retirement map identity differs');
    retirements.set(stepId, retirement);
  }
  return retirements;
}
