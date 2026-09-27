import {
  type AddressSpace,
  describeAddressSpace,
  formatStepNodeId,
  formatStepReference,
  listStepNodes,
  parseStepReference,
  resolveStepReference,
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
export function addressSpaceOf(
  workItems: readonly { id: string; parentId: string | null; number: string }[],
  steps: readonly { id: string; code: string | null; position: number }[],
): AddressSpace {
  const parentIds = new Set(workItems.map((workItem) => workItem.parentId));
  return {
    workItems: workItems.map(({ id, number }) => ({ id, number, isLeaf: !parentIds.has(id) })),
    steps,
  };
}

/** Hashes the canonical address description for both reads and resolution. */
export async function addressRevisionOf(
  projectId: string,
  space: AddressSpace,
  digest: Digest,
): Promise<string> {
  return `ar1:${await digest.sha256(describeAddressSpace(projectId, space))}`;
}

/**
 * Reads every leaf's step nodes in tree and step order, and hashes exactly the
 * address space used to spell them. Names and facts cannot change the revision.
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
  const space = addressSpaceOf(tree.workItems, tree.steps);
  const numberById = new Map(space.workItems.map(({ id, number }) => [id, number]));
  const codeById = new Map(space.steps.map(({ id, code }) => [id, code]));
  const stepNodes = space.workItems.flatMap(({ id: workItemId, isLeaf }) => {
    // Proof: removing the leaf filter made `reads only leaf nodes in step order,
    // with effective numbers and null for uncoded steps` receive four nodes
    // instead of two (`- Expected - 0 / + Received + 12`); watched 2026-09-27.
    if (!isLeaf) return [];
    return listStepNodes(workItemId, space.steps).map((ref): StepNodeAddress => {
      const code = codeById.get(ref.stepId);
      const number = numberById.get(workItemId);
      if (code === undefined || number === undefined) throw new Error('incomplete address space');
      return {
        id: formatStepNodeId(ref),
        workItemId,
        stepId: ref.stepId,
        reference: code === null ? null : formatStepReference(number, code),
      };
    });
  });
  return {
    addressRevision: await addressRevisionOf(projectId, space, digest),
    stepNodes,
  };
}

/** Resolves one input against the same digest and effective addresses as the tree read. */
export async function resolveAddressedStep(
  projectId: string,
  input: { reference: string; revision: string },
  addresses: {
    workItems: readonly { id: string; parentId: string | null; number: string }[];
    steps: readonly { id: string; code: string | null; position: number }[];
  },
  digest: Digest,
): Promise<
  | { kind: 'resolved'; stepNodeId: string; workItemId: string; stepId: string; reference: string }
  | { kind: 'stale'; addressRevision: string }
  | {
      kind: 'unresolvable';
      reason: 'malformed' | 'unknown_work_item' | 'parent' | 'unknown_code' | 'alias_mismatch';
    }
> {
  if (parseStepReference(input.reference) === null)
    return { kind: 'unresolvable', reason: 'malformed' };
  const space = addressSpaceOf(addresses.workItems, addresses.steps);
  const addressRevision = await addressRevisionOf(projectId, space, digest);
  // Proof: skipping this comparison made the mounted stale-reference test fail
  // on `Expected: 409 / Received: 200`; watched 2026-09-27.
  if (input.revision !== addressRevision) return { kind: 'stale', addressRevision };
  const resolved = resolveStepReference(input.reference, space);
  if (!resolved.ok) return { kind: 'unresolvable', reason: resolved.reason };
  return {
    kind: 'resolved',
    stepNodeId: formatStepNodeId(resolved.ref),
    workItemId: resolved.ref.workItemId,
    stepId: resolved.ref.stepId,
    reference: resolved.reference,
  };
}
