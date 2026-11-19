import type { StepBinding, StoredEstimate } from '@wbs/domain';

import { projectStoredStepFacts } from './step-fact-reads';
import type { StepUsagePackage } from './step-usage';
import { readCatalogueId, type PackageStepValues, type StepIdentity } from './step-catalogue';

/** Actual trusted estimate columns; driver declarations cannot validate storage corruption. */
export interface StepEstimateRecord {
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly optimistic: unknown;
  readonly realistic: unknown;
  readonly pessimistic: unknown;
}

/** Decodes only scoped selected rows, once, before the shared semantic projection. */
export function readStoredEstimate(row: StepEstimateRecord): StoredEstimate {
  const workItemId = readCatalogueId(row.workItemId, 'estimate work item');
  const stepId = readCatalogueId(row.stepId, 'estimate step');
  const readDay = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error('stored estimate has a malformed day value');
    return value;
  };
  return {workItemId,stepId,optimistic:readDay(row.optimistic),realistic:readDay(row.realistic),pessimistic:readDay(row.pessimistic)};
}

/** Every retained fact must still name a resolved leaf target; ordering is SC18, independent of ID or input order. */
export function projectStoredEstimates(
  captured: StepUsagePackage,
  bindings: readonly StepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
  values: ReadonlyMap<string, PackageStepValues>,
  estimates: readonly StoredEstimate[],
): StoredEstimate[] {
  return projectStoredStepFacts(captured,bindings,identities,values,estimates,'estimate');
}
