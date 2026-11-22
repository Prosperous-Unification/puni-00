# verify — keep-single-estimate-visible

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 121 passed, 0 failed. This change was valid; the CLI emitted an informational archive warning because the main wbs-estimate-cell spec is absent. File-scoped bunx prettier --check exited 0 for every new file.

| Command                                                                                | Result                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bun install --frozen-lockfile                                                          | Exit 0; checked 1602 installs across 1447 packages, no changes.                                                                                                                      |
| env -u CLAUDECODE bun test ./apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx | Exit 1 before assertions: TypeError: vi.hoisted is not a function at line 36; 0 pass, 1 fail, 1 error. The earlier review's makeRedactionPolicy export error did not reproduce here. |

## Implementation checks — 2026-09-27

| Command                                                                                                                                                                                                             | Result                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx vitest run src/components/wbs/plan-estimates.test.tsx --no-file-parallelism --maxWorkers=1 -t 'says a flat trio once\|shows a parent’s rolled-up trio once'` from `apps/wbs/fe-01`                            | Before rendering edits: exit 1, both tests failed on `expected 'transparent' to be 'var(--muted-foreground)'`. After restoring the fix: exit 0, 2 passed.                             |
| `bunx vitest run src/components/wbs/plan-estimates.test.tsx --no-file-parallelism --maxWorkers=1` from `apps/wbs/fe-01`                                                                                             | Exit 0, 74 passed. Covers differing result, focus, refused input and incomplete draft cases already in the file.                                                                      |
| `bunx nx run wbs-fe-01:test`                                                                                                                                                                                        | Exit 0 after `bunx nx reset`: UTC suite 148 files and 3107 tests passed; zoned suite 2 files and 3 tests passed.                                                                      |
| `CI=1 E2E_PORT_SHIFT=1900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts apps/wbs/fe-01/e2e/dark-mode.spec.ts -g 'the quiet trio in a folded step cell stands off the row it is in' --workers=1` | Exit 0, 1 Chromium test passed. It checked saved 5 after reload, absent duplicate final span and readable ink. `bun run tools/dev/setup.ts` first created local ignored `.env` files. |
| `bunx nx run wbs-fe-01:lint:fast`                                                                                                                                                                                   | Exit 0.                                                                                                                                                                               |
| `bunx nx run wbs-fe-01:typecheck`                                                                                                                                                                                   | Exit 0, including `typecheck:module`.                                                                                                                                                 |
| `bunx prettier --check` on the three touched frontend files and the change's `tasks.md` and `verify.md`                                                                                                             | Exit 0 after all code, task and verification edits.                                                                                                                                   |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                            | Exit 0, 127 passed, 0 failed. Informational archive warnings remain for deltas whose main specs do not yet exist.                                                                     |

### R5 fault proofs

| Injected fault in `plan-columns/estimates.tsx`                                     | Observed production-path failure                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Removed `final !== atRest` from `showsResult`, restoring the duplicate final span. | Both equal-value component tests failed on `expected <span ...> to be null`; the received span held `5`. Restored the condition. |
| Restored transparent ink for equal leaf and parent trios.                          | Both equal-value component tests failed on `expected 'transparent' to be 'var(--muted-foreground)'`. Restored visible ink.       |

## Review round 1 — 2026-09-27

Astra (gpt-6-astra, high) found that a saved flat `5` lost its result once the box held a refused `9/9/`: the comparison used the stored trio, not the box's text. `showsResult` now compares `final` with what the cell already reads (the box's `combinedValue` on a folded leaf, `atRest` elsewhere), which also makes the separate `!unfolded` guard redundant, so it and its stale proof were removed.

| Check or injected fault                                                                         | Observed result                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New test `keeps a flat estimate’s figure beside a cell holding a refused entry`, before the fix | Failed on `expected undefined to be '5'`; 1 failed, 33 passed.                                                                                                                                          |
| `bunx vitest run src/components/wbs/plan-estimates.test.tsx` after the fix                      | Exit 0, 75 passed.                                                                                                                                                                                      |
| Removed `final !== shown` from `showsResult`                                                    | 6 tests failed, including `says a flat trio once`, `shows a parent’s rolled-up trio once when it equals the result` and `draws no result beside an unfolded step’s own figure`. Restored the condition. |
| Compared `atRest` in place of `shown`                                                           | Only the new refused-entry test failed, on `expected undefined to be '5'`. Restored `shown`.                                                                                                            |

The initial `bunx nx run wbs-fe-01:test --args=...` sent the file argument only to the zoned half of the two-command target, so it was interrupted and a direct focused Vitest run was used for the red/green cycle. A later full Nx invocation first reported a recursive invocation before running tests; `bunx nx reset` cleared its interrupted invocation state, and the full target then passed.

The h2puni gate does not apply on this host (`hostname` returned `pop-os`). No full repository gate was run here.

## Review round 2 — 2026-09-27

Astra found the `final !== ''` proof no longer breakable: an empty box equals an empty figure, so `final !== shown` alone kept the span off. `leaves an unestimated folded cell empty` now also types a refused `9/9/` into the unestimated cell and asserts no final span. With `final !== ''` removed, that test alone failed on `expected <span …(2)></span> to be null` (1 failed, 74 passed); restored, 75 passed.

## Archive verification reconciliation, 2026-11-21

The historical commands, outcomes and faults above match the original
[`9739ffc2` verification](https://github.com/Prosperous-Unification/puni-00/blob/9739ffc29cf11a559ad7c1b29e1ffe133b434ae4/openspec/changes/keep-single-estimate-visible/verify.md),
blob `758a606afd8d5efe326f29111bc7d6c71b051ec1`.

| Task | Recorded acceptance                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Both equal leaf and parent tests failed on transparent versus muted ink before the rendering edit and passed after it.                                                                                                                                                                                                                                                                                                                    |
| 1.2  | `a175083c` implemented the visible equal reading and preserved differing readings. `64bb169c` compared the value actually displayed, so refused `9/9/` over saved 5 still shows 5 beside the draft. `6350291b` distinguished the empty estimate with the same refused draft, where no final span is shown.                                                                                                                                |
| 1.3  | The original shifted-port Chromium run observed saved 5 after reload, readable ink and no duplicate. That local result predates the review fixes. The focused suite reached 75 cases. Removing the unequal guard broke six tests, comparing stored text exposed the refused draft, dropping the nonempty guard exposed an empty span, and restoring transparent ink broke both equal cases. The final lane and integration Pixels passed. |
| 2.1  | Whole frontend passed 148 UTC files with 3,107 tests and two zoned files with three tests. Format, lint:fast, typecheck and strict OpenSpec 127/127 passed. The historical local host was ineligible, and the lane delegated its h2puni run to integration.                                                                                                                                                                               |

[Lane PR 78 checks](https://github.com/Prosperous-Unification/puni-00/actions/runs/36278501363)
and [combined integration checks](https://github.com/Prosperous-Unification/puni-00/actions/runs/36280995654)
passed the relevant hosted runtime gate and Pixels. The separate trusted-wiki lint
failed in both, and the integration k3s rehearsal also failed.
The [integrated h2puni receipt](https://github.com/Prosperous-Unification/puni-00/pull/82#issuecomment-5851900160)
reports printed SHA `6aee2bf80e0ad1349c61c14c66ca28c178bdb05e`,
`GATE_EXIT=0` and all four targets passing for 35 projects. The reviewed estimate
files match that head and the accepted merge
`aad01af8a7c1affbfa7c1e2e43e7f0b999bab259`, whose common tree is
`b618eb95d2813ec5a0eef23f6c0d92dee5829d25`. The host log itself was not read.

The archive status reported sdd-lean with design ready and `isComplete: false`.
The historical change used four required artifacts, and its selected archival
proceeded with that warning. Its two refinements were synced after the predecessor.
