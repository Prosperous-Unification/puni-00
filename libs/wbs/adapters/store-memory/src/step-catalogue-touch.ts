import {
  compareStepUsageIds,
  readCatalogueId,
  type Project,
  type StepScope,
  type WorkPackage,
  type WriteStamp,
} from '@wbs/core';

import type { MemoryStepCatalogueContext, MemoryStepCatalogueTables } from './step-catalogue';
import { captureMemoryCatalogueScope } from './step-catalogue-scope';

export interface MemoryCatalogueTargets {
  readonly workPackageIds: readonly string[];
  readonly projectIds: readonly string[];
}

/** Scope selection happens before private validation; empty projects do not depend on a package row. */
export function captureMemoryCatalogueTargets(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
  organizationId: string,
  scope: StepScope,
): MemoryCatalogueTargets {
  const capture = captureMemoryCatalogueScope(tables, context),
    workPackageIds: string[] = [],
    projectIds: string[] = [];
  for (const [id, project] of context.projects) {
    if (scope.scopeKind === 'organization' && project.organizationId !== organizationId) continue;
    if (scope.scopeKind === 'space' && project.spaceId !== scope.scopeId) continue;
    if (scope.scopeKind === 'project' && id !== scope.scopeId) continue;
    if (
      project.id !== id ||
      !capture.scopeExists(organizationId, { scopeKind: 'project', scopeId: id })
    )
      throw new Error('catalogue reached project is absent or foreign');
    projectIds.push(readCatalogueId(id, 'affected project'));
  }
  for (const [id, workPackage] of context.packages) {
    const owner = context.packageOrganization.get(id),
      parent = context.projects.get(workPackage.projectId);
    if (
      owner !== undefined &&
      owner !== organizationId &&
      parent?.organizationId !== organizationId
    )
      continue;
    if (owner === undefined && parent?.organizationId !== organizationId) continue;
    if (scope.scopeKind === 'project' && workPackage.projectId !== scope.scopeId) continue;
    if (scope.scopeKind === 'space' && parent?.spaceId !== scope.scopeId) continue;
    const chain = capture.packageChain(organizationId, id);
    if (chain === null) throw new Error('catalogue reached package disappeared');
    workPackageIds.push(chain.workPackageId);
  }
  return {
    workPackageIds: workPackageIds.sort(compareStepUsageIds),
    projectIds: projectIds.sort(compareStepUsageIds),
  };
}

/** A definition reached through several scopes invalidates each actual cache owner once. */
export function mergeMemoryCatalogueTargets(
  targets: readonly MemoryCatalogueTargets[],
): MemoryCatalogueTargets {
  return {
    workPackageIds: [...new Set(targets.flatMap((target) => target.workPackageIds))].sort(
      compareStepUsageIds,
    ),
    projectIds: [...new Set(targets.flatMap((target) => target.projectIds))].sort(
      compareStepUsageIds,
    ),
  };
}

/** Prepares every required counter before catalogue publication; only the owning synchronous method invokes the returned publisher. */
export function prepareMemoryCatalogueTouches(
  context: MemoryStepCatalogueContext,
  targets: MemoryCatalogueTargets,
  stamp: WriteStamp,
): () => void {
  const packages = new Map<string, WorkPackage>(),
    projects = new Map<string, Project>();
  for (const id of targets.workPackageIds) {
    const row = context.packages.get(id);
    // Proof: omitting the nonnegative term accepted -1 in the actual catalogue
    // writer rebound from complete genuine Source evidence; the negative-package
    // owner failed, then passed after exact restore (verification-catalogue-negative-revisions-20261119.json).
    if (
      row?.id !== id ||
      typeof row.revision !== 'number' ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      !Number.isSafeInteger(row.revision + 1)
    )
      throw new Error('catalogue affected package revision is absent or malformed');
    packages.set(id, { ...row, revision: row.revision + 1 });
  }
  for (const id of targets.projectIds) {
    const row = context.projects.get(id);
    // Proof: omitting the nonnegative term accepted -1 in the actual catalogue
    // writer rebound from complete genuine Source evidence; the negative-project
    // owner failed, then passed after exact restore (verification-catalogue-negative-revisions-20261119.json).
    if (
      row?.id !== id ||
      typeof row.revision !== 'number' ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      !Number.isSafeInteger(row.revision + 1)
    )
      throw new Error('catalogue affected project revision is absent or malformed');
    projects.set(id, { ...row, revision: row.revision + 1, updatedAt: stamp.at });
  }
  return () => {
    for (const [id, row] of packages) context.packages.set(id, row);
    for (const [id, row] of projects) context.projects.set(id, row);
  };
}
