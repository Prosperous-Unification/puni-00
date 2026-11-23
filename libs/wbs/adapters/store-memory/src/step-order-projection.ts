import {
  projectCatalogueBindings,
  projectStepOrders,
  readStepWriteType,
  type WorkItemStepProjection,
} from '@wbs/core';
import { resolveSteps } from '@wbs/domain';

import { captureMemoryPackageStepsIn } from './step-package-reads';
import type { MemoryStepWriteContext } from './step-write';

/** Resolves future leaves synchronously on the actual state maps supplied by this Source/loan. */
export function readMemoryStepOrderProjectionIn(
  context: MemoryStepWriteContext,
  workPackageId: string,
  projection: WorkItemStepProjection,
) {
  const captured = captureMemoryPackageStepsIn(context.catalogue, context.scope, workPackageId);
  if (captured === null) throw new Error('step projection work package is absent');
  const { chain } = captured;
  const bindings = projectCatalogueBindings(
    chain.organizationId,
    captured.bindings,
    captured.identities,
  );
  const readTypes = (workItemId: string, typeIds: readonly string[]) =>
    readStepWriteType(
      chain.organizationId,
      workItemId,
      typeIds.map((typeId) => {
        const organizationId = context.scope.typeOrganization.get(typeId);
        return {
          workItemId,
          typeId,
          actualTypeId: context.scope.types.get(typeId)?.id,
          organizationId,
          actualOrganizationId:
            organizationId !== undefined && context.scope.organizations.has(organizationId)
              ? organizationId
              : undefined,
        };
      }),
    );
  const owners = new Map(
    [...context.workItems.byId.values()].map((row) => [row.id, row.workPackageId]),
  );
  const types = new Map(
    [...context.workItems.byId.values()]
      .filter((row) => row.workPackageId === workPackageId)
      .map((row) => [row.id, readTypes(row.id, context.workItems.typesOf.get(row.id) ?? [])]),
  );
  return projectStepOrders(
    {
      workPackageId,
      owners,
      types,
      steps: captured.resolved.steps.map((step) => ({ id: step.stepId })),
      readProposedTypes: readTypes,
      resolve: (type) => resolveSteps(chain, type, bindings),
    },
    projection,
  );
}
