<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. One ink for the pointed row, whichever face pointed it

- [x] 1.1 The `<tr>`'s `data-row-lit` is written from `pointedAt` rather than
      from `pointedFromChart`, so the row the pointer is resting on here carries
      the row light like one pointed from the chart. The banded-hover rule's
      `:not([data-row-lit])` then declines to match it, which is what takes the
      stripe out of the colour — the CSS needs no edit at all.
      **This is `linked-row-hover`'s R5 fault, on purpose.** Writing
      `data-row-lit` on every hovered row is exactly what broke the stripe under
      the pointer in 2026-08-14; the stripe moving under the pointer is the
      thing Dany has now asked to stop.
      Test: `wbs-table.test.tsx` — `lights the row the pointer is resting on`.
      Negative: `data-row-lit` put back to `pointedFromChart`; watched failing
      on the hovered row carrying no attribute.
- [x] 1.2 A browser says the colour no longer depends on the stripe: a banded
      row and an unbanded one, each pointed in turn, painted the **same**
      colour. jsdom cannot make this claim — it lays nothing out and computes no
      cascade — and `hover-cards.spec.ts` is where the 2026-08-14 measurement of
      the opposite lives.
      Test: `e2e/hover-cards.spec.ts` — `a pointed row is one colour, banded or
not`.
      Negative: `data-row-lit` put back to `pointedFromChart`; watched failing
      on the two colours differing.

## 2. A chart row's whole line points it

- [x] 2.1 The chart SVG's root carries `onPointerMove`, which maps the pointer's
      client point through the SVG's own `getScreenCTM().inverse()` into user
      space — where the contract is _days by rows_ — and points
      `Math.floor(userY)`.
      **On the root and not a per-row hit rect**, because the chart draws the
      weekend columns, today's tint and every gridline _after_ the bands, none
      of them `pointer-events: none`: a hit rect low in the document would be
      covered by them in stripes, and one placed high would take the bars' own
      hover away. A root listener is under all of it by construction, and needs
      no z-order to be right.
      Reading the row from the SVG's own matrix rather than from `ROW_PX`: the
      matrix is what the browser actually laid out, and a second arithmetic
      path is a second thing to be wrong.
      Test: `gantt-panel.test.tsx` — `points the row the pointer is on, bar or
no bar`.
      Negative: the `onPointerMove` removed; watched failing on nothing pointed.
- [x] 2.2 The SVG root's `onPointerLeave` clears the pointed row. The row lines
      deliberately carry **no** `onPointerOut`: a caret or a dependency link on
      the same row is drawn over the line and is not a departure from the row,
      so clearing there would blink the light off under the mark the reader is
      looking at. Leaving the drawing is the one thing that means "no row".
      Test: `wbs-table.test.tsx` — `clears when the pointer leaves the chart`.
      Negative: the root's `onPointerLeave` removed; watched failing on the row
      still lit after the pointer has gone.

### One range check not written, and why

A row index past the last row would point nothing, and a guard for it would be a
check that cannot fail: `pointRow` already goes through `rowIdAt`, which returns
`undefined` for an index the chart holds no label for and reports nothing rather
than clearing. The lines are also drawn from `chart.labels` itself, so there is
no index to be out of range. `AGENTS.md`: write the negative before you believe
the line.

- [x] 2.3 A bar's own hover is untouched: it still points its row and still
      opens its surface after the wait. The root's move fires for the same row,
      so the two agree rather than fight.
      Test: `gantt-panel.test.tsx` — the existing bar-hover cases, unchanged.
- [x] 2.4 A browser says the empty part of a row points it, and that no bar
      surface opens there.
      Test: `e2e/hover-cards.spec.ts` — `the empty part of a Gantt row lights
it`.
      Negative: the `onPointerMove` removed; watched failing.

## 3. The checks that said the opposite

- [x] 3.1 `linked-row-hover`'s `an alternating row still moves under the pointer`
      and its jsdom half asserted the behaviour this change reverses. They are
      **rewritten**, not deleted: the claim becomes that the two rows land on
      the same colour, which is the new contract and is just as breakable.
- [x] 3.2 `hovering a table row lights its Gantt label and band, and not itself`
      becomes `and itself`. The scenario is in the delta spec.

## 4. Words

- [x] 4.1 `CONTEXT.md`'s **Pointed row** entry says the light is one ink on both
      faces and that a chart row's whole line points it. `wbs-table.tsx`'s
      `data-row-lit` JSDoc and `styles.css`'s banded-hover comment carry why the
      2026-08-14 rule was reversed, with Dany's words.

## 5. Gate

- [x] 5.1 fe-01's jsdom suite, the whole browser gate on shifted ports, lint,
      typecheck, format, `openspec validate --all`. Results and the
      failure-proof table in `verify.md`.
