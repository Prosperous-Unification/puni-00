# Verify — Gantt legibility (ui-review F-012, F-013, F-023, F-026, F-037, F-038)

Local, worktree `ui-gantt`, `E2E_PORT_SHIFT=1900`, 2026-10-13.

## Commands

- `bunx nx run wbs-fe-01:test` (with `test:unit`): 74 files / 925 tests, 195 / 3849, 4 / 5 — all passed.
- `bunx nx run wbs-fe-01:typecheck` and `lint:fast`: successful.
- Playwright, Chromium: `gantt.spec gantt-legibility gantt-detail gantt-attempts
gantt-minute-estimate arrange-by-schedule hover-cards dark-mode plan-surface status
pointed-row-offscreen live-caret mobile` — first run 159 passed, 3 failed (strip height
  and the `?` lookup), fixed in `e2303e363`; reruns 9/9 and 143/143 passed.

## R5 proofs (each watched failing)

- F-012 `gantt-bar-labels.test.tsx`: `labelLaneOf` back to the whole bar band →
  `sand-plan label bottom: expected 50.96 to be less than or equal to 42.01`.
  Browser, on the base commit: `? · 130 · Row guess over ? · 130 · Row guess`.
- F-037: base code → `expected '? · 010 · KB · Strip' to be 'no estimate'`.
- F-038 `gantt-geometry.test.ts`: tab10 → `#1f77b4 label: expected 4.8208…`;
  0.35 threshold → `#2ca02c label: expected 3.4025…`. Browser spec on base:
  green label 3.4025803501541017 in both schemes; done bars at 75% fill only:
  3.2579494463966228 in light.
- F-023 `gantt-axis-months.test.tsx`: base → `expected [] to deeply equal [ 'Oct 2026', … ]`.
- F-026 `gantt-panel-fill.test.tsx`: schedule horizon → `expected 15 to be ≥ 250`;
  sub-day-only floor → `expected 1 to be ≥ 4`. Browser: right edge 260, expected > 1404.
- F-013 browser spec on base: `Names struck through when off`, expected false, received true.
- Strip size, measured and backed out: a 32px strip failed `scroll-stability.e2e.ts`
  (`[data-table-frame] leaves mismatched faces at end`, 0.2268; 0.1504 at 24px), and the
  toolbar's `text-xs` at the old height alone brought `gantt.spec.ts:3883`'s marker-rule body
  ink back (delta 40, columns 122–124) in 2/10 local runs against 10/10 green on the base.
  With the strip's metrics restored: 20/20 across both, repeated 10 times.
