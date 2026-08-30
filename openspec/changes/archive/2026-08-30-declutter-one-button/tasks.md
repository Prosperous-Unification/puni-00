<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

Every slice below is a **gate** over paint `gantt-declutter` either hid or
deleted. `gantt-geometry.ts` is untouched: `placeGantt` goes on placing brackets
and assumed spans, `placed.horizon` goes on containing them, and the canvas, the
axis, the row indexes and every y-position are identical either side of the
switch. That is what makes "row alignment stays load-bearing" a fact rather than
a hope, and it is why this change cannot collide with the capacity engine's
worktree.

The R5 shape here is the mirror of #44's. There, every absence assertion needed
a presence beside it, because a chart that drew nothing would pass an absence
alone. Here every absence assertion needs its **own** presence assertion after
the switch is pressed, on the same render: a gate wired to nothing passes the
at-rest half of every pair, and a gate wired backwards passes neither. Both
directions are watched red.

## 1. The switch is renamed, and so is what it remembers

- [x] 1.1 `ARROWS_KEY`/`rememberedArrows`/`arrowsShown` become
      `DETAIL_KEY`/`rememberedDetail`/`detailShown`, the button reads `Detail`,
      its hook is `data-gantt-detail-toggle` and its `title` names the three
      families. The lazy initialiser, the `setItem` outside the updater and
      `aria-pressed` are unchanged — test: `gantt-panel.test.tsx`, the switch
      opening off, `aria-pressed` following a press, a remount reading
      `wbs.ganttDetail` back; negatives already in place and re-watched: a
      stored non-boolean and unreadable JSON each dropping the key
- [x] 1.2 `wbs.ganttArrows` is removed on read and never read as an answer —
      test: `gantt-panel.test.tsx`, a stored `wbs.ganttArrows` of `true` opening
      the chart off, with no arrow drawn and the key gone from storage;
      negative: the `removeItem` deleted, watched leaving the key in storage

## 2. The three families come back behind the one gate

- [x] 2.1 The parent's ghost rect and its zero-span tick are restored from
      `gantt-declutter`'s base, both behind `detailShown` — test:
      `gantt-panel.test.tsx`, `draws no mark of its own on a parent's row until
the detail is asked for` and `leaves a zero-projection parent's row empty
until the detail is asked for`, each asserting the absence, pressing the
      switch and asserting the mark, with the children on their own rows and the
      row count unmoved in both halves; negative: the `detailShown &&` dropped,
      watched drawing the bracket at rest
- [x] 2.2 `drawnBars` takes every placed bar when the switch is on and the
      estimated ones alone when it is off, and the assumed paint deleted by #44
      comes back with it: `ASSUMED_BAR_CLASSES`, `barClasses`'s estimated arm,
      `assumedLabelFor`, `durationWords`'s not-estimated arm, `barFacts`'s
      not-estimated line, the `data-assumed` hook and the label's own ink — test:
      `gantt-panel.test.tsx`, a leaf half estimated drawing one bar at rest and
      two once asked, the second carrying `data-assumed` and a `?`, with the
      costed bar unmoved; negative: the ternary pinned to `placed.bars`, watched
      drawing the uncosted slice at rest
- [x] 2.3 The not-before carets follow the same gate: every placed flag when the
      switch is on — a parent held at a date now has a bracket to stand over —
      and only the flags with a costed bar under them when it is off. The
      person-link filter is left deriving from `drawnBars`, which is already
      right in both states — test: `gantt-panel.test.tsx`, three rows carrying a
      date of which one draws a bar, asserting one caret at rest and three once
      asked; negative: the ternary pinned to the filtered arm, watched leaving
      the parent's caret off with the detail on

## 3. The browser half

- [x] 3.1 `askForTheArrows()` (jsdom) and `askForTheArrows(page, heads)` (e2e)
      become `askForTheDetail`, pressing `[data-gantt-detail-toggle]` and
      throwing on a press that drew nothing — the same refusal, over the new
      control
- [x] 3.2 `e2e/gantt.spec.ts`'s three declutter cases become pairs: the seeded
      3-row plan drawing 2 bars and no bracket at rest and 4 bars and 1 bracket
      once asked, every one of them with width in the browser; the arrow-and-caret
      case asserting the bracket's absence before the press and its presence
      after; and the reload case carrying all three families across a reload and
      back off again — the click is the half jsdom cannot answer (R5 #14/#15)

## 4. The gate

- [x] 4.1 The three commands of the gate: `nx format:check --all`, `nx run-many`
      over test/lint/typecheck/build, and `openspec validate --all`
- [x] 4.2 `bun run e2e` on CI's `pixels` job — h2puni has no sudo for
      `playwright install-deps`, which is stated rather than worked around
- [x] 4.3 `verify.md` written from the runs, with the failure-proof table: every
      gate above, both directions, the fault injected and the failure observed
