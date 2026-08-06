# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   605 pass  0 fail
      fe-01 (vitest)                         106 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/arrow-key-navigation
Totals: 7 passed, 0 failed (7 items)
```

## Every check, and the fault that broke it

| Check                                                    | Fault injected                                                           | What the run reported                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Left and Right defer to the caret (`cell-navigation.ts`) | the `atStart`/`atEnd` condition deleted                                  | only `leaves the key alone when the caret has somewhere to go` failed — every mid-word arrow left the cell                           |
| A selection keeps the key (`cell-navigation.ts`)         | the `hasSelection` refusal deleted                                       | only `leaves the key alone when something is selected` failed                                                                        |
| Focus does not wrap at the ends (`cell-navigation.ts`)   | the row lookup made to fall back to `rowIds[0]`                          | `stays put past the last row` and `stays put above the first row` both failed                                                        |
| The grid is the rows on screen (`wbs-table.tsx`)         | `rowIds` taken from `flat` (the whole tree) instead of the rendered rows | only `skips the children of a collapsed branch` failed, landing focus on a row nobody could see                                      |
| The key is taken only when focus moves (`wbs-table.tsx`) | `preventDefault()` called on the no-move path too                        | `leaves the caret alone in the middle of a word` and `takes the key only when it is moving the focus` both failed                    |
| Every editable cell navigates (`wbs-table.tsx`)          | the handler removed from the notes cell                                  | `navigates from every editable cell` failed — the original tests moved only from the name and from Dev optimistic, and survived this |
| An arriving cell is not selected (`wbs-table.tsx`)       | `setSelectionRange` replaced with `next.select()` again                  | `arrives with a collapsed caret, not a selection` failed                                                                             |
| Read-only cells are not stops (`wbs-table.tsx`)          | the selector relaxed to `[data-cell]`                                    | `never stops on a parent's rolled-up figures` failed, landing focus on a sum                                                         |
| An IME composition keeps its keys (`cell-navigation.ts`) | the composing/modifier refusal deleted                                   | `leaves an IME composition to the input` and `leaves a modified arrow to the browser` both failed                                    |

## Cross review, 2026-08-06 (codex + agy)

**Six findings, all real, all fixed.** Each reviewer found two the other did not.

The one that mattered most was mine and was new: arriving cells were **selected**,
and a full selection reads as `hasSelection` — which is the rule that keeps
Shift+Arrow out of the grid. So the next press in the same direction did nothing,
and crossing a row of populated cells took twice the keypresses. agy found it by
following the caret state through two calls. The caret now lands on the edge the
travel came from, which is why `nextCell` returns a position and not just a cell.

The others: an IME composition had its Up and Down taken, which moves focus out
of a half-written word and commits it (codex); a parent's read-only roll-up
figures were navigation stops, which is the same dead keypress the derived number
column was excluded for (both); `grid.current` was assigned during render, so a
render React had not committed — or might abandon — could publish rows the DOM did
not have (both). The grid is now read from the committed DOM at the moment the key
arrives, which removes the ref, the render mutation and the read-only cells in one
go. And "every editable cell navigates" was not a breakable claim (codex): the
tests moved from the name and from Dev optimistic only, so removing the handler
from notes left them green. It is table-driven across every editable column now.

One finding is **recorded rather than fixed**: the inputs carry a `key` that
includes their value, so a peer's edit to a field you are typing in unmounts it
and drops focus to the body (agy). That is the `defaultValue`-plus-`key` idiom
doing what it is for — showing the server's truth — and changing it is a change to
how the table reconciles, not to how the arrow keys work. It is in `LLM_README.md`
as an open finding instead of being half-fixed here.

`nextCell` returning `null` for a cell the grid no longer holds was queried
against R5's "unknown is not OK — throw" (agy). It stands, and the comment now
says why properly: a row removed between the render and the keypress is a modeled
condition, and the modeled response is to let the browser have the key. Throwing
would take the table down over someone else's delete.

## Two injected faults that did **not** fail anything

Recorded rather than quietly dropped, because a proof that survives its own
fault is the thing `AGENTS.md` R5 is about — and one of these was claimed in
`tasks.md` before it was tried.

**Adding `number` to the column list changed nothing** — and that list no longer
exists. The grid comes from `[data-cell]:not([readonly])` in the DOM, so the
number column is excluded by not being tagged rather than by being left off a
list, and there is now exactly one statement of the fact instead of two.

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
