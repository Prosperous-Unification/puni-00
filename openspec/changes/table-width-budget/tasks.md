<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The boundary nobody had watched

- [x] 1.1 `e2e/layout.spec.ts` grows the case
      `holds the folded budget at 1280, and says where it stops`: a plan taken
      from one folded phase to three in one browser, at
      1280×800, reading `scrollWidth`/`clientWidth` off the frame and both
      declarations off the `<table>` at each step. Asserts one and two fit, three
      scrolls, the pinned columns hold the left edge once it does, and that the
      `width` is the **cap** while the `min-width` is the floor. The three
      figures are re-derived through `foldedTableMinWidth` rather than written
      out, so a column that changes width changes the test in the same commit.
      **Negatives, both watched:** `FLEXIBLE_CAP` swapped for `FLEXIBLE_FLOOR` in
      `tableWidthStyle`'s `width` arm — the shape the report's misreading would
      be true under — and the `in-parallel` column widened to the 48px C0
      measured, which is the fault the P2 alleged. R5 rows 1 and 2.

## 2. The cell that is a cell

- [x] 2.1 The Depends on cell's own `mouseenter`/`mouseleave` move from the
      wrapper `<span>` onto the `<td>`. `wbs-table.test.tsx` grows
      `takes the pointer on the cell itself, not on a wrapper inside it`, and
      the four cases beside it move with it: their `hoverTargetOf` now finds the
      `<td>`. **Negative:** the handlers put back on the wrapper, watched
      failing — all six together. R5 row 3.
- [x] 2.2 `e2e/deps-cell.spec.ts` grows the case
      `lights the whole set from a crowded cell at its default width`: two pills
      at the resolved 110px, a real pointer put
      on the cell's own padding, `[data-dep-lit]` read off the `<tr>`s. This is
      the one a browser has to answer: whether a point in the cell is covered by
      a pill is a layout fact and jsdom lays nothing out (R5 #14–16).
      **Negative:** the handlers back on the wrapper, watched failing with no row
      lit. R5 row 4.
- [x] 2.3 The pill's narrower reading is unchanged — asserted in the same
      browser run rather than assumed, because the move is only safe if
      `mouseenter`'s outermost-first order really holds through React.
      `narrows to one pill when the pointer settles on it, from the cell`.
      **Negative:** the pill's `onMouseEnter` deleted, watched failing.
      R5 row 5.

## 3. The sentence that counts

- [x] 3.1 `phases-dialog.tsx`'s width sentence agrees in number with its own
      count. `phases-dialog.test.tsx`'s `counts one phase as one` rewritten to
      assert the **whole** sentence rather than a prefix that swept the verb up
      with the noun, plus `counts more than one phase as several`.
      **Negatives, both watched:** the singular arm restored (`need` for one),
      and the plural arm made to say `needs` for two — so the fix cannot be
      "never say `need`". R5 rows 6 and 7.

## 4. The record

- [x] 4.1 `specs/wbs-domain/spec.md`: the table-layout requirement MODIFIED with
      the two-declarations sentence and the three boundary scenarios; the
      dependency-hover requirement MODIFIED to say the cell is the whole cell;
      one ADDED requirement for the counted sentence.
- [x] 4.2 `verify.md`: the gate, the CI run, the failure-proof table, and the
      three findings written against what was measured rather than against what
      was reported — including the depth-5 number, which is recorded and not
      fixed, with the cost of each candidate fix attached.
