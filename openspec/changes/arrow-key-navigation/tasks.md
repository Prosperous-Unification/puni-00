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
- [ ] 3.2 Exercise it on dev.
