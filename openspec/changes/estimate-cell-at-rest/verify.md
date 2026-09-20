## Commands

### Slice 0 — baseline

- `git rev-parse HEAD` — exit 0; `cea74a7310c52cc7348a243c770a2dcf94a25b06`.
- `git status --short --untracked-files=all` — exit 0; no output before the slice began.
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 1 passed (1)`, `Tests 65 passed (65)` (N = 65).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-read-and-write.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 2 passed (2)`, `Tests 153 passed (153)` (M = 153).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts` from `apps/wbs/fe-01` — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)` (U = 578).
- Strict OpenSpec validation block — exit 0; one JSON report with `passed: 103`, `failed: 0` (V = 103). Evidence: `$TMPDIR/evidence/openspec-validation.baseline.CDMhDu.json`.

### Slice 1 — OpenSpec change

- Pre-edit `test ! -e` checks for `openspec/changes/estimate-cell-at-rest` and `openspec/specs/wbs-estimate-cell` — exit 0; `PRECHECK change=absent spec=absent`.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change estimate-cell-at-rest --schema sdd-lean` — exit 0; `Created change 'estimate-cell-at-rest'`.
- `grep -n "schema: sdd-lean" openspec/changes/estimate-cell-at-rest/.openspec.yaml` — exit 0; `1:schema: sdd-lean`.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 status --change estimate-cell-at-rest --json` — exit 0; schema `sdd-lean`, change root in this repository.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 instructions proposal --change estimate-cell-at-rest` — exit 1; auxiliary skill lookup used the filename instead of the artifact id and reported `Artifact 'proposal' not found ... Valid artifacts: intent, specs, design, tasks, verify`.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 instructions intent --change estimate-cell-at-rest` — exit 0; output path `openspec/changes/estimate-cell-at-rest/proposal.md`.
- Strict OpenSpec validation block — exit 0; one JSON report with `passed: 104`, `failed: 0`, exactly V + 1. Evidence: `$TMPDIR/evidence/openspec-validation.slice-1.R5Wg3j.json`.
- `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/estimate-cell-at-rest/proposal.md openspec/changes/estimate-cell-at-rest/tasks.md openspec/changes/estimate-cell-at-rest/verify.md openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md` — exit 0; all four files reported `(unchanged)`.
- The first `NX_DAEMON=false bunx nx format:check --all` invocation yielded after 30 seconds without a captured completion status; it was not accepted as verification.
- Re-run `NX_DAEMON=false bunx nx format:check --all` — exit 0 after resuming the captured session; no output.
- Final file-scoped Prettier pass over `verify.md` — exit 0; formatting completed.
- Final `NX_DAEMON=false bunx nx format:check --all` — exit 0; no output.
- Final strict OpenSpec validation — exit 0; `passed: 104`, `failed: 0`. Evidence: `$TMPDIR/evidence/openspec-validation.final.EF86mG.json`.
- Final artifact-content checks — proposal 339 words, five requirements, eight scenarios, and no pixel value in the delta specification.
- A composite status assertion exited 1 because it additionally expected `isPlanningComplete: true`; OpenSpec reports `false` while the omitted optional `design.md` remains `ready`. The required `intent`, `specs`, `tasks`, and `verify` artifacts each report `done`; the packet's file plan does not permit adding `design.md`.
- Corrected final artifact-status and scope checks — exit 0; required artifacts `done`, optional design `ready`, and only the five slice-1 paths changed.

### Slice 2 — the trio recedes at rest

- `git rev-parse HEAD` — exit 0; `c277440839ee5a821052b27b6862872d719501ca`.
- `git status --short --untracked-files=all` — exit 0; no output before the slice began.
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 1 passed (1)`, `Tests 65 passed (65)` (N = 65).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-read-and-write.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 2 passed (2)`, `Tests 153 passed (153)` (M = 153).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts` from `apps/wbs/fe-01` — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)` (U = 578).
- Strict OpenSpec validation block — exit 0; one JSON report with `passed: 104`, `failed: 0` (V = 104). Evidence: `$TMPDIR/evidence/openspec-validation.slice-2-baseline.oZJL58.json`.
- Slice 2 pre-edit assertions — exit 0; `finalSaysMore` and the trio box's `font: 'inherit'` were present; `QUIET_TRIO_PX`, `useState`, and `rolledTrio` were absent; the named describe block and slice-1 verification record were present.
- Red oracle after adding the four tests, helpers, import, and constant only — test exit 1 as required; `Tests 3 failed | 66 passed (69)`. The failures were `expected 'inherit' to be '10px'` in `quiets the trio while the cell is not being typed in`, the same message in `gives the trio back its strength on focus and quiets it again on blur`, and `expected '' to be '10px'` in `quiets a parent’s rolled-up trio exactly as a leaf’s`. Evidence: `$TMPDIR/evidence/slice-2-red.txt`.
- One-file oracle after the production edits — exit 0; `Test Files 1 passed (1)`, `Tests 69 passed (69)` (N + 4).
- Two-file oracle after the production edits — exit 0; `Test Files 2 passed (2)`, `Tests 157 passed (157)` (M + 4).
- Sandbox unit command after the production edits — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)`, unchanged from U.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0; `Successfully ran target typecheck for project wbs-fe-01`.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0; `Successfully ran target lint for project wbs-fe-01`.
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx openspec/changes/estimate-cell-at-rest/verify.md` — exit 0; all three files reported `(unchanged)`.
- `NX_DAEMON=false bunx nx format:check --all` — exit 0; no output.
- Final file-scoped Prettier pass over `verify.md` — exit 0; the file reported `(unchanged)`.
- Final repository-wide format check after the evidence append — exit 0; no output.
- `git diff --check` — exit 0; no output. The scope audit named exactly the three slice-2 paths.
- Post-evidence one-file oracle — exit 0; `Test Files 1 passed (1)`, `Tests 69 passed (69)`.
- Post-evidence `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0; `Successfully ran target typecheck for project wbs-fe-01`.
- Post-evidence `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0; `Successfully ran target lint for project wbs-fe-01`.
- Final strict OpenSpec validation — exit 0; `passed: 104`, `failed: 0`, unchanged from V. Evidence: `$TMPDIR/evidence/openspec-validation.slice-2-final.A0Hs3C.json`.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build` — exit 0; `Successfully ran target build for project wbs-fe-01` after 928 modules were transformed.

### Slice 3 — the result becomes the main reading

- `git rev-parse HEAD` — exit 0; `add5811c0de925d147e6adea727047d10b68f0a4`.
- `git status --short --untracked-files=all` — exit 0; no output before the slice began.
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 1 passed (1)`, `Tests 69 passed (69)` (N = 69).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-read-and-write.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 2 passed (2)`, `Tests 157 passed (157)` (M = 157).
- Sandbox unit command — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)` (U = 578).
- Strict OpenSpec validation block — exit 0; one JSON report with `passed: 104`, `failed: 0` (V = 104). Evidence: `$TMPDIR/evidence/openspec-validation.zNF8Vu.json`.
- Slice 3 pre-edit assertions — exit 0; Slice 2's `QUIET_TRIO_PX`, typing state, helpers, and verification record were present, and all old result guards and five Chromium pins were present.
- Red two-file oracle after test and Chromium-pin edits, before production edits — test exit 1 as required; `Tests 16 failed | 145 passed (161)`. The five message classes occurred exactly 7, 5, 2, 1, and 1 times: `expected '· 4' to be '4'`, `expected '· 3.7' to be '3.7'`, `expected undefined to be '5'`, `expected '· 2' to be '2'`, and `expected '· 5' to be '5'`. Evidence: `$TMPDIR/evidence/slice-3-red.txt`.
- Two-file oracle after production edits — exit 0; `Test Files 2 passed (2)`, `Tests 161 passed (161)` (M_after = M + 4).
- One-file oracle after production edits — exit 0; `Test Files 1 passed (1)`, `Tests 73 passed (73)` (N_after = N + 4).
- Cumulative against the pre-slice-2 baseline: N_after − N₀ = 73 − 65 = 8 and M_after − M₀ = 161 − 153 = 8.
- Sandbox unit command after the production edits — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)`, unchanged from U.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0; `Successfully ran target typecheck for project wbs-fe-01`.
- The first lint invocation exceeded its 30-second capture window and returned no terminal status; it was not accepted as verification. A subsequent invocation completed with exit 0 and `Successfully ran target lint for project wbs-fe-01`, reading the completed prior invocation's cached output.
- The first N5 patch-save command used an app-relative path while running from the repository root, so `diff` reported `No such file or directory`; the focused fault still produced the named failure. Before restoration, the patch was regenerated from the correct root-relative path with accepted diff status 1, then restoration passed `cmp`.
- File-scoped Prettier over the five Slice 3 paths — exit 0; all five files reported `(unchanged)`.
- `NX_DAEMON=false bunx nx format:check --all` — exit 0; no output.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache` — exit 0; `Successfully ran target lint for project wbs-fe-01`, cache skipped.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache` — exit 0; `Successfully ran target typecheck for project wbs-fe-01`, cache skipped.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build --skip-nx-cache` — exit 0; `Successfully ran target build for project wbs-fe-01` after 928 modules were transformed, cache skipped.
- Final strict OpenSpec validation — exit 0; `passed: 104`, `failed: 0`, unchanged from V. Evidence: `$TMPDIR/evidence/openspec-validation.slice-3-final.drNaGb.json`.
- Final one-file oracle after proof comments and evidence updates — exit 0; `Test Files 1 passed (1)`, `Tests 73 passed (73)`.
- Final two-file oracle after proof comments and evidence updates — exit 0; `Test Files 2 passed (2)`, `Tests 161 passed (161)`.
- Final sandbox unit command — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)`, unchanged from U.

### Slice 4 — the dark-mode check and the record

- `git rev-parse HEAD` — exit 0; `a62da783f7839dc2d1593bb1bf4296e55758bda1`.
- `git status --short --untracked-files=all` — exit 0; no output before the slice began.
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 1 passed (1)`, `Tests 73 passed (73)` (N = 73).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-read-and-write.test.tsx` from `apps/wbs/fe-01` — exit 0; `Test Files 2 passed (2)`, `Tests 161 passed (161)` (M = 161).
- Sandbox unit command — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)` (U = 578).
- Strict OpenSpec validation baseline — exit 0; one JSON report with `passed: 104`, `failed: 0` (V = 104). Evidence: `$TMPDIR/evidence/openspec-validation.slice-4-baseline.PmWWh1.json`.
- Slice 4 pre-edit assertions — exit 0; Slices 2 and 3's production and layout changes were present, the dark contrast test was absent, and the verification record carried Slices 1 to 3.
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/dark-mode.spec.ts` — exit 0; the file reported `(unchanged)`.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0; `Successfully ran target typecheck for project wbs-fe-01`.
- The first lint invocation exceeded its 30-second capture window and returned no terminal status; it was not accepted as verification. An immediate second invocation collided with that still-running process and exited 1 with `Recursive task invocation detected`. After the process ended, `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache` completed with exit 0 and `Successfully ran target lint for project wbs-fe-01`.
- Post-edit one-file oracle — exit 0; `Test Files 1 passed (1)`, `Tests 73 passed (73)`, unchanged from N.
- Post-edit two-file oracle — exit 0; `Test Files 2 passed (2)`, `Tests 161 passed (161)`, unchanged from M.
- Post-edit sandbox unit command — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)`, unchanged from U.
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/dark-mode.spec.ts openspec/changes/estimate-cell-at-rest/verify.md` — exit 0; both files reported `(unchanged)`.
- `NX_DAEMON=false bunx nx format:check --all` — exit 0 after resuming the captured process; no output.
- Strict OpenSpec validation after the Slice 4 edits — exit 0; `passed: 104`, `failed: 0`, unchanged from V. Evidence: `$TMPDIR/evidence/openspec-validation.slice-4-final.SGFVM7.json`.
- Final record-only Prettier pass over `verify.md` and repository-wide format check — exit 0; Prettier reported `(unchanged)` and the format check produced no output.
- Final cached `NX_DAEMON=false bunx nx run wbs-fe-01:lint` and `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` reruns — exit 0; each reported `Successfully ran target`.
- Post-record OpenSpec validation — exit 0; `passed: 104`, `failed: 0`, unchanged from V. Evidence: `$TMPDIR/evidence/openspec-validation.slice-4-post-record.JoilJ2.json`.
- Final one-file oracle — exit 0; `Test Files 1 passed (1)`, `Tests 73 passed (73)`, unchanged from N.
- Final two-file oracle — exit 0; `Test Files 2 passed (2)`, `Tests 161 passed (161)`, unchanged from M.
- Final sandbox unit command — exit 0; `Test Files 38 passed (38)`, `Tests 578 passed (578)`, unchanged from U.

## Negative proofs

### Slice 1

None. This slice adds specification artifacts and no production safety check.

### Slice 2

- N1, replaced the rest branch with the full-strength arm. The focused Vitest command exited 1 with `Tests 1 failed | 68 skipped (69)` and `AssertionError: expected 'inherit' to be '10px'`; restoring the saved bytes passed `cmp`, and the same named test reran green with `Tests 1 passed | 68 skipped (69)`. Evidence: `$TMPDIR/evidence/n1-rest-arm-deleted.patch` and `n1-rest-arm-deleted.txt`.
- N2, narrowed `problem !== null || typing` to `problem !== null`. The focused command exited 1 with `Tests 1 failed | 68 skipped (69)` and `AssertionError: expected '10px' to be 'inherit'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n2-focus-arm-deleted.patch` and `n2-focus-arm-deleted.txt`.
- N2b, deleted only the wrapper's `setTyping(false);`. The focused command exited 1 with `Tests 1 failed | 68 skipped (69)` and `AssertionError: expected 'inherit' to be '10px'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n2b-blur-reset-deleted.patch` and `n2b-blur-reset-deleted.txt`.
- N3, dropped `problem !== null ||` and left `typing`. The focused command exited 1 with `Tests 1 failed | 68 skipped (69)` and `AssertionError: expected '10px' to be 'inherit'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n3-refusal-guard-deleted.patch` and `n3-refusal-guard-deleted.txt`.
- N4, dropped the quiet size, weight, and colour declarations from the rolled-up trio. The focused command exited 1 with `Tests 1 failed | 68 skipped (69)` and `AssertionError: expected '' to be '10px'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n4-parent-style-deleted.patch` and `n4-parent-style-deleted.txt`.

### Slice 3

- N5, dropped `!unfolded &&` from `showsResult`. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected <span …(2)></span> to be null`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n5-unfolded-guard-deleted.patch` and `n5-unfolded-guard-deleted.txt`.
- N6, dropped the repeat guard from the leaf box's rest colour. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected 'var(--muted-foreground)' to be 'transparent'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n6-flat-box-guard-deleted.patch` and `n6-flat-box-guard-deleted.txt`.
- N6b, dropped the repeat guard from the rolled-up trio's colour. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected 'var(--muted-foreground)' to be 'transparent'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n6b-flat-parent-guard-deleted.patch` and `n6b-flat-parent-guard-deleted.txt`.
- N7, dropped `final !== ''` from `showsResult`. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected <span …(2)></span> to be null`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n7-empty-guard-deleted.patch` and `n7-empty-guard-deleted.txt`.
- N8, restored `fontSize: 10` on the result. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected '10px' to be ''`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n8-result-size-restored.patch` and `n8-result-size-restored.txt`.
- N8b, restored `fontWeight: 'normal'` on the result. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected 'normal' to be ''`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n8b-result-weight-restored.patch` and `n8b-result-weight-restored.txt`.
- N8c, restored `color: 'var(--muted-foreground)'` on the result. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected 'var(--muted-foreground)' to be ''`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n8c-result-color-restored.patch` and `n8c-result-color-restored.txt`.
- N8d, removed `fontVariantNumeric: 'tabular-nums'` from the result. The focused command exited 1 with `Tests 1 failed | 72 skipped (73)` and `AssertionError: expected '' to be 'tabular-nums'`; restoration passed `cmp`, and the named test reran green. Evidence: `$TMPDIR/evidence/n8d-tabular-numerals-deleted.patch` and `n8d-tabular-numerals-deleted.txt`.

## Pending planner verification

- `NX_DAEMON=false bunx nx run wbs-fe-01:test` — pending planner verification because sandboxed Node cannot spawn Bun.
- `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` — pending planner verification for the same sandbox restriction.
- Slice 3 changed the seeded result pin from `· 4` to `4` in `holds a trio and its figure on one line of a folded step cell` — written, not run; pending planner verification.
- Slice 3 changed the wide result pins from `· 25` to `25` in that test — written, not run; pending planner verification.
- Slice 3 rewrote that test's three size-budget comments for the reversed type hierarchy — written, not run; pending planner verification.
- Slice 3 widened `measure()` with resting focus, computed type, ink, and numeric-variant fields — written, not run; pending planner verification.
- Slice 3 added the five wide-case resting/main-reading assertions — written, not run; pending planner verification.
- Slice 3 changed the parent and leaf result pins from `· 4` to `4` in `stands a parent’s figure in the same slot as its leaves’` — written, not run; pending planner verification.
- Planner P0, P1, and P1b are recorded below as completed outside the executor sandbox; they are no longer pending.
- P2, the unsharded Chromium gate after Slice 4 — pending planner verification.
- `the quiet trio in a folded step cell stands off the row it is in` — written and statically checked, not run; pending planner verification inside P2 and P4.
- P3, the staffed fractional-cell measurement and finding on the reviewed commit — pending planner verification.
- P4, the dark contrast test's transparent-ink fault, byte restoration, green rerun, and adjacent dated `Proof:` comment — pending planner verification.
- P5, light and dark visual review with preserved screenshot evidence — pending planner verification.
- P6, `bin/h2puni-gate.sh <sha>` on the shared build host — pending planner verification.

## Not verified

- `bin/h2puni-gate.sh <sha>` was not run because the host gate is unavailable on this machine and this executor cannot create the required commit.
- No browser ran inside any executor attempt; the browser checks listed above require planner verification outside the sandbox.
- No Slice 3 Chromium assertion was run in this attempt; the sandbox has no browser execution authority.

## Planner, P0 (before slice 2)

- 2026-09-20, commit `538cfe98`, unchanged production code: `CI=1 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- --grep "folded step cell|same slot as its leaves"` with `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT` and `AGENT` unset: **2 passed** in Chromium (`holds a trio and its figure on one line of a folded step cell` 3.1s, `stands a parent’s figure in the same slot as its leaves’` 3.3s; 16.7s wall clock with the stack's start). Chromium was already installed, so `playwright install --with-deps` was not run. The gate was green before the change.

## Planner, after slice 2

- 2026-09-20: replayed N2b outside the sandbox (deleted only `setTyping(false)`): `gives the trio back its strength on focus and quiets it again on blur` failed with `expected 'inherit' to be '10px'`, 1 failed of 69; restored byte for byte (`cmp`), then the two-file oracle passed 157 of 157.
- `NX_DAEMON=false bunx nx run-many -t typecheck lint test:unit -p wbs-fe-01 --skip-nx-cache` with the agent variables unset: all three targets succeeded.
- Not run here: `wbs-fe-01:test` (the zoned tier), Chromium, the host gate; they follow slice 3 and slice 4.

## Planner, after slice 3

- 2026-09-20: replayed N6 outside the sandbox (the flat leaf's `transparent` removed): `says a flat trio once` failed with `expected 'var(--muted-foreground)' to be 'transparent'`, 1 failed of 73; restored byte for byte.
- P1, Chromium, with slice 3 applied: `--grep "folded step cell|same slot as its leaves"`: **2 passed** (3.4s and 3.6s; 16.2s wall clock). Decision rule D1 did not fire.
- P1b, Chromium, the fit test alone, one fault at a time in `estimates.tsx`, each restored with `cp` and `cmp`:
  - CN-a, rest arm deleted: `wide.boxType` failed, `Expected: "10px"`, `Received: "13px"`.
  - CN-b, `fontSize: 10` back on the result: `figureType` failed, `Expected: "13px"`, `Received: "10px"`.
  - CN-c, muted colour back on the result: `figureInk` failed, `Expected: "oklch(0.129 0.042 264.695)"`, `Received: "oklch(0.554 0.046 257.417)"`.
  - CN-d, `fontVariantNumeric` removed: `figureNumerals` failed, `Expected: "tabular-nums"`, `Received: "normal"`.
  - `wide.boxFocused` is a measurement precondition; no production fault belongs to it.
- `NX_DAEMON=false bunx nx run-many -t typecheck lint test -p wbs-fe-01 --skip-nx-cache` with the agent variables unset, on slice 3 plus the planner's proof comments: all three targets succeeded (`test` runs both tiers).

## Planner, after slice 4

- P2, 2026-09-20: the whole Chromium gate, unsharded, `CI=1 NX_DAEMON=false bunx nx run wbs-fe-01:e2e` with the agent variables unset: **376 passed, 40 skipped** in 19.4 minutes. Among them `the quiet trio in a folded step cell stands off the row it is in`, `a step’s figure lands at one x whether or not the row is assigned` and `stands a parent’s figure in the same slot as its leaves’`. Decision rule D2 did not fire.
- P4: with the box's rest arm painting `color: 'transparent'` unconditionally, the contrast test failed on `Error: the quiet trio reads at 1.00:1` (`Expected: >= 4.5`, `Received: 1`); restored byte for byte (`cmp`), rerun: 1 passed. The `Proof:` comment stands above the test.
- The ratio itself, read with a temporary `console.log` that was removed again: **7.66:1** under the dark palette, against the 4.5 the test requires.
- P3, a measurement and not a gate: the temporary staffed, fractional block on this tree printed `STAFFED {"said":"24.3", "cell":{"width":104}, "box":{"width":30.6875}, "figure":{"width":25.3125}, "clipped":16, "boxType":"10px", "boxFocused":false}` and failed `Expected: <= 0`, `Received: 16`. The spec was restored byte for byte. The same arrangement clips 28px on unchanged main (measured while planning), so this change improves it and does not close it; it is scheduled as its own work item.
- P5, by eye. Light (the picture the whole-gate run left): in the Dev column the result `4` stands at the right edge in the row's weight and the trio `2/3/8` sits beside it small and grey; it reads as a number with its annotation. Dark (a temporary screenshot line, removed again, the spec restored with `cmp`): the same arrangement, `2/4/6` and `4`; the trio is legible and clearly secondary. Neither palette hides the trio; an unestimated cell shows only its `o/r/p` placeholder.
- Still owed before landing: the whole `wbs-fe-01` test, typecheck and lint on the final tree, and `bin/h2puni-gate.sh` on the merged commit.
