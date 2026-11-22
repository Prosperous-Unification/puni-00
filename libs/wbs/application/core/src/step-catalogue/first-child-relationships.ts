import type { ScopedDependencyEndpoint } from '@wbs/domain';

import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { FirstChildWrite } from './first-child';
import type { StepUsageFactRecord } from './step-usage-capture';

function identity(endpoint: ScopedDependencyEndpoint) {
  return [
    endpoint.workPackageId,
    endpoint.workItemId,
    endpoint.scope,
    endpoint.scope === 'whole' ? null : endpoint.stepId,
  ];
}
function encoded(dependency: StoredTypedDependency): string {
  return JSON.stringify([
    dependency.id,
    dependency.workPackageId,
    dependency.type,
    identity(dependency.predecessor),
    identity(dependency.successor),
  ]);
}

/** Exact same-writer local census plus already-admitted directional incident evidence; no foreign write authority is created. */
export function prepareFirstChildRelationships(
  write: FirstChildWrite,
  actualLocal: readonly StoredTypedDependency[],
) {
  const child = write.kind === 'fresh' ? write.child : write.record.child;
  const direction = write.kind === 'fresh' ? 'down' : write.direction;
  const from = direction === 'down' ? child.parentId : child.id;
  const to = direction === 'down' ? child.id : child.parentId;
  const remap = (endpoint: ScopedDependencyEndpoint): ScopedDependencyEndpoint =>
    endpoint.scope === 'node' &&
    endpoint.workPackageId === child.workPackageId &&
    endpoint.workItemId === from
      ? { ...endpoint, workItemId: to }
      : { ...endpoint };
  const moved = (dependency: StoredTypedDependency): StoredTypedDependency => ({
    ...dependency,
    predecessor: remap(dependency.predecessor),
    successor: remap(dependency.successor),
  });
  const localIds = new Set<string>();
  for (const dependency of actualLocal) {
    if (
      dependency.workPackageId !== child.workPackageId ||
      dependency.predecessor.workPackageId !== child.workPackageId ||
      dependency.successor.workPackageId !== child.workPackageId ||
      localIds.has(dependency.id)
    )
      throw new Error('first child local relationship census is inconsistent');
    localIds.add(dependency.id);
  }
  if (
    JSON.stringify(actualLocal.map(encoded).sort()) !==
    JSON.stringify(write.localDependencies.map(encoded).sort())
  )
    throw new Error('first child admitted local relationship census changed');
  const incidentIds = new Set<string>();
  const detachedFacts: StepUsageFactRecord[] = [];
  const detachedFactsAfter: StepUsageFactRecord[] = [];
  for (const receipt of write.detachedIncidents) {
    const original = receipt.from.dependency;
    if (
      incidentIds.has(original.id) ||
      localIds.has(original.id) ||
      original.predecessor.workPackageId === original.successor.workPackageId ||
      original.workPackageId !== original.successor.workPackageId ||
      encoded(moved(original)) !== encoded(receipt.to.dependency) ||
      encoded(original) === encoded(receipt.to.dependency) ||
      receipt.from.createdAt !== receipt.to.createdAt ||
      receipt.from.createdBy !== receipt.to.createdBy
    )
      throw new Error('first child incident receipt differs from its admitted node mapping');
    incidentIds.add(original.id);
    for (const endpoint of [original.predecessor, original.successor]) {
      detachedFacts.push({
        kind: 'external_dependency',
        scope: endpoint.scope,
        workPackageId: endpoint.workPackageId,
        workItemId: endpoint.workItemId,
        stepId: endpoint.scope === 'whole' ? null : endpoint.stepId,
      });
    }
  }
  for (const receipt of write.detachedIncidents) {
    for (const endpoint of [receipt.to.dependency.predecessor, receipt.to.dependency.successor])
      detachedFactsAfter.push({
        kind: 'external_dependency',
        scope: endpoint.scope,
        workPackageId: endpoint.workPackageId,
        workItemId: endpoint.workItemId,
        stepId: endpoint.scope === 'whole' ? null : endpoint.stepId,
      });
  }
  return { localAfter: actualLocal.map(moved), detachedFacts, detachedFactsAfter };
}
