import {
  type AddressSpace,
  describeAddressSpace,
  formatStepNodeId,
  formatStepReference,
  orderSteps,
} from '@wbs/domain';

import type { Digest } from '../../ports/runtime';

/** One leaf's step occurrence and its current canonical spelling, if coded. */
export interface StepNodeAddress {
  id: string;
  workItemId: string;
  stepId: string;
  reference: string | null;
}

/**
 * Projects the tree's effective numbers and leafhood into the address space.
 * A row is a leaf exactly when no row names it as parent; step order is retained.
 */
export function buildAddressSpace(
  workItems: readonly { id: string; parentId: string | null; number: string }[],
  steps: readonly { id: string; code: string | null; position: number }[],
): AddressSpace {
  const parentIds = new Set(workItems.map((workItem) => workItem.parentId));
  return {
    workItems: workItems.map(({ id, number }) => ({ id, number, isLeaf: !parentIds.has(id) })),
    steps,
  };
}

/**
 * Reads every leaf's step nodes in tree and step order, and hashes exactly the
 * address space used to spell them. Names and facts cannot change the revision.
 * Two rows showing one number both get their spelled reference; resolving it
 * is what refuses (`ambiguous_work_item`), so the read never fails over it.
 * The digest port must return lowercase SHA-256 hex for the described bytes.
 */
export async function readStepAddresses(
  projectId: string,
  tree: {
    workItems: readonly { id: string; parentId: string | null; number: string }[];
    steps: readonly { id: string; code: string | null; position: number }[];
  },
  digest: Digest,
): Promise<{ addressRevision: string; stepNodes: StepNodeAddress[] }> {
  const space = buildAddressSpace(tree.workItems, tree.steps);
  const ordered = orderSteps(space.steps);
  const stepNodes = space.workItems.flatMap(({ id: workItemId, number, isLeaf }) => {
    // Proof: removing the leaf filter made `reads only leaf nodes in step order,
    // with effective numbers and null for uncoded steps` receive four nodes
    // instead of two (`- Expected - 0 / + Received + 12`); watched 2026-09-27.
    if (!isLeaf) return [];
    return ordered.map(({ id: stepId, code }): StepNodeAddress => ({
      id: formatStepNodeId({ workItemId, stepId }),
      workItemId,
      stepId,
      reference: code === null ? null : formatStepReference(number, code),
    }));
  });
  return {
    addressRevision: `ar1:${await digest.sha256(describeAddressSpace(projectId, space))}`,
    stepNodes,
  };
}
