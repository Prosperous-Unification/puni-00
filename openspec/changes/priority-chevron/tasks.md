<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The five shapes

- [x] 1.1 `priority-chevron.tsx` holds one shape per rank — a double chevron up,
      a single up, a bar, a single down, a double down — keyed on **rank**
      exactly as the inks are, because a rung is renameable. Tests:
      `priority-chevron.test.tsx` `gives each of the five rungs its own drawing,
not just its own name` and `points up above the ordinary rung and down
below it, doubled at the ends`. Negatives: every entry of `GLYPH_POINTS` set to
      one polyline, watched failing on `expected 1 to be 5` **with the
      five-names line still green** — that is the vacuity the geometry assertion
      exists for; and `GLYPH_SHAPES` reversed, watched failing on `expected [
Array(5) ] to deeply equal [ 'up-double', 'up', 'level', …(2) ]`.
- [x] 1.2 The set covers the ladder and no more (`PRIORITY_GLYPH_COUNT` against
      `PRIORITY_BAND_COUNT`), and a rank outside it draws nothing rather than
      throwing in a render.

## 2. In the cell

- [x] 2.1 `PriorityCell` draws the glyph out of the flow on the leading edge and
      reserves `PRIORITY_GLYPH_ROOM_PX` of `padding-left` for it — whether or not
      a glyph is drawn, so a clear does not shift the column. Nothing is drawn
      for a work item nobody has prioritised. Test:
      `e2e/priority-ramp.spec.ts` `leaves an unprioritised row's cell blank`;
      negative: `paint !== null &&` dropped, watched failing on `Expected: 0 ·
Received: 1` — every unprioritised row grows rank 0's double chevron.
- [x] 2.2 The glyph takes no pointer. Test: `is drawn beside the number and does
not swallow the cell's click`, which measures the glyph's 8×8 box **first**
      so the click is aimed inside it — without that the case passes with the
      glyph deleted. Negative: `pointerEvents: 'none'` deleted, watched failing
      on `a click on the glyph did not reach the cell underneath it`.

## 3. The column does not grow

- [x] 3.1 `shares the 48px column with the widest priority anybody can type`
      types `9999` and measures both the column's width and the box's overflow.
      **It failed on the first shipped glyph** — a 2px gap put 10px on the
      leading edge and the digits clipped by 1px — so the gap went rather than
      the column growing. `PRIORITY_GLYPH_ROOM_PX` and `table-frame.ts` both
      carry the measurement.

## 4. Gate

- [x] 4.1 fe-01's jsdom suite, the whole browser gate, lint, typecheck, format.
      Results in `verify.md`.
