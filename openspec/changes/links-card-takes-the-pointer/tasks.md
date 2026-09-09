<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The card takes the pointer

- [x] 1.1 `HoverCard` gains `takesPointer`, and `ExternalRefsCard` passes it and drops its
      per-line `pointer-events: auto`.
      Test: `e2e/external-refs.spec.ts` — `the pointer walks onto the card and follows a link`
      walks straight down the cell's column with `{ steps: 12 }` and asserts both that the card
      is still there and that `elementFromPoint` in its padding is inside it.
      Negative: `takesPointer` removed; watched failing on `the card closed on the way down to
it`.

## 2. Held long enough to reach

- [x] 2.1 The links cell holds an open card for `CARD_GRACE_MS` after `mouseleave`, cancelled
      by the wrapper's `mouseenter` — which is what fires when the pointer arrives on the card,
      having crossed the Name cell to get there. The late clear goes through the same same-cell
      guard every writer here uses, so a timer that fires after another cell is armed is a
      no-op.
      Test: the same browser case's second half — a 15-step diagonal to the right-hand end of
      the card's second line, with the target asserted to be well right of the cell first, or
      the reach is not a reach.
      Negative: `CARD_GRACE_MS` set to 0; watched failing on `the card closed on a diagonal
reach for a link`.
- [x] 2.2 `plan-cells.test.tsx`'s lift case reads the hold in jsdom: the cell stays on
      `POPOVER_ROW_LAYER` immediately after the leave, and drops back once the grace is out.
      Read immediately, which is the window the fault lives in — a `waitFor` there is satisfied
      by its own first sample either way.

## 3. Gate

- [x] 3.1 `fe-01:test`, then the whole browser gate on the shifted ports.
- [x] 3.2 R5 #23 recorded in `AGENTS.md`, tally 22 → 23.
