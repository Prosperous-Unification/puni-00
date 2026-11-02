/** Trusted identities and the complete local revision vector for one runtime basis. */
export interface RuntimeBasisInput {
  readonly ledgerId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly workItems: readonly { readonly id: string; readonly revision: number }[];
}

function assertIdentity(identity: string): void {
  // Proof: F02 removed this guard; malformed-identity descriptor tests returned bytes instead of throwing.
  if (typeof identity !== 'string' || identity.length === 0)
    throw new Error('runtime basis identity must be nonempty text');
}

function assertRevision(revision: number): void {
  // Proof: F03 removed this guard; absent, unsafe, fractional and negative revision tests returned bytes.
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error('runtime basis revision must be a nonnegative safe integer');
}

/**
 * Describes the complete revision vector as versioned JSON, without a newline.
 * IDs sort by code units; input order and storage object keys never affect bytes.
 * The explicit ledger identity is trusted input, not evidence of ledger inspection.
 * @throws for absent identities, duplicate row IDs or invalid trusted revisions.
 */
export function describeRuntimeBasis(input: RuntimeBasisInput): string {
  assertIdentity(input.ledgerId);
  assertIdentity(input.organizationId);
  assertIdentity(input.projectId);
  assertRevision(input.projectRevision);
  const ids = new Set<string>();
  const pairs: (readonly [string, number])[] = [];
  // Proof: F19 restored Array.map; the sparse absent-row test returned a null pair instead of throwing.
  for (const { id, revision } of input.workItems) {
    assertIdentity(id);
    assertRevision(revision);
    // Proof: F04 removed this check; duplicate-ID descriptor input no longer threw.
    if (ids.has(id)) throw new Error(`runtime basis repeats work item ${id}`);
    ids.add(id);
    pairs.push([id, revision]);
  }
  pairs.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return JSON.stringify([
    'wbs-runtime-basis',
    1,
    input.ledgerId,
    input.organizationId,
    input.projectId,
    // Proof: F01 omitted this field; the pinned canonical-byte test failed with revision 2 absent.
    input.projectRevision,
    pairs,
  ]);
}
