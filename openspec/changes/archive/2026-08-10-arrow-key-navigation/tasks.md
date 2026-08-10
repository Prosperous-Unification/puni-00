## 1. The move, as a pure function

- [x] 1.1 Failing tests in `apps/fe-01/src/components/wbs/cell-navigation.test.ts` for `nextCell`: down a column, up a column, right along a row, left along a row.
- [x] 1.2 Failing tests for the edges: the last row, the first row, the last column, the first column — all of them stay put rather than wrapping.
- [x] 1.3 **Negative test:** Left with the caret mid-value, and Right with a selection, return `null` so the browser keeps the key. Watch it fail with the caret conditions removed.
- [x] 1.4 **Negative test:** a row list that excludes a collapsed branch's children moves to the next visible row. Watch it fail with the function reading the whole tree instead of what it was given.
- [x] 1.5 Implement `cell-navigation.ts`. No React, no DOM, no event.

## 2. The table

- [x] 2.1 Failing tests in `wbs-table.test.tsx`: Down from a name focuses the next row's name; Right from the end of a name focuses the first estimate; Left mid-word moves nothing.
- [x] 2.2 Give every editable input `data-cell`, and route the arrow keys through one handler read from the `live` ref.
- [x] 2.3 **There is no negative test to have here, and `verify.md` says so.** Adding `onArrowKey` to the `columns` dependency list breaks nothing: it is a `useCallback` with no dependencies, so its identity never changes. The landmine is about _unstable_ callbacks, and the one that broke it keeps its own passing injection in `drag-to-reorder/verify.md`. Claimed before it was tried; corrected rather than invented.

## 3. Gate and verification

- [x] 3.1 `verify.md`: the uncached gate and the failure-proof table.
- [x] 3.2 Deployed to dev at `75fb3a7` and the deployment verified healthy — app shell 200, be-01 and gw-01 `/health` 200 with the new dependency probes, and the resume-and-reconnect socket check still passing end to end. **The arrow keys themselves were not exercised in a real browser**, which `verify.md` says under what this does not cover: nobody has watched a real caret cross a real cell.

## 4. Cross review, 2026-08-06 (codex + agy)

Six findings, all real, all fixed; each reviewer found two the other did not.
Recorded in full in `verify.md`.

- [x] 4.1 **Arriving cells were selected**, and a full selection reads as `hasSelection` — the rule that keeps Shift+Arrow out of the grid — so the next press in the same direction did nothing and crossing a row took twice the keys (agy, high). The caret lands on the edge the travel came from; `nextCell` returns a position, not just a cell.
- [x] 4.2 **An IME composition had its Up and Down taken** (codex, high), which moves focus out of a half-written word and commits it. Modified arrows are left alone for the same reason.
- [x] 4.3 **`grid.current` was assigned during render** (both), so a render React had not committed — or might abandon — could publish rows the DOM did not have. The grid is read from the committed DOM when the key arrives.
- [x] 4.4 **A parent's read-only roll-up figures were stops** (both) — the same dead keypress the derived number column was excluded for. `[data-cell]:not([readonly])` is now the whole definition, so the exclusion is stated once instead of twice.
- [x] 4.5 **"Every editable cell navigates" was not breakable** (codex): the tests moved from the name and Dev optimistic only, so removing the handler from notes left them green. Table-driven across every editable column now.
- [x] 4.6 **`nextCell` returning `null` for a missing cell was queried against R5's "throw on unknown"** (agy). It stands, and the comment says why properly: a row removed between the render and the keypress is a modeled condition, and letting the browser have the key is the modeled response. Throwing would take the table down over someone else's delete.
- [x] 4.7 **Not fixed, recorded:** a cell input's `key` holds its value, so a peer's edit to a field you are typing in unmounts it and drops focus to the body (agy). That is how the table reconciles, not how the arrow keys work. It is an open finding in `LLM_README.md`.
