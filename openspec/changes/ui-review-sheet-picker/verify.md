# Verify

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
