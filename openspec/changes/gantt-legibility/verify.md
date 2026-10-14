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

## Review round (Fable, 2026-10-14)

- F-037 number kept: `gantt-bar-labels.test.tsx` "writes its number once per bar" failed with
  the number arm absent on `expected 'no estimate' to be '010 · no estimate'`.
- Hatched label ground: the browser contrast spec, now seeding an on-hold row and a row waiting on
  it, failed in both schemes on the hatched orange bar at 3.6966327586007055 before the ground.
- Done slivers: `gantt-panel-fill.test.tsx` failed without the 8px floor on
  `expected '#16a34a' not to be '#16a34a'`.
- Export months: `gantt-axis-months.test.tsx` failed with the export's month arm removed on
  `expected [ 'Sep 2026', 'hull - hull', …(83) ] to include 'Oct 2026'`. The body boundary
  travels in the cloned chart and is asserted there.
- Playwright on a298b8622: 153/153 passed across gantt.spec, gantt-legibility, gantt-detail,
  gantt-attempts, status, dark-mode, plan-surface, pointed-row-offscreen, scroll-stability,
  mobile and hover-cards.
- CI correction: the red `gate twilight` on 589f18d8c was a `twilight-dash:test` flake
  (`review-selection-objects.test.ts:868`, leftover `.pending-*`), not twilight-burokrat and not
  a timeout. Rerun requested; superseded by the CI run on the new head.
- `nx run wbs-fe-01:test` 925 + 3877 + 5 passed; `typecheck` and `lint:fast` successful.

## Cumulative specification reconciliation — 2026-10-14

The copied Leaves requirement in this delta still claimed that Detail off hid
assumed leaf bars. That contradicted the September 11 directive recorded in
`detail-keeps-unestimated/specs/wbs-domain/spec.md`, the renderer's `drawnBars =
placed.bars`, and gantt-panel.test.tsx's detail-switch assertions: assumed bar
count stays one across both states, while parent carets disappear with brackets.
Updated the copied requirement, half-estimated leaf scenario and caret paragraph
to the existing renderer behavior. Updated the earlier detail delta's obsolete
`?` label wording to this change's `no estimate` wording. Renderer behavior was
not changed during integration.

## Review round 2 (Fable, 2026-10-14)

- D6 fallback order: `number · no estimate` → `number` → nothing. With the phrase ahead of the
  number (round 1), `gantt-bar-labels.test.tsx` failed on
  `expected 'no estimate' to be '010 · no estimate'` at two workdays.
- Done slivers keep a 1px green edge: `gantt-panel-fill.test.tsx` failed with the sliver's edge
  in its own colour on `expected '#94a3b8' to be '#16a34a'`, and with the 8px floor removed on
  `expected [ '[stroke-width:2]', …(2) ] to not include '[stroke-width:2]'`.
- `nx run wbs-fe-01:test` 926 + 3883 + 5 passed; `typecheck` and `lint:fast` successful.
- Playwright (Gantt, layout and phone suites): 152/153 passed. The one failure,
  `hover-cards.spec.ts:1075`, reproduced 2 in 5 before merging main and passed 6/6 after; main
  alone passed 5/5.

## Full screen fills its width (F-062, 2026-10-14)

Worktree `ui-gantt-full`, `E2E_PORT_SHIFT=2100`, on integration-1 abd06e9ad.

- `gantt-legibility.spec.ts` "full screen fills its width at every rung" (1440 and 1024; Days,
  Weeks, Months): on the base it failed at Days on `last column 804px short of the edge` (1440)
  and `388px` (1024). The full-screen layer remounts the scroll box, and the width observers were
  still watching the detached one, which measures 0.
- With `fullScreen` dropped from the measuring effect's dependencies, the same messages appeared.
  With the full-screen loop skipped, the back-under-the-plan assertion failed on
  `expected 1144 to be less than 20` (1440) and `728` (1024).
- With the observers fixed and no room check on month names, it failed at Weeks 1440 on
  `last column 16px short of the edge, scrolls: true`: "Jan 2027" on the last cell ran 15px past
  the chart. `gantt-axis-months.test.tsx` failed without the check on
  `expected [ 'Oct 2026', 'Nov 2026', 'Dec 2026' ] to deeply equal [ 'Oct 2026', 'Nov 2026' ]`.
- Playwright: 113 passed and 4 skipped across gantt-legibility, gantt-detail, gantt.spec,
  gantt-attempts, gantt-minute-estimate, dark-mode, scroll-stability and mobile.
- `nx run wbs-fe-01:test` passed 929 + 3947 + 5; `typecheck` and `lint:fast` were successful.
  OpenSpec `validate --all` passed 192/192.

## Release pixel investigation — 2026-10-14

PR run `38522362798`, pixels shard 1/4, failed the exact box comparison in
`gantt-detail.spec.ts`. Before: `{x:203, y:847.0399780273438, width:58,
height:10.96002197265625}`. After: `{x:203.5, y:847.5399780273438, width:57,
height:9.96002197265625}`. Center and fill geometry match; the critical stroke
contracted from 2px to 1px. Independent full dispatch `38522426632` passed the
same shard at the same prior SHA, as reported by the integration owner.

The failed trace proves the fixture race. At trace time **276557.194 ms**, all
four bars were still unestimated and critical, with `010 Dev data-finish=0`.
The baseline box was read around **276580 ms**. The estimate command started
at **276478.041 ms** and took **136.991 ms**, completing after that baseline.
At **276693.071 ms**, after the Detail click, `010 Dev` was costed at finish 3
and `020` had float 3, lost critical status and its 2px outline. The click
coincided with the pending estimate's schedule refresh; Detail did not change
the schedule.

The fixture now waits for rendered `010 Dev data-finish=3` before taking the
baseline. It keeps the exact before/after box comparison and zero retries.
This is readiness repair, not a tolerance increase or renderer change. The
four focused component suites passed **314 tests**. Local browser execution
was refused by the required canonical lock (exit **70**, missing
`/home/puni1/.cache`). A deterministic delayed estimate/schedule response
negative and a green browser run on the host remain unverified and must be
recorded before release approval.
