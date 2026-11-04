## Scope and completeness

The repair follows parent `0a84c750d695b171fced5b1f7645ab2527eb33bb` on PR #787. It changes the Twilight job allowance from 75 to 120 minutes, the existing workflow oracle, and factual documentation. Task 1.1 is complete; Task 2.1 remains open for final integration and gates and blocks archive. No runtime contract, dependency, database format or operator state changes.

The two delta requirements are implemented by the production workflow declaration, its real-workflow regression and the retained cancellation record. The new capability delta remains unsynced until completion. No `design.md` or ADR is needed for this reversible configuration repair; no domain terms changed.

## Local verification

Commands ran at the repository root, using the retained native capture helper. Original streams and exit receipts are retained under `.superpowers/sdd/runtime-write-delivery-20261101/`.

| Command                                                                                                                                                                                                                           | Actual outcome                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts -t 'CI gives the complete uncached gate its chosen finite allowance'`                                                                 | Before production repair: exit 1, 0 passed / 1 failed / 57 filtered; expected 120, received 75. After repair: exit 0, 1 passed / 0 failed / 57 filtered, 2 assertions. Final focused run after the proof comment also passed. |
| `bun test tools/tool-git-hooks/src/hooks/gate-workflow.test.ts tools/tool-devsync/src/toolchain-pins.test.ts`                                                                                                                     | Exit 0, 40 passed / 0 failed, 290 assertions across two files.                                                                                                                                                                |
| `bunx nx format:check --all`                                                                                                                                                                                                      | Exit 0, empty stdout and stderr. The formatter child remained active until actual completion; the silent interval was not treated as a failure.                                                                               |
| `bunx prettier --check openspec/changes/agentic-runtime-ci-allowance/proposal.md openspec/changes/agentic-runtime-ci-allowance/tasks.md openspec/changes/agentic-runtime-ci-allowance/specs/agentic-runtime-ci-allowance/spec.md` | Exit 0. This separately covers the new, then-untracked packet.                                                                                                                                                                |
| `node_modules/.bin/openspec validate --all --json`                                                                                                                                                                                | Exit 0; 322 of 322 entries valid, zero errors, 704 existing warnings and 25 informational findings.                                                                                                                           |

Independent Task 1 spec and quality review found no Critical, Important or Minor issues and verified all four original test receipts and stream hashes. The capture helper's stable 1,921-path scope is narrower than the complete repository; exact-diff review supplies the change boundary.

The first seven-file formatting check after adding this verification record exited 1 and named only this new Markdown table. Its original receipt is `ci-allowance-final-packet-format-1793667218290`; the record was then formatted with the existing Prettier command. This is separate from the successful full-source format run above.

## Failure proof

| Changed check                                                     | Injected production fault                                                      | Observed negative and restoration                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI gives the complete uncached gate its chosen finite allowance` | Keep the actual Twilight workflow at 75 while requiring 120 in the regression. | Original RED receipt `ci-allowance-task1-attempt17-red-1793666674545`: native exit 1, expected 120 / received 75. Change only the production allowance and adjacent factual comment; GREEN receipt `ci-allowance-task1-attempt17-green-1793666688532`: native exit 0, 1 passed. The adjacent `Proof:` names this observation. |

No check, selected command, parallelism, cache policy, installed-survey resource guard or aggregate failure condition was removed or weakened. This proof establishes the finite declaration, not successful completion within 120 minutes.

## Historical cancellation and retained evidence

[Run 41544558083](https://github.com/Prosperous-Unification/puni-00/actions/runs/41544558083), Twilight job 125617033412, belongs to `0a84c750d695b171fced5b1f7645ab2527eb33bb`. The trusted GitHub Actions check (app 15368, suite 112579974135) reports cancellation; its annotation explicitly says the job exceeded 1h15m0s.

Artifact 13192189566 is 625,820 bytes, with SHA-256 `8470a9fe7fa4569a396a6cd445e395cb0eabd822b2604ad937a3d1e9df6358cf`, matching the upload log and API digest. Its complete 6,507,251-byte Nx log records Burokrat 2,571 passed / 0 failed across 104 files in 3719.64 seconds. No failed assertion was observed in that retained log. It ends during Dash cleanup tests and supplies no complete Dash verdict. The packed-package phase was skipped after cancellation.

Durable archive: `.superpowers/artifacts/agentic-ci-timeout-0a84c750d-20261103/index.json`, 66 files / 17,567,093 bytes. It preserves ten original native captures, helpers, streams, the extracted log, task report, exact diff and independent review. All stream, helper and transferred-file hashes were checked before indexing. Earlier browser success remains source-specific and does not turn this cancelled runtime job into a successful gate.

## Outstanding acceptance

The complete final-head hosted CI and canonical `bin/h2puni-gate.sh <sha>` remain required before merge. The ongoing canonical invocation for parent `0a84c750d` cannot certify a repaired or newly integrated head. No fresh full `bunx nx run-many -t test lint typecheck build`, packed-package suite, independent full lint/typecheck/build, or final-head canonical success is claimed by this local repair record. The normal commit/push receipts and clean-worktree identity will be recorded by integration.

Main advanced during verification. Its published changes must be integrated and the resulting source reviewed and gated; no passing result from the older tree is relabeled. Operator-store migration, production activation and the remaining agentic foundation are outside this repair's completion claim.
