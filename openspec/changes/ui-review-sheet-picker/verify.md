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

## Current-main reconciliation of #515 review fixes, 2026-10-16

Base: `5274046bdb0835727e22f98901a849afaad3b4a7`, isolated checkout
`/tmp/puni-ui515-reconcile`. This candidate applies the unique review fixes from
`89b1b62ebd078857adc86afece4551054bb429df`, without replaying its merge onto
main. Bottom-sheet names still wrap in full with symmetric touch padding;
the existing touchscreen and table-edge scrolling regressions, picker CSS,
and all combined-candidate evidence above are retained.

The reference-sheet fact-card paint assertion is a separate mouse case at
390×844. It does not replace the touchscreen whole-name regression or require
touch readers to hover. The new mouse case has not run on this candidate.

### Historical review-round proofs

Commit `89b1b62e` records the following observed failures on `102a2e098` on
2026-10-16. These are historical evidence, not fresh runs on this reconciliation:

- Guarding only `onPointerDownOutside` left Radix's `onInteractOutside` able to close Project settings: both the desktop toast-dismiss case and nested 390×844 case failed with settings dialog `element(s) not found`.
- A portalled card at `zIndex: 20` failed the original reference-sheet paint probe with `the fact card is painted under <div role="dialog" … data-modal-surface="bottom"`.
- The keyboard shortcuts backdrop at `z-100` failed the standing-toast paint probe with `covered by <div role="presentation" data-cheat-sheet-backdrop …`.
- The project list at input width failed the imported-name line-count assertion at 375px with `[3,3]` lines.

### Fresh local checks and limits

- Changed-file Prettier `--check`: exit 0, all matched files formatted. `git diff --check`: exit 0.
- Preservation inspection: removing only the added mouse describe block reproduces the base reference-cell test byte for byte; `creatable-picker.tsx` is byte for byte unchanged; the prior `verify.md` is an unchanged prefix.
- OpenSpec validation is **unavailable locally**: the cached 1.12.0 CLI has no dependency tree. Direct Bun execution tried its read-only auto-install cache and exited `EROFS`; `bun --no-install` identified missing `commander`, and supplying the workspace dependency path then identified missing `diff`. No dependency installation was attempted after the host OOM.
- No local unit/component suite, browser suite, mutation run, lint, typecheck, build, full Nx gate or h2puni gate ran for this candidate. Hosted CI must verify those checks; the adapted mouse paint probe especially needs a fresh positive and a negative with the card layer restored to 20.
- This local review candidate has not been pushed, merged, archived or deployed. It requires architect review before publication.

### Hosted exact-source mouse paint proof, 2026-10-16

Source: `15202bdf5c2c6cb26b7e1dd70dd5d23c7eda2047`; tree:
`8adc72f3b706a4703f9ad956b2a428d68fef266c`. This source corrects the mouse
fixture to search the unassigned `seeded.tags[2]` consistently. The seed assigns
the first two tags to row 010, and its picker excludes assigned entries.

[Hosted CI run 38859293390](https://github.com/Prosperous-Unification/puni-00/actions/runs/38859293390)
passed all four browser shards and the `pixels` aggregate. Shard 3 artifact
`12028529973` (`wbs-table-screenshot-3-1`) records the exact Chromium test
`390x844 reference sheets with a mouse › an option fact card is painted above its reference sheet`
at `reference-cells.spec.ts:703`: passed, retry 0, no errors, 4.787s.

[Isolated proof run 38863950723](https://github.com/Prosperous-Unification/puni-00/actions/runs/38863950723)
passed using proof workflow commit `c73a65bb42414432c0837631bb48c76bbed41505`.
Its checkout pins the source SHA above, grants only `contents: read`, and does
not persist checkout credentials. Each phase invokes the same production test
with the production Playwright config, one Chromium worker and `--retries=0`:

```sh
bunx playwright test --config apps/wbs/fe-01/playwright.config.ts reference-cells.spec.ts --project=chromium --grep 'an option fact card is painted above its reference sheet$' --workers=1 --retries=0
```

| Phase    | Named JUnit outcome | Exit | Duration |
| -------- | ------------------- | ---- | -------- |
| Baseline | 1 passed, 0 failed  | 0    | 5.285s   |
| Fault    | 0 passed, 1 failed  | 1    | 5.614s   |
| Restored | 1 passed, 0 failed  | 0    | 5.409s   |

The sole injected source change in `hover-card.tsx` was
`zIndex: portalled ? 'var(--layer-card)' : 20` → `zIndex: 20`. The fault failed
the paint assertion at `reference-cells.spec.ts:731`: `Expected: true`,
`Received: false`, with `the fact card is painted under <div role="dialog" …`.
The diagnostic's 80-character bound cuts the covering element's final
attribute at `data-modal-surface="botto`; the checker requires the named paint
failure, modal-surface attribute and expected/received values. The first proof
run `38863422208` observed this same negative but rejected its truncated
diagnostic; the corrected run above completed all three phases.

[Receipt artifact 12030645931](https://github.com/Prosperous-Unification/puni-00/actions/runs/38863950723/artifacts/12030645931)
(`ui536-paint-proof-38863950723-1`) contains per-phase logs, JUnit, HTML reports,
the negative screenshot and trace, the one-line fault diff, and source/restored
SHA and tree receipts. The restored SHA and tree match the source above;
tracked diffs were empty before injection and after restoration. Runner setup
did not dirty tracked source.

This hosted proof closes the mouse paint evidence gap above. No local browser,
Nx or full gate ran for this documentation update. The source CI workspace
gate was still running when this receipt was recorded; aggregate gates remain
required before merge. No merge, archive or deploy is recorded here.

## Lane review round (#515 BLOCK) on `ui-review/integration-4`, 2026-10-16

Command results on the lane commit `89b1b62e`; its watched proofs are listed
under Historical review-round proofs above.

- `bunx nx run-many -t test:unit test -p wbs-fe-01 --skip-nx-cache` — both targets succeeded (exit 0).
- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache` — passed.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 215/215 passed (after amending `project-dropdown-details`).
- Playwright: header, project-picker, plan-import, reference-cell-panel, mobile, hints, hover-cards, import-with-ai, toolbar-panels, dark-mode, directory, home, keyboard, project-settings, gantt — 229 passed (27.7 min); `reference-cells.spec.ts --repeat-each 3` — 15 passed.

## Re-merge of main 5274046bd (#514), 2026-10-17

Main's F-092 rule set kept (bottom sheets wrap, compact lists ellipsis + fact card); round-2 additions kept. Shift 1700, `--workers 2`:

- header, plan-import, project-settings — 27 passed.
- `reference-cells.spec.ts --repeat-each 3` — 18 passed (includes the card paint probe on main's wrapped line, watched failing with the card at `zIndex: 20`).
- `lint:fast` + `typecheck` (wbs-fe-01) — passed; `openspec validate --all --json` — 224/224.

## Integration-4 fix: list width independent of the header, 2026-10-16

On `ui-review/integration-4` (#528's outline Plan / Board selector), the list at the input's width was 196px at 1024. Fix: `md:min-w-72` on the listbox. Shift 5500:

- Proof (before the fix): `header.spec.ts` › `two imports of one long name read apart at every width` failed on `a name takes more than two lines at 1024px: [3,3]`, and the new check failed on `the list is narrower than 18rem at 1024px`, `Received: 196`.
- After: header 18 passed; plan-import 5 passed; mobile 28 passed; toolbar-panels 20 passed (`--workers 2`).
- `lint:fast` + `typecheck` (wbs-fe-01) passed; `openspec validate --all --json` — 231/231.

## Merge of main 5fdc19839 (#556, #561) into integration-4, 2026-10-16

Main's reconciled `hover-card.tsx` (pure placement extracted, card layer
already present) and its verify, tasks and spec wording kept; integration-4's
`md:min-w-72`, its 18rem rule, scenario and header assertion kept. Shift 6100,
`--workers 2`:

- header, plan-import, project-settings, reference-cells, hints, hover-cards — 85 passed (4.3m), including the mouse paint probe at `reference-cells.spec.ts:703`.
- `vitest` `project-page.test.tsx`, `hover-card.test.tsx`, `hover-card-placement.test.ts` — 147 passed.
- `lint:fast` + `typecheck` (wbs-fe-01) — passed; `openspec validate --all --json` — 247/247.
