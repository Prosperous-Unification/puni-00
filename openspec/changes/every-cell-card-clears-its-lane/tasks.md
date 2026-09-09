<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Measure every column first

- [x] 1.1 A throwaway probe walked all seven columns in Chromium and reported, per column, what
      `elementFromPoint` answers at the next row's trigger and which card is open after the
      walk. Two columns failed: the notes preview and Depends on. The probe was deleted once
      `e2e/card-lanes.spec.ts` said the same things as assertions.

## 2. The notes preview, at any column width

- [x] 2.1 `clearsMarkerLane` becomes `right: 24px` rather than `left: -24px`, and the `100%`
      width cap that propped the old shape up is deleted with it.
      Test: `e2e/card-lanes.spec.ts` — the `notes preview` lane, in a layout whose Name cell is
      192px.
      Negative: the `left`/cap shape put back; watched failing on `the notes preview: the open
card is over 020's own trigger · Expected: "the row" · Received: "the open card (H1)"`.
- [x] 2.2 `hover-card.test.tsx` reads the declarations the browser cannot: `right: 24px`,
      `left: auto`, and no `100%` in the width.
      Negative: `clearsMarkerLane` off `HoverPreview`; watched failing on `expected '' to be
'24px'`.
- [x] 2.3 `hover-cards.spec.ts`'s `leaves the marker lane clear` keeps its claim in the **wide**
      layout, where both shapes are the same box, with a precondition that holds for the new
      one: the card fills the room its positioned ancestor gives it, but for the lane. Its own
      negative still fails on `Expected: <= 486.40625 · Received: 502`.

## 3. The dependency card

- [x] 3.1 It opens beside its cell.
      Negative: `opensSideways` removed; watched failing on `Depends on: the open card is over
030's own trigger · Received: "the open card (DIV)"`.
- [x] 3.2 The bridge's corridor is the card's own rectangle.
      Negative: the bounding box put back; watched failing in `depends-card.test.tsx` on
      `expected { kind: 'corridor' } to deeply equal { kind: 'outside' }`. The browser cannot
      distinguish this one on its own, so the unit is its proof and this line says so rather
      than claiming a failure nobody saw.
- [x] 3.3 `entersThroughDependsCard` is **deleted**, both call sites with it — the cell's
      `mouseenter` and a chip's. It existed so that an enter landing in the card's passive
      padding, over the Depends on cell (or chip) of the row **beneath**, did not take the card
      over; beside its cell, no Depends on cell but its own is ever under it. Measured before
      deleting: with the guard removed, the only things that failed were its own two proofs,
      both of which describe the geometry it was written for, and both of which were already
      red from the move. Its narrowing (`corridor`/`row` only) was watched failing on `Depends
on: the pointer reached 030 and 030 did not answer · Expected: 1 · Received: 0` on the way to
      finding that out.
- [x] 3.4 Three tests re-aimed or deleted, because their subject moved with the card:
      `deps-cell.spec.ts`'s `holds the card while the pointer crosses its padding over the row
beneath` and `plan-dependencies.test.tsx`'s `leaves the open card alone when the row beneath it
is entered through its padding` are deleted with the guard they proved;
      `hover-cards.spec.ts`'s `travels through passive card space…` now reads the control under
      the card's own padding off the page (`Dev estimate for 030`, four columns right) instead
      of naming the row below's add button. Negative: `takesPointer` added to the card; watched
      failing on `the card's empty space is over nothing clickable · Received string: "What 010
waits for"`.
- [x] 3.5 `hover-cards.spec.ts`'s `paints over the pinned cell of the row below it` is
      **deleted**. Its subject was this card standing over a pinned cell of the row below,
      which the sideways placement removes; re-aimed at the folded step card, its screenshot
      oracle was watched **passing** with `zIndex: 20` deleted (the two shots differ because
      the pointer's own row light moves between them), and the hit test that replaced it found a
      **separate, pre-existing defect** — a folded step card _is_ painted under a pinned cell
      once its column is scrolled under the pinned block. That is recorded as its own finding
      rather than fixed here.

## 4. Gate

- [x] 4.1 `fe-01:test`, then the whole browser gate on the shifted ports.
- [x] 4.2 R5 #25 recorded in `AGENTS.md`: a cap that only holds while the box is above its own
      minimum.
