import {
  decideFirstChildWrite, encodeStepUsageLink, prepareFirstChildRelationships, projectStepNodesInUse,
  projectCatalogueBindings, readCatalogueId, readStepIdentity, readStepUsageFacts,
  readStoredActual, readStoredProgress,
  type FirstChildWrite, type FirstChildWriteOutcome, type StepIdentity,
} from '@wbs/core';
import type { WorkPackageChain } from '@wbs/domain';

import { readMemoryEstimatesIn, readMemoryStepFactsIn } from './estimate-reads';
import type { MemoryState } from './memory-stores';
import type { MemoryStepCatalogueContext } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';
import { captureMemoryStepUsage } from './step-usage';
import { readMemoryAttemptsIn, readMemoryIssuedIn, readMemoryMeasureEstimatesIn, readMemoryMeasuresIn } from './tuple-reads';

/** Physical holders and quantities share the same owned graph as transferred point tuples. */
function validateFirstChildPayloads(candidate: MemoryState, organizationId: string, workItemId: string): void {
  const { tables } = candidate;
  for (const assignment of tables.directory.assignments.values()) {
    if (assignment.workItemId !== workItemId) continue;
    if (!tables.directory.people.has(assignment.personId) || tables.directory.organizationOf.get(assignment.personId) !== organizationId)
      throw new Error('first child assignee is absent or foreign');
  }
  for (const blockage of tables.blockages.rows)
    if (blockage.workItemId === workItemId && !Number.isSafeInteger(blockage.blockedAt))
      throw new Error('first child blocked time is malformed');
  const requireResource = (resourceId: string, units: number): void => {
    if (!tables.directory.resources.resources.has(resourceId) || tables.directory.organizationOf.get(resourceId) !== organizationId || !Number.isSafeInteger(units) || units < 1)
      throw new Error('first child resource or units are inconsistent');
  };
  for (const demand of tables.directory.resources.demands.values())
    if (demand.workItemId === workItemId) requireResource(demand.resourceId, demand.units);
  const claims = new Set(tables.claims.rows.filter((claim) => claim.workItemId === workItemId).map(({ id }) => id));
  for (const occupancy of tables.claims.occupancy)
    if (claims.has(occupancy.claimId)) requireResource(occupancy.resourceId, occupancy.units);
}

function moveRows<Row extends { readonly workItemId: string }>(rows: Row[], from: string, to: string): void {
  if (rows.some((row) => row.workItemId === to)) throw new Error('first child destination already holds point facts');
  rows.splice(0, rows.length, ...rows.map((row) => row.workItemId === from ? { ...row, workItemId: to } : row));
}

/**
 * Complete synchronous transform of one private MemoryState stage. The Source
 * supplies its actual current catalogue context and publishes only after this
 * returns written and its existing loan/source fence still permits publication.
 * No retained projection or asynchronous repository runs between mutations.
 */
export function applyMemoryFirstChildIn(candidate: MemoryState, context: MemoryStepCatalogueContext, write: FirstChildWrite): FirstChildWriteOutcome {
  const { tables } = candidate;
  const child = write.kind === 'fresh' ? write.child : write.record.child;
  const actualParent = tables.workItems.byId.get(child.parentId) ?? null;
  const actualChild = tables.workItems.byId.get(child.id) ?? null;
  if (actualParent === null || actualParent.workPackageId !== child.workPackageId) return { kind: 'not_found' };
  const owner = readCatalogueId(context.packageOrganization.get(child.workPackageId), 'first child package organization');
  const scope = captureMemoryCatalogueScope(tables.stepCatalogue, context);
  const chains: WorkPackageChain[] = [];
  for (const [id, workPackage] of context.packages) {
    if (context.packageOrganization.get(id) !== owner && context.projects.get(workPackage.projectId)?.organizationId !== owner) continue;
    const chain = scope.packageChain(owner, id);
    if (chain === null) throw new Error('first child usage package disappeared');
    chains.push(chain);
  }
  const identities = new Map<string, StepIdentity>();
  for (const [id, raw] of tables.stepCatalogue.definitions) {
    if (raw.organizationId !== owner) continue;
    const definition = readStepIdentity(raw);
    if (definition.id !== id) throw new Error('first child definition identity is inconsistent');
    identities.set(id, definition);
  }
  const bindings = projectCatalogueBindings(owner, scope.bindingRows(tables.stepCatalogue, owner).bindings, identities);
  const captured = captureMemoryStepUsage(tables.stepCatalogue, context, chains, identities);
  const actualLocal = tables.typedDependencies.rows.filter((dependency) => dependency.predecessor.workPackageId === child.workPackageId && dependency.successor.workPackageId === child.workPackageId);
  const relationships = prepareFirstChildRelationships(write, actualLocal);
  const links = new Set(chains.flatMap(({ workPackageId }) => [...(tables.stepCatalogue.packageValues.get(workPackageId)?.keys() ?? [])].map((stepId) => encodeStepUsageLink(workPackageId, stepId))));
  const facts = [...captured.facts, ...readStepUsageFacts(captured.packages, identities, links, relationships.detachedFacts)];
  const decision = decideFirstChildWrite(captured.packages, bindings, facts, write, actualParent, actualChild);
  if (decision.kind !== 'ready') return decision;
  const from = decision.fromWorkItemId, to = decision.toWorkItemId;
  validateFirstChildPayloads(candidate, owner, from);
  const factContext = { catalogue: tables.stepCatalogue, scope: context, workItems: tables.workItems, measureDefinitions: tables.directory.measureDefinitions };
  // The source remains a leaf until every value codec and same-state applicability read completes.
  readMemoryEstimatesIn(factContext, tables.estimates.rows, child.workPackageId, [from]);
  readMemoryStepFactsIn(factContext, tables.actuals.rows, child.workPackageId, [from], readStoredActual, 'actual');
  readMemoryStepFactsIn(factContext, tables.progress.rows, child.workPackageId, [from], readStoredProgress, 'progress');
  readMemoryMeasuresIn(factContext, tables.measures, child.workPackageId, [from]);
  readMemoryMeasureEstimatesIn(factContext, tables.measureEstimates, tables.measures, child.workPackageId, [from]);
  readMemoryAttemptsIn(factContext, tables.attempts, child.workPackageId, [from]);
  readMemoryIssuedIn(factContext, tables.attempts, child.workPackageId, [actualParent.id, from]);
  if (decision.direction === 'up') {
    if (tables.budgets.rows.some(({ workItemId }) => workItemId === child.id) ||
        [tables.workItems.teamsOf, tables.workItems.tagsOf, tables.workItems.servicesOf, tables.workItems.typesOf].some((memberships) => (memberships.get(child.id)?.length ?? 0) !== 0) ||
        (tables.workItems.refsOf.get(child.id)?.length ?? 0) !== 0 ||
        tables.dependencies.rows.some(({ predecessorId, successorId }) => predecessorId === child.id || successorId === child.id))
      return { kind: 'stale_transition' };
  }
  for (const shifted of write.respaced) {
    const row = tables.workItems.byId.get(shifted.id);
    if (row === undefined || row.workPackageId !== child.workPackageId || row.parentId !== child.parentId)
      throw new Error('first child respaced sibling is absent or outside placement');
    tables.workItems.byId.set(row.id, { ...row, position: shifted.position });
  }
  if (decision.direction === 'down') {
    tables.workItems.byId.set(actualParent.id, { ...actualParent, readiness: null, hold: null, revision: actualParent.revision + 1 });
    tables.workItems.byId.set(child.id, { ...child, revision: child.revision + 1 });
    tables.workItems.teamsOf.set(child.id, []);
  }
  moveRows(tables.estimates.rows, from, to);
  moveRows(tables.actuals.rows, from, to);
  moveRows(tables.progress.rows, from, to);
  moveRows(tables.measures.rows, from, to);
  moveRows(tables.measureEstimates.rows, from, to);
  moveRows(tables.attempts.rows, from, to);
  moveRows(tables.blockages.rows, from, to);
  // Preserve actual claim objects' current lease/revocation/creation fields and their occupancy IDs.
  tables.claims.rows.splice(0, tables.claims.rows.length, ...tables.claims.rows.map((claim) =>
    claim.workItemId === from && claim.stepId !== null ? { ...claim, workItemId: to } : claim));
  for (const [key, assignment] of [...tables.directory.assignments]) {
    if (assignment.workItemId !== from) continue;
    const target = `${to}::${assignment.stepId}`;
    if (tables.directory.assignments.has(target)) throw new Error('first child destination assignment already exists');
    tables.directory.assignments.delete(key);
    tables.directory.assignments.set(target, { ...assignment, workItemId: to });
  }
  for (const [key, demand] of [...tables.directory.resources.demands]) {
    if (demand.workItemId !== from) continue;
    const target = `${to}::${demand.resourceId}`;
    if (tables.directory.resources.demands.has(target)) throw new Error('first child destination demand already exists');
    tables.directory.resources.demands.delete(key);
    tables.directory.resources.demands.set(target, { ...demand, workItemId: to });
  }
  for (const mark of [...tables.attempts.issued]) {
    if (mark.workItemId !== from) continue;
    const target = tables.attempts.issued.find((held) => held.workItemId === to && held.stepId === mark.stepId);
    if (target === undefined) tables.attempts.issued.push({ ...mark, workItemId: to });
    else {
      const at = tables.attempts.issued.indexOf(target);
      tables.attempts.issued.splice(at, 1, { ...target, issued: Math.max(target.issued, mark.issued) });
    }
  }
  const replacements = new Map(relationships.localAfter.map((dependency) => [dependency.id, dependency]));
  tables.typedDependencies.rows.splice(0, tables.typedDependencies.rows.length, ...tables.typedDependencies.rows.map((dependency) => replacements.get(dependency.id) ?? dependency));
  if (decision.direction === 'up') {
    tables.workItems.byId.delete(child.id);
    tables.workItems.teamsOf.delete(child.id);
    tables.workItems.tagsOf.delete(child.id);
    tables.workItems.servicesOf.delete(child.id);
    tables.workItems.typesOf.delete(child.id);
    tables.workItems.refsOf.delete(child.id);
    tables.attempts.issued.splice(0, tables.attempts.issued.length, ...tables.attempts.issued.filter(({ workItemId }) => workItemId !== child.id));
    tables.workItems.byId.set(actualParent.id, { ...actualParent, ...decision.record.parentStatements, revision: actualParent.revision + 1 });
  }
  const changedEndpoints = new Set(relationships.localAfter.flatMap((dependency, index) => {
    const before = actualLocal[index];
    if (before === undefined) throw new Error('first child relationship census lost a row');
    return before.predecessor.workItemId === dependency.predecessor.workItemId && before.successor.workItemId === dependency.successor.workItemId
      ? [] : [before.predecessor.workItemId, before.successor.workItemId, dependency.predecessor.workItemId, dependency.successor.workItemId];
  }));
  for (const id of changedEndpoints) {
    if (id === from || id === to) continue;
    const held = tables.workItems.byId.get(id);
    if (held === undefined || held.workPackageId !== child.workPackageId) throw new Error('first child relationship endpoint disappeared');
    tables.workItems.byId.set(id, { ...held, revision: held.revision + 1 });
  }
  const after = captureMemoryStepUsage(tables.stepCatalogue, context, chains, identities);
  const afterFacts = [...after.facts, ...readStepUsageFacts(after.packages, identities, links, relationships.detachedFactsAfter)];
  projectStepNodesInUse(after.packages, bindings, bindings, afterFacts);
  return { kind: 'written', record: structuredClone(decision.record) };
}
