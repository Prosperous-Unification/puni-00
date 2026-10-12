# Verify: checkrun-receipts

Branch `batch-10/080-checkrun-receipts`, based on `batch-10/integration-10` 271604b0d. Bun tests ran
under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

Full targets at `7f053ab67`, run with `bunx nx run <target> --skip-nx-cache`:

| Target                           | Result                               |
| -------------------------------- | ------------------------------------ |
| `twilight-burokrat:test`         | 1058 pass, 0 fail, 66 files (exit 0) |
| `twilight-dash:test`             | 1554 pass, 0 fail, 40 files (exit 0) |
| `twilight-burokrat:test:package` | 46 pass, 0 fail, 7 files (exit 0)    |

Against the S5 baselines (Burokrat 1031, Dash 1548), the counts grew by the new tests: Burokrat by
`check-runs` (13), `check-run-golden` (2) and the relocation CLI negative (1); Dash by the
runner's 6.

The `TMPDIR=/var/tmp` reruns were started and then stopped at the coordinator's request, so they
are **not run**.

Also observed on this branch:

| Command                                                                                                                                                      | Result              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `bun test …/policy/check-runs.test.ts`                                                                                                                       | 13 pass, 0 fail     |
| `bun test …/policy/check-run-golden.test.ts`                                                                                                                 | 2 pass, 0 fail      |
| `bun test …/policy/relocation-activation.test.ts`                                                                                                            | 32 pass, 0 fail     |
| `bun test …/policy/release.test.ts`                                                                                                                          | 13 pass, 0 fail     |
| `bun test …/policy/pilot-policy.test.ts` (with `TOOL_WIKI_TRUSTED_NODE_MODULES`)                                                                             | 23 pass, 0 fail     |
| `bun test twilight-dash/cli/src/check-runs/ …/packaging/` (`FORCE_COLOR=1`)                                                                                  | 13 pass, 0 fail     |
| tool-devsync oracles (eslint-boundaries, adr-index, repo-namespacing-handoff, workspace-targets, workspace-projects, burokrat-consumer, product-constraints) | 89 pass, 0 fail     |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                     | 184 items, 0 failed |
| `bunx eslint` over both products' `src`; `tsc` lib and spec configs for both                                                                                 | clean               |

## R5 proofs (each fault injected, the named test watched failing, then restored)

`policy/check-runs.ts`, one mutation per rule. The mutation script is in the lane record. Each one
failed the named test in `check-runs.test.ts`:

| Fault                                         | Failed test                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `absent` branch deleted                       | refuses an absent ledger and an unreadable one by name                                         |
| schema refusal skipped                        | refuses a ledger that is not JSON or not the schema                                            |
| sequence, `previous` link, `head` seal (each) | refuses a ledger whose chain or seal no longer covers its runs                                 |
| authority comparison                          | refuses runs another recorder wrote                                                            |
| candidate comparison                          | refuses runs of another revision or another tree                                               |
| missing-check, id, argv, unplanned run (each) | refuses a planned check with no run and runs that are not the planned ones                     |
| unplanned probe, skipped probe, moved probe   | refuses a passing check whose skip probe was skipped, unplanned or moved                       |
| `ended < started` disabled / made `<=`        | a run may end at the instant it starts, never before                                           |
| `started < previous end` disabled / made `<=` | a run may start at the instant the previous one ended, never before (and 3 more tests on `<=`) |
| stream digest comparison                      | refuses a stream that is absent or is not the bytes its digest names                           |

Other faults:

- **Production path through the command.** With the candidate comparison disabled,
  `refuses check runs that are absent or were recorded for another revision` received exit 0:
  the base revision's runs prepared, certified and tarred the candidate.
- **Clock guard.** `new Date().toISOString()` appended to `prepare-activation-cli.ts` made
  `the Burokrat package reads no clock` fail, listing that file.
- **Goldens.**
  - A newline appended to `passing/check-runs.json` failed `keep their pinned bytes`, and so did an
    extra stream file.
  - `reproducible: false` failed `bind the reproducible candidate…` with the regeneration message.
- **Dash runner.** Each fault failed its test with `this case must not run a check`:

  | Fault                      | Failed test                                                       |
  | -------------------------- | ----------------------------------------------------------------- |
  | unknown-flag refusal       | refuses grammar faults and unusable directories before any effect |
  | existing-directory refusal | the same test                                                     |
  | inside-candidate refusal   | the same test                                                     |
  | HEAD refusal               | runs only the committed candidate                                 |
  | dirty-checkout refusal     | runs only the committed candidate                                 |
  - Dropping `check.exitCode === 0` failed `probes a bun test check only after it passed`.
  - Renaming the authority's command failed the byte-for-byte golden reproduction.

- **Bug found by the dirty negative.** A trimmed porcelain line reported `x.json` for `nx.json`.
  The fix is that `git` returns stdout untrimmed.
- **Lint.** Dropping the `check-runs/**` lint override made eslint report `Imports of apps are
forbidden` on the runner's judge import.
- **Prettier.** Without the `.prettierignore` rule, `prettier --check` on a golden ledger exited 1.

## Findings

- **Facade reach.** `check-runs.ts` first imported `relocation-activation.ts`, which pulled
  `trust.ts` and its mdast imports into everything that reaches the facade. That includes Dash's
  bundled observation launcher, and `packaging/reproducible.test.ts` failed on unresolved
  `mdast-util-*` in its copied roots. The fix moved the check derivation into `check-plan.ts` and
  the refusal class into `relocation-refusal.ts`; `relocation-activation.ts` re-exports both.
- **The `.bun-version` input.** Adding `.bun-version` to `twilight-burokrat:test` inputs failed
  `pilot-policy.test.ts`. The bootstrap relationship declaration pins that target's configuration
  byte for byte, so the input was reverted.

## Not run

The h2puni host gate.
