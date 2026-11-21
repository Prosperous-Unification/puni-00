import {
  type Assignment,
  encodeStepUsageLink,
  readCatalogueId,
  readPackageStepValues,
  readStepUsageClaims,
  readStepUsageFacts,
  readStepUsagePackages,
  readStoredIssued,
  type StepFactKind,
  type StepIdentity,
  type StepUsageFactRecord,
} from '@wbs/core';
import { isRelationshipType, type WorkPackageChain } from '@wbs/domain';

import type { MemoryActualTable } from './actual-fixture';
import type { MemoryAttemptTable } from './attempt-fixture';
import type { MemoryClaimTable } from './claim-fixture';
import type { MemoryEstimateTable } from './estimate-fixture';
import type { MemoryMeasureEstimateTable } from './measure-estimate-fixture';
import type { MemoryMeasureTable } from './measure-fixture';
import type { MemoryWorkItemTables } from './memory-work-item-fixture';
import type { MemoryProgressTable } from './progress-fixture';
import type { MemoryStepBlockageTable } from './step-blockage-fixture';
import type { MemoryStepCatalogueContext, MemoryStepCatalogueTables } from './step-catalogue';
import type { MemoryStepParallelTable } from './step-parallel-fixture';
import type { MemoryTypedDependencyTable } from './typed-dependency-fixture';

/** Actual source-owned arrays/maps, including issued counters independently of attempts and both relationship families in their unified table. */
export interface MemoryStepUsageTables {
  readonly workItems: MemoryWorkItemTables;
  readonly estimates: MemoryEstimateTable;
  readonly actuals: MemoryActualTable;
  readonly progress: MemoryProgressTable;
  readonly measures: MemoryMeasureTable;
  readonly measureEstimates: MemoryMeasureEstimateTable;
  readonly attempts: MemoryAttemptTable;
  readonly assignments: ReadonlyMap<string, Assignment>;
  readonly claims: MemoryClaimTable;
  readonly blockages: MemoryStepBlockageTable;
  readonly parallels: MemoryStepParallelTable;
  readonly dependencies: MemoryTypedDependencyTable;
  readonly people: ReadonlyMap<string, { readonly id: string }>;
  readonly users: ReadonlyMap<string, { readonly id: string }>;
  readonly personOrganization: ReadonlyMap<string, string>;
}

/** Synchronous capture from the same source/staged writer; no port reread, legacy Step DTO or fabricated empty family. */
export function captureMemoryStepUsage(
  catalogue: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
  chains: readonly WorkPackageChain[],
  definitions: ReadonlyMap<string, StepIdentity>,
) {
  const tables = context.usage;
  const packageIds = new Set(chains.map(({ workPackageId }) => workPackageId));
  const workItemRows = [...tables.workItems.byId].flatMap(([id, workItem]) => {
    if (workItem.id !== id) throw new Error('step usage work item identity is inconsistent');
    return packageIds.has(workItem.workPackageId) ? [workItem] : [];
  });
  const workItemIds = new Set(workItemRows.map(({ id }) => id));
  const memberships = [...tables.workItems.typesOf].flatMap(([workItemId, typeIds]) => {
    if (!tables.workItems.byId.has(workItemId))
      throw new Error('step usage type membership has no work item');
    if (!workItemIds.has(workItemId)) return [];
    return typeIds.map((typeId) => {
      const owner = context.typeOrganization.get(typeId);
      return {
        workItemId,
        typeId,
        actualTypeId: context.types.get(typeId)?.id,
        organizationId: owner,
        actualOrganizationId:
          owner !== undefined && context.organizations.has(owner) ? owner : undefined,
      };
    });
  });
  const packages = readStepUsagePackages(chains, workItemRows, memberships);
  const links = new Set<string>();
  for (const [packageId, values] of catalogue.packageValues) {
    if (!packageIds.has(packageId)) continue;
    for (const [stepId, row] of values) {
      readPackageStepValues(row, packageId, stepId);
      links.add(encodeStepUsageLink(packageId, stepId));
    }
  }
  const facts: StepUsageFactRecord[] = [];
  const capturePointFacts = (
    kind: Exclude<StepFactKind, 'typed_dependency' | 'external_dependency' | 'claim'>,
    rows: readonly { readonly workItemId: string; readonly stepId: string | null }[],
  ): void => {
    for (const row of rows) {
      const workItemId = readCatalogueId(row.workItemId, 'fact work item');
      const workItem = tables.workItems.byId.get(workItemId);
      if (workItem === undefined) throw new Error('step usage fact work item is absent');
      if (!packageIds.has(workItem.workPackageId)) continue;
      facts.push({
        kind,
        workPackageId: workItem.workPackageId,
        workItemId,
        scope: kind === 'attempt_issued' ? 'allocator' : 'node',
        stepId: row.stepId,
      });
    }
  };
  capturePointFacts('estimate', tables.estimates.rows);
  capturePointFacts('actual', tables.actuals.rows);
  capturePointFacts('progress', tables.progress.rows);
  capturePointFacts('measure', tables.measures.rows);
  capturePointFacts('measure_estimate', tables.measureEstimates.rows);
  // The existing memory measure-estimate store derives the token single-capturePointFacts trio from this authoritative measure row (D28), as SQLite's mirror stores it physically.
  capturePointFacts(
    'measure_estimate',
    tables.measures.rows.filter(({ metric }) => metric === 'token_estimate'),
  );
  capturePointFacts('attempt', tables.attempts.rows);
  for (const mark of tables.attempts.issued) {
    const workItemId = readCatalogueId(mark.workItemId, 'allocator work item');
    const workItem = tables.workItems.byId.get(workItemId);
    if (workItem === undefined) throw new Error('step usage allocator work item is absent');
    if (packageIds.has(workItem.workPackageId))
      capturePointFacts('attempt_issued', [readStoredIssued(mark)]);
  }
  capturePointFacts('assignment', [...tables.assignments.values()]);
  const claims = tables.claims.rows.flatMap((row) => {
    const workItem = tables.workItems.byId.get(row.workItemId);
    if (workItem === undefined) throw new Error('step usage claim work item is absent');
    if (!packageIds.has(workItem.workPackageId)) return [];
    const personOrganizationId = tables.personOrganization.get(row.personId);
    return [
      {
        ...row,
        workPackageId: workItem.workPackageId,
        actualPersonId: tables.people.get(row.personId)?.id,
        personOrganizationId,
        actualPersonOrganizationId:
          personOrganizationId !== undefined && context.organizations.has(personOrganizationId)
            ? personOrganizationId
            : undefined,
        actualAccountId: tables.users.get(row.accountId)?.id,
      },
    ];
  });
  facts.push(...readStepUsageClaims(packages, claims));
  capturePointFacts('blockage', tables.blockages.rows);
  capturePointFacts('parallel', tables.parallels.rows);
  for (const dependency of tables.dependencies.rows) {
    const predecessorPackage = dependency.predecessor.workPackageId,
      successorPackage = dependency.successor.workPackageId;
    if (!packageIds.has(predecessorPackage) && !packageIds.has(successorPackage)) continue;
    if (dependency.workPackageId !== successorPackage || !isRelationshipType(dependency.type))
      throw new Error('step usage dependency ownership/type is inconsistent');
    const kind =
      predecessorPackage === successorPackage ? 'typed_dependency' : 'external_dependency';
    for (const endpoint of [dependency.predecessor, dependency.successor])
      facts.push({
        kind,
        scope: endpoint.scope,
        workPackageId: endpoint.workPackageId,
        workItemId: endpoint.workItemId,
        stepId: endpoint.scope === 'whole' ? null : endpoint.stepId,
      });
  }
  return { packages, facts: readStepUsageFacts(packages, definitions, links, facts) };
}
