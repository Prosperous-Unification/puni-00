import {
  type PackageStepValues,
  projectCatalogueBindings,
  projectStoredStepFacts,
  readCatalogueId,
  readPackageStepValues,
  readStepIdentity,
  readStepUsagePackages,
  readStoredEstimate,
  type StepFactAddress,
  type StepFactKind,
  type StepIdentity,
  type StoredEstimate,
} from '@wbs/core';

import { captureMemoryCatalogueScope } from './step-catalogue-scope';
import type { MemoryStepWriteContext } from './step-write';

/** Captures actual committed/staged maps synchronously, before returning detached estimates. */
export function readMemoryEstimatesIn(
  context: MemoryStepWriteContext,
  rows: readonly StoredEstimate[],
  workPackageId: string,
  ids: readonly string[] | null,
): StoredEstimate[] {
  return readMemoryStepFactsIn(context, rows, workPackageId, ids, readStoredEstimate, 'estimate');
}

/** Actual source maps are selected and decoded before one shared metadata/projection capture. */
export function readMemoryStepFactsIn<Fact extends StepFactAddress>(
  context: MemoryStepWriteContext,
  rows: readonly Fact[],
  workPackageId: string,
  ids: readonly string[] | null,
  decode: (row: Fact) => Fact,
  family: StepFactKind,
): Fact[] {
  const requested = ids === null ? null : new Set(ids);
  const facts: Fact[] = [];
  for (const raw of rows) {
    if (requested !== null && !requested.has(raw.workItemId)) continue;
    const row = context.workItems.byId.get(raw.workItemId);
    if (row === undefined) {
      if (requested !== null) throw new Error(`targeted stored ${family} work item is absent`);
      continue;
    }
    if (row.workPackageId !== workPackageId) continue;
    facts.push(decode(raw));
  }
  if (facts.length === 0) return [];
  const { captured, bindings, identities, values } = captureMemoryStepFactContextIn(
    context,
    workPackageId,
    facts,
    family,
  );
  return projectStoredStepFacts(captured, bindings, identities, values, facts, family);
}

/** Actual metadata on this exact state; allocator readers reuse it without fabricating leaf rows. */
export function captureMemoryStepFactContextIn(
  context: MemoryStepWriteContext,
  workPackageId: string,
  facts: readonly StepFactAddress[],
  family: StepFactKind,
) {
  const owner = readCatalogueId(
    context.scope.packageOrganization.get(workPackageId),
    `${family} package organization`,
  );
  const scope = captureMemoryCatalogueScope(context.catalogue, context.scope);
  const chain = scope.packageChain(owner, workPackageId);
  if (chain === null) throw new Error(`stored ${family} package is absent`);
  const workItems = [...context.workItems.byId].flatMap(([id, row]) => {
    if (row.workPackageId !== workPackageId) return [];
    if (row.id !== id) throw new Error(`stored ${family} work item identity is inconsistent`);
    return [row];
  });
  const memberships = workItems.flatMap(({ id }) =>
    (context.workItems.typesOf.get(id) ?? []).map((typeId) => {
      const organizationId = context.scope.typeOrganization.get(typeId);
      return {
        workItemId: id,
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
  const captured = readStepUsagePackages([chain], workItems, memberships).at(0);
  if (captured === undefined) throw new Error(`stored ${family} package capture is absent`);
  const { bindings, identities: reached } = scope.bindingRows(context.catalogue, owner, chain);
  const identities = new Map<string, StepIdentity>(reached),
    values = new Map<string, PackageStepValues>();
  for (const stepId of new Set(facts.map(({ stepId }) => stepId))) {
    const raw = context.catalogue.definitions.get(stepId);
    if (raw !== undefined) {
      const definitionOwner = readCatalogueId(
        raw.organizationId,
        `${family} definition organization`,
      );
      if (definitionOwner !== owner || !context.scope.organizations.has(definitionOwner))
        throw new Error(`stored ${family} definition is absent or foreign`);
      const identity = readStepIdentity(raw);
      if (identity.id !== stepId)
        throw new Error(`stored ${family} definition identity is inconsistent`);
      identities.set(stepId, identity);
    }
    const explicit = context.catalogue.packageValues.get(workPackageId)?.get(stepId);
    if (explicit !== undefined)
      values.set(stepId, readPackageStepValues(explicit, workPackageId, stepId));
  }
  return {
    captured,
    bindings: projectCatalogueBindings(owner, bindings, identities),
    identities,
    values,
  };
}
