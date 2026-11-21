import { type ClaimStepOrder, projectClaimLeafSteps, type StampedClaim } from '@wbs/core';

import { captureMemoryStepFactContextIn } from './estimate-reads';
import { readMemoryPackageStepsIn } from './step-package-reads';
import type { MemoryStepWriteContext } from './step-write';

/** Current state maps are captured synchronously beside the selected detached claims. */
export function readMemoryClaimStepsIn(
  context: MemoryStepWriteContext,
  workPackageId: string,
  claims: readonly StampedClaim[],
): ClaimStepOrder {
  // Proof: memory-package-values bypasses this dependency; a real package with
  // no claims answers despite missing physical explicit values (one failure).
  const stepIds = readMemoryPackageStepsIn(context.catalogue, context.scope, workPackageId).map(
    ({ id }) => id,
  );
  const points = claims.flatMap(({ workItemId, stepId }) =>
    stepId === null ? [] : [{ workItemId, stepId }],
  );
  const { captured, bindings, identities, values } = captureMemoryStepFactContextIn(
    context,
    workPackageId,
    points,
    'claim',
  );
  return {
    stepIds,
    leafSteps: projectClaimLeafSteps(captured, bindings, identities, values, claims),
  };
}
