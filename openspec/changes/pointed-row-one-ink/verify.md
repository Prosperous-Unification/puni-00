<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `feat/hint-press-cancels`, with all three of this
branch's changes in the tree at once — they touch the same files (`wbs-table.tsx`,
`CONTEXT.md`) and were gated together rather than pretending to a split the
working tree never had.

| Command                                                                                 | Result                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bunx nx format:check --all`                                                            | **clean** (after `nx format:write` on five files) |
| `bunx nx run-many -t typecheck`                                                         | **exit 0**, 23 projects                           |
| `bunx nx run-many -t lint`                                                              | **exit 0**, 23 projects, 1 pre-existing warning   |
| `bunx nx test fe-01 --skip-nx-cache`                                                    | **2036 passed / 65 files**                        |
| `CI=1 E2E_PORT_SHIFT=500 bunx playwright test --config=apps/fe-01/playwright.config.ts` | **281 passed, 1 skipped**, 9.0m                   |
| `bunx openspec validate --all --json`                                                   | **30 passed, 0 failed**                           |

The lint warning is `wbs-table.tsx`'s `columns` memo — `LLM_README.md`'s landmine
#1, pre-existing and named the same way in `tool-hints-wait/verify.md`.

`bin/h2puni-gate.sh` was **not run**: it exits 127 on this macOS host. The
commands above were run directly.

## Failure proof (R5)

Every check below was watched failing with the named fault injected.

### jsdom

| Check                                                           | Fault injected                                | Observed failure                                                                       |
| --------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `lights the chart from a table row, and the row itself`         | `data-row-lit` put back to `pointedFromChart` | `expected [] to deeply equal [ '030' ]`                                                |
| `clears when the pointer leaves the chart`                      | the SVG root's `onPointerLeave` removed       | `expected [ '030' ] to deeply equal []`                                                |
| `reports null when the pointer leaves the drawing from a bar`   | the SVG root's `onPointerLeave` removed       | `expected [ [ 'strip', 'pointer' ] ] to deeply equal [ [ 'strip', 'pointer' ], …(1) ]` |
| `points a row from its own line, with no bar under the pointer` | the row lines removed from the chart          | `no row line for 1`, thrown at the locator                                             |

### Chromium

| Check                                        | Fault injected                                | Observed failure                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a pointed row is one colour, banded or not` | `data-row-lit` put back to `pointedFromChart` | `a pointed row is a different colour on a banded stripe · Expected: "oklab(0.93903 -0.000271824 -0.00292741)" · Received: "oklab(0.917255 -0.000368904 -0.00397291)"` |

## The hit surface that was three rows tall

**A bug in this change, found in a browser and not by reasoning.** The row lines
were written `fill="none"` with `pointerEvents="all"`, on the reasoning that a
rect with no paint is not hit under the default `visiblePainted` and that `all`
says what is meant. `all` is the fill region **and the stroke region**, and
stroke width is inherited in user units — where one unit is a whole row. So each
line hit-tested a row above and a row below itself, and the topmost line won
every point in the chart.

Its own `getBoundingClientRect` reported one row throughout, which is why the
first theory was wrong twice: the boxes were measured, they were correct, and
the pointer still lit the wrong row. What settled it was asking the browser what
was under the point —

```
LINE 0 box={"x":192,"y":812,"width":192,"height":28} at=357,826
  under=rect[data-gantt-row-line=1] > rect[data-gantt-row-line=0] > svg[data-gantt-chart]
```

— row 1's surface on top of a point 14px inside row 0. `pointerEvents="fill"` is
the interior and only the interior whatever the fill is painted with, and the
same probe then answered `rect[data-gantt-row-line=0] > rect[data-gantt-row-lit=0]`.

**A hit region is not a bounding box**, and no assertion about geometry would
have caught this: every box was right.

## The strength of the light, and why it moved

One ink means one destination, and a banded row starts 2.5% of the way to it. At
the shipped 12% the pointer moved an unbanded row 9-and-change in luminance and a
banded row **4.92** — measured in Chromium, and the reason two of
`linked-row-hover`'s assertions failed on the banded half rather than on the ink.
Dany chose to strengthen rather than accept it, so `--grid-dep-lit` and
`--card-dep-lit` are 20% of `--ring`. The percentages stay equal to each other:
`--card-dep-lit` is the same dose on the other surface, not a second decision.

## Three checks that said the opposite, rewritten rather than deleted

`linked-row-hover` asserted this change's negation in three places, on purpose
and with its reasons recorded. All three now assert the new contract and none was
removed:

- `hover-cards.spec.ts` — `a banded row moves as far under the pointer as a plain
one` became `a pointed row is one colour, banded or not`. The old claim was
  equal **steps** from unequal rests, which is two colours a fixed distance
  apart; the new one is the same colour.
- `gantt.spec.ts` — `lights the chart from a table row` asserted
  `[data-row-lit]` count 0 and now asserts the pointed row is the one the pointer
  is on.
- `wbs-table.test.tsx` — `lights the chart from a table row, and not the row
itself` became `and the row itself`.

## One design correction the suite forced

A bar's `onPointerOut` used to clear the pointed row. That was right while a bar
and a row label were the only two things that could point one; with the row's own
line under it, leaving a bar is usually landing on the same row, and clearing
there blinked the light off under the caret or dependency link the reader had
moved onto. Clearing is single-sourced at the drawing's edge now.

`gantt-panel.test.tsx`'s `reports null when the pointer leaves a bar` went on
passing through that change — for a different reason than it was written for,
which is its own kind of vacuity. It is renamed `…leaves the drawing from a bar`,
its comment says which line now answers it, and that line's negative was watched.
