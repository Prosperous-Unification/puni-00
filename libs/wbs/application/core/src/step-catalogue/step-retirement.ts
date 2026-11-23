import { allowanceHundredthsOf, isEstimateUnit } from '@wbs/domain';

import type { StepDefinitionPatch } from '../ports/step-catalogue';
import { readCatalogueId } from './step-catalogue';

export const STEP_RETIREMENT_MIGRATION = '20261118210000_add_step_retirements';

/** Current runtime profile only; physical historical identity readers keep their own117 epoch. */
export interface StepRetirementEpochRecord {
  readonly relationKind: unknown;
  readonly migrationCount: unknown;
  readonly migrationName: unknown;
  readonly migrationHash: unknown;
  readonly migrationCreatedAt: unknown;
}

/** Required relation and applied-ledger header presence/shape only; this does not authenticate migration content against a universal expected hash. */
export function assertStepRetirementEpoch(row: StepRetirementEpochRecord): void {
  if (
    row.relationKind !== 'table' ||
    row.migrationCount !== 1 ||
    row.migrationName !== STEP_RETIREMENT_MIGRATION ||
    typeof row.migrationHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(row.migrationHash) ||
    row.migrationCreatedAt !== Date.UTC(2026, 10, 18, 21)
  )
    throw new Error('catalogue retirement profile header is absent or malformed');
}

export interface StepRetirementRecord {
  readonly stepId: unknown;
  readonly organizationId: unknown;
  readonly retiredAt: unknown;
  readonly retiredBy: unknown;
  readonly definitionId: unknown;
  readonly definitionOrganizationId: unknown;
  readonly actualOrganizationId: unknown;
  readonly actualActorId: unknown;
}
export interface StepRetirement {
  readonly stepId: string;
  readonly organizationId: string;
  readonly retiredAt: number;
  readonly retiredBy: string;
}

/** Validates a present retirement and its actual physical ownership/audit headers; absence is handled explicitly by its capture owner. */
export function readStepRetirement(row: StepRetirementRecord): StepRetirement {
  const stepId = readCatalogueId(row.stepId, 'retirement step'),
    organizationId = readCatalogueId(row.organizationId, 'retirement organization'),
    retiredBy = readCatalogueId(row.retiredBy, 'retirement actor');
  if (
    row.definitionId !== stepId ||
    row.definitionOrganizationId !== organizationId ||
    row.actualOrganizationId !== organizationId ||
    row.actualActorId !== retiredBy
  )
    throw new Error(
      'catalogue retirement identity, organization or actor is absent or inconsistent',
    );
  if (typeof row.retiredAt !== 'number' || !Number.isSafeInteger(row.retiredAt))
    throw new Error('catalogue retirement instant is malformed');
  return { stepId, organizationId, retiredAt: row.retiredAt, retiredBy };
}

/** Retains only provided metadata; omitted fields are not unit/default substitutes. */
export function retainStepDefinitionPatch(patch: StepDefinitionPatch): {
  readonly patch: StepDefinitionPatch;
  readonly defaultAllowanceBps: number | undefined;
} {
  const kept = structuredClone(patch);
  if (kept.name !== undefined) readCatalogueId(kept.name, 'patched definition name');
  if (kept.defaultEstimateUnit !== undefined && !isEstimateUnit(kept.defaultEstimateUnit))
    throw new Error('catalogue patched default unit is malformed');
  let defaultAllowanceBps: number | undefined;
  if (kept.defaultAllowancePercent !== undefined) {
    const converted = allowanceHundredthsOf(kept.defaultAllowancePercent);
    if (converted === null) throw new Error('catalogue patched default allowance is malformed');
    defaultAllowanceBps = converted;
  }
  return { patch: kept, defaultAllowanceBps };
}
