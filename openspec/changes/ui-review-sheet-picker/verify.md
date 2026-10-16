# Verify

## Original standalone #515 evidence

All runs 2026-10-16 in `/home/df/wd/puni/ui-sheet-picker` (branch from main
3e06eb5a4), Chromium on Linux, `E2E_PORT_SHIFT=1700`.

## Commands and results

- `bunx nx run wbs-fe-01:test:unit --skip-nx-cache` — 75 files / 940 tests passed.
- `bunx nx run wbs-fe-01:test --skip-nx-cache` — first run: 1 failure, `project-page.test.tsx` `refreshes the picker catalogue…` timed out because it looked for the toast inside the p3 table; the stack is portalled now, so the test asks for the table and the toast separately. The file alone afterwards: 103/103 passed. Full rerun: node 75 files / 940, jsdom 208 files / 4126, zoned 4 files / 5 — all passed (exit 0).
- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01` — passed.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 215/215 passed.
- Playwright: header, project-picker, plan-import, reference-cell-panel, mobile, hints, import-with-ai, toolbar-panels, dark-mode, directory, home — 105 passed; `reference-cells.spec.ts --repeat-each 3` — 15 passed.

## R5 proofs (observed failures)

- F-085 (`e2e/plan-import.spec.ts`, 390×844): on main the hit test at the toast's centre found `<button class="inline-flex shrink-0 …` (a sheet row); portalled without `pointer-events-auto` the same; without `ModalContent`'s toast guard, tapping the toast's ✕ closed the sheet (`element(s) not found`); without `font-sans` the toast read `"Times New Roman"`.
- F-086 (`e2e/header.spec.ts`): on main the names ran past the list's inner edge by `[46, 61]` px at 1440, `[135, 150]` at 1024, `[158, 173]` at 375; `data-fact` dropped from the box → `Received: null`. The reworded preconditions of the two older picker tests failed with the entry back on one line (`Received: 1`).
- F-092 (`e2e/reference-cells.spec.ts`, 390×844, 25 long tags): on main the dialog scrolled sideways `Received: 73`; without the modal-surface bound the same 73; `textOverflow: 'clip'` → 27 cut lines without an ellipsis; `data-fact` dropped → 27 lines without their words; without the block-line rule inside the phone media query → 27 lines that are flex rows.

## Combined #504 and #515 candidate

This section covers the merge of exact heads `5288fce7f` and `102a2e098` in
`/tmp/pr512-combined-picker` on 2026-10-16. The earlier section records the
standalone #515 implementation; its ellipsis and fact-card expectations are
superseded on bottom sheets by visible wrapping.

The merge preserves #504's traced-tag fixture and #515's 25-long-tag fixture.
The long-name check now measures actual text Range fragments and symmetric
12px vertical padding after touchscreen opening. It requires full painted
names and no horizontal sheet or list pan. Native `scrollIntoView` remains
necessary to expose a priority option against the scrolling table's bottom.
No changes from the rejected manual-scroll candidate were imported.

### Watched negatives

- With #515's inline nowrap retained, `long directory names stay fully visible without panning the reference sheet` failed: the first long option was visibly clipped.
- Restoring only inline `padding: 2px 6px` failed that case on expected padding >=12, received2.
- Omitting the native `scrollIntoView` call failed `exposes the active priority option at the scrolling table edge`: expected active option centre hit true, received false.

### Combined candidate commands and results

All commands ran from `/tmp/pr512-combined-picker`, except Vitest from
`apps/wbs/fe-01`. The browser servers built the frontend as part of startup.

- `CI=1 E2E_PORT_SHIFT=2900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts reference-cells.spec.ts reference-cell-panel.spec.ts` — **12/12 passed**, 2.3 minutes. Includes the original mobile three-chip case, 25 long names on a touchscreen, table-edge priority scrolling, desktop references and picker panels.
- `CI=1 E2E_PORT_SHIFT=2900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts header.spec.ts plan-import.spec.ts --grep 'widest entry|long entry wraps|two imports of one long name|refused import is drawn above'` — **4/4 passed**, 39.7 seconds. Covers wide and wrapped project names, distinguishable imports, and toast hit testing/dismissal above the sheet.
- `bunx vitest run src/components/wbs/creatable-picker.test.tsx src/components/wbs/reference-set-field.test.tsx src/components/wbs/project-page.test.tsx src/components/wbs/toasts.test.tsx src/styles.test.ts --no-file-parallelism --maxWorkers=1` — **5 files, 173/173 passed**.
- `bunx eslint` on the eight changed TS/TSX files — exit **0** without warnings. `NX_DAEMON=false bunx nx show project wbs-fe-01 --json` generated the graph first, so the boundary rule ran.
- `bunx tsc --project apps/wbs/fe-01/tsconfig.app.json --noEmit` and `bunx tsc --project apps/wbs/fe-01/tsconfig.e2e.json --noEmit` — exit **0** each.
- `bunx prettier --check` on the nine changed frontend files and this change directory — all matched files formatted. `git diff --check` — exit **0**.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` — **220/220 valid** (202 changes, 18 specs).

### Limits

Full host gate and hosted CI have not run on this combined candidate. No push,
host gate or raw full Nx gate ran. Chromium is the existing browser contract;
no new scroll API is used. Existing Vite configuration and proxy disconnect
warnings occurred during browser runs. Nx generated its graph in process after
the sandbox denied plugin worker sockets.
