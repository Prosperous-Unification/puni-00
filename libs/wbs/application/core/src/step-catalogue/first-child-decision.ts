import { resolveSteps, type StepBinding } from '@wbs/domain';

import { STEP_FACT_KINDS, type StepFactKind } from '../ports/step-catalogue';
import type { WorkItem } from '../ports/work-item-store';
import type { FirstChildRecord, FirstChildWrite, FirstChildWriteOutcome } from './first-child';
import { readFirstChildBlockages } from './first-child-history';
import {
  projectStepNodesInUse,
  type StepUsageFact,
  type StepUsagePackage,
  type StepUsageWorkItem,
} from './step-usage';

export type FirstChildDecision =
  | {
      readonly kind: 'ready';
      readonly direction: 'down' | 'up';
      readonly fromWorkItemId: string;
      readonly toWorkItemId: string;
      readonly record: FirstChildRecord;
    }
  | Exclude<FirstChildWriteOutcome, { readonly kind: 'written' }>;

/**
 * Same-writer structural decision before any tree, statement or fact mutation.
 * The capture includes every protected family and admitted detached incidents.
 * Scalar codecs and exact original relationship census are adapter boundaries;
 * this projection validates original semantic usage and the actual destination.
 *
 * Existing parent allocator reservations are a distinct step-usage endpoint;
 * they remain on their address. They never make parent point facts lawful.
 * Whole relationships/subtree claims newly attached to a replay child, or a
 * subtree-only endpoint on a parent becoming a leaf, are stale replay rather
 * than silently deleted or synthesized into a step pair.
 */
export function decideFirstChildWrite(
  packages: readonly StepUsagePackage[],
  bindings: readonly StepBinding[],
  facts: readonly StepUsageFact[],
  write: FirstChildWrite,
  actualParent: WorkItem | null,
  actualChild: WorkItem | null,
  sourceBlockages: readonly { readonly stepId: unknown; readonly blockedAt: unknown }[],
): FirstChildDecision {
  const child = write.kind === 'fresh' ? write.child : write.record.child;
  const direction = write.kind === 'fresh' ? 'down' : write.direction;
  if (actualParent?.id !== child.parentId || actualParent.workPackageId !== child.workPackageId)
    return { kind: 'not_found' };
  const captured = packages.find(({ chain }) => chain.workPackageId === child.workPackageId);
  if (captured === undefined) throw new Error('first child package capture is absent');
  const parent = captured.workItems.find(({ id }) => id === actualParent.id);
  if (parent === undefined) throw new Error('first child parent capture is absent');
  const children = captured.workItems.filter(({ parentId }) => parentId === parent.id);
  const selectedChild = captured.workItems.find(({ id }) => id === child.id);
  if (direction === 'down') {
    if (actualChild !== null || selectedChild !== undefined || children.length !== 0)
      return { kind: 'stale_transition' };
    if (packages.some(({ workItems }) => workItems.some(({ id }) => id === child.id)))
      return { kind: 'stale_transition' };
    if (child.readiness !== actualParent.readiness || child.hold !== actualParent.hold)
      return { kind: 'stale_transition' };
  } else {
    if (
      actualChild?.id !== child.id ||
      actualChild.parentId !== parent.id ||
      actualChild.workPackageId !== child.workPackageId ||
      selectedChild === undefined ||
      children.length !== 1 ||
      children.at(0)?.id !== child.id ||
      captured.workItems.some(({ parentId }) => parentId === child.id)
    )
      return { kind: 'stale_transition' };
    if (
      selectedChild.typeState.kind !== 'untyped' ||
      actualParent.readiness !== null ||
      actualParent.hold !== null ||
      actualChild.readiness !== child.readiness ||
      actualChild.hold !== child.hold
    )
      return { kind: 'stale_transition' };
    if (
      Object.keys(child).some(
        (key) => key !== 'revision' && Reflect.get(actualChild, key) !== Reflect.get(child, key),
      )
    )
      return { kind: 'stale_transition' };
  }
  if (
    write.kind === 'replay' &&
    direction === 'down' &&
    (actualParent.readiness !== write.record.parentStatements.readiness ||
      actualParent.hold !== write.record.parentStatements.hold)
  )
    return { kind: 'stale_transition' };

  projectStepNodesInUse(packages, bindings, bindings, facts);
  const proposedChild: StepUsageWorkItem = {
    id: child.id,
    parentId: parent.id,
    position: child.position,
    name: child.name,
    typeState: { kind: 'untyped' },
  };
  const from = direction === 'down' ? parent : selectedChild;
  if (from === undefined) throw new Error('first child source capture is absent');
  const to = direction === 'down' ? proposedChild : parent;
  const candidatePackages = packages.map((entry) =>
    entry === captured
      ? {
          ...entry,
          workItems:
            direction === 'down'
              ? [...entry.workItems, proposedChild]
              : entry.workItems.filter(({ id }) => id !== child.id),
        }
      : entry,
  );
  projectStepNodesInUse(candidatePackages, bindings, bindings, []);
  const before = resolveSteps(captured.chain, from.typeState, bindings).map(({ stepId }) => stepId);
  const after = new Set(
    resolveSteps(captured.chain, to.typeState, bindings).map(({ stepId }) => stepId),
  );
  const ancestors = new Set<string>();
  const rows = new Map(captured.workItems.map((row) => [row.id, row]));
  let ancestorId = from.parentId;
  while (ancestorId !== null) {
    const ancestor = rows.get(ancestorId);
    if (ancestor === undefined) throw new Error('first child ancestor is absent');
    ancestors.add(ancestorId);
    ancestorId = ancestor.parentId;
  }
  const protectedSteps = new Map<string, Set<StepFactKind>>();
  for (const fact of facts) {
    const endpoint = fact.endpoint;
    if (endpoint.workPackageId !== child.workPackageId) continue;
    if (endpoint.scope === 'whole' || endpoint.scope === 'subtree-claim') {
      if (
        direction === 'up' &&
        (endpoint.workItemId === child.id ||
          (endpoint.scope === 'subtree-claim' && endpoint.workItemId === parent.id))
      )
        return { kind: 'stale_transition' };
      continue;
    }
    if (
      direction === 'up' &&
      endpoint.scope === 'descendant-step' &&
      endpoint.workItemId === parent.id
    )
      return { kind: 'stale_transition' };
    const transfers =
      endpoint.scope === 'descendant-step'
        ? ancestors.has(endpoint.workItemId) && before.includes(endpoint.stepId)
        : endpoint.workItemId === from.id;
    if (!transfers || (fact.kind !== 'parallel' && after.has(endpoint.stepId))) continue;
    const held = protectedSteps.get(endpoint.stepId);
    if (held === undefined) protectedSteps.set(endpoint.stepId, new Set([fact.kind]));
    else held.add(fact.kind);
  }
  if (protectedSteps.size !== 0) {
    const pairs = before.flatMap((stepId) => {
      const kinds = protectedSteps.get(stepId);
      return kinds === undefined
        ? []
        : [
            {
              id: from.id,
              name: from.name,
              stepId,
              workPackageId: child.workPackageId,
              facts: STEP_FACT_KINDS.filter((kind) => kinds.has(kind)),
            },
          ];
    });
    return { kind: 'step_nodes_in_use', count: pairs.length, pairs: pairs.slice(0, 200) };
  }
  const blockages = readFirstChildBlockages(sourceBlockages);
  // Proof: bypassing this comparison returned 200 for both mounted timestamp faults,
  // admitted all three Memory changes and let SQLite write after a successful earlier inspection.
  if (write.kind === 'replay' && write.record.version === 2) {
    const expected = write.record.blockages;
    if (
      blockages.length !== expected.length ||
      blockages.some(
        (row, index) =>
          row.stepId !== expected[index]?.stepId || row.blockedAt !== expected[index]?.blockedAt,
      )
    )
      return { kind: 'stale_transition' };
  }
  const stepIds = before.filter((stepId) => after.has(stepId));
  const record: FirstChildRecord =
    write.kind === 'replay'
      ? { ...structuredClone(write.record), stepIds }
      : {
          version: 2,
          child: structuredClone(child),
          parentStatements: { readiness: actualParent.readiness, hold: actualParent.hold },
          stepIds,
          blockages,
        };
  return { kind: 'ready', direction, fromWorkItemId: from.id, toWorkItemId: to.id, record };
}
