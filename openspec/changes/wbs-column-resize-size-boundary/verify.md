## Recovery scope

Base: `4f098bfe2bf64343b8f503b5bdebd6e1a6fa34f4`; original hook blob `7860850d7a8b6cd1ff328a58d9e263ef336f085d`.

The original temporary checkout and receipts were removed by laptop cleanup. Original final commit `322194ad6c3493eb6ab3ca0d1fb2f1cfc9c04613`, implementation `1ca905230`, and fault `62b9691469d7d426b9ee6c80abbf66dcebee6168` are unavailable in the shared Git object store. No heavy filesystem scan was attempted. This recovery reconstructs the source/tests/OpenSpec from the original base and session history; it is not an exact recovery of those commit objects or receipts.

The source extraction moves widthFromDrag, ColumnResize, ColumnResizeHandle and the existing resizeColumn callback factory into column-resize.tsx as createColumnResize. Hook exports stay stable. The callback is created on every render with the same captured project ID, width map and setter; drag functional update, commit copy/storage order and cancellation storage reread remain unchanged. Gantt, persistence state ownership and plan export remain in place.

The supplied original 913-line count counted nonblank lines. Installed F7 previously observed 957 physical lines in the exact base. Extracting the initial block alone left 808; the PM approved moving the cohesive column callback factory, producing a 792-line hook and 183-line resize module. All original resize JSDoc was preserved verbatim.

## Historical observations, not fresh recovery verification

These results were observed in the original session. Their temporary raw receipts are lost, and none certifies this reconstructed commit:

- Focused column-resize, plan-layout and table-frame suites: 138 passed across three files; restored mounted tests: 3 passed.
- Frozen browser selection: column drag, reload persistence and reset passed; two Name cases crashed during seedPlan before gestures. One subsequent serial frozen diagnostic passed both Name cases, Chromium exit 0. The earlier overlapping source-fault browser run was excluded as final evidence.
- Scoped ESLint, FE tsc, Vite build, scoped Prettier and OpenSpec validation passed before the final historical prose update. OpenSpec all validation reported 220 passed.
- Installed exact F7 on original implementation: 41 base findings to 40 candidate findings, only the selected oversized hook removed; unevaluated remained empty and certifies remained false. The original committed oversized-source fault restored 41 findings and failed the selected-finding assertion.
- A final full installed survey was deferred: MemAvailable reached about 40 MiB with thousands of unrelated Claude/bash/head processes. No whole-rule acceptance or WBS100 closure was claimed.

## Failure proof history

| Injected fault in the original session                      | Production-path observation                                                         | Recovery limitation                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Replace both pointer identity filters with null-only guards | Mounted matching-release test failed: expected 2 drags, received 3                  | Historical observed failure; raw receipt lost; reconstructed test not rerun            |
| Remove matching pointerup commit                            | Matching-release and measured-Name tests failed: expected one commit, received zero | Historical observed failure; raw receipt lost; reconstructed test not rerun            |
| Restore original oversized source in a committed fault      | Installed F7 returned the 957-line finding and selected-finding assertion failed    | Historical observed failure; fault commit and raw report lost; fresh evaluator pending |

Adjacent Proof comments preserve the original gesture fault observations. They refer to historical execution, not a new recovery run.

## Evaluator identity from the original session

Installed consumer executable: `/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib`, run from its consumer cwd. Manifest sourceRevision `ac774f0c358db369c2048e537151e263cc29361e`; toolkit identity `db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79`; bin.mjs SHA256 `3432dfb59cc8d2caa31ea4dbd561aa2963ceb1572174f7e98a5410ece455849c`. Successor policy SHA256 `052a3aa30b1ae091968cf01318c7ad89a32e4e3dc144479e73d0c6da0ae965de`.

Command shape: `twib check committed <checkout-root> <sha> <policy-path> --rule F7`. The original evaluator required a checkout root, not its .git directory. Fresh recovery evaluator availability and observations are unverified.

## Fresh recovery checks and limits

Read LLM_README.md and AGENTS.md. The persistent checkout lives under the ignored workspace .worktrees directory; shared root files were preserved. Fresh scoped format, diff and documentation-preservation output is recorded in the recovery handoff. No fresh tests, ESLint, tsc, build, browser, installed F7/full survey, full Nx gate, full format gate or h2puni gate were run during recovery, as the PM restricted laptop work to lightweight reconstruction and authorized an immediate public review-branch push. Do not merge without fresh review and required validation.

Fresh recovery output: scoped Prettier check reported `All matched files use Prettier code style!`; `git diff --check` produced no diagnostics; the original resize JSDoc assertion passed. Hook: 792 lines, blob `9f2ad8d2372e6bda00acea788a5893863a9e0376`, matching the hook blob recorded in the original implementation diff. Resize module: 183 lines, blob `6fd44eb76ab75b102fa18df43809de795bcdcaa9`. The original module blob was not retained, so exact module byte identity with the lost commit is unverified.
