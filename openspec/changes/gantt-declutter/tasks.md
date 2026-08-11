<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

Every slice below is a removal in the **paint**. `gantt-geometry.ts` is not
touched at all: `placeGantt` goes on placing brackets and assumed spans, the
horizon goes on containing them, and the panel simply stops drawing three of the
marks it is handed. That is what keeps row indexes, y-positions and the axis
identical either side of this change — and it is also why the arrow-anchor work
on `change/dep-waits-on-first-role` and this change cannot collide.

The R5 shape of a removal is the awkward part: a check that a mark is **absent**
passes trivially against a chart that draws nothing at all. Every absence
assertion below therefore stands beside a positive one on the same render — the
bars that must still be there, the rows that must still be at their indexes — so
a panel that stopped drawing everything fails the same test. And the absence is
watched failing by putting the removed drawing back, which is the only fault
that can break a check about a mark that is gone.

## 1. The arrows open off, and the browser remembers

- [x] 1.1 The switch's state is read from `localStorage` at mount and written on
      every press: key `wbs.ganttArrows`, default off, one preference per
      browser — test: `gantt-panel.test.tsx`, a chart with a dependency drawing
      no arrow and no head on open, the same chart drawing both after the switch
      is pressed, `aria-pressed` following, and a remount reading the stored
      answer back; negative: the stored answer is a claim, so a key holding the
      string `yes` must leave the arrows off and drop the key, watched failing
      with the type check removed
- [x] 1.2 `e2e/gantt.spec.ts`'s switch case rewritten around the new default:
      the chart opens with no arrows, a real click in the sticky corner draws
      them, a reload keeps them drawn, and off is remembered the same way round
      — the click is the half jsdom cannot answer (R5 #14/#15)

## 2. A parent's row draws nothing

- [x] 2.1 Both `placed.brackets` blocks deleted from the SVG — the ghost rect
      and the zero-span tick — test: `gantt-panel.test.tsx`, a plan with a
      parent over two children asserting no bracket mark anywhere **and** both
      children's bars still on their own rows, and a zero-projection parent
      asserting the same; negatives: the ghost rect's block put back, and the
      tempting next step of leaving a row that draws nothing off the chart
- [x] 2.2 `e2e/gantt.spec.ts`'s bracket measurements removed and replaced by the
      alignment they were standing in: the chart draws one label per row of the
      plan, counted against the table's own rows, and no bracket mark exists

## 3. An unestimated slice draws nothing

- [x] 3.1 The bars, the ticks and the on-bar labels are drawn from the estimated
      slices alone — one filtered list, so the three cannot disagree — test:
      `gantt-panel.test.tsx`, a leaf holding an estimated Dev slice and an
      unestimated QA slice drawing exactly one bar, no tick and no label for the
      QA slice, and the Dev bar unmoved on its row; negative: the filter dropped,
      watched drawing the uncosted slice again
- [x] 3.2 The dead paint deleted with the mark: the assumed bar's classes,
      `barClasses`'s estimated arm, `assumedLabelFor`, the not-estimated line in
      `barFacts`, the `data-assumed` hook and their tests — nothing that only an
      undrawn bar could reach survives, and no test selects on a hook nothing can
      write
- [x] 3.3 A person link whose slice is no longer drawn is not drawn either: a
      dashed line to an absent bar points at nothing — test:
      `gantt-panel.test.tsx`, a hand-off from an estimated slice to an
      unestimated one drawing no link, and the estimated-to-estimated hand-off
      beside it still drawing one
- [x] 3.4 `e2e/gantt.spec.ts`'s `data-assumed` filters removed and the fact they
      were working around asserted instead: the seeded plan draws one bar per
      estimated slice — two on a three-row plan, where it drew five — and every
      drawn bar has width in the browser

## 4. The gate

- [x] 4.1 The three commands of the gate: `nx format:check`, `nx run-many` over
      test/lint/typecheck/build, and `openspec validate`
- [x] 4.2 `bun run e2e`: **cannot run on this host.** Chromium refuses to launch
      here — `libatk-1.0.so.0: cannot open shared object file` — and installing
      the browser's system libraries is a change to the box, not to this branch.
      Ports 3100/3200/4200 were checked and clear, so the landmine is not what
      stopped it. CI's `pixels` job is the first browser run of this change; the
      e2e edits are unwatched until it reports.
- [x] 4.3 `verify.md` written from the runs, with the failure-proof table: every
      negative above, the fault injected, and the failure observed
