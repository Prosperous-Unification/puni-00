import type { WriteStamp } from '@wbs/core';
import type { Drizzle } from '@wbs/store-sqlite/db';
import { StepCatalogueRepository } from '@wbs/store-sqlite/step-catalogue';

import { OPEN } from '../../repository/gate';

/** Authors stable fixture IDs through the real catalogue writer and binds them to the named project. */
export async function bindProjectFixtureSteps(
  db: Drizzle,
  organizationId: string,
  projectId: string,
  steps: readonly (readonly [id: string, code: string, name: string, position: number])[],
  stamp: WriteStamp,
): Promise<void> {
  const catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  for (const [id, code, name, position] of steps) {
    const defined = await catalogue.defineAndBindStep(
      organizationId,
      { id, code, name, position, defaultAllowancePercent: 0, defaultEstimateUnit: 'workdays' },
      {
        bindingId: id + '-binding',
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
      stamp,
    );
    // Proof: dropping this check let a duplicate fixture code resolve; the real SQLite duplicate-code control failed.
    if (!defined.ok) throw new Error('project fixture step refused: ' + defined.reason);
  }
}
