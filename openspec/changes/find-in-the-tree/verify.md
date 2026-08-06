# Verification

## The gate, uncached

```
$ bunx nx format:write --all
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx vitest run            # in apps/fe-01, for the count
Test Files  17 passed (17)
     Tests  357 passed (357)      # 331 before: +11 tree-search, +15 wbs-table

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
"totals": { "items": 28, "passed": 28, "failed": 0 }
```

## The checks, and the faults that broke them

| Check                                         | Fault injected                                       | What the run reported                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ancestors are kept (`tree-search.ts`)         | the ancestor walk deleted                            | 10 failed: `keeps the rows that place a match deep in the tree`, `opens every kept row…`, `hides a row that neither matches nor sits on a match’s line`, and 7 table tests — `Back boxes` shown as a root |
| Clearing restores the reader's expansion      | the overlay committed into `expanded` on Escape      | `clearing the search puts the reader’s own collapse back` failed with the whole plan open                                                                                                                 |
| The expansion is saved (`wbs-table.tsx`)      | `rememberExpansion` call dropped from the effect     | `remembers a collapsed branch across a remount` failed with the branch open, and `drops a remembered expansion that is not one` failed with the hand-edited value still in storage                        |
| A match is revealed out of a collapsed branch | `state: { expanded }` — the search's overlay dropped | `reveals a match inside a branch the reader had closed` failed with the hit counted and hidden; `clearing the search…` failed too                                                                         |
| No match hides everything (`tree-search.ts`)  | a fall-back to every row when `matchIds` is empty    | `hides everything when nothing matches, rather than showing everything`, `shows an empty table and says so when nothing matches` and `re-derives from the rows that came back…` failed                    |
| The match itself is marked                    | `matched` hard-coded false in the Name cell          | `marks the row that matched…` and `shows the whole subtree under a matched parent` failed                                                                                                                 |

Every fault was applied to the production path, watched failing, and reverted;
each has a `Proof:` comment beside the code it broke.

## What was read rather than assumed

TanStack's expansion semantics, from the vendored source
(`node_modules/@tanstack/table-core/src`), because the whole change rests on
them:

- `getExpandedRowModel` returns the **unexpanded** model when the state is `{}`
  (or any empty record) and the flattened one when it is `true` or a non-empty
  record. `paginateExpandedRows` defaults to `true`, which is what makes
  `expandRows` run at all.
- `row.getIsExpanded()` is `expanded === true || expanded?.[row.id]`, so an
  **absent key is closed**. That is the rule a row created since the save
  arrives under, and it is stated in the JSDoc and the proposal rather than
  worked around.

Both are also observed rather than only read: `collapses every branch and opens
them all again` drives `{}` and `true` through the real component.

## What is not watched here

- **Whether the tint reads as a mark.** jsdom has no layout and no colour; the
  test asserts the Name cell of a hit has a background and the cells around it
  do not. Whether `#fff3bf` is the right yellow is Dany's screen.
- **The real `localStorage`.** `vitest.setup.ts` installs an in-memory stand-in
  because jsdom 24 under Bun has none. The contract is the same one browsers
  give, but a quota-exceeded `setItem` — a browser in private mode, or a store
  full of other sites' data — throws and is **not** modelled: it would take the
  table down with it. Named as a gap rather than caught, because a swallowed
  write is exactly the log-and-continue R5 bans; the honest fix is a decision
  about degradation, and it is not this change.
- **Focus while searching.** The readiness walk can aim at a row the search is
  hiding; the effect then finds no cell and leaves the focus alone. Reasoned
  from the code and the existing "a cell that is not there is left alone" test,
  not driven end to end.
- **Dev.** Not deployed; the tree is left dirty for review.
