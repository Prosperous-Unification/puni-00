import { describe, expect, it } from 'vitest';

import {
  type FilterCriteria,
  isFiltering,
  type NarrowableRow,
  narrowTree,
  NO_FILTER,
  type RowFacets,
} from './tree-search';

/** A row carrying no facet at all, which is what every row is unless a test says otherwise. */
const NO_FACETS: RowFacets = {
  teamIds: [],
  assigneeIds: [],
  priorityBand: null,
  estimatedRoleIds: [],
  unestimated: false,
  critical: false,
};

const row = (
  id: string,
  parentId: string | null,
  name: string,
  facets: Partial<RowFacets> = {},
): NarrowableRow => ({
  id,
  parentId,
  name,
  facets: { ...NO_FACETS, ...facets },
});

/** What is being asked, stated as the difference from asking nothing. */
const asking = (criteria: Partial<FilterCriteria>): FilterCriteria => ({
  ...NO_FILTER,
  ...criteria,
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
const PLAN: NarrowableRow[] = [
  row('a', null, 'Strip the walls'),
  row('a1', 'a', 'Sockets'),
  row('a11', 'a1', 'Back boxes'),
  row('a2', 'a', 'Skirting'),
  row('b', null, 'Paint'),
  row('b1', 'b', 'Undercoat'),
];

/**
 * The same shape, with facets on it: `a` is Platform's and Ada is on it, and
 * the rows under it carry nothing of their own.
 */
const FACETED: NarrowableRow[] = [
  row('a', null, 'Strip the walls', {
    teamIds: ['platform'],
    assigneeIds: ['ada'],
    priorityBand: 'High',
    estimatedRoleIds: ['dev'],
    critical: true,
  }),
  row('a1', 'a', 'Sockets', { unestimated: true }),
  row('a11', 'a1', 'Back boxes', { teamIds: ['payments'], assigneeIds: ['bo'] }),
  row('a2', 'a', 'Skirting', { priorityBand: 'Low' }),
  row('b', null, 'Paint', { teamIds: ['payments'], estimatedRoleIds: ['dev', 'qa'] }),
  row('b1', 'b', 'Undercoat', { assigneeIds: ['ada'], unestimated: true, critical: true }),
];

const ids = (of: ReadonlySet<string>): string[] => [...of].sort();

describe('isFiltering', () => {
  it('is false for nothing asked and for a query of nothing but spaces', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering(asking({ query: '   ' }))).toBe(false);
  });

  it('is true for a facet with no query beside it', () => {
    // The whole of what R10 adds: a filter that is on while the Find box is
    // empty. A `searching` flag that only read the query would leave the
    // triangles live and the count silent under every facet.
    expect(isFiltering(asking({ teamIds: ['platform'] }))).toBe(true);
    expect(isFiltering(asking({ critical: true }))).toBe(true);
    expect(isFiltering(asking({ unestimated: true }))).toBe(true);
  });
});

describe('narrowTree — a typed name', () => {
  it('keeps every row and asks for no expansion when nothing is asked', () => {
    const narrowed = narrowTree(PLAN, NO_FILTER);

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1']);
    expect(ids(narrowed.matchIds)).toEqual([]);
    // Null, not `true`: nothing is being asked, so the reader's own collapse
    // state stands. An overlay of `true` here would silently open every
    // branch the moment the box was focused and emptied again.
    expect(narrowed.expandedOverlay).toBeNull();
  });

  it('treats a query of nothing but spaces as no filter at all', () => {
    // The same `trim().toLowerCase()` rule the project picker and the Depends
    // on picker apply. Two filters side by side that disagree about a space is
    // a surprise with nothing to gain from it.
    const narrowed = narrowTree(PLAN, asking({ query: '   ' }));

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1']);
    expect(narrowed.expandedOverlay).toBeNull();
  });

  it('keeps the rows that place a match deep in the tree', () => {
    // The requirement the change exists for: a narrowed tree that dropped the
    // ancestors would show `Back boxes` floating at the root of a plan it is
    // three levels inside, which is a tree lying about its own shape.
    const narrowed = narrowTree(PLAN, asking({ query: 'back' }));

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11']);
    expect(ids(narrowed.matchIds)).toEqual(['a11']);
  });

  it('opens every kept row, so a match inside a closed branch is on screen', () => {
    const narrowed = narrowTree(PLAN, asking({ query: 'back' }));

    expect(narrowed.expandedOverlay).toEqual({ a: true, a1: true, a11: true });
  });

  it('shows the whole subtree under a matched parent', () => {
    const narrowed = narrowTree(PLAN, asking({ query: 'strip the' }));

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2']);
    // Only the row whose own name matched is a hit. The three under it are
    // there because their parent matched, and marking them would make the
    // mark mean nothing.
    expect(ids(narrowed.matchIds)).toEqual(['a']);
    expect(narrowed.expandedOverlay).toEqual({ a: true, a1: true, a11: true, a2: true });
  });

  it('matches without regard to case', () => {
    const narrowed = narrowTree(PLAN, asking({ query: 'SOCKets' }));

    expect(ids(narrowed.matchIds)).toEqual(['a1']);
  });

  it('hides a row that neither matches nor sits on a match’s line', () => {
    const narrowed = narrowTree(PLAN, asking({ query: 'skirting' }));

    // `a` places the match; everything under `b` and the whole `a1` branch are
    // unrelated to it and go.
    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a2']);
  });

  it('hides everything when nothing matches, rather than showing everything', () => {
    // A filter that falls back to the unfiltered table on no match reads as
    // broken — the typing appears to have done nothing. An empty table plus a
    // sentence saying so is the honest answer.
    const narrowed = narrowTree(PLAN, asking({ query: 'plumbing' }));

    expect(ids(narrowed.visibleIds)).toEqual([]);
    expect(ids(narrowed.matchIds)).toEqual([]);
    expect(narrowed.expandedOverlay).toEqual({});
  });

  it('finds a match whose parent is not in the list', () => {
    // `toTree` keeps a row whose parent is missing at the root rather than
    // dropping it, so this list is one the table really can hand over.
    const orphaned = [row('x', 'gone', 'Rewire the shed')];

    const narrowed = narrowTree(orphaned, asking({ query: 'shed' }));

    expect(ids(narrowed.visibleIds)).toEqual(['x']);
  });

  it('terminates on a parent cycle instead of walking it forever', () => {
    // `toTree` leaves both rows of a cycle out of the tree, so the table
    // cannot hand one over today. This is pure and takes the list it is given:
    // a hang here would be a frozen tab, which is worse than any wrong answer.
    const looped = [row('p', 'q', 'Plaster'), row('q', 'p', 'Prime')];

    const narrowed = narrowTree(looped, asking({ query: 'plaster' }));

    expect(ids(narrowed.visibleIds)).toEqual(['p', 'q']);
    expect(ids(narrowed.matchIds)).toEqual(['p']);
  });

  it('counts one row once when it is both an ancestor and a descendant of a match', () => {
    // `a1` is kept as `a11`'s ancestor and again as matched `a`'s descendant.
    const narrowed = narrowTree(PLAN, asking({ query: 'walls' }));

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2']);
  });
});

describe('narrowTree — the facets', () => {
  it('keeps a facet match’s ancestors, and not its subtree', () => {
    // R10 §4, Dany 2026-08-17: `Kitchen` means the kitchen branch, and
    // `team = Platform` does not mean everything under a row Platform happens
    // to be labelled with. `a` matched; `a1`, `a11` and `a2` are not
    // Platform's and go, while nothing above `a` is dropped.
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['platform'] }));

    expect(ids(narrowed.visibleIds)).toEqual(['a']);
    expect(ids(narrowed.matchIds)).toEqual(['a']);
  });

  it('keeps the ancestors that place a facet match deep in the tree', () => {
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['payments'] }));

    // `a11` is Payments'; `a` and `a1` are the rows that place it, and neither
    // is marked.
    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11', 'b']);
    expect(ids(narrowed.matchIds)).toEqual(['a11', 'b']);
  });

  it('takes any of the values ticked within one facet', () => {
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['platform', 'payments'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a', 'a11', 'b']);
  });

  it('takes only the rows answering every facet ticked', () => {
    // Across facets it is AND: `b` is Payments' but has no assignee, `b1` has
    // Ada but no team of its own.
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['payments'], assigneeIds: ['bo'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a11']);
  });

  it('finds a person on any of a row’s phases', () => {
    const narrowed = narrowTree(FACETED, asking({ assigneeIds: ['ada'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a', 'b1']);
  });

  it('finds a band by what the ladder calls it', () => {
    const narrowed = narrowTree(FACETED, asking({ priorityBands: ['High'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a']);
  });

  it('never matches an unprioritised row on a band', () => {
    // A row nobody has prioritised carries no band, and a filter that swept it
    // into one would put a word on screen the plan never said.
    const narrowed = narrowTree(FACETED, asking({ priorityBands: ['High', 'Low'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a', 'a2']);
  });

  it('finds the rows carrying an estimate for a phase', () => {
    const narrowed = narrowTree(FACETED, asking({ estimatedRoleIds: ['qa'] }));

    expect(ids(narrowed.matchIds)).toEqual(['b']);
  });

  it('finds the leaves the readiness badge counts', () => {
    const narrowed = narrowTree(FACETED, asking({ unestimated: true }));

    expect(ids(narrowed.matchIds)).toEqual(['a1', 'b1']);
    // `a` is `a1`'s ancestor and `b` is `b1`'s: both stay as context.
    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'b', 'b1']);
  });

  it('finds the rows with work on the critical path', () => {
    const narrowed = narrowTree(FACETED, asking({ critical: true }));

    expect(ids(narrowed.matchIds)).toEqual(['a', 'b1']);
  });

  it('hides everything when no row answers a facet', () => {
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['nobody-else'] }));

    expect(ids(narrowed.visibleIds)).toEqual([]);
    expect(narrowed.expandedOverlay).toEqual({});
  });

  it('opens every kept row under a facet too', () => {
    const narrowed = narrowTree(FACETED, asking({ teamIds: ['payments'] }));

    expect(narrowed.expandedOverlay).toEqual({ a: true, a1: true, a11: true, b: true });
  });
});

describe('narrowTree — a name and a facet together', () => {
  it('takes only the rows answering both', () => {
    // `Strip the walls` matches the name and is Platform's; `Paint` is
    // Payments' and does not match the name.
    const narrowed = narrowTree(FACETED, asking({ query: 'a', teamIds: ['platform'] }));

    expect(ids(narrowed.matchIds)).toEqual(['a']);
  });

  it('stops bringing the subtree the name alone would have brought', () => {
    // The one semantic split inside this function, and the case it exists for
    // (R10 §8.4): the same query with no facet beside it keeps all four rows
    // of the branch, and one tick turns the filter into a per-row question.
    const named = narrowTree(FACETED, asking({ query: 'strip the' }));
    expect(ids(named.visibleIds)).toEqual(['a', 'a1', 'a11', 'a2']);

    const narrowed = narrowTree(FACETED, asking({ query: 'strip the', teamIds: ['platform'] }));

    expect(ids(narrowed.visibleIds)).toEqual(['a']);
    expect(ids(narrowed.matchIds)).toEqual(['a']);
  });

  it('still keeps the ancestors of a row that answers both', () => {
    const narrowed = narrowTree(FACETED, asking({ query: 'back', teamIds: ['payments'] }));

    expect(ids(narrowed.visibleIds)).toEqual(['a', 'a1', 'a11']);
    expect(ids(narrowed.matchIds)).toEqual(['a11']);
  });
});
