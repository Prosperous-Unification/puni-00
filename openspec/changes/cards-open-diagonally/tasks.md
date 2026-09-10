<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. One placement for every in-cell card

- [x] 1.1 The in-cell branch of `HoverCard` is unconditional: past the cell (`sidewaysPlacement`
      picks the side), past the row (measured, because `100%` is the cell's wrapper and a wrapper
      is a line box inside a row), `width: max-content` against the measured room beside.
      `opensSideways`, `leavesItsRowClear`, `roomForCard` and `CardRoom` are deleted with the
      placements they served.
      Test: `e2e/card-lanes.spec.ts` — every lane asserts the card clears its own row, on top of
      the column claims it already made.
      Negative: the row offset replaced by `top: 0`; watched failing on `Start: the card covers
its own row · Expected: >= 174.1875 · Received: 150`.

## 2. The reach

- [x] 2.1 The **store** holds a cell's card for {@link REACH_FOR_THE_CARD_MS} after the pointer
      leaves (`holdHovered`), and every write cancels it — so a cell that opens its own card
      kills the previous cell's hold without knowing it exists. `cancelHold` is the one arrival
      that is not a write: the pointer landing on the card itself, which must not re-open a card
      the marker alone may open.
      The first cut put the timer in the cells and the dependency card died to a hold started
      before the pointer came back: `the tint moves the same way on both surfaces` waited 120s
      for `locator('[role="tooltip"]')`.
      Negative for the cancel: `cancelHold` made a no-op; watched failing on `the card closed
while walking to item 2`.
      Test: `e2e/hover-cards.spec.ts` — `is still there after a flick of the hand towards it`,
      **in steps**: a single `mouse.move` lands on the card, which is a DOM child of the cell, so
      no `mouseleave` fires at all and the teleport passes over the fault (R5 #23, third time).
      Negative: the reach set to 0; watched failing on `the preview did not survive the reach ·
Expected: 1 · Received: 0`, and on `e2e/external-refs.spec.ts`'s `the card closed on the way over
to it`.
- [x] 2.2 Three jsdom cases that read the frame the pointer left on now wait for the hold:
      `keeps the preview open while the pointer crosses the cell to reach it`, `lifts the hovered
row above the pinned cells the preview opens over`, `lifts the links cell over the pinned layer
while its card is open`, and the dependency bridge's `keeps the card mounted across passive
padding`. The lights still go at once; only the card waits.

## 3. The written notes, beside the box

- [x] 3.1 `RenderedNotes` is lifted out of `HoverPreview` so the panel and the card are one
      rendering rather than two that drift.
- [x] 3.2 `WrittenNotesPanel` listens to the Name box's own `focus`, `input` and `blur` and holds
      the text **itself**. Held one level up it re-renders the cell — and the uncontrolled box —
      on every keystroke: `plan-row-render-cost.test.tsx` went red on `expected 1 to be +0`, and
      `a chord waits for the blur's patch that is still out` on a re-render inside the blur
      putting the old text back in the box.
      Test: `e2e/hover-cards.spec.ts` — `the open editor shows the same rendering beside it`.
      Negative: the panel's `focus`/`input` listeners dropped; watched failing on `waiting for
getByLabel('Notes for 010, rendered while writing')`.

## 4. Gate

- [x] 4.1 jsdom in three shards, then the whole browser gate in four.
