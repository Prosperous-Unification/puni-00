<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

The whole change is one CSS keyword and the browser test that makes it
provable. The order matters more than the size: the sweep was written and
watched failing first, because the existing drag tests pass over this defect —
they grab the strip at its horizontal centre, which on the seeded plan is past
the right end of a chart only half the window wide. A test that starts the drag
where the chart is not drawn cannot see the chart taking the press.

## 1. Watch the strip fail

- [x] 1.1 The strip's own case in `e2e/gantt.spec.ts`:
      `owns every point on its strip, rather than the chart sliding under it`.
      `document.elementFromPoint` over 18 points —
      three heights down the 6px, three positions across the label column and
      three across the calendar axis beside it — each named by what it hits, so
      the failure reads as the element rather than as `false`. Watched failing
      at `7a26663` on 6 of 21 points in its first form (a sweep across the
      panel, which ran past the chart's right edge into pixels nothing
      contests) and on **all 18** in the form that ships. The second half of
      the case starts a real drag from the strip's far-left corner — the one
      the label column's sticky header owned — and asserts the panel follows
      the pointer mid-flight.
- [x] 1.2 The sweep is measured from `[data-gantt-labels]` and
      `[data-gantt-axis]`, whose rectangles are asserted to have area and to
      reach past the label column, rather than from the panel's own width.
      This is the line that stops the case going vacuous the day the fixture's
      plan is narrower than the window: over empty strip every point is the
      handle's with the fix in or out.

## 2. Isolate the chart

- [x] 2.1 `isolate` on the panel's `<section>` in `gantt-panel.tsx`, with the
      comment saying which three `z-index`es it confines and what they cost
      without it — test: 1.1 goes green; negative: the keyword removed and all
      18 points came back as the chart's `div`/`span`. Watched both ways,
      2026-08-12, Chromium on h2puni.
- [x] 2.2 Nothing else moves: the handle keeps `z-index: 1` and its
      `margin-bottom: -6px`, and `wbs-table.tsx` is not touched. The full
      browser gate re-run for the marks and cards the isolation could have
      trapped — 159 passed, including the anchored hover cards, which are
      portalled to `document.body` and so were never inside this box.
