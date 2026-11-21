import type { ResolvedStep } from '@wbs/domain';
import {
  type AddressSpace,
  describeAddressSpace,
  formatStepNodeId,
  formatStepReference,
  parseStepReference,
  readAddressSteps,
  resolveStepReference,
  type StepReferenceRefusal,
} from '@wbs/domain';

import type { Digest } from '../../ports/runtime';

interface AddressRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly number: string;
  readonly steps?: readonly Pick<ResolvedStep, 'stepId' | 'code'>[];
}

/** One leaf's step occurrence and its current canonical spelling, if coded. */
export interface StepNodeAddress {
  id: string;
  workItemId: string;
  stepId: string;
  reference: string | null;
}

/**
 * Captures effective numbers and leafhood with the explicitly selected address model.
 * Current leaf mode requires every leaf list, even if all lists would otherwise be missing.
 * Uniform mode preserves the existing legacy receiver. Neither mode invents current metadata.
 * @throws when a current leaf inventory is absent.
 */
export function buildAddressSpace(
  workItems: readonly AddressRow[],
  steps: readonly { id: string; code: string | null; position: number }[],
  mode: 'leaf' | 'uniform',
): AddressSpace {
  const parentIds = new Set(workItems.map((workItem) => workItem.parentId));
  const leafSteps = new Map<string, readonly { id: string; code: string | null }[]>();
  if (mode === 'leaf')
    for (const row of workItems) {
      if (parentIds.has(row.id)) continue;
      // Proof: missing-as-empty replaced refusal and required mapping with an empty fallback;
      // current address construction refuses a missing leaf list instead of using the package union failed.
      if (row.steps === undefined) throw new Error('leaf step metadata is absent');
      leafSteps.set(
        row.id,
        row.steps.map((step) => ({ id: step.stepId, code: step.code })),
      );
    }
  return {
    workItems: workItems.map(({ id, number }) => ({ id, number, isLeaf: !parentIds.has(id) })),
    steps,
    ...(mode === 'leaf' ? { leafSteps } : {}),
  };
}

/** Hashes the canonical address description for both reads and resolution. */
export async function digestAddressSpace(
  workPackageId: string,
  space: AddressSpace,
  digest: Digest,
): Promise<string> {
  return `${space.leafSteps === undefined ? 'ar1' : 'ar2'}:${await digest.sha256(describeAddressSpace(workPackageId, space))}`;
}

/**
 * Reads every leaf's step nodes in tree and step order, and hashes exactly the
 * address space used to spell them. Names and facts cannot change the revision.
 * Two rows showing one number both get their spelled reference; resolving it
 * is what refuses (`ambiguous_work_item`), so the read never fails over it.
 * The digest port must return lowercase SHA-256 hex for the described bytes.
 */
// Proof: default-uniform exposed extra nodes in the actual isolated HTTP tree (2026-11-20).
export async function readStepAddresses(
  workPackageId: string,
  tree: {
    workItems: readonly AddressRow[];
    steps: readonly { id: string; code: string | null; position: number }[];
  },
  digest: Digest,
  mode: 'leaf' | 'uniform' = 'leaf',
): Promise<{ addressRevision: string; stepNodes: StepNodeAddress[] }> {
  const space = buildAddressSpace(tree.workItems, tree.steps, mode);
  const stepNodes = space.workItems.flatMap(({ id: workItemId, number, isLeaf }) => {
    // Proof: removing the leaf filter made `reads only leaf nodes in step order,
    // with effective numbers and null for uncoded steps` receive four nodes
    // instead of two (`- Expected - 0 / + Received + 12`); watched 2026-09-27.
    if (!isLeaf) return [];
    // Proof: node-union exposed untyped/conflicting nodes in the actual isolated HTTP tree;
    // leaf-order reversed the captured lists and failed the opposing-order control.
    const ordered = readAddressSteps(space, workItemId);
    // Proof: node-padding used package count12 and failed the current leaf-count control.
    return ordered.map(({ id: stepId, code }, stepAt): StepNodeAddress => ({
      id: formatStepNodeId({ workItemId, stepId }),
      workItemId,
      stepId,
      reference:
        code === null ? null : formatStepReference(number, code, stepAt + 1, ordered.length),
    }));
  });
  return {
    addressRevision: await digestAddressSpace(workPackageId, space, digest),
    stepNodes,
  };
}

/** Resolves one input against the same digest and effective addresses as the tree read. */
// Proof: resolver-uniform falsely refused the actual typed local reference409instead of200 (2026-11-20).
export async function resolveAddressedStep(
  workPackageId: string,
  input: { reference: string; revision: string },
  addresses: {
    workItems: readonly AddressRow[];
    steps: readonly { id: string; code: string | null; position: number }[];
  },
  digest: Digest,
  mode: 'leaf' | 'uniform' = 'leaf',
): Promise<
  | { kind: 'resolved'; stepNodeId: string; workItemId: string; stepId: string; reference: string }
  | { kind: 'stale'; addressRevision: string }
  | { kind: 'unresolvable'; reason: StepReferenceRefusal }
> {
  // Malformed text is a request defect whatever revision it came with, so it is
  // judged before staleness. Proof: with this early check removed, `refuses an
  // old revision after a renumbering move…` failed on `Expected: 422, Received:
  // 409` for a malformed reference sent with a stale revision; watched 2026-09-27.
  if (parseStepReference(input.reference) === null)
    return { kind: 'unresolvable', reason: 'malformed' };
  const space = buildAddressSpace(addresses.workItems, addresses.steps, mode);
  const addressRevision = await digestAddressSpace(workPackageId, space, digest);
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
