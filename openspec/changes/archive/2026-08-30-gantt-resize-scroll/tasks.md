<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The fold, measured

- [x] 1.1 `chartBelowTheFold(port)` in `gantt-panel.tsx`: `scrollHeight -
clientHeight - scrollTop`, floored at 0 — test: `gantt-panel.test.tsx`
      `how much chart is below the panel's bottom edge`, four cases including the
      overscroll past the last row. Pure arithmetic, and the only thing about the
      fade jsdom may assert: it lays nothing out, so all three inputs are 0 there
      and the panel always reads "nothing below".
- [x] 1.2 The panel holds a ref to its own scroll box and measures the fold from
      the box it is handed — on mount, on its own `onScroll`, and from a
      `ResizeObserver` on both the box and the chart's content row (the panel
      resized by the handle; the chart resized by a row, the names, or a coarser
      scale). `ResizeObserver` guarded by `typeof`, as the room measurement next
      door already is.

## 2. The cue

- [x] 2.1 A zero-height sticky element at the end of the scroll content, with
      the fade absolutely placed above its bottom edge, drawn only while the
      fold is more than a pixel deep — test: `e2e/gantt.spec.ts` `fades while
there is chart below it, and lifts at the last row`; negatives, all
      watched in Chromium: the cue never drawn (`{false && …}`), the cue always
      drawn (`{true && …}`), and the reader's offset dropped from the sum.
- [x] 2.2 The cue is as wide as the chart's own content, with `min-w-full`
      under it — test: `e2e/gantt.spec.ts` `covers the visible band with the
calendar scrolled right` and the width assertion in the case above;
      negatives: `width: '100%'` in place of the measured span (watched with the
      calendar scrolled fully right), and `min-w-full` struck (watched on a chart
      narrower than its panel).
  - Zero height is load-bearing rather than tidy: a cue with height of its own
    is chart below the fold in its own right, and the fade could never lift.

## 3. What a scrolled panel must not lose

- [x] 3.1 Browser checks for the two properties that already held and had no
      test that could see them break — test: `e2e/gantt.spec.ts` `keeps the
calendar over the bars, and every bar on its own label`; negatives: `sticky
top-0` struck from `[data-gantt-axis]`, and the label column's sticky
      corner spacer deleted. Both watched in Chromium.
- [x] 3.2 The remembered height across a reload is unchanged, and its existing
      case (`gives the chart the screen the pointer asks for, remembers it, and
resets`) still passes.

## 4. Gate

- [x] 4.1 `bunx nx run fe-01:{test,lint,typecheck}`, `bunx prettier --write` on
      what was touched, `openspec validate --all --json`, and the whole
      `e2e/gantt.spec.ts` on shifted ports (`E2E_PORT_SHIFT=900`). Results in
      `verify.md`.
