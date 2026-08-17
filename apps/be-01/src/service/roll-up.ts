import type { StoredActual, StoredEstimate, WorkItem } from '../repository';

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
 * The one traversal both roll-ups are: a leaf's own figures, a parent's the sum
 * of its descendants', and a role nobody has a figure for **absent** rather
 * than zero.
 *
 * Generic over the figure, and it is generic for one reason rather than for
 * elegance. Estimates and actuals share every structural rule — the same key,
 * leaves only, absence meaning "nobody has said" — and a second hand-written
 * fold beside this one is how the two come to disagree about a case neither
 * author was thinking about: an empty parent, a role held by one child of three,
 * a branch nested four deep. There is one recursion and it is tested once.
 *
 * `held` is read into a per-item map first, so an item that holds rows for two
 * roles is one entry with two keys — and so a row naming a work item that is not
 * in `rows` is ignored rather than throwing, which is what a stale read looks
 * like.
 */
function foldByRole<T>(
  rows: readonly WorkItem[],
  held: ReadonlyMap<string, ReadonlyMap<string, T>>,
  combine: (a: T, b: T) => T,
): Map<string, Map<string, T>> {
  const childrenOf = new Map<string | null, WorkItem[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parentId) ?? [];
    group.push(row);
    childrenOf.set(row.parentId, group);
  }

  const totals = new Map<string, Map<string, T>>();
  const totalFor = (id: string): Map<string, T> => {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;

    const children = childrenOf.get(id) ?? [];
    const total = new Map<string, T>();
    if (children.length === 0) {
      for (const [roleId, figure] of held.get(id) ?? []) total.set(roleId, figure);
    } else {
      for (const child of children) {
        for (const [roleId, figure] of totalFor(child.id)) {
          const running = total.get(roleId);
          total.set(roleId, running === undefined ? figure : combine(running, figure));
        }
      }
    }
    totals.set(id, total);
    return total;
  };

  for (const row of rows) totalFor(row.id);
  return totals;
}

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
  return foldByRole(rows, ownOf, add);
}

/**
 * Every work item's **recorded** days by role, folded exactly as the estimates
 * are: its own if it is a leaf, the sum of its descendants' otherwise.
 *
 * A role nobody has recorded days against is **absent**, never zero — the rule
 * this whole table is built on. A parent whose children hold no actuals at all
 * therefore comes back with an empty map, which reads as "nobody has recorded
 * anything under here" and not as "no days were spent on it".
 *
 * Note what this deliberately does not do: it never mixes in an estimate. A
 * branch where one child of three has an actual reports that child's days and
 * nothing else, so the number is the sum of what was recorded rather than a
 * projection of what the rest might take. Reading the two side by side is the
 * point, and it only works while each is what it says it is.
 */
export function rollUpActuals(
  rows: readonly WorkItem[],
  actuals: readonly StoredActual[],
): Map<string, Map<string, number>> {
  const ownOf = new Map<string, Map<string, number>>();
  for (const held of actuals) {
    const byRole = ownOf.get(held.workItemId) ?? new Map<string, number>();
    byRole.set(held.roleId, held.days);
    ownOf.set(held.workItemId, byRole);
  }
  return foldByRole(rows, ownOf, (a, b) => a + b);
}
