<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The containment assertion, before the fix

- [ ] 1.1 Add to `e2e/gantt.spec.ts`: after a drag far past the available room, the panel's bottom is at or above the column's bottom, and `document.scrollHeight === window.innerHeight` — test: `stays inside the column it lives in`. **This must fail on the current code first**, on the measured `1200 > 955`; record the figures in `verify.md`. A fix written before this test is a fix with no oracle. **Written, never run** — the ports were held, so it has neither failed on the old clamp nor passed on the new one. Left unticked for exactly that reason.

## 2. The clamp measures the column

- [x] 2.1 `clampedGanttHeight(px, availablePx)` — the second argument renamed and re-documented as the column's room, not the viewport's; `GANTT_VIEWPORT_SHARE` deleted from the cap — test: `gantt-panel.test.ts` `caps at the room it is given`, `the floor wins over the cap`; negative: the argument fed `window.innerHeight` again, watched failing on the containment test from 1.1. Done, and `GANTT_VIEWPORT_SHARE` is deleted outright — 2.3 took its last reader. The negative was watched in jsdom instead (`expected 614.4000000000001 to be 488`); the containment test could not be run.
- [ ] 2.2 The handle computes `available` by **measuring** the column and the panel at `pointerdown` — the panel's own box, plus the unused space below it, plus what the table region may give up before its `min-height` — never from constants — test: `gantt-panel.test.ts` `the room is measured, not derived`; negative: `available` computed from `TABLE_NEEDS_HEIGHT` and a fixed toolbar height, watched failing in Chromium at a width where the toolbar wraps to two rows. jsdom measures every box at 0 and **cannot** be this slice's oracle. `ganttRoomInColumn` is written and called at `pointerdown`; its named negative needs a browser and was not run, so this stays unticked.
- [x] 2.3 The panel's `maxHeight` follows the same number instead of `80vh` — test: `the panel's ceiling is its column, not the window`; negative: `80vh` restored, watched failing on the containment test. Done; the negative was watched in jsdom on the value itself (`expected '80vh' to be '488px'`) rather than on the containment test.

## 3. The panel can give space back

- [ ] 3.1 `shrink-0` dropped from the panel in the non-full-screen case; full screen's `flex-1 min-h-0` untouched — test: `an over-constrained column shrinks the chart`, `full screen still ignores the dragged height`; negative: `shrink-0` restored **with the clamp already fixed**, watched failing only on the resize case — which is the point: this is the backstop, and its own test has to be the one the clamp does not already cover. **Not implemented.** A shrinkable panel shares an over-constraint with the table frame in proportion to `shrink × basis`, so at the column's own room — the height the clamp exists to allow — the chart would settle 67px short of the gesture on the measured numbers. Containment is the clamp's and the `max-height`'s; `verify.md` works it through. `does not split an over-constraint with the table frame` guards the class the other way, watched failing on `expected false to be true`.

## 4. A remembered height is re-clamped, not rewritten

- [ ] 4.1 The panel re-clamps a remembered height against the current column on mount and on resize; the stored value is left alone — test: `a height dragged in a tall window is clamped in a short one`, `a wider window gives the dragged height back`; negative: the re-clamp writing back to storage, watched failing on the second case. `appliedGanttHeight` and the measuring layout effect are written and the pure half has watched negatives, but `ganttRoomPx` is always `null` in jsdom — the whole re-clamp path is dead there, and the storage negative has nowhere to run.

## 5. The boundary follows the pointer

- [ ] 5.1 Chromium: with room above, a drag up moves `handleTop` up and makes the panel taller in the same gesture — test: `e2e/gantt.spec.ts` `dragging up moves the boundary up`; negative: the panel made `shrink-0` again with slack below it, watched failing on `handleTop` unchanged — the exact symptom measured on 2026-08-29 (159.71 → 337.71 with `handleTop` fixed at 569). **Not implemented, and the mechanism this slice names cannot do it**: `flex-shrink` is only consulted for _negative_ free space, and the symptom is 226px of _positive_ leftover sitting below the panel. Moving that leftover is `unified-scroll-docking`'s decision to revisit, not this change's to patch — `verify.md` has the reasoning. The assertion is written as `test.fixme` beside it.

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the whole `CI=1` Playwright gate on **free** ports 3100/3200/4200 — never the shared dev server, which is what made this bug survive the gate's own suite (`LLM_README.md` landmine). Not run. `fe-01:test`, `fe-01:lint` and `fe-01:typecheck` were, and their output is in `verify.md`.
