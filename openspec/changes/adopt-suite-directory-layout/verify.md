# Verification

Entries are appended per slice, newest last. Evidence references are basenames in that
attempt's evidence directory.

## Slice 1 — declare the suite level

Attempt `suite-directory-move.1.20260925T213450Z`, base `a60c34947392b3f16ba9e0b3f23765a3e3260ce3` (2026-09-26). The working tree was clean. Baselines: layout 19 pass, policies 15 pass, cache 4 pass, legacy pin 1 pass; strict OpenSpec 115 passed, 0 failed (`openspec-base.*.json`).

The new contract validated at 116 passed, 0 failed (`openspec-contract.*.json`). Before implementation, layout ran 20 pass and 3 fail (suite roots received the old `apps/<product>/<project>` refusal); policy discovery ran 1 pass and 2 fail (`Received: 0` and `Expected: not 0`); cache inputs ran 2 pass and 2 fail on the absent suite glob. The test-only typecheck exited 0 (`s1-red-*.log`).

After the rule patch, layout ran 23 pass, policies 18 pass, and cache inputs 4 pass. The legacy pin failed at digest `551e2a7d0fb1ed4b5659abee6b00ede7ccf703b9f65f71761b88be12a318eb80`, 308 occurrences and 34 current recursive selectors; after the pin patch it ran 1 pass. Typecheck and lint exited 0 (`s1-green-*.log`, `s1-pin-*.log`, `s1-typecheck.log`, `s1-lint.log`).

Negative proofs (`fault-*.patch`, `fault-*.log`, `restored-*.log`): `n1` received the old application shape; `n2` received `[]` for an undeclared suite; `n3` derived `cli-undefined`; `n6` derived product `probe-suite`; `n4` derived product `twilight-structure`; `n5` derived name `twilight-structure-twilight-probe`; `p1` saw lint exit 0; `p2` saw lint exit 0; `p3` refused `libs/twilight-structure/eslint.product.mjs` as a suite policy; `c1` failed both cache input cases on the absent suite glob. Each named test failed on that fact, the mutation was restored with `cmp`, and the same command passed again. The expectation block printed `slice 1: every fault failed its named case on its own fact`.

After the nine proof comments, layout ran 23 pass, policies 18 pass, cache inputs 4 pass, legacy pin 1 pass, and lint exited 0 (`s1-final-*.log`). Whole `tool-devsync:test`, Git-writing and HEAD-reading checks, the host gate, and planner integration checks remain pending planner verification.

Owned-file Prettier write and check exited 0 (`All matched files use Prettier code style!`). `tool-devsync:build` and repository-wide `nx format:check --all` each exited 0 (`s1-build.log`, `s1-format.log`).

## Slice 2 — move Twilight Burokrat

Attempt `suite-directory-move.2.20260925T214257Z`, base `0b66613af22cb7d66d13bf2212670a9585396213` (2026-09-26). The working tree was clean (`status-before.txt`). The baseline contained 127 tracked files under `apps/wiki` (`s2-count.txt`).

The move script exited 0 (`s2-move: apps/wiki is apps/twilight-structure/twilight-burokrat`). The path lists matched exactly: 127 old tracked paths and 127 new untracked paths (`s2-old.txt`, `s2-new.txt`). Every moved file matched the HEAD bytes except `cli/tsconfig.json`; its sole changed line extended `../../../../tsconfig.base.json` in place of `../../../tsconfig.base.json` (`s2-tsconfig.diff`). The check printed `s2-check: 127 files moved, one line changed`. Task 2.1 is checked. No negative proof was required in this mechanical slice.

The moved tree awaits slice 3's reference edits. Focused suites, typecheck, lint, builds, repository-wide format and strict OpenSpec validation are deferred to slice 3, because the moved sources still name the retired root. Whole devsync and Twilight Burokrat suites, the full pilot suite, Git staging and rename summary remain pending planner verification. The host gate was not run on this machine.

## Slice 3 — follow every moved reference

Attempt `suite-directory-move.3.20260925T214556Z`, reviewed base `0b66613af22cb7d66d13bf2212670a9585396213`, staged index `b5d9da0b5adb978bcda0779a76fad1bb9462cc301479a78a47ff61f5d8417ad2` (2026-09-26). The worktree matched the index, there were no untracked files, and 127 renames were staged into the suite (`base.txt`, `untracked-before.txt`). Extraction reported 5 patches, 3 scripts, 35 faults and 27 Proof blocks.

The staged-move baselines were red as expected: layout 22 pass and 1 fail; workspace-projects 15 pass and 2 fail; sync 50 pass and 2 fail; inventory 3 pass and 1 fail; targets 17 pass and 2 fail; cache 4 pass; legacy pin 1 fail; Twilight Burokrat typecheck exited 1 on `TS6053` for `apps/wiki/cli/tsconfig.json` (`s3-base-*.log`). The new retired-root check began at 1 pass and 2 fail, with 115 current `path:line` entries (`s3-red-retired.log`).

`s3-edit.sh` matched every counted substitution and Prettier formatted only the 50 listed paths. Green devsync counts were layout 23, workspace-projects 17, sync 52, inventory 4, targets 19, cache 4, retired-roots 3, all with 0 fail. Both typechecks, tool-devsync lint, and Twilight Burokrat source lint exited 0 (`s3-green-*.log`). The thirteen focused Twilight Burokrat files ran serially and passed: generations 13, contracts 16, classification 16, root-migration 32, activation 13, gate-entrypoints 57, policy release 13, trusted-policy 55, rules 63, committed-target-facts 2, selectors 19, audit 19 and packaging release 10 (`s3-green-bk-*.log`). The legacy pin then failed at received digest `c0a77f3355f27bc1e8fa7f23bd427c7b4cc7c068e6f787bb1552364482f28c22`, and passed after the pin update (`s3-pin-*.log`).

Faults and their observed diagnostics (`fault-*.patch`, `fault-*.log`, `restored-*.log`): `g1` found `apps/wiki/stray.txt`; `g2` found `docs/retired-root-probe.md:1`, while `g2-off` made the current-file case pass and the excuse case fail on `retired-roots.test.ts: excuses 3, holds 0`; `g3` found `docs/local-dev.md:1`; `g4` found the quoted-segment document at `docs/retired-root-probe.md:1`; `g5` found `wiki-release/tasks.md: excuses 4, holds 5`; `g6` found `docs/no-such-tree/: excuses nothing`; `g7` failed all three cases on `cannot list the workspace: git: 'ls-filez' is not a git command`, while `g7-off` left only the excuse case failing; `g8` passed all three cases after the simulated archive, `g8-off` found `twilight-burokrat-package/proposal.md: excuses 2, holds 0`, and `g9` failed on `ENOENT` reading the deleted old proposal path. The `g1-off`, `g3-off`, `g4-off`, `g5-off` and `g6-off` controls each passed all three cases. `e1` lost the expected `other` project-name line; `e2` received `project name must be twilight-burokrat-cli, found twilight-burokrat`; `e3` received `[]`; `r1` and `r2` missed the moved project.json and tsconfig.json restart paths; `r3` failed both the destination tuple and product-axis cases; `r4` received the old `../../../dist/apps/wiki/cli` outDir. Every mutation was reversed, saved bytes were compared with `cmp`, and its named command passed after restoration. The expectation block printed `slice 3: every fault met its expected outcome, and every clause-off twin showed its clause alone decides it`. The planner-only `r5` selector proof remains pending after the combined commit.

After inserting 17 observed Proof blocks and checking tasks 3.1–3.2, the seven devsync files, both typechecks, both lints and the legacy pin passed again (`s3-final-*.log`). The two project builds exited 0 (`s3-build.log`). Whole devsync, whole Twilight Burokrat, the HEAD-reading pilot tests, package tests, index checks, Git-writing checks, planner `r5`, and host gate remain pending planner verification; this executor did not run the host gate on this machine.

Owned-file Prettier write and check exited 0 (`s3-prettier-*.log`), repository-wide `nx format:check --all` exited 0 (`s3-format.log`), and strict OpenSpec validation returned 116 passed, 0 failed (`openspec-validation.*.json`). The final changed-path check matched the 52 owned paths exactly; the 127 staged renames remain separate from those worktree edits.
