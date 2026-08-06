import type { StoredEstimate, WorkItem } from '../repository';

/** Three durations in days, summed or held directly. */
export interface Days {
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

const add = (a: Days, b: Days): Days => ({
  optimistic: a.optimistic + b.optimistic,
  realistic: a.realistic + b.realistic,
  pessimistic: a.pessimistic + b.pessimistic,
});

/**
 * Every work item's estimates by role: its own if it is a leaf, the sum of its
 * descendants' otherwise.
 *
 * A role no descendant estimated is **absent** from the map rather than zero.
 * The two look identical in a spreadsheet and mean opposite things — "this needs
 * no QA" against "nobody has looked at the QA yet" — and only one of them is a
 * plan you can commit to.
 *
 * Computed on read and never stored, so there is no second copy to fall out of
 * date with the estimates it came from.
 */
export function rollUp(
  rows: readonly WorkItem[],
  estimates: readonly StoredEstimate[],
): Map<string, Map<string, Days>> {
  const childrenOf = new Map<string | null, WorkItem[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parentId) ?? [];
    group.push(row);
    childrenOf.set(row.parentId, group);
  }

  const ownOf = new Map<string, Map<string, Days>>();
  for (const held of estimates) {
    const byRole = ownOf.get(held.workItemId) ?? new Map<string, Days>();
    byRole.set(held.roleId, {
      optimistic: held.optimistic,
      realistic: held.realistic,
      pessimistic: held.pessimistic,
    });
    ownOf.set(held.workItemId, byRole);
  }

  const totals = new Map<string, Map<string, Days>>();
  const totalFor = (id: string): Map<string, Days> => {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;

    const children = childrenOf.get(id) ?? [];
    const total = new Map<string, Days>();
    if (children.length === 0) {
      for (const [roleId, days] of ownOf.get(id) ?? []) total.set(roleId, days);
    } else {
      for (const child of children) {
        for (const [roleId, days] of totalFor(child.id)) {
          const running = total.get(roleId);
          total.set(roleId, running === undefined ? days : add(running, days));
        }
      }
    }
    totals.set(id, total);
    return total;
  };

  for (const row of rows) totalFor(row.id);
  return totals;
}
