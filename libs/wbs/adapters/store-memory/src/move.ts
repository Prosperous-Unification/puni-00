import {
  decideMoveWrite,
  type MoveWrite,
  type MoveWriteOutcome,
  projectCatalogueBindings,
  readCatalogueId,
  readStepIdentity,
  type StepIdentity,
} from '@wbs/core';
import type { WorkPackageChain } from '@wbs/domain';

import type { MemoryState } from './memory-stores';
import type { MemoryStepCatalogueContext } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';
import { captureMemoryStepUsage } from './step-usage';

/** Complete real organization catalogue/usage from the same private move stage. */
function captureMoveCatalogueIn(
  candidate: MemoryState,
  context: MemoryStepCatalogueContext,
  workPackageId: string,
) {
  const owner = readCatalogueId(
    context.packageOrganization.get(workPackageId),
    'move package organization',
  );
  const catalogue = candidate.tables.stepCatalogue;
  const scope = captureMemoryCatalogueScope(catalogue, context);
  const chains: WorkPackageChain[] = [];
  for (const [id, workPackage] of context.packages) {
    if (
      context.packageOrganization.get(id) !== owner &&
      context.projects.get(workPackage.projectId)?.organizationId !== owner
    )
      continue;
    const chain = scope.packageChain(owner, id);
    if (chain === null) throw new Error('move usage package disappeared');
    chains.push(chain);
  }
  const identities = new Map<string, StepIdentity>();
  for (const [id, raw] of catalogue.definitions) {
    if (raw.organizationId !== owner) continue;
    const identity = readStepIdentity(raw);
    if (identity.id !== id) throw new Error('move definition identity is inconsistent');
    identities.set(id, identity);
  }
  return {
    ...captureMemoryStepUsage(catalogue, context, chains, identities),
    bindings: projectCatalogueBindings(
      owner,
      scope.bindingRows(catalogue, owner).bindings,
      identities,
    ),
    owner,
  };
}

/** Synchronous transform on a Source-owned clone; no publication or asynchronous port access here. */
export function applyMemoryMoveIn(
  candidate: MemoryState,
  context: MemoryStepCatalogueContext,
  write: MoveWrite,
): MoveWriteOutcome {
  const { tables } = candidate;
  const moving = tables.workItems.byId.get(write.workItemId);
  if (moving?.workPackageId !== write.workPackageId) return { kind: 'not_found' };
  if (
    write.parentId !== null &&
    tables.workItems.byId.get(write.parentId)?.workPackageId !== write.workPackageId
  )
    return { kind: 'not_found' };
  const captured = captureMoveCatalogueIn(candidate, context, write.workPackageId);
  const decision = decideMoveWrite(captured, [...tables.workItems.byId.values()], write);
  if (decision.kind !== 'ready') return decision;
  const destination = decision.record.destinationStatements;
  const clearedDemands = [];
  if (destination !== null) {
    for (const [key, demand] of tables.directory.resources.demands) {
      if (demand.workItemId !== destination.workItemId) continue;
      if (
        !tables.directory.resources.resources.has(demand.resourceId) ||
        tables.directory.organizationOf.get(demand.resourceId) !== captured.owner ||
        !Number.isSafeInteger(demand.units) ||
        demand.units < 1
      )
        throw new Error('move demand resource or units are inconsistent');
      clearedDemands.push({ ...demand });
      tables.directory.resources.demands.delete(key);
    }
    const parent = tables.workItems.byId.get(destination.workItemId);
    if (parent === undefined) throw new Error('move destination disappeared');
    tables.workItems.byId.set(parent.id, {
      ...parent,
      readiness: null,
      hold: null,
      revision: parent.revision + 1,
    });
  }
  for (const placement of write.respaced) {
    const sibling = tables.workItems.byId.get(placement.id);
    if (sibling === undefined) throw new Error('move respaced row disappeared');
    tables.workItems.byId.set(sibling.id, { ...sibling, position: placement.position });
  }
  tables.workItems.byId.set(moving.id, {
    ...moving,
    parentId: write.parentId,
    position: write.position,
    revision: moving.revision + 1,
  });
  clearedDemands.sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  return { kind: 'written', record: { ...decision.record, clearedDemands } };
}
