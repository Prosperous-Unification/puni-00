# Verification

Base: public main `5274046bd`. Persistent checkout: `.worktrees/wbs08025-local-admission-sol`.
Scope: local receipt admission relative to an independently caller-selected accepted reference.
No authentication, live WBS freshness or application claim is made.

## Observed focused checks

- Before implementation, the corrected admission fixture failed all nine cases because `admit-progress` was unsupported (exit 2). The first fixture attempt incorrectly named `dependencies`; this was corrected to the real v9 `stepBlockages` before observing the feature RED.
- Admission focused file: 15 pass, 0 fail, 91 assertions, 4.04 seconds (before final proof comments and the independent substitution-test strengthening).
- Dash versioned producer: RED on unsupported `record-progress-v2`; then 1 pass, 0 fail, 65 filtered, 4 assertions, 7.89 seconds (before adding downstream admission assertions).

## R5 mutation observations

Each mutant ran as one focused Bun file/test filter, sequentially, with its original source restored in `finally`. Exact logs are `/tmp/wbs08025-<name>.log` in the implementation host; the durable observations follow. All listed final mutants exited 1 because the specified production-path negative failed.

| Mutant                                             | Observed failure                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove legacy schema refusal throw                 | Legacy admission returned exit 0 and wrote output; expected exit 1. Legacy conversion test remains in the same scenario.                                                                     |
| Replace receipt/producer digest guard with false   | Redigested receipt naming B against producer/selected A returned exit 0; expected refusal.                                                                                                   |
| Replace producer/accepted digest guard with false  | Real v9 export A with selected B returned exit 0; expected refusal. The fixture asserts equal PlanRef/tasks digest and unequal reference digests after changing only blockedAt.              |
| Substitute producer for accepted-reference decoder | Redigested unknown-key accepted input returned exit 0; expected malformed refusal.                                                                                                           |
| Ignore bound receipt unknown keys                  | Redigested extra field reached output; expected refusal.                                                                                                                                     |
| Return true for bound receipt digest validation    | Changed observedAt without redigesting reached output; expected refusal.                                                                                                                     |
| Widen bound referenceDigest to string              | Malformed reference digest passed decoding and reached producer mismatch; expected malformed receipt diagnostic. This proves the boundary diagnostic; a later equality still refused output. |
| Remove bound entries minimum                       | Empty entries reached output; expected refusal.                                                                                                                                              |
| Open output with w instead of wx                   | Occupied output was replaced and command returned exit 0; expected refusal and unchanged bytes.                                                                                              |

The first receipt/producer equality mutant survived: its test also selected B, so the later producer/accepted comparison refused the invocation. The test was strengthened to select A while substituting B into the receipt. All nine mutants above were then rerun and failed their targeted negative tests.

## Resource limits and unavailable checks

Focused checks were coordinated with the other worker on this laptop. Mutation runs and final recovery checks ran sequentially; the regression orchestration deviation is documented below. Mutation-run MemAvailable ranged from 16,142 to 18,487 MiB; the runner refuses below 4 GiB. No full Nx gate, browser suite, build, full survey or h2puni gate was run. OpenSpec CLI was initially absent from PATH and the checkout; `BUN_TMPDIR=/tmp bunx --bun @fission-ai/openspec@1.12.0 validate admit-progress-against-selected-reference --json` subsequently exited 0 with valid true and no issues. One frozen dependency install was authorized for the isolated checkout.

## Scoped regression results

- `bun test apps/twilight-structure/twilight-navigator/cli/src/admit-progress.test.ts --timeout=30000`: 15 pass, 0 fail, 91 assertions, 5.55 seconds.
- `bun test apps/twilight-structure/twilight-navigator/cli/src/receipt-to-commands.test.ts --timeout=30000`: 28 pass, 0 fail, 138 assertions, 8.38 seconds.
- `bun test apps/twilight-structure/twilight-burokrat/cli/src/contracts/navigator-records.test.ts --timeout=30000`: 12 pass, 0 fail, 20 assertions, 3.06 seconds.
- `bun test apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.test.ts -t 'production consumers retain|dispatcher uses no clocks|record-progress-v2 explicitly' --timeout=30000`: 3 pass, 0 fail, 63 filtered, 12 assertions, 15.82 seconds. Includes the actual v2 Dash output admitted by the Navigator entrypoint.
- A further restored mutation dispatched `record-progress-v2` through the v1 producer: its focused production test failed with expected schema 2, received 1 (8.23 seconds).
- Scoped ESLint on the eight changed TypeScript files exited 0 after correcting test-only unknown JSON typing and a void arrow callback. `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph exists; this is not a complete lint-gate claim.
- `tsc --build --force apps/twilight-structure/twilight-navigator/cli/tsconfig.json`: exit 0.
- `tsc --build --force apps/twilight-structure/twilight-dash/cli/tsconfig.json`: exit 0.
- `tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`: unavailable dependency, TS2307 for `@noble/hashes/sha2.js` and `@noble/hashes/utils.js` imported by existing shared test-evidence code. The initial checkout inherited dependencies from the ancestor checkout and had no own frozen install. After the frozen install, `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json` exited 0.
- `git diff --check`: exit 0.

The four regression invocations accidentally overlapped: the orchestration awaited tool responses but did not initially drain the returned running sessions. All four sessions were then drained before any further check started. MemAvailable was 18,217 MiB and swap use was zero after that overlap. This violated the intended sequential execution constraint; no observed memory pressure occurred. The later Dash mutation, lint and each scoped typecheck ran to completion individually. After the test-only type annotations and frozen install, the final admission rerun passed all 15 tests and 91 assertions in 3.86 seconds. The install first failed with EROFS on Bun's default temporary directory; `BUN_TMPDIR=/tmp bun install --frozen-lockfile` then exited 0, checking 1,573 installs across 1,447 packages with no changes.

## Final source check

- Final admission file, including the redigested missing-referenceDigest negative: 16 pass, 0 fail, 97 assertions, 4.74 seconds.
- Pinned OpenSpec 1.12.0 validation of this change: exit 0, valid true, no issues.
- Scoped Prettier check of all changed code/docs and the complete change directory: exit 0, all matched files formatted.
- Task checkboxes describe the completed local source slice. Hosted CI and the full host gate remain unrun and required before merge.

## Shared consistency review correction

Exact-head review of `a6531e6db7064645ce4bebf770864325ca886d71` identified that the shared checker still compared only PlanRef after v2 decoding was added. Consequently, validate-progress-receipt and receipt-to-commands could accept a bound A receipt alongside real v9 B differing only in blockedAt. The shared checker now conditionally requires receipt.referenceDigest = supplied reference.referenceDigest for schema 2; schema 1 retains its historical consistency semantics.

- Genuine RED: the two production CLI negatives both returned exit 0 where exit 1 was required; focused run 0 pass, 2 fail, 18 filtered, 4.64 seconds. Both fixtures assert equal PlanRef/tasksDigest and unequal referenceDigest for real Navigator-generated v9 exports A/B.
- GREEN: the complete admission/consumer file passed 20 tests, 127 assertions, 12.78 seconds, including matching schema 2 and legacy schema 1 consumers.
- Watched mutation: replaced only the new shared equality condition with false. Both CLI negatives again returned exit 0; focused run 0 pass, 2 fail, 18 filtered, 4.63 seconds. Source was restored in finally. Log: `/tmp/wbs08025-shared-digest-guard.log`. Adjacent Proof comment names both observed production tests.
- Final restored negative rerun: 2 pass, 0 fail, 18 filtered, 18 assertions, 4.59 seconds.
- Existing receipt-to-commands regression file: 28 pass, 0 fail, 138 assertions, 5.85 seconds.
- Scoped Navigator and Burokrat `bunx tsc --build --force <project>/tsconfig.json`: both exit 0.
- ESLint for the changed checker and test file: exit 0; module-boundary rule skipped because no cached Nx graph exists.
- Pinned OpenSpec validation: exit 0, valid true, no issues. Scoped Prettier check: exit 0.
- All P2 RED/GREEN/mutation/restoration and final checks ran sequentially. Initial MemAvailable was 20,610 MiB, swap use zero; no memory pressure was observed. No full gate, browser, build or survey was run.
- Prior normal commit hooks succeeded with Tool Wiki inactive/uncertified (external activation root absent) and the module-boundary rule unavailable. These remain verification limits, without a trusted-admission claim.

## Hosted CLI help regression repair (2026-10-16)

Base: PR #538 head `d3ca2fa6becb10b224af4f9346118ad30a3cec95`. Hosted workspace job `116848745678` in run `38862719235` exposed the stale two-command help expectation. The existing admission spec requires `admit-progress`; the production registry already lists it first. Only the expected list and its adjacent proof comment changed; command behavior is unchanged.

- Reproduction: `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-navigator/cli/src/cli.test.ts --test-name-pattern 'help lists exactly'` exited 1: `0 pass`, `9 filtered out`, `1 fail`, `3 expect() calls`; the diff showed `+ "admit-progress"` before the two historical commands.
- Updated expectation: the same focused command exited 0: `1 pass`, `9 filtered out`, `0 fail`, `7 expect() calls`.
- R5 injected fault: removed only `'admit-progress': ADMIT_PROGRESS_FLAGS` from the production `COMMAND_FLAGS` registry, retaining its dispatcher. The same help test exited 1: `0 pass`, `9 filtered out`, `1 fail`, `3 expect() calls`, with `- "admit-progress"`, `Expected - 1`, `Received + 0`. Log: `/tmp/wbs08025-help-registry-omission.log`. The mutation runner restored the original source in `finally`; the final diff contains no production changes.
- Restored regression: `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-navigator/cli/src/cli.test.ts --timeout=30000` exited 0: `10 pass`, `0 fail`, `79 expect() calls`, `3.93s`.
- Scoped typecheck: `bun /home/df/wd/puni/puni-00/node_modules/.bin/tsc --build --force apps/twilight-structure/twilight-navigator/cli/tsconfig.json` exited 0. An initial attempt using `node_modules/typescript/bin/tsc` failed because this workspace provides the compiler under `@typescript/native`; no dependency installation was needed.
- Scoped formatting: `bun /home/df/wd/puni/puni-00/node_modules/.bin/prettier --check apps/twilight-structure/twilight-navigator/cli/src/cli.test.ts openspec/changes/admit-progress-against-selected-reference/verify.md` exited 0 with `All matched files use Prettier code style!`. `git diff --check` exited 0.

Checks ran sequentially within the requested RAM constraint. Full Nx, browser, Burokrat and h2puni gates remain unrun for this repair. This evidence supports only the CLI help regression repair and retains the local caller-selected reference scope; it grants no live authority.
