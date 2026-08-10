<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

All fixtures keep `gantt-panel.test.tsx`'s Monday 2026-08-10 seed. Every slice
below is presentational; the browser gate re-measures the two marks whose
geometry changes (bracket → rect) and jsdom carries the rest — none of the four
depends on a browser default action, which is what the R5 #14/#15 fault class
turns on.

## 1. The words on the bars

- [x] 1.1 The on-bar label carries the row words: estimated bars read
      `<assignee> · <number> - <name>` (assignee part decided by width exactly
      as today, dropped entirely when nobody fits or nobody is assigned — the
      row words then stand alone), unestimated bars keep the `?` first and
      append the row words after; label font drops to 9px — test:
      `gantt-panel.test.tsx`, a wide assigned bar reading
      `Anna Adams · 010 - <name>`, an unassigned bar reading its row words
      rather than nothing, an unestimated bar's label beginning with its `?`
      candidate; negative: the row words appended only when they fully fit
      (the old `barLabelFor` behaviour extended), watched failing the narrow
      assigned case whose label must still carry the cropped row words

## 2. The parent's mark

- [x] 2.1 The bracket path becomes a rect: same `data-gantt-bracket={rowId}`
      hook, `x = from`, `width = to − from`, the leaf bar's inset, height and
      corner radii, `fill-foreground` at low opacity (`/15`), no stroke — test:
      `gantt-panel.test.tsx`'s two bracket cases rewritten to assert the rect's
      `x`/`width` at the same calendar readings the path's `d` carried
      (`L 9 0.18` becomes `width = 9 − from`); negative: the rect drawn from
      the engine's workday numbers instead of the placed readings, watched
      failing the staggered-calendar case at `width 7` where the calendar says 9
- [x] 2.2 `e2e/gantt.spec.ts`'s bracket measurement updated: the mark is a rect
      now, its box asserted non-zero and level with its row, its paint asserted
      semitransparent (computed `fill-opacity` < 1 or rgba alpha < 1) — watched
      failing with the opacity class removed

## 3. The arrows switch

- [x] 3.1 A labelled toggle (`Arrows`, `aria-pressed`) in the panel's sticky
      corner hides every `data-gantt-arrow` and `data-gantt-arrow-head` and
      shows them again; default shown; person links and carets untouched —
      test: `gantt-panel.test.tsx`, toggling off removes both arrow marks and
      leaves `data-gantt-person-link` and `data-gantt-not-before` counts
      unmoved, toggling back restores the arrows; negative: the filter keyed on
      the elbow alone, watched failing on heads still in the document

## 4. The month caption

- [x] 4.1 The corner prints `Aug 2026`: a `monthWords(date)` beside the panel
      mapping `2026-08-17` → `Aug 2026` from a fixed English table, the corner
      using it, `Workday` untouched without a start date — test: the two
      caption cases (`the caption follows the scroll`) updated to the new
      format, one asserting a scrolled September reads `Sep 2026`

## 5. The gate

- [x] 5.1 `bunx nx format:check --all`, `bunx nx run-many -t test lint
typecheck build --parallel=2`, `openspec validate --all --json`, and
      `bun run e2e` with no other checkout's dev server holding 3100/4200 —
      results into `verify.md` with the negatives named
