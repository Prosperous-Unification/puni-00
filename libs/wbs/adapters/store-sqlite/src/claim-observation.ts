import { projectClaimLeafSteps, type StampedClaim } from '@wbs/core';

import type { Drizzle } from './db';
import { captureSqliteStepFactContextIn } from './estimate-reads';

/** Uses the observation's actual transaction, even when there are no point claims. */
export function readSqliteClaimLeafStepsIn(
  db: Drizzle,
  workPackageId: string,
  claims: readonly StampedClaim[],
): ReadonlyMap<string, readonly string[]> {
  const points = claims.flatMap(({ workItemId, stepId }) =>
    stepId === null ? [] : [{ workItemId, stepId }],
  );
  const { captured, bindings, identities, values } = captureSqliteStepFactContextIn(
    db,
    workPackageId,
    points,
    'claim',
  );
  return projectClaimLeafSteps(captured, bindings, identities, values, claims);
}
