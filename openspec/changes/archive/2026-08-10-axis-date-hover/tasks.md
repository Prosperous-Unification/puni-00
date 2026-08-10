<!-- Ordered TDD slices. Only checkboxes are tracked. -->

## 1. The card

- [x] 1.1 `axisDayWords(day)` beside `monthWords`: the two lines above, from
      fixed English tables, throwing on a weekday no calendar has (same guard
      shape as `monthWords`) — tests red first, then green
- [x] 1.2 Axis cells open the shared hover surface: same `opening` timer,
      `HOVER_OPEN_MS`, mouse-only guard, `dismiss` on leave, mutual exclusion
      with the bar surfaces, closed on `generation`; native `title` removed —
      jsdom tests: dated cell, weekend cell, workday-axis cell, crossing
      pointer, touch pointer, only-one-card
- [x] 1.3 One browser assertion in `e2e/gantt.spec.ts`: hover a dated cell,
      the card appears with the month in it

## 2. The gate

- [x] 2.1 Format, run-many, openspec validate; verify.md with watched negatives
