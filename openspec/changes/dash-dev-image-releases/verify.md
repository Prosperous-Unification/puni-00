## Commands and outcomes

- Baseline `bun test .../src/cli.test.ts` with Bun default 5-second timeout: 26 pass, 2 startup timeouts. No source change was made to hide the timeouts. Re-run using the project timeout budget (`--timeout 30000`): 28 pass, 0 fail.
- `bun test .../src/ops/release.test.ts .../src/cli.test.ts --timeout 60000`: 50 pass, 0 fail, 176 assertions. Includes real Bun adapter invocation and both profile branches.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck build -p twilight-dash --output-style=stream`: exit 0, both targets passed.
- Initial Nx lint: nine new-file findings. Imports, expressions and index typing were corrected; covering ESLint autofix run exited 0. Final complete Dash lint target passed (exit 0, 1m12s).
- `bun node_modules/.bin/openspec validate dash-dev-image-releases --strict`: valid.

## Failure-proof table

Faults were injected into the production module, each named test was run against the real entrypoint, and the original file was restored in a `finally` block. Raw local evidence: `/tmp/dash-release-proofs.json`.

| Check                         | Injected fault                                       | Observed test                             | Outcome                                                                     |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Flag grammar                  | Removed grammar refusal                              | Unknown and duplicate flag cases          | 2 failures                                                                  |
| Request schema                | Broadened action/environment/profile enums           | Invalid action and profile cases          | 2 failures; independent development guard still refused invalid environment |
| Development-only fast profile | Removed environment guard                            | Production fast with valid adapter        | 1 failure; adapter executed                                                 |
| Protected configuration       | Replaced descriptor-bound reader with unchecked read | Exposed 0640 config                       | 1 failure; adapter executed                                                 |
| Dispatch schema               | Bypassed shape validation                            | Version-2 configuration with valid target | 1 failure; adapter executed                                                 |
| Unknown target context        | Removed modeled refusal                              | Unknown target case                       | 1 failure; required target-specific outcome lost                            |

The protected reader's existing unreadability, absence, regular-file, ownership and symlink guards are reused unchanged, and are also exercised through the new command.

## Review and additional checks

- Independent scoped code/spec review: no actionable findings. Reviewer's sandboxed test run hit EPERM (17 pass/5 fail), so it is not counted as acceptance; the root's escalated production-entrypoint run above supplies passing evidence.
- `bun test .../src/compute/report-capacity.test.ts --timeout 60000`: 23 pass, 0 fail, 61 assertions; covers the existing protected-configuration consumer.
- `git diff --check`: exit 0.

- Real cross-repository divergent-branch integration (`bun /tmp/website-facade-branch-proof.ts`): passed from the public cwd, exact selected private/public feature commits differ from main, original dirty/private and public checkouts preserved, and no builder/Fleet mutation. Local evidence: `/tmp/website-facade-proof-yGtDxN`.
- Independent actual full-builder/fast-builder/Docker/registry proof (`bun /tmp/website-fast-real-builder-proof.ts`): passed. A site-only update compiled/built neither app nor API, reused both exact registry digests and preserved API writer ENV/runner identity. Compilation alone used controlled synthetic Nx output; no live deployment was exercised. Local evidence: `/tmp/website-real-fast-proof-pbPeNT`.
- The early entrypoint dispatch is restricted to `ops release`, so future sibling `ops job`/`ops pool` commands continue to their own dispatcher rather than being intercepted by this facade.

## Remaining acceptance

The private adapter is implemented and independently reviewed; its required CI passed and [PR 78](https://github.com/Prosperous-Unification/puni-pr-00/pull/78) merged at `46f550f4c6a52a30d6d47a22808be883b8565856`. The strict Fleet receipt companion passed its checks and [PR 16](https://github.com/Prosperous-Unification/puni-fleet/pull/16) merged at `2decfae3acd09c93256c89a77f210b48efe2ce08`.

Main advanced to `07c47b69c` while public gates were running, including the host-job command parser. The shared entrypoint conflict is resolved by retaining main's typed parser and ops usage exit code while dispatching only `ops release` before that parser. The combined real-entrypoint CLI/release tests pass: 77 tests, 244 assertions, 0 failures. Dash typecheck and entrypoint formatting also pass. Earlier host runs were stopped after their target became obsolete; they do not count as final acceptance. The final exact-SHA host gate, required CI and public merge remain pending; final external evidence belongs to [PR 824](https://github.com/Prosperous-Unification/puni-00/pull/824).

The first h4 gate's piped output encountered Bun stdout EAGAIN during OpenSpec JSON; repeating the same canonical command with regular-file output passed that stage. No check was changed or skipped. No live release or production action was requested or performed.

## Central typed grammar integration

Main advanced again to `aec80d31f`, including the complete shared typed grammar. Release parsing now lives in that grammar, and the release handler receives its inferred request before the heavy CLI graph loads. Typed MCP/pool calls and release usage exit 1 versus other ops usage exit 64 are retained. Generated help, equals flags and options before the target are part of this integration.

The new equals/help production-entrypoint cases were observed failing against incoming main before implementation (`/tmp/dash-release-central-red.log`). After integration, combined CLI/release tests passed: **148 tests, 440 assertions, 0 failures**, `/tmp/dash-release-central-baseline.log`. Initial integrated typecheck executed and passed in 9.4 seconds.

**Thirteen watched fault/restoration pairs** passed, `/tmp/dash-release-central-proofs/index.json`, driven by `/tmp/dash-release-central-proofs.py`: production-fast condition, target pattern with a configured malformed target, profile enum, environment enum independently under full, accepting an ignored flag, accepting repeated refs, defaulting a missing profile, broadening release dispatch to host commands, release usage exit policy, the heavy-helper release fence, namespace registration, discarded child exit status and admitting an unsupported action. Each fault produced its named assertion failure and each restoration passed. Adjacent Proof comments name these checks.

The proof driver refused an ambiguous injection marker before editing, then resumed with a unique release marker. Its assertion-output matcher initially rejected Bun's `Expected constructor:` format even though the heavy-helper test correctly failed; the source was restored, the driver was corrected, and that fault/restoration pair was rerun successfully. Neither harness interruption is counted as a passing proof.

Both prior host runs were stopped once main integration made their target obsolete. The full 53-project phase on `32b86b1d` passed and its required GitHub CI passed, but those are historical evidence, not final acceptance for the typed integration. Final static checks, cross-repository plan, final exact-SHA host gate, new CI and public merge remain pending.

The complete integrated Dash lint/typecheck/build targets executed and passed in 1m05s (`/tmp/dash-release-central-final-static.log`), and the combined 148-test suite passed again after proof comments/lint (`/tmp/dash-release-central-final-tests.log`). The actual public-to-private divergent-branch plan passed on the central grammar: `/tmp/website-facade-central-proof.log`, evidence `/tmp/website-facade-proof-rnN85T`, requested private `7315af40f8be8160cb3f4dd4756adc044a88a315` and public `3ed489d5f695a776d1af0c3a53a2cea449996a85`, with no shared mutation.

A final abnormal-termination test kills its own disposable adapter with SIGTERM and observes a nonzero CLI outcome. Discarding the production child status made that named test fail, and restoration passed; it is the twelfth pair in the index. The final combined suite/static refresh and final external gate/CI/public merge are still pending at this checkpoint.

Final integrated acceptance before commit: **149 tests, 442 assertions, 0 failures** in 26.61 seconds (`/tmp/dash-release-central-ready-tests.log`); complete Dash lint/typecheck/build executed and passed in 1m03s (`/tmp/dash-release-central-ready-static.log`). Strict OpenSpec validation passed after splitting the long grammar requirement into its own testable requirement. The thirteenth watched pair admits `deploy` into the action grammar; `grammar refuses invalid action` failed, then restoration passed. Only final-commit review, the new exact-SHA host gate, new required CI and the public merge remain pending. Final external acceptance is recorded in PR 824.

## Required CI fixture correction

The final typed commit `341e6a4b6` passed Twilight and every browser shard, but workspace CI `41558132696`, job `125662089097`, failed `fanout-selected-rank.controller.db.test.ts:185`. Its fixture assumed HTTP creation order, while the existing project-rank spec orders unranked projects by creation timestamp and then ID. The unchanged production clock uses millisecond `Date.now()` with random UUIDs; tied timestamps can reverse the fixture's lower projects.

Eight natural local runs passed, so they are not claimed as reproduction. A controlled equal-timestamp/descending-ID fixture reproduced the exact existing `starts[0]` assertion failure (`/tmp/dash-release-rank-fixture-proof/equal-time-descending-ids-red.log`). The fixture now assigns distinct creation timestamps alongside its existing direct SQL setup, preserving its unranked state and every original assertion. The corrected fixture passed. Forcing the production selected-booking boundary to use Fast still failed that same assertion, then restoration passed: `forced-fast-production-red.log` and `selected-production-restored-green.log` in the same directory. Production source was restored byte-for-byte; only deterministic test setup changes. This restores the precise existing spec, so it adds no product behavior or OpenSpec capability.

The merge controller stopped before merging the failed commit. Its obsolete queued h2 ticket was cancelled after exact PID/label verification; other jobs were preserved. Fresh required CI and a new exact-SHA host gate are mandatory for the correction commit. No blind CI rerun or bypass is counted.

The corrected fixture's six related controller/store files passed **67 tests, 423 assertions, 0 failures** in 60.95 seconds (`/tmp/dash-release-rank-fixture-related.log`). The backend typecheck and its dependency executed and passed in 19.2 seconds (`/tmp/dash-release-rank-fixture-typecheck.log`); named ESLint, Prettier, strict OpenSpec and diff checks passed. Independent review confirmed every assertion and the original unranked-to-ranked scenario remain unchanged, and production source has zero diff. The repair requires fresh CI and canonical host verification for its new commit.
