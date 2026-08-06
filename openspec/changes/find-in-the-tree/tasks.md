## 1. The narrowing, pure

- [x] 1.1 Failing tests first in `tree-search.test.ts`: empty query keeps every
      row and asks for no overlay; a whitespace query is not a search; a leaf
      match keeps its ancestors; a matched parent keeps its subtree; the
      overlay opens every kept row; case-insensitive; unrelated rows go; no
      match keeps nothing; a row whose parent is not in the list; a parent
      cycle terminates.
- [x] 1.2 `tree-search.ts`: `searchTree(rows, query)` →
      `{ visibleIds, matchIds, expandedOverlay }`, overlay `null` while there
      is no query. **Negative test:** ancestor walk removed — 3 tests here and
      7 in the table failed, watched.
- [x] 1.3 **Negative test:** no-match falling back to every row — the
      empty-answer test here and 2 table tests failed, watched.

## 2. The expansion, remembered

- [x] 2.1 `wbs.expanded.<projectId>` read into the initial state; saved by the
      one effect that also swaps the state when the project changes, so a save
      cannot pair one project's expansion with another's key.
- [x] 2.2 A stored value that is not `true` or a record of booleans is dropped
      with its key. New rows arrive collapsed under a record — TanStack's own
      rule, verified against `getExpandedRowModel`, written down in the JSDoc
      and the proposal.
- [x] 2.3 Collapse all (`{}`) and Expand all (`true`) in the toolbar.
- [x] 2.4 **Negative test:** the save removed — the remount test and the
      dropped-value test both failed, watched.

## 3. Find, in the table

- [x] 3.1 Failing tests in `wbs-table.test.tsx`: ancestors kept; a match
      revealed out of a collapsed branch; the match marked and its context not;
      a matched parent's subtree; the empty state and its sentence; the count
      line; Escape clearing and the reader's collapse surviving; the triangles
      and buttons standing down; the box outside the grid; the arrows walking
      the visible subset; a renamed row leaving the match set; collapse/expand
      all; persistence across a remount and across projects.
- [x] 3.2 Implement: `search` derived per render from `flat` and the query, the
      overlay handed to TanStack in place of the reader's expansion, the row
      model filtered by `visibleIds`, the mark read through `live` so `columns`
      keeps its `[roles, unfoldedRoles]` dependency list.
- [x] 3.3 **Negative test:** the overlay dropped from the table's state — the
      reveal test failed; the overlay committed into `expanded` on Escape — the
      restore test failed; the mark hard-coded false — 2 tests failed. All
      watched.
- [x] 3.4 `beforeEach(localStorage.clear)` in `wbs-table.test.tsx`: without it
      one test's collapsing is the next test's starting shape.

## 4. Words and the gate

- [x] 4.1 `CONTEXT.md`: Search, Match, Expansion.
- [x] 4.2 Format, the run-many gate uncached, `openspec validate --all` — in
      `verify.md`, with the fault table.
- [ ] 4.3 Deploy to dev; Dany looks. **Not done here** — the tree is left dirty
      for the orchestrator's review, and dev deploys from a pushed commit.
