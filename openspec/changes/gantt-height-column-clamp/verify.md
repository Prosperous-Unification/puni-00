# verify — `gantt-height-column-clamp`

Implemented for slices 1, 2 and 4, with the browser half of every slice **unrun**
— see "Skipped or unavailable checks". Slices **3 and 5 are not implemented**
and not ticked: for each, the mechanism the slice names is shown below not to
produce the behaviour it asks for, and the finding is written down rather than a
layout change guessed with no browser to measure it in. Slice 6 is not run.

## The fault, measured

Chrome, 2026-08-29, `localhost:4200`, viewport 963px, one project with the chart
shown. Read out of the live DOM.

| Quantity                                       | Measured                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| plan column                                    | top 49, bottom 955 → 906px                             |
| toolbar / table `min-height` / handle / footer | 68 / 320 / 6 / 24 = 418                                |
| room actually available for the panel          | **488**                                                |
| `clampedGanttHeight` cap (`0.8 × 963`)         | **770**                                                |
| drag 1 (up 178px): panel                       | 159.71 → 337.71 — and `handleTop` **unchanged at 569** |
| drag 2 (up 419px): panel                       | 757, bottom at **1200** vs column bottom **955**       |
| `document.scrollHeight` after drag 2           | 963 — unchanged, no scrollbar                          |
| overhang unreachable                           | **245px**                                              |

Ruled out by measurement, not by reading: hit-testing (nine sampled points
across the 6px strip all returned the handle; `isolate` on the panel and
`zIndex: 1` on the handle both in force) and the gesture itself (every drag
committed the right number to `localStorage`).

## Why the existing suite is green through it

`e2e/gantt.spec.ts`'s `the chart edge the reader drags` asserts the panel's
height after a drag. The height was right every time — 337.71, then 757, exactly
what was asked for. It never asserted where the panel's bottom **was**. Slice
1.1 adds that assertion (`stays inside the column it lives in`), written before
the fix and **not executed** — the ports were held, as they were during the
investigation.

## What was changed

- `clampedGanttHeight(px, availablePx)` caps at `min(GANTT_CEILING_PX,
availablePx)`. `GANTT_VIEWPORT_SHARE` is **deleted** — it had no other reader
  once the panel's `max-height` stopped using it.
- `ganttRoomInColumn(column, panel)` is new, and is the only thing that answers
  "how much room": the column's content height less what every **other** child
  insists on keeping — its margins always, plus either the definite `min-height`
  it can shrink to or the height it stands at. All of it read off the live
  boxes; nothing derived from a constant. It answers `number | null`, and the
  `null` is "nothing has been laid out", deliberately a different answer from
  the `0` a column that has run out of room gives.
- **The room formula was written the other way round first and was wrong.**
  `panel + slackBelow + shrinkableAbove` reads correctly on a healthy layout and
  lies on a broken one: a panel that is already overflowing has no slack under it
  and its shrinkable neighbour is already on its floor, so the sum comes back as
  the overflowing height itself and the clamp allows exactly what it was meant to
  refuse — a stable broken state, reached on the very first measurement after the
  chart is opened at a too-large remembered height. Caught by working the effect
  through by hand, **not** by a test: no jsdom test could see it, and the browser
  one is unrun. The formula that shipped does not mention the panel's height at
  all, which is what makes it right on a broken layout and trivially invariant on
  a healthy one.
- The handle measures the room **once per gesture**, at `pointerdown`, beside
  the from-height it already measured there.
- `appliedGanttHeight(claim, room)` is new: `wbs-table.tsx` holds the reader's
  claim and a `ganttRoomPx` measured by a `useLayoutEffect` + `ResizeObserver`
  on the column, and the panel is handed the claim **re-clamped**, never the
  claim rewritten. Nothing writes to storage on a re-clamp.
- The panel's `max-height` is the measured room, falling back to `100%` — the
  column — where nothing has measured it. Never a `vh`.
- **The panel keeps `shrink-0`, against the proposal** — see "The finding on
  slice 3" below.
- `table-frame.ts`'s JSDoc says the frame is the only shrinkable item in the
  column. That is still true, and it now says _why the panel being `shrink-0` is
  load-bearing_ rather than listing it as incidental.

## Commands

| Command                                                              | Result                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bunx nx run fe-01:typecheck`                                        | **pass** — `tsc --build --force` on `tsconfig.app.json` and `tsconfig.e2e.json`                           |
| `bunx nx run fe-01:lint`                                             | **pass** — 0 errors, 1 pre-existing warning (`wbs-table.tsx:4143`, `useMemo` deps, untouched code)        |
| `bunx nx run fe-01:test`                                             | **1812 passed, 2 failed** (`--skip-nx-cache`) — both failures pre-existing and local-timezone-only, below |
| `bunx nx format:write` on the five changed files                     | applied                                                                                                   |
| `bin/h2puni-gate.sh`                                                 | **not run** (out of scope for this session)                                                               |
| `openspec validate --all --json`                                     | **not run**                                                                                               |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | **not run** — ports held; see below                                                                       |

### The two failing jsdom cases are neither mine nor real

`plan-mermaid.test.ts` → `leaves a bar crossing a weekend exactly where it was
told` (`expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'`)
and `still parses a point … as a real milestone` (`expected
'2026-09-02T21:00:00.000Z' to be '2026-09-03T00:00:00.000Z'`). Both are a
three-hour offset: this machine is UTC+3. Watched passing under the timezone CI
runs at:

```
$ TZ=UTC bunx vitest run src/components/wbs/plan-mermaid.test.ts
 ✓ src/components/wbs/plan-mermaid.test.ts  (49 tests) 1730ms
 Test Files  1 passed (1)
      Tests  49 passed (49)
```

Nothing in this change touches Mermaid, dates or the workday calendar.

## Failure proofs (R5)

Every row marked **watched** had the named fault injected on its own, the test
run, the failure read, and the fault reverted. The quoted strings are that run's
output.

| Check                                                  | Fault injected                                                              | Test that saw it fail                                                                                    | Watched                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| the cap is the column's room                           | `Math.min(GANTT_CEILING_PX, 0.8 * window.innerHeight)` restored             | `caps at the room it is given` — `expected 614.4000000000001 to be 488`                                  | **yes**, 2026-08-29                          |
| a column nothing laid out is not a column with no room | the handle's fallback removed (`roomPx: room ?? 0`)                         | `follows the pointer while dragged, and remembers where it was let go` — `expected '84px' to be '450px'` | **yes**, 2026-08-29                          |
| an unresolvable length is 0, not NaN                   | `lengthPx` reduced to a bare `Number.parseFloat`                            | `answers nothing where nothing has been laid out` — `expected NaN to be null`                            | **yes**, 2026-08-29                          |
| the ceiling is the column                              | `maxHeight: '80vh'` restored                                                | `the panel's ceiling is its column, not the window` — `expected '80vh' to be '488px'`                    | **yes**, 2026-08-29                          |
| the panel does not split an over-constraint            | `shrink-0` dropped from the non-full-screen arm                             | `does not split an over-constraint with the table frame` — `expected false to be true`                   | **yes**, 2026-08-29                          |
| a re-clamp does not swallow the unmeasured case        | `clampedGanttHeight(claimPx, roomPx ?? 0)`                                  | `draws the claim unclamped while nothing has measured the column` — `expected 84 to be 700`              | **yes**, 2026-08-29                          |
| the panel stays in its column                          | the viewport clamp restored                                                 | `stays inside the column it lives in` (`1200 > 955`)                                                     | **NO — written, never run**                  |
| the room is measured, not derived                      | `available` computed from `TABLE_NEEDS_HEIGHT` and a nominal toolbar height | Chromium at a width where the toolbar wraps                                                              | **NO — no such test written**                |
| a re-clamp does not rewrite the claim                  | the re-clamp writing back to `localStorage`                                 | `a wider window gives the dragged height back`                                                           | **NO — jsdom cannot reach it**               |
| the boundary follows the pointer                       | —                                                                           | `dragging up moves the boundary up`                                                                      | **NO — `test.fixme`; see the finding below** |

## Which slices need a browser before they can be believed

jsdom measures every box at 0 and answers every computed style with the empty
string. Every claim below is therefore **unproven** by the run above, and each
is named where it is made in the code:

1. **1.1 — containment.** `stays inside the column it lives in` is written into
   `e2e/gantt.spec.ts` and has never executed. It was supposed to be watched
   failing on the current code _first_; it was not, and the `1200 > 955` in the
   table above is the 2026-08-29 hand measurement, not a test run. Until it is
   run against both the old and the new clamp, the fix has no oracle.
2. **2.2 — the room is measured.** `ganttRoomInColumn` answers `null` in jsdom,
   so the only jsdom case is the "nothing was laid out" contract. What the sum
   actually comes to — the toolbar's margin, the table frame's 20rem floor, a
   banner counted at its standing height — no jsdom test can see, and neither
   can anything see whether Chrome really reports `min-height: auto` as `auto`
   for a flex child, which is the assumption that keeps a banner from being
   counted as fully shrinkable. The negative the slice asks for (the sum derived
   from constants, at a width where the toolbar wraps to two rows) is not
   written, because there is nowhere to run it.
3. **2.3 — the ceiling.** jsdom proves the _value_ of `max-height`. Whether a
   `max-height` of the measured room actually contains the panel is Chromium's.
4. **3.1 — the panel gives space back.** Not implemented; the whole of the
   reasoning below is from the flexbox spec and has never been watched in a
   browser. It is the single most important thing to check in Chromium.
5. **4.1 — the re-clamp.** `ganttRoomPx` stays `null` in jsdom, so the whole
   re-clamp path is dead there: `appliedGanttHeight` is proven pure and correct,
   and that a resize re-measures, that the panel is redrawn shorter, and that
   `localStorage` is left alone while it happens are all unproven.
6. **6.1 — the gate.** Not run.

## The finding on slice 3, and why the panel keeps `shrink-0`

**A shrinkable panel would make every maximal drag under-deliver.**

The proposal asks for `shrink-0` to go so that "an over-constrained column
shrinks the chart rather than pushing it through the bottom". The premise is
right — a rigid item with an explicit height leaves an over-constrained column
nothing to do but overflow. The consequence is not, because a browser resolves
an over-constraint by **sharing** it across every shrinkable item in proportion
to `flex-shrink × flex-basis`, and this column's other shrinkable item is the
table frame, whose basis is its whole content.

Worked through on the 2026-08-29 measurements. The column is 906px: toolbar 68
(`shrink-0`), frame basis 446 with a 320 floor, handle 6 (`shrink-0`), panel.
The room this change computes for the panel is `159.71 + 226.29 + (446 − 320) =
512`, and 512 is what the clamp then allows.

- **Panel `shrink-0` (shipped).** Sum of bases at height 512 is 1032, a 126px
  deficit, and the frame is the only shrinkable item: it takes all 126 and lands
  exactly on its 320 floor. Panel 512, its bottom flush with the column's.
- **Panel shrinkable (as asked).** Scaled shrink factors are 446 (frame) and 512
  (panel), so the 126px deficit splits 58.7 / 67.3. Neither hits a limit, the
  loop ends, and the panel settles at **444.7 where 512 was dragged** — with the
  frame left 67px above the floor it was supposed to give up.

The `max-height` does not rescue that case: it is equal to the height there, so
there is no max violation for the algorithm to clamp and freeze on. It only
bites while the height is _above_ the room, which after this change is a single
frame between a column changing and the observer re-measuring it.

A chart that quietly swallows 67px of a gesture is a worse bug than the one this
change is about, and it would land on every maximal drag rather than on the
stale-column edge the give-way was wanted for. So containment is the clamp's
alone — `appliedGanttHeight` plus the `max-height`, both off one measured room —
and the delta spec's "the panel SHALL be able to give space back" is met by the
re-clamp instead: the panel does shrink to fit _when the column is measured_,
which is what that scenario's own wording asks for.

**This is reasoned from the flexbox spec and never watched in a browser.** It is
the first thing to check with Chromium in hand, and if the resolution turns out
otherwise then `shrink-0` should go after all, with a browser assertion beside
it saying so.

## The finding on slice 5, and why it is not implemented

**`shrink-0` is not what stops the boundary following the pointer, and dropping
it does not fix that symptom.**

The measured behaviour — a 178px drag up making the panel 178px taller with
`handleTop` unchanged at 569 — happens because the column had **226px of
positive free space below the panel** (panel bottom 728.71 against a column
bottom of 955). `flex-shrink` has no effect on positive free space: it is only
consulted when the free space is negative. Every item in that column has
`flex-grow: 0`, so the leftover sits at the end of the column, and the panel
grows into it before anything above it can move. The clamp does not change this
either — the room is `panel + slackBelow + shrinkableAbove`, and spending the
`slackBelow` term is exactly the growth that leaves `handleTop` where it is.

The only mechanisms that move the boundary are ones that stop the leftover being
below the panel: `margin-top: auto` on the panel, or the frame growing again.
Both put the same leftover **above** the chart — which is precisely the "508px
of nothing between its last row and a chart docked to the bottom of the window"
that `unified-scroll-docking` removed, and that `table-frame.ts` records as the
reason the frame is `flex: 0 1 auto`.

So symptom 2 is `unified-scroll-docking`'s deliberate trade-off about where a
short plan's leftover goes, not a bug this change can patch. Guessing a layout
change with no browser to measure it in is what R5 exists to stop. The
assertion is written and marked `test.fixme` with this reasoning beside it, so
it goes green without a rewrite the day that decision is revisited.

Note also that the fixture the browser gate uses is a three-row plan whose frame
is already at its 20rem floor, so **all** of its room is `slackBelow`: on that
fixture `handleTop` will not move for any drag, before or after this change.

## Skipped or unavailable checks

- **The e2e gate was not run.** Ports 3100/3200/4200 are held by a running dev
  server and `playwright.config.ts` sets `reuseExistingServer: !isCi`, so a run
  would have measured that checkout rather than this one — the `LLM_README.md`
  landmine, and R5 #16's third hat. Everything in `e2e/gantt.spec.ts` added here
  is **unexecuted**.
- `bin/h2puni-gate.sh` and `openspec validate --all --json` were not run.
- The `max-h-[40vh]` default share is untouched. It is still a share of the
  viewport, and it is now contained by the panel's own `flex-shrink` rather than
  by a clamp — unmeasured, like everything else on this list.
