# verify — `gantt-resize-scroll`

All four slices implemented. Every check this change adds was watched failing in
Chromium with a named fault in place; the messages below are quoted from the
runs, not reconstructed.

## What was built

`gantt-panel.tsx` alone.

- `chartBelowTheFold(port)` — `scrollHeight - clientHeight - scrollTop`, floored
  at 0. The floor is the browser's own overscroll bounce, which reports a
  `scrollTop` past the end.
- `GanttChart` holds a ref to its scroll box, a `moreBelow` boolean and a
  `chartSpanPx` measurement, refreshed on mount, on the box's `onScroll`, and
  from a `ResizeObserver` on both the box and the chart's content row.
- The cue: a zero-height `position: sticky; bottom: 0` element at the end of the
  scroll content, `min-w-full` and as wide as the measured content row, with a
  20px fade (`GANTT_EDGE_FADE`) absolutely placed above its bottom edge and
  marked `data-gantt-more-below`.

Three decisions worth naming, because each is a fault that was ruled out rather
than a preference:

- **Painted, not masked.** A `mask-image` on the scroll box — the obvious read
  of the `REFERENCE_SET_EDGE_FADE` idiom — fades the panel's content to whatever
  is *behind* the panel, which is the page in the same `--background`. Tried in
  Chromium: on the light palette the cut row dissolves into the identical colour
  it was already drawn on. Painting the background over the content says the
  same thing in a way both palettes can show.
- **Zero height.** A cue with height of its own is chart below the fold in its
  own right, and the fade could never lift.
- **As wide as the content, not as wide as the box.** The cue lives in the
  scroll area, so a `width: 100%` cue is the scrollport's width pinned at the
  content's left edge — measured sliding 656px off the panel with the calendar
  scrolled right. The span is read off the content row rather than off
  `scrollWidth`, because the cue is itself in `scrollWidth`: a width read from
  there would hold its own answer up and could never shrink again.

## What was ruled out

**A persistently visible scrollbar** — `::-webkit-scrollbar` rules, or
`scrollbar-color`, either of which takes Blink off macOS's overlay scrollbars.
Measured in this gate's Chromium: `clientWidth` unchanged at 1368 with the rules
injected and the panel scrolling. Playwright launches Chromium with
`--hide-scrollbars`, so **no check in this repository's browser gate can observe
a scrollbar at all** — a scrollbar affordance here would be exactly the kind of
claim R5 forbids. The fade is a drawn element and is measurable.

**Snapping the dragged height to whole rows.** It would end the mid-row cut
outright, and it contradicts the height contract three existing browser cases
assert to the pixel (`… expected the panel to be 150px taller`).

## Failure proof

Every fault injected on its own, reverted before the next, all in Chromium at
1400×900 on `E2E_PORT_SHIFT=900`, 2026-08-29/30.

| Fault injected                                                              | Test that observed it                                        | Failure message                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The cue never drawn: `{false && (…)}` for `{moreBelow && (…)}`               | `fades while there is chart below it, and lifts at the last row` | `page.evaluate: Error: nothing on the page at [data-gantt-more-below]`                                                                                                |
| The cue always drawn: `{true && (…)}`                                       | the same case, at rest                                        | `a chart with nothing below it is still fading its edge … Expected: 0, Received: 1`                                                                                    |
| The reader's offset dropped: `chartBelowTheFold` returning `scrollHeight - clientHeight` | the same case, at the last row                    | `the fade is still over the chart at its last row … Expected: 0, Received: 1`                                                                                          |
| `min-w-full` struck from the cue's class list                               | the same case, on a chart narrower than its panel             | `the fade does not reach across the panel … Expected: >= 1367, Received: 536`                                                                                          |
| `width: '100%'` for `width: chartSpanPx ?? '100%'`                          | `covers the visible band with the calendar scrolled right`    | `the fade does not reach across the panel … Expected: >= 1367, Received: -656`                                                                                        |
| `sticky top-0` struck from `[data-gantt-axis]`                              | `keeps the calendar over the bars, and every bar on its own label` | `the calendar rode up with the chart … Expected: <= 1, Received: 56`                                                                                              |
| The label column's sticky corner spacer deleted                             | the same case                                                 | `these bars are not on their own row`, four entries against `[]`, the first `010.2: bar 566.3524780273438–584.2725219726562 against label 533.3125–561.3125`           |

### One assertion with no proof, and it says so in the file

`the fade did not come back above the last row`, the scroll back up at the end
of the first case. Every fault that stops the cue tracking the scroll leaves it
drawn **at** the last row, so the assertion above it goes red first and this one
is never reached. It is kept as the round trip's other half, with a comment
saying it is there to say so rather than to catch it — the same treatment
`stays inside the column it lives in` gives its page-scroll pair.

### One guard deleted rather than believed

The first cut asserted the cue's left and right edges separately. The left one
**cannot fail for the fault the case exists for**: a cue that slides away with
the calendar slides *left*, so `left <= panel.left` passes for it. Both were
replaced by one overlap number (`bandCovered`), which falls for a cue that is
too narrow and for one displaced either way, and that number is what the two
width faults above were watched on. `T1 column-widths-drag`'s lesson, applied
before the line was believed rather than after.

## What jsdom is allowed to say

`gantt-panel.test.tsx` gains four cases about `chartBelowTheFold`'s arithmetic
and nothing else. jsdom lays nothing out — `scrollHeight`, `clientHeight` and
`scrollTop` are all 0 there — so it always reads "nothing below" and could watch
every fault above pass. That is R5's five-times-shipped fault class, and the
reason all seven proofs are browser proofs.

## Commands

| Command                                                                       | Result |
| ----------------------------------------------------------------------------- | ------ |
| `bunx nx typecheck fe-01`                                                     | PASS   |
| `bunx nx lint fe-01`                                                          | TBD    |
| `bunx nx test fe-01`                                                          | TBD    |
| `CI=1 E2E_PORT_SHIFT=900 bunx nx run fe-01:e2e -- apps/fe-01/e2e/gantt.spec.ts` | TBD  |
| `bunx openspec validate --all --json`                                         | **92/92 valid** (after the inherited fix below) |

## Inherited, not caused

Two things arrived with the `fix/reference-cell-popover` merge this worktree was
told to take (it carries the `E2E_PORT_SHIFT` support the gate is run on).

1. `wbs-table.test.tsx`'s `gives every cell the chrome its declared width is
   measured with` failed on `expected 'clip' to be 'hidden'`. That branch changed
   `CELL.overflow` from `hidden` to `clip` and updated the *other* cell-chrome
   case, not this loop; it also added `tag` and `service` to `POPOVER_COLUMNS`
   without adding them to this loop's exempt list. Both fixed here — a stale
   assertion restored to an already-precise spec, which R4 does not ask a change
   for. Nothing else in that branch was touched.
2. `openspec validate --all --json` refused `reference-cell-popover` on
   `MODIFIED "A cell that opens a popover is exempt from the cell clip" must
   contain SHALL or MUST` — with a `SHALL` plainly in the requirement's second
   line. The validator reads the **first line** of a requirement's text and no
   further; measured here by reflowing that sentence so the `SHALL` lands on
   line one and watching 92/92 go valid. The wording is reflowed, not changed.
3. The port shift itself. It is that branch's, not this one's; this change only
   runs the gate on it.

## Skipped or unverified

- `bin/h2puni-gate.sh` — not run. It is the h2puni gate and this work was done on
  a Mac; the host-wide lock it takes is not this machine's.
- The rest of the browser gate (`layout`, `plan-surface`, `dark-mode`, …) — not
  run. The change adds one element inside `[data-gantt-panel]` and touches no
  shared CSS rule, so `linked-row-hover`'s "a filtered run is not enough" applies
  to the shared stylesheet rather than here; `gantt.spec.ts` was run whole.
- Nothing was measured on a phone viewport. The cue is drawn in full screen and
  on the cards face by the same code path, and neither was watched.
