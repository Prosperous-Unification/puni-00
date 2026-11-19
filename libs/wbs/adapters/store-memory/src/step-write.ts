import {
  decideStepWrite,
  type PackageStepValues,
  projectCatalogueBindings,
  readCatalogueId,
  readPackageStepValues,
  readStepIdentity,
  readStepWriteType,
  type StepWriteDecision,
} from '@wbs/core';

import type { MemoryWorkItemTables } from './memory-work-item-fixture';
import type { MemoryStepCatalogueContext, MemoryStepCatalogueTables } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';

/** Required actual graph; no asynchronous port or legacy Step DTO can stand in for these maps. */
export interface MemoryStepWriteContext {
  readonly catalogue: MemoryStepCatalogueTables;
  readonly scope: MemoryStepCatalogueContext;
  readonly workItems: MemoryWorkItemTables;
}

/** Synchronous same-stage leaf capture immediately before mutation. Parent and absent work items are invariant failures. */
export function readMemoryStepWriteIn(
  context: MemoryStepWriteContext,
  workItemId: string,
  stepId: string,
): StepWriteDecision {
  const row = context.workItems.byId.get(workItemId);
  if (row?.id !== workItemId) throw new Error('step write work item is absent or inconsistent');
  if ([...context.workItems.byId.values()].some((candidate) => candidate.parentId === workItemId))
    throw new Error('step write requires a leaf work item');
  const owner = readCatalogueId(
    context.scope.packageOrganization.get(row.workPackageId),
    'step write package organization',
  );
  const capture = captureMemoryCatalogueScope(context.catalogue, context.scope);
  const chain = capture.packageChain(owner, row.workPackageId);
  if (chain === null) throw new Error('step write package is absent or foreign');
  const raw = context.catalogue.definitions.get(stepId);
  if (raw === undefined) return { kind: 'unknown_step' };
  const identityOwner = readCatalogueId(raw.organizationId, 'step write definition organization');
  if (!context.scope.organizations.has(identityOwner))
    throw new Error('step write definition organization is absent');
  if (identityOwner !== owner) return { kind: 'unknown_step' };
  const identity = readStepIdentity(raw);
  const memberships = (context.workItems.typesOf.get(workItemId) ?? []).map((typeId) => {
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
  });
  const typeState = readStepWriteType(owner, workItemId, memberships);
  const { bindings, identities } = capture.bindingRows(context.catalogue, owner, chain);
  const values = new Map<string, PackageStepValues>();
  const explicit = context.catalogue.packageValues.get(chain.workPackageId)?.get(stepId);
  if (explicit !== undefined)
    values.set(stepId, readPackageStepValues(explicit, chain.workPackageId, stepId));
  return decideStepWrite(
    chain,
    typeState,
    stepId,
    identity,
    projectCatalogueBindings(owner, bindings, identities),
    values,
  );
}
