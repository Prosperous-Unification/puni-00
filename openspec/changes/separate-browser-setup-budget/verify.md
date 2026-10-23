# Verification Report

**Change:** `separate-browser-setup-budget`  
**Verification date:** 2026-10-24 (Europe/Kyiv)  
**Implementation baseline:** `70bafc2d7982e2a5713d4d681398debeed807809`

## Structural validation

`./node_modules/.bin/openspec validate --all --json` exited 0: 276 items passed, zero failed (258 changes and 18 specs); every item was valid. The full JSON is retained in `/tmp/puni-delivery-ci/budget-openspec-final.json`. The optional design artifact is omitted: the four declarations and their proof sequence are fully specified by the intent, delta spec and tasks; no architecture or domain terms changed.

## Task completion and spec sync

All three local implementation/proof/review tasks are complete. The final ordinary PR pipeline remains a publication acceptance requirement; this source record does not claim that future verdict. `browser-validation-budget` is an active delta and is not synced or archived. The implementation is merged under the 2026-10-24 goal.

## Original production failures

[Run 40004553548](https://github.com/Prosperous-Unification/puni-00/actions/runs/40004553548) tested head `70bafc2d7` and synthetic merge `ffe8016b3eeb5ece27667674058cb37b980fbcfd` against base `1de2778500f7c62f48f32fc568ec2a6c949334bb`. Its workspace and Twilight gates passed, but browser shard one exhausted the 25-minute whole-job limit three times.

| Attempt | Job                                                                                                         | Ubuntu archive transfer | Passing cases | Skipped | Last selected case index |
| ------- | ----------------------------------------------------------------------------------------------------------- | ----------------------- | ------------- | ------- | ------------------------ |
| 1       | [120589633186](https://github.com/Prosperous-Unification/puni-00/actions/runs/40004553548/job/120589633186) | 11m35s                  | 132           | 1       | 133/157                  |
| 2       | [120624030988](https://github.com/Prosperous-Unification/puni-00/actions/runs/40004553548/job/120624030988) | 10m34s                  | 133           | 1       | 134/157                  |
| 3       | [120644786477](https://github.com/Prosperous-Unification/puni-00/actions/runs/40004553548/job/120644786477) | 9m15s                   | 126           | 1       | 127/157                  |

The new delivery case passed in every attempt. None completed the selected shard or the dedicated organization phase; passing prefixes are not full acceptance. The logs establish slow package archive transfers and budget starvation, not a particular network root cause. Playwright browser downloads themselves took seconds. Successful shard and gate jobs were carried across partial retries, not executed again.

## Implementation and focused verification

Commit `f002ed7abfc99913570c7c628896e0ee91d4d59a` changes only the workflow and its existing contract test. The workflow SHA-256 is `9c3dbc638392c0b860695129e7b52586181a35911cda4c2e148f81ea10156f5e`. Budgets are job/setup/layout/organization 50/15/25/5 minutes. The 25-minute layout allowance avoids tightening a successful 19.5-minute shard to a provisional 20-minute cap. Commands, four shards, runner, zero retries, organization selection, affected/docs selection, artifacts and the stable reducer are unchanged.

Focused command:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts --timeout=10000
```

Observed TDD: old workflow **9 pass / 4 fail**, exit 1, 202ms; configured workflow **13 pass / 0 fail**, exit 0, 128ms. Final restored run with Proof comments: **13 pass / 0 fail / 92 expectations**, exit 0, 182ms.

### Declaration failure proofs

Each fault mutated the actual production YAML, ran the command above, checked the named failure and restored the source in `finally`. Every fault produced **12 pass / 1 fail**, exit 1. Restored green was **13 pass / 0 fail**, exit 0, 157ms. These prove declarations, separately from platform enforcement.

| Fault                           | Failing production-workflow test                                          | Wall time |
| ------------------------------- | ------------------------------------------------------------------------- | --------- |
| Remove Chromium timeout         | `bounds Install chromium to 15 minutes`                                   | 0.142s    |
| Remove layout timeout           | `bounds Layout gate to 25 minutes`                                        | 0.152s    |
| Remove organization timeout     | `bounds Activated organization context to 5 minutes`                      | 0.155s    |
| Remove whole-job timeout        | `reserves setup and overhead outside the layout and organization budgets` | 0.178s    |
| Restore whole-job timeout to 25 | `reserves setup and overhead outside the layout and organization budgets` | 0.157s    |

Adjacent workflow `Proof:` comments identify the tested relationships. Local captures: `browser-budget-implementation.md`, `budget-fault-receipts.json`, `budget-omit-*-timeout.log`, `budget-restore-job-25.log` and `budget-restored-green.log` under `/tmp/puni-delivery-ci/`.

### Actual Actions deadline proofs

The isolated [Actions proof run 40025174273](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273) ran on branch `proof/browser-budget-deadlines-20261024`, commit `62ebc347a4636328f57ccf9fe397e3eadebf2529`, based on delivery head `70bafc2d7`. It began at 2026-10-23T21:13:29Z and ended at 21:18:02Z with intentional failure from the injected deadline faults.

The production YAML snapshot was read while its working-tree base was `70bafc2d7`; its hash above matches the file subsequently committed in `f002ed7ab`. The probe preserved the selected runner and organization condition, replaced application commands with bounded 90-second dependencies and markers, and shortened the guard under test to one minute. Paired controls literally omitted that timeout key; another three-minute limit bounded their execution. Three waves limited proof concurrency to three jobs. No PR, deployment, ruleset or secret change was involved, and no proof check was attached to the feature commit.

| Boundary       | Guarded job / outcome / duration                                                                                            | Same delay with guard omitted                                                                                             | Deadline-expected oracle on omission |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Chromium setup | [120659447280](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120659447280), failure, 75s   | [120660000260](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660000260), success, 94s | exit 1                               |
| Layout         | [120659447530](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120659447530), failure, 76s   | [120660000419](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660000419), success, 94s | exit 1                               |
| Organization   | [120659447622](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120659447622), failure, 75s   | [120660000529](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660000529), success, 93s | exit 1                               |
| Whole job      | [120660673998](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660673998), cancelled, 74s | [120660673884](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660673884), success, 94s | exit 1                               |

All three guarded phase logs explicitly reported that the named action timed out after one minute. The guarded whole job carried the scheduler annotation that it exceeded its one-minute maximum. Guarded dependencies did not print their completion marker and later validation markers stayed skipped/absent. Removed-bound controls printed both actual completion and later-validation markers. The [fast positive control](https://github.com/Prosperous-Unification/puni-00/actions/runs/40025174273/job/120660674041) passed in six seconds.

Thirteen oracle executions over actual job metadata/logs matched expected exits: four guarded deadline assertions exited 0; the same four deadline assertions exited 1 with their guards removed; four success assertions on those controls and one fast-control assertion exited 0. These are observed breakable enforcement proofs, not merely static pins. Shortened clocks establish the platform deadline mechanism; they do not benchmark application tests or claim a natural 15/25/5-minute deadline was exhausted.

Raw source derivation, command receipts, logs, metadata and oracle captures are retained under `/tmp/puni-delivery-ci/browser-budget-proof-20261024/`; the proof branch preserves the dispatched workflow. Final complete browser acceptance still belongs to the ordinary PR pipeline.

## Checks and review

- `bunx prettier --check .github/workflows/ci.yml tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts`: exit 0, both files formatted, 0.207s.
- `bunx eslint tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts`: exit 0, no diagnostics.
- `NX_DAEMON=false bunx nx run tool-git-hooks:typecheck --skip-nx-cache --output-style=stream`: exit 0, successful target, 289ms Nx duration.
- `git diff --check`: exit 0.
- Normal implementation commit hooks passed in 2.33s. Tool Wiki explicitly reported inactive/uncertified because its external activation root was not provisioned. Migration and document-cap hooks skipped by their file scopes. No hook bypass.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0, no output.
- One independent scoped review of the correction and its declaration/runtime proofs approved with no blocking findings. It repeated no tests and changed no source; report `/tmp/puni-delivery-ci/browser-budget-review.md`.
- The final evidence files are formatted and committed with normal hooks. The tested source configuration remains exactly `f002ed7ab`; the final publication head and cleanliness are recorded in the PR receipt.

## Final acceptance and limitations

The final-head required `gate` and `pixels` verdicts, actual synthetic merge/base, selected scope, job links and timings belong in [PR #692's verification receipt](https://github.com/Prosperous-Unification/puni-00/pull/692). This record does not assert those external verdicts before publication. A receipt update preserves the tested source instead of creating a further evidence-only commit.

No duplicate local full app/browser/host gate is credited. The required PR pipeline remains canonical final verification; a host wrapper is reserved for additional necessary host validation. Full formatting and current-code gates remain required in that pipeline. No merge, deployment, secret change, ruleset change or runner migration occurred. The correction contains slow setup within a finite limit; it does not make network transfers faster. Longer worst-case job time is the explicit trade-off for giving setup and test phases independent allowances.
