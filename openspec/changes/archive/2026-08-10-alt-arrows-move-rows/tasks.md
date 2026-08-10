## 1. The four keys

- [x] 1.1 `onAltMove` on the cells that already route their own keys — name,
      estimate boxes, the folded trio cell, notes. Alt+Up/Down swap with a
      sibling through `api.move` with ids from `siblingsOf`; Alt+Left/Right
      reuse `outdent` and `indent`. `preventDefault` for every arrow the grid
      owns; Ctrl, Meta and an IME composition are left alone.
      **Tests:** the two sibling swaps, the indent from mid-text, the outdent
      from an estimate box.
- [x] 1.2 Edges are no-ops decided before the request: first sibling up, last
      sibling down, root outdent, first-sibling indent.
      **Negative test:** the two "moves nothing" tests watch `api.move` go
      uncalled, and both fail when the edge check wraps to the other end of
      the group.
- [x] 1.3 The key is taken from the browser even when nothing moves.
      **Negative test:** every test in the block asserts `keyDown` returns
      false; nine of them fail with the `preventDefault` removed.

## 2. Where the focus lands

- [x] 2.1 `focusNext` carries a cell — row and column — instead of a row id.
      The Name cell claims its own arrival at attach; every other column is
      focused from the committed DOM by an effect once the tree lands.
      `indent` and `outdent` take the column to land on, defaulting to the
      name so Tab, Enter and Backspace are unchanged.
      **Negative tests:** both "lands in the same column" tests fail with the
      column hard-coded to the name — the Name cell takes the focus — and
      again with the effect's `focus()` removed, when it stays on the body.

## 3. Refusals and repetition

- [x] 3.1 A frozen row refuses locally, in the drag's own sentence.
      **Negative test:** the frozen test watches `api.move` go uncalled and
      the message shown; it fails with the check dropped.
- [x] 3.2 Alt+arrows are dropped while `busy`.
      **Negative test:** the held-key test fails with the busy check removed —
      two moves asked for instead of one.

## 4. The boundary this does not cross

- [x] 4.1 The dependency picker's own Alt+arrows still move its highlight and
      move no rows. **Test:** the picker test.
- [x] 4.2 The existing arrow suite stays green, and the modified-arrow test
      narrows to Ctrl and Meta — Alt is the grid's now, which is the change.
      A plain arrow is still navigation, which has its own test here.

## 5. Gate

- [x] 5.1 `format:check --all`, the run-many gate uncached, and
      `openspec validate --all --json` — recorded in `verify.md` with the
      failure-proof table.
