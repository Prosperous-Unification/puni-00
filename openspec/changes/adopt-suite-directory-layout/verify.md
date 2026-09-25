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
