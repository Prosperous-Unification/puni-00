<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The containment assertion, before the fix

- [ ] 1.1 Add to `e2e/gantt.spec.ts`: after a drag far past the available room, the panel's bottom is at or above the column's bottom, and `document.scrollHeight === window.innerHeight` — test: `stays inside the column it lives in`. **This must fail on the current code first**, on the measured `1200 > 955`; record the figures in `verify.md`. A fix written before this test is a fix with no oracle.

## 2. The clamp measures the column

- [ ] 2.1 `clampedGanttHeight(px, availablePx)` — the second argument renamed and re-documented as the column's room, not the viewport's; `GANTT_VIEWPORT_SHARE` deleted from the cap — test: `gantt-panel.test.ts` `caps at the room it is given`, `the floor wins over the cap`; negative: the argument fed `window.innerHeight` again, watched failing on the containment test from 1.1.
- [ ] 2.2 The handle computes `available` by **measuring** the column and the panel at `pointerdown` — the panel's own box, plus the unused space below it, plus what the table region may give up before its `min-height` — never from constants — test: `gantt-panel.test.ts` `the room is measured, not derived`; negative: `available` computed from `TABLE_NEEDS_HEIGHT` and a fixed toolbar height, watched failing in Chromium at a width where the toolbar wraps to two rows. jsdom measures every box at 0 and **cannot** be this slice's oracle.
- [ ] 2.3 The panel's `maxHeight` follows the same number instead of `80vh` — test: `the panel's ceiling is its column, not the window`; negative: `80vh` restored, watched failing on the containment test.

## 3. The panel can give space back

- [ ] 3.1 `shrink-0` dropped from the panel in the non-full-screen case; full screen's `flex-1 min-h-0` untouched — test: `an over-constrained column shrinks the chart`, `full screen still ignores the dragged height`; negative: `shrink-0` restored **with the clamp already fixed**, watched failing only on the resize case — which is the point: this is the backstop, and its own test has to be the one the clamp does not already cover.

## 4. A remembered height is re-clamped, not rewritten

- [ ] 4.1 The panel re-clamps a remembered height against the current column on mount and on resize; the stored value is left alone — test: `a height dragged in a tall window is clamped in a short one`, `a wider window gives the dragged height back`; negative: the re-clamp writing back to storage, watched failing on the second case.

## 5. The boundary follows the pointer

- [ ] 5.1 Chromium: with room above, a drag up moves `handleTop` up and makes the panel taller in the same gesture — test: `e2e/gantt.spec.ts` `dragging up moves the boundary up`; negative: the panel made `shrink-0` again with slack below it, watched failing on `handleTop` unchanged — the exact symptom measured on 2026-08-29 (159.71 → 337.71 with `handleTop` fixed at 569).

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the whole `CI=1` Playwright gate on **free** ports 3100/3200/4200 — never the shared dev server, which is what made this bug survive the gate's own suite (`LLM_README.md` landmine).
