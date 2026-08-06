import { describe, expect, it } from 'vitest';

import { type SearchableRow, searchTree } from './tree-search';

const row = (id: string, parentId: string | null, name: string): SearchableRow => ({
  id,
  parentId,
  name,
});

/**
 * A small plan with a match three levels down and a branch with nothing in it.
 *
 * ```
 * a   Strip the walls
 *  a1  Sockets
 *   a11 Back boxes
 *  a2  Skirting
 * b   Paint
 *  b1  Undercoat
 * ```
 */
const PLAN: SearchableRow[] = [
  row('a', null, 'Strip the walls'),
  row('a1', 'a', 'Sockets'),
  row('a11', 'a1', 'Back boxes'),
  row('a2', 'a', 'Skirting'),
  row('b', null, 'Paint'),
  row('b1', 'b', 'Undercoat'),
];

const ids = (of: ReadonlySet<string>): string[] => [...of].sort();

describe('searchTree', () => {
  it('keeps every row and asks for no expansion when nothing is typed', () => {
    const search = searchTree(PLAN, '');

    expect(ids(search.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1']);
    expect(ids(search.matchIds)).toEqual([]);
    // Null, not `true`: no search is running, so the reader's own collapse
    // state stands. An overlay of `true` here would silently open every
    // branch the moment the box was focused and emptied again.
    expect(search.expandedOverlay).toBeNull();
  });

  it('treats a query of nothing but spaces as no search at all', () => {
    // The same `trim().toLowerCase()` rule the project picker and the Depends
    // on picker apply. Two filters side by side that disagree about a space is
    // a surprise with nothing to gain from it.
    const search = searchTree(PLAN, '   ');

    expect(ids(search.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1']);
    expect(search.expandedOverlay).toBeNull();
  });

  it('keeps the rows that place a match deep in the tree', () => {
    // The requirement the change exists for: a narrowed tree that dropped the
    // ancestors would show `Back boxes` floating at the root of a plan it is
    // three levels inside, which is a tree lying about its own shape.
    const search = searchTree(PLAN, 'back');

    expect(ids(search.visibleIds)).toEqual(['a', 'a1', 'a11']);
    expect(ids(search.matchIds)).toEqual(['a11']);
  });

  it('opens every kept row, so a match inside a closed branch is on screen', () => {
    const search = searchTree(PLAN, 'back');

    expect(search.expandedOverlay).toEqual({ a: true, a1: true, a11: true });
  });

  it('shows the whole subtree under a matched parent', () => {
    const search = searchTree(PLAN, 'strip the');

    expect(ids(search.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2']);
    // Only the row whose own name matched is a hit. The four under it are
    // there because their parent matched, and marking them would make the
    // mark mean nothing.
    expect(ids(search.matchIds)).toEqual(['a']);
    expect(search.expandedOverlay).toEqual({ a: true, a1: true, a11: true, a2: true });
  });

  it('matches without regard to case', () => {
    const search = searchTree(PLAN, 'SOCKets');

    expect(ids(search.matchIds)).toEqual(['a1']);
  });

  it('hides a row that neither matches nor sits on a match’s line', () => {
    const search = searchTree(PLAN, 'skirting');

    // `a` places the match; everything under `b` and the whole `a1` branch are
    // unrelated to it and go.
    expect(ids(search.visibleIds)).toEqual(['a', 'a2']);
  });

  it('hides everything when nothing matches, rather than showing everything', () => {
    // A filter that falls back to the unfiltered table on no match reads as
    // broken — the typing appears to have done nothing. An empty table plus a
    // sentence saying so is the honest answer.
    const search = searchTree(PLAN, 'plumbing');

    expect(ids(search.visibleIds)).toEqual([]);
    expect(ids(search.matchIds)).toEqual([]);
    expect(search.expandedOverlay).toEqual({});
  });

  it('finds a match whose parent is not in the list', () => {
    // `toTree` keeps a row whose parent is missing at the root rather than
    // dropping it, so this list is one the table really can hand over.
    const orphaned = [row('x', 'gone', 'Rewire the shed')];

    const search = searchTree(orphaned, 'shed');

    expect(ids(search.visibleIds)).toEqual(['x']);
  });

  it('terminates on a parent cycle instead of walking it forever', () => {
    // `toTree` leaves both rows of a cycle out of the tree, so the table
    // cannot hand one over today. This is pure and takes the list it is given:
    // a hang here would be a frozen tab, which is worse than any wrong answer.
    const looped = [row('p', 'q', 'Plaster'), row('q', 'p', 'Prime')];

    const search = searchTree(looped, 'plaster');

    expect(ids(search.visibleIds)).toEqual(['p', 'q']);
    expect(ids(search.matchIds)).toEqual(['p']);
  });

  it('counts one row once when it is both an ancestor and a descendant of a match', () => {
    // `a1` is kept as `a11`'s ancestor and again as matched `a`'s descendant.
    const search = searchTree(PLAN, 'walls');

    expect(ids(search.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2']);
  });
});
