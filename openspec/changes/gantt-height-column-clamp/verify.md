# verify — `gantt-height-column-clamp`

Not yet implemented. The fault below **is** measured; everything else is pending.

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
1.1 adds that assertion and must be watched failing on the current code before
any fix is written.

## Commands

| Command                                                                                       | Result  |
| --------------------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                                          | not run |
| `openspec validate --all --json`                                                              | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate, free ports) | not run |

## Failure proofs (R5)

| Check                             | Fault injected                                   | Test that saw it fail                                       | Watched |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- | ------- |
| the panel stays in its column     | the viewport clamp restored                      | `stays inside the column it lives in` (`1200 > 955`)        | pending |
| the room is measured, not derived | `available` computed from constants              | Chromium at a width where the toolbar wraps                 | pending |
| the ceiling is the column         | `maxHeight: 80vh` restored                       | `the panel's ceiling is its column, not the window`         | pending |
| the panel can give space back     | `shrink-0` restored with the clamp already fixed | `an over-constrained column shrinks the chart`              | pending |
| a re-clamp does not forget        | the re-clamp writing back to storage             | `a wider window gives the dragged height back`              | pending |
| the boundary follows the pointer  | panel `shrink-0` with slack below it             | `dragging up moves the boundary up` (`handleTop` unchanged) | pending |

## Skipped or unavailable checks

The e2e gate was **not** run during this investigation: ports 3100/3200/4200
were held by a running dev server and `playwright.config.ts` hardcodes them with
`reuseExistingServer`, so a run would have measured that checkout rather than
this one.
