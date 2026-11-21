import {
  type LabelledWorkItem,
  projectCatalogueBindings,
  readStepWriteType,
  type TreeWorkItem,
} from '@wbs/core';
import { resolveSteps } from '@wbs/domain';

import { captureMemoryPackageStepsIn } from './step-package-reads';
import type { MemoryStepWriteContext } from './step-write';

/** Actual state maps, synchronously captured beside the detached tree rows; no port reentry. */
export function readMemoryTreeRowsIn(
  context: MemoryStepWriteContext,
  workPackageId: string,
  rows: readonly LabelledWorkItem[],
): TreeWorkItem[] {
  const captured = captureMemoryPackageStepsIn(context.catalogue, context.scope, workPackageId);
  if (captured === null) return [];
  const { chain } = captured,
    owner = chain.organizationId;
  const bindings = projectCatalogueBindings(owner, captured.bindings, captured.identities);
  const parents = new Set(rows.map(({ parentId }) => parentId));
  return rows.map((row) => {
    const memberships = row.typeIds.map((typeId) => {
      const organizationId = context.scope.typeOrganization.get(typeId);
      return {
        workItemId: row.id,
        typeId,
        actualTypeId: context.scope.types.get(typeId)?.id,
        organizationId,
        actualOrganizationId:
          organizationId !== undefined && context.scope.organizations.has(organizationId)
            ? organizationId
            : undefined,
      };
    });
    const typeState = readStepWriteType(owner, row.id, memberships);
    // Proof: dropping empty lists lost claim-empty; admitting parents added steps to claim-parent.
    // Both faults failed current memory tree captures own leaf order without adding display metadata to stored reads.
    return parents.has(row.id) ? row : { ...row, steps: resolveSteps(chain, typeState, bindings) };
  });
}
