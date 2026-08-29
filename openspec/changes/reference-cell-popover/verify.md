# verify — `reference-cell-popover`

Slices 1–4 implemented and gated. Slice 5's full-gate run is recorded below.
Everything not executed says so.

## What was reported, and what was actually wrong

Dany opened a Tags cell on 2026-08-29 at 22:40 and sent three screenshots: a
picker list hanging over the row below, cut to a sliver; a cell whose `+` and
search box were not in the row at all; and a row two lines tall after a tag
landed in it.

Root-caused in Chromium against the running dev server rather than reasoned
about. `POPOVER_COLUMNS` in `wbs-table.tsx` listed `team` and neither `tag` nor
`service`, though all three render a `CreatablePicker`. Those cells kept
`CELL`'s `overflow: hidden`; the open list is an absolutely positioned child
**inside** the cell, so the cell's content became 94px against a 26px row, and
Chromium scrolled the cell to reveal it:

```
td.scrollTop === 22       // measured, live
strip y = 143             // the strip drawn 21px above
td    y = 164             // the row it belongs to
```

The missing `+` is that scroll, not a missing button. Confirmed by injecting
`td[data-column="tag"] { overflow: visible }` into the live page, after which
the picker drew correctly — `+`, focused box, and a three-line list under it.

The second fault is separate: the wrap that brings a clipped chip back into
reach was in the flow, so the cell grew and the row grew with it.

## What was built

1. `tag` and `service` join `POPOVER_COLUMNS`.
2. `CELL` clips with `overflow: clip` rather than `hidden`. A `hidden` box is a
   scroll container the browser may scroll to reveal a focused or opened
   descendant; a `clip` box has no scrollport at all. This makes the
   displacement impossible in every cell, including columns nobody has exempted
   yet — those now draw a cut-off list, which is visibly wrong, instead of
   silently moving a row's contents out of its row.
3. The strip leaves the flow while it is edited: an opaque bordered panel
   anchored to the cell's top-left, the width of its own column, growing
   downwards over the rows below. `[data-reference-anchor]` keeps the line with
   a `minHeight` floor.
4. `E2E_PORT_SHIFT` moves be-01, gw-01 and fe-01 together so the browser gate
   runs beside a dev server. Without it none of the negatives below could have
   been watched: `bun run dev` held 3100/3200/4200 all evening, and
   `reuseExistingServer` is true off CI.

## Two corrections, both found by running it

**The panel was `width: max-content` capped at 240px.** With a Teams cell open
it covered the Tags cell of the same row, and a click aimed at the neighbour
hit the panel: `<span data-reference-strip data-reference-set="team"> … from

<td data-column="team"> subtree intercepts pointer events`, a 60s timeout in
`round-trips every desktop reference set`. A popover that eats its neighbour's
clicks is not an improvement on a row that grew. It is the column's own width
now and grows downwards only.

**The anchor pinned `height: 24`.** The strip rests at 24.1875px — Chromium's
layout of a 14px input with this table's border and padding — so the pin
clipped the rest line by the fraction: `Expected: 24.1875 / Received: 24`. It
is a `minHeight` floor, and the gate measures the floor against the _painted_
strip rather than against the constant it came from, so drift in either
direction fails.

**The list assertion was written against `Tags for 010`,** which carries every
seeded tag, so its picker has nothing to offer and opens no list at all. It
passed on an empty page until it was written as `toHaveCount(1)` and failed on
`Expected: 1 / Received: 0`. It reads `Tags for 030` now, which is offered all
three.

## Failure-proof table

| Check                                                                 | Injected fault                               | Observed failure                                 |
| --------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `does not clip the cells whose popovers open over the rows` (jsdom)   | `'tag'` out of `POPOVER_COLUMNS`             | `expected 'clip' to be 'visible'`                |
| same                                                                  | `CELL.overflow` back to `'hidden'`           | `expected 'hidden' to be 'clip'`                 |
| `makes the declared width include the cell chrome` (jsdom)            | `CELL.overflow` back to `'hidden'`           | `expected 'hidden' to be 'clip'`                 |
| `leaves the flow while it is edited` (jsdom)                          | panel's `position: 'absolute'` removed       | `expected '' to be 'absolute'`                   |
| same                                                                  | panel's `background` removed                 | `Tests 1 failed` on the paint assertion          |
| same                                                                  | anchor's height/floor removed                | `the strip rendered no anchor` / floor assertion |
| `the open cell stands its row taller than a row with none` (Chromium) | panel's `position: 'absolute'` removed       | `Expected: <= 27.1875 / Received: 87.1875`       |
| `the line the anchor keeps…` (Chromium)                               | anchor pinned `height` instead of a floor    | `Expected: 24.1875 / Received: 24`               |
| `the open list is cut off at the cell edge` (Chromium)                | written against a cell with nothing to offer | `Expected: 1 / Received: 0`                      |

The jsdom rows for the panel were watched a second time after an accident worth
recording: `git checkout <file>` was used to undo an injected fault while the
implementation was still uncommitted, which reverted the whole file to HEAD and
deleted it. The rebuilt implementation was re-tested against the same tests,
which had survived — a clean tests-present/implementation-absent baseline that
failed on `the strip rendered no anchor` and `expected 'hidden' to be 'clip'`
before the code went back in.

**jsdom cannot be the oracle for any of the Chromium rows.** It computes no
layout, so a row's height, a cell's scroll offset and a list's painted height
are all invisible to it — `AGENTS.md` R5 #14/#15 and the four repeats after
them.

## What was run

```
bunx vitest run --root apps/fe-01 src/components/wbs/reference-set-field.test.tsx \
  src/components/wbs/table-frame.test.ts          → 64 passed
bunx vitest run --root apps/fe-01 src/components/wbs/wbs-table.test.tsx \
  -t "does not clip the cells whose popovers"     → 1 passed
CI=1 E2E_PORT_SHIFT=500 nx run fe-01:e2e -- apps/fe-01/e2e/reference-cells.spec.ts
                                                 → 3 passed
```

The port shift itself was proved before anything depended on it: be-01 on 3600,
gw-01 on 3700, Vite on 4700, three specs green, while `bun run dev` held
3100/3200/4200 in the same checkout.

## Not done

The whole-gate run required by task 5.1 is recorded in this file's final state.
Nothing here has been merged or pushed.
