/** One actual leaf's resolved identities in execution order, including an explicit empty list. */
export interface LeafStepOrder {
  readonly workItemId: string;
  readonly stepIds: readonly string[];
}

/**
 * Detaches ordered identities from the same observation's resolved tree rows.
 * The ordinary row census determines actual leaves; metadata cannot silently
 * omit a leaf or turn absent evidence into an empty resolution.
 * @throws for missing leaf metadata, including an absent resolved tree row.
 */
export function captureLeafStepOrders(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  resolvedRows: readonly {
    readonly id: string;
    readonly steps?: readonly { readonly stepId: string }[];
  }[],
): LeafStepOrder[] {
  const parents = new Set(rows.map(({ parentId }) => parentId));
  const byId = new Map(resolvedRows.map(({ id, steps }) => [id, steps]));
  return rows
    .filter(({ id }) => !parents.has(id))
    .map(({ id }) => {
      const steps = byId.get(id);
      // Proof: an empty-list fallback separately failed the missing-row and missing-metadata
      // negatives; reversing this projection failed both actual Source order controls (2026-11-20).
      if (steps === undefined) throw new Error(`captured leaf step order is absent for ${id}`);
      return { workItemId: id, stepIds: steps.map(({ stepId }) => stepId) };
    });
}
