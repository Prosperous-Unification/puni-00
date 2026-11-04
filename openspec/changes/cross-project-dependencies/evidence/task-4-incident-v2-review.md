# Incident lifecycle v2 bounded review — APPROVE

Reviewed the frozen, uncommitted ten-file packet in `/tmp/puni-cross-incident-lifecycle` at base `81316a58bd670ed12ce397b9a7a9fc6be4dae751`, against the prior REJECT, v2 source packet, architecture packet and OpenSpec task 4.4. This approves the corrected 4.4a/b source packet only. It does not complete task 4.4 or approve integration, activation or deployment.

No new blocking bounded semantic defect was found. The prior TS18048 blocker is resolved: `applyDelete` explicitly branches on the referenced-dependency reason, binds `dependencyIds`, throws when that trusted value is missing, and returns inside the narrowed branch. It introduces no assertion, cast or fallback. Diff against the preserved v1 review copy confirms this narrowing is the only production change since that review; the other new content is three ported controller probes.

The owned SQLite suite now exercises mounted two-link refusal with the complete sorted ID array and unchanged tables, plus both cascade and promote parent deletion/undo/redo with exact external relationship ID, project/work-item endpoints, scopes and type. The existing mounted refusal rolls back an earlier successful rename. Successor deletion removes selected incoming/local links, preserves an unrelated external link and restores/removes original IDs; concurrent remote revision and newly formed outgoing/incoming incidents refuse compensation. The graph guard still checks the effective projected endpoint set after removal of its earlier blanket pre-read. Positive connected lifecycle assertions use the admitted semantic SQLite seam; they are not mounted positive authoring evidence.

## Fresh verification

All checks below ran against this frozen worktree. Source remained unchanged.

| Check                                                                                              | Outcome                                         | Log                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.lib.json`                                            | exit 0                                          | `/tmp/puni-incident-v2-review-be-lib.log`            |
| `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json`                                           | exit 0                                          | `/tmp/puni-incident-v2-review-be-spec.log`           |
| `bunx tsc --noEmit -p libs/wbs/domain/contracts/tsconfig.spec.json`                                | exit 0                                          | `/tmp/puni-incident-v2-review-contracts-spec.log`    |
| Uncached configured Nx typecheck: wbs-be-01, wbs-core, wbs-contracts; both dependent module checks | all 5 tasks pass                                | `/tmp/puni-incident-v2-review-typechecks.log`        |
| Connected command admission, typed dependency lifecycle, external migration SQLite suites          | 136 pass, 0 fail; 1,630 assertions              | `/tmp/puni-incident-v2-review-focus.log`             |
| `bun test ./libs/wbs/application/core/src`                                                         | 1,247 pass, 0 fail; 4,934 assertions; 110 files | `/tmp/puni-incident-v2-review-core-source-tests.log` |
| `bun test ./libs/wbs/domain/contracts/src`                                                         | 155 pass, 0 fail; 746 assertions; 27 files      | `/tmp/puni-incident-v2-review-contracts-tests.log`   |
| Typed dependency graph, undo, typed commands and typed copy controller source files                | 51 pass, 0 fail; 296 assertions                 | `/tmp/puni-incident-v2-review-regressions.log`       |
| Uncached full Nx lint: wbs-be-01, wbs-core, wbs-contracts, wbs-store-sqlite                        | all 4 tasks pass                                | `/tmp/puni-incident-v2-review-lint.log`              |
| Prettier on all ten changed files; `git diff --check`                                              | exit 0                                          | `/tmp/puni-incident-v2-review-format.log`            |

Nx invocations used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, `--skip-nx-cache` and `--parallel=1`. Runtime source checks total **1,589 pass, 0 fail, 7,606 assertions**. Checks did not use coverage flags.

The initial broad-filter command `bun test libs/wbs/application/core/src` failed after configured compiler builds produced ignored `dist/out-tsc` JavaScript. Bun collected both source and emitted copies: 1,316 pass, 107 fail, 90 errors over 220 files. Every failure-bearing file was an emitted copy; missing source-relative config and module aliases caused those failures. This attempt is preserved in `/tmp/puni-incident-v2-review-core-tests.log` and is not green evidence. Explicit `./` source-directory reruns above completed successfully. Compiler artifacts were not removed; no tracked source was edited.

## Frozen source and limits

All ten entries in `/tmp/puni-incident-lifecycle-v2.sha256` matched at entry, during review and after completion. Persisted checks: `/tmp/puni-incident-v2-review-before.sha256.log` and `/tmp/puni-incident-v2-review-after.sha256.log`. Git status retains the same ten modified files and base SHA. The initial manifest match is also in the review tool transcript; the persisted before log was captured during review before final checks.

The v1 disposable mutation evidence remains historical evidence in `/tmp/puni-incident-lifecycle-review.md`; no mutation was rerun during this read-only v2 review. This verdict does not establish a complete R5 sweep, including a dedicated missing-ID diagnostic fault, scope-qualified same-ID delivery, isolated external project-FK proof, every independent authority/coverage fault or held-announcement comparisons for every branch. Project deletion remains persistence protection only; its SQL refusal includes ordinary child/step FK blockers and cannot isolate the external project FK.

First-child incident mapping/creation-audit receipts, compound compensation/replay and the remaining actual graph/current-authority proofs remain deferred 4.4c–e. Task 4.4 must remain open. Production external authoring remains dormant; fully mounted positive lifecycle closure remains unproven.

Not run: full backend/store package tests, all-workspace Nx checks/builds, browser/portable checks, mutation reruns, strict OpenSpec validation, CI secrets or migration lint, either host gate, activation or deployment checks. No required tool was missing. No source, Git, WBS or PR mutation was performed.
