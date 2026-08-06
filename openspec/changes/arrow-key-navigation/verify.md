# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   605 pass  0 fail
      fe-01 (vitest)                          97 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/arrow-key-navigation
Totals: 7 passed, 0 failed (7 items)
```

## Every check, and the fault that broke it

| Check                                                    | Fault injected                                                           | What the run reported                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Left and Right defer to the caret (`cell-navigation.ts`) | the `atStart`/`atEnd` condition deleted                                  | only `leaves the key alone when the caret has somewhere to go` failed — every mid-word arrow left the cell        |
| A selection keeps the key (`cell-navigation.ts`)         | the `hasSelection` refusal deleted                                       | only `leaves the key alone when something is selected` failed                                                     |
| Focus does not wrap at the ends (`cell-navigation.ts`)   | the row lookup made to fall back to `rowIds[0]`                          | `stays put past the last row` and `stays put above the first row` both failed                                     |
| The grid is the rows on screen (`wbs-table.tsx`)         | `rowIds` taken from `flat` (the whole tree) instead of the rendered rows | only `skips the children of a collapsed branch` failed, landing focus on a row nobody could see                   |
| The key is taken only when focus moves (`wbs-table.tsx`) | `preventDefault()` called on the no-move path too                        | `leaves the caret alone in the middle of a word` and `takes the key only when it is moving the focus` both failed |
| Every editable cell navigates (`wbs-table.tsx`)          | the handler removed from the name cell                                   | two failed, including the row-to-row move                                                                         |

## Two injected faults that did **not** fail anything

Recorded rather than quietly dropped, because a proof that survives its own
fault is the thing `AGENTS.md` R5 is about — and one of these was claimed in
`tasks.md` before it was tried.

**Adding `number` to the column list changed nothing.** There is no
`data-cell` on the number column, so the DOM lookup finds nothing and the focus
stays where it was. The column list and the `data-cell` tagging are two
statements of the same fact and only the second is load-bearing. The spec's
requirement holds either way; the list is documentation, and is now described as
such rather than as the guard.

**Adding `onArrowKey` to the `columns` dependency list changed nothing.** That
list may only contain `roles` — but this handler is a `useCallback` with no
dependencies, so it never changes identity and listing it would be harmless. The
landmine is about _unstable_ callbacks, and the one that broke it (`onKeyDown`,
which reaches the row list) still has its own passing fault injection in
`drag-to-reorder/verify.md`. Task 2.3 claimed a negative test here; there isn't
one to have, and saying so is better than inventing it.

## What this does not cover

- **A real browser's caret.** jsdom does not move a caret for an arrow key, so
  "the browser still gets it" is asserted through `defaultPrevented` rather than
  through where the caret ended up. What is proven is that the key is left
  uncancelled; what is not is what Safari then does with it.
- **Scrolling to a cell that is off screen.** `focus()` scrolls it into view in a
  browser; jsdom has no layout, so nothing here checks it.
- **Right-to-left text.** Left and Right are treated as previous and next column.
- **Screen-reader announcement of the move.** Focus moves and the label goes with
  it, which is the baseline; nothing announces the position in the grid.
