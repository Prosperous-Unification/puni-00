import type { ExpandedState } from '@tanstack/react-table';

/** A work item as the search reads it: what it is called, and where it hangs. */
export interface SearchableRow {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * What one query does to the tree.
 *
 * `visibleIds` is every row that stays on screen — the matches, the ancestors
 * that place them and the descendants beneath them. `matchIds` is only the rows
 * whose own name matched, so the table can mark them: the rest are context, and
 * marking them too would make the mark mean nothing.
 *
 * `expandedOverlay` is the expansion the table must render **while the query is
 * on**, in place of the reader's own. Null means there is no query and the
 * reader's own expansion stands — the overlay is never merged into it, which is
 * what lets clearing the box put the plan back exactly as it was left.
 */
export interface TreeSearch {
  visibleIds: ReadonlySet<string>;
  matchIds: ReadonlySet<string>;
  expandedOverlay: ExpandedState | null;
}

/**
 * Narrows a flat list of rows to what a query is asking about, and says what
 * has to be open for the answer to be on screen.
 *
 * Three rules make one narrowed tree, and the second and third are what stop it
 * lying:
 *
 * 1. A row **matches** when its name contains the query, case-insensitively —
 *    the same `trim().toLowerCase()` substring every other filter in this repo
 *    uses ({@link matchingProjects}, {@link pickerEntries}).
 * 2. Every **ancestor** of a match is kept. A match shown without the rows above
 *    it is a work item torn out of the plan that gives it its meaning, and its
 *    indent and its number would then describe a tree that is not on screen.
 * 3. Every **descendant** of a match is kept. Matching a parent is how a person
 *    asks for a whole branch, and answering with the parent alone would hide the
 *    work it is a heading for.
 *
 * Anything else is hidden — including, when nothing matches at all, everything.
 * A filter that falls back to the whole table on no match reads as broken: the
 * typing appears to have done nothing.
 *
 * The overlay opens **every kept row**, not only the ancestors. Both are needed:
 * a match inside a branch the reader had closed has to be revealed, and a
 * matched parent's subtree has to be open for rule 3 to be visible. Every kept
 * row's parent is itself kept — ancestors by rule 2, descendants by the chain
 * they hang from — so opening the kept set is exactly enough to render it.
 *
 * Pure, and re-derived from the rows handed in on every call. The tree refetches
 * on every edit by anybody, and a remembered answer would narrow to a plan that
 * no longer exists.
 *
 * Terminates on any list, including one whose `parentId`s form a cycle: the
 * ancestor walk stops at a row it has already stepped on, and the descendant
 * walk queues each row once. `toTree` leaves a cycle out of the tree entirely,
 * so the table cannot hand one over today — but a hang here would be a frozen
 * tab, which is worse than any wrong answer this could give.
 */
export function searchTree(rows: readonly SearchableRow[], query: string): TreeSearch {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') {
    return {
      visibleIds: new Set(rows.map((row) => row.id)),
      matchIds: new Set(),
      expandedOverlay: null,
    };
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const siblings = childrenOf.get(row.parentId);
    if (siblings === undefined) childrenOf.set(row.parentId, [row.id]);
    else siblings.push(row.id);
  }

  const matchIds = new Set(
    rows.filter((row) => row.name.toLowerCase().includes(wanted)).map((row) => row.id),
  );
  const visibleIds = new Set<string>(matchIds);

  // Proof: this walk removed, `keeps the rows that place a match deep in the
  // tree`, `opens every kept row…` and `hides a row that neither matches nor
  // sits on a match’s line` failed here, and seven table tests failed with
  // `Back boxes` shown as a root of a plan it is three levels inside. Watched,
  // 2026-08-06.
  for (const matched of matchIds) {
    const steppedOn = new Set<string>([matched]);
    let above = byId.get(matched)?.parentId ?? null;
    while (above !== null && !steppedOn.has(above)) {
      // A `parentId` naming a row this list does not hold is the top of the
      // tree as far as this list goes — `toTree` renders such a row at the
      // root. Keeping the id anyway would put a row that does not exist into
      // the kept set and into the count beside the box.
      const parent = byId.get(above);
      if (parent === undefined) break;
      steppedOn.add(above);
      visibleIds.add(above);
      above = parent.parentId;
    }
  }

  // Queued rather than recursive, and each row queued once: `walked` is what
  // keeps a row that is both a match's ancestor and another match's descendant
  // from being walked twice, and a cycle from being walked forever.
  const queue = [...matchIds];
  const walked = new Set(matchIds);
  while (queue.length > 0) {
    const under = queue.pop();
    if (under === undefined) break;
    for (const child of childrenOf.get(under) ?? []) {
      visibleIds.add(child);
      if (walked.has(child)) continue;
      walked.add(child);
      queue.push(child);
    }
  }

  // Nothing matched leaves `visibleIds` empty, and that is the answer.
  // Proof: given a fall-back to every row when `matchIds` is empty, `hides
  // everything when nothing matches, rather than showing everything` failed
  // here, and `shows an empty table and says so when nothing matches` and
  // `re-derives from the rows that came back…` failed in the table. Watched,
  // 2026-08-06.
  return {
    visibleIds,
    matchIds,
    expandedOverlay: Object.fromEntries([...visibleIds].map((id) => [id, true])),
  };
}
