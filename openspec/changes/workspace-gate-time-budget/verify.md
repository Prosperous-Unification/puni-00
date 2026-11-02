# Verification

## Hosted evidence before correction

[Run 38858776285](https://github.com/Prosperous-Unification/puni-00/actions/runs/38858776285)
ran PR #535 head `f6f867ecf059e79fcaa2083e2439a33795910c58` on 2026-10-16.
Workspace job `116836180460` started at 06:00:51 UTC and completed canceled at 07:01:05 UTC.
Its Nx step passed from 06:03:46 to 06:58:51 (55m05s), followed by successful Solver image smoke
and Heavy-work lock steps. Gate head pinning ran from 07:00:51 until cancellation at 07:01:03.
Dev entrypoint and the later checks, including Secrets scan, migrations and OpenSpec, were skipped.
The required aggregate gate failed. This is incomplete gate evidence, not a complete gate pass.

## Scope and pending evidence

The workspace timeout changes from 60 to 90 minutes. Ninety minutes is a chosen finite allowance,
not a measured complete duration. Check commands, verdict propagation and other timeouts retain
their prior definitions. The user-requested trusted-wiki lint skip remains intentional.

Full local Nx, browser and Burokrat checks are intentionally skipped under the RAM constraint.
Hosted CI on the new head must supply the complete gate verdict. Local checks passed:

- Prettier checked the workflow and this change directory: all matched files use its style.
- `git diff --check` exited 0.
- Bun parsed both workflow revisions as YAML, set the prior workspace timeout to 90, and confirmed
  full parsed equality: only that timeout changes semantically.
- `bunx --bun @fission-ai/openspec@1.12.0 validate workspace-gate-time-budget --type change --json`
  exited 0: one change passed, zero issues.

Normal commit hooks passed: Prettier, plaintext-secrets, private-nesting, and both agent trailer
stages. Code lint, migration lint and doc-caps had no matching staged files. The Tool Wiki hook
reported `inactive`, `certified:false`, because no external activation root is provisioned; this is
the intentional trusted-wiki skip, not certification. Hosted CI remains pending.

## Failure proofs

| Changed check                                                               | Fault                                | Observation                                                             |
| --------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| No check predicate or implementation changes; job scheduling allowance only | Existing 60-minute ceiling exhausted | Production run canceled Gate head pinning and failed the aggregate gate |

The 90-minute cancellation boundary is supplied by GitHub Actions and has not been exercised
locally. No new safety predicate is introduced.

## Production entrypoint expectation repair

Hosted [run 38864988637](https://github.com/Prosperous-Unification/puni-00/actions/runs/38864988637)
for wave 8 head `58334f1d3548e8ded83fc72eb224731ee06a63a8` reported the stale
`gate-entrypoints.test.ts` workspace expectation: `Expected: 60`, `Received: 90`.
Wave 9 head `741840881376327bca23140cb8367c7528818dca` inherited the same test.
The focused test reproduced that failure locally (0 pass, 1 fail, 57 filtered out).

The test now expects the specified 90-minute workspace allowance. The Twilight assertion stays
at 50 minutes. Production workflow and application source are unchanged. The adjacent `Proof:`
comment records the actual production-workflow mutation and observed focused failure.

Focused command, run serially from the isolated repository root:

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts --test-name-pattern 'CI gives the complete uncached gate its chosen finite allowance' --preload ./tools/test/scratch/preload.ts --timeout=60000
```

| State                                             | Observed outcome                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Original expectation 60, production workspace 90  | Exit 1; 0 pass, 1 fail; Expected 60 / Received 90                  |
| Corrected expectation 90, production workspace 90 | Exit 0; 1 pass, 0 fail; both workspace and Twilight assertions run |
| Production workspace mutated from 90 to 60        | Exit 1; 0 pass, 1 fail; Expected 90 / Received 60                  |
| Original workflow restored, adjacent proof added  | Exit 0; 1 pass, 0 fail; 57 filtered out, 2 assertions              |

The temporary workflow mutation was restored byte-for-byte; `git diff -- .github/workflows/ci.yml`
is empty. Scoped ESLint and Prettier passed; pinned OpenSpec 1.12.0 validated this change
with 1 passed, 0 failed and no issues. Normal staged pre-commit hooks passed: ESLint, Prettier,
plaintext-secrets and private-nesting. Tool Wiki reported inactive/uncertified because the external
activation root is not provisioned. ESLint reported that `@nx/enforce-module-boundaries` was skipped
because no cached project graph exists in the isolated checkout; no graph/full Nx run was started.
Full local Nx, Burokrat and
browser checks remain intentionally skipped for laptop RAM. Exact-head hosted CI and the canonical
h2puni gate remain release requirements. No complete aggregate gate pass is claimed.

## 120-minute repair local evidence

2026-10-30 implementation BASE: `da98bb93784747641de8ac1ecd2c9c67786a3b9b`.
Earlier sections are historical 60/90-minute evidence; their 50-minute Twilight references
describe the old assertion. Current production Twilight stays at 75 minutes. No old incomplete
hosted run is relabeled as passed. The chosen 120-minute workspace allowance is not a measured
completed gate duration.

### Both 90-minute hosted attempts remained incomplete

[Run 40959508633](https://github.com/Prosperous-Unification/puni-00/actions/runs/40959508633)
used source `b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda`, not this repair branch.
Attempt 1 workspace `123748477125` was canceled in solver smoke after its Nx step passed.
Attempt 2 workspace `124066899303` was canceled during lint after test/typecheck/build passed
in 80m32s; aggregate `124109679034` failed. Both annotations report maximum execution
`1h30m0s`. There was no third retry and no complete gate pass.

Raw logs: `/tmp/puni-r2-ci-workspace-40959508633-attempt{1,2}.log`.
Artifacts: `/tmp/puni-ci-workspace-duration-20261030-9b061932-099e-461d-92a4-738d092a7a2e/{attempt1,attempt2}/nx-gate.log`;
the derived `analysis.json` distinguishes phase summaries from expected diagnostic logs.

### Focused production-path proof and scoped checks

The existing test expectation changed first while the production workflow still read 90.
Serial RED then GREEN command (Bun 1.4.4):

```sh
bun --no-env-file test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts --test-name-pattern 'CI gives the complete uncached gate its chosen finite allowance' --timeout=60000
```

- RED exit 1: Expected 120 / Received 90; 0 pass, 1 fail, 57 filtered, 1 assertion.
  Production workflow SHA256: `f32006c3ee19f3fb2e671349df9614deb7be6edd23e06d4068db708e744b6e15`.
- GREEN exit 0 after choosing production workspace 120: 1 pass, 0 fail, 57 filtered,
  2 assertions (workspace 120 and Twilight 75). Adjacent Proof comment records the failure.
- `bun /tmp/puni-ci-budget-compare.ts` exit 0: installed YAML parser reported no errors or
  warnings; complete parsed objects were deeply equal after changing only BASE workspace
  90 to 120. Twilight remained 75; every other parsed value matched.
- `bunx --no-install eslint apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts`
  exit 0, both streams empty; no boundary-rule warning or skip was reported.
- `bunx --no-install openspec validate workspace-gate-time-budget --type change --json`
  exit 0: 1 passed, 0 failed, no issues.

Commands were captured with `bun /tmp/puni-ci-budget-task1.ts run <label> <command...>`,
which independently awaited process exit and both complete streams. Raw streams and command,
exit and SHA256 receipts: `/tmp/puni-ci-budget-task1-{red,green,equivalence,eslint,openspec}.{stdout,stderr,json}`.
No temporary production fault was introduced: RED used the unchanged obsolete production value;
the intended production repair remains. No dependency or lockfile change was made.

Full local Nx/browser/Burokrat checks remain intentionally skipped. Independent review,
exact-head hosted CI and the canonical host gate are controller-owned and remain pending.
The GitHub 120-minute cancellation boundary was not exercised locally.

Exact-path formatting check (exit 0, both streams empty):

```sh
bunx --no-install prettier --check .github/workflows/ci.yml apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts openspec/changes/workspace-gate-time-budget/tasks.md openspec/changes/workspace-gate-time-budget/verify.md
```

`git diff --check` exited 0 with both streams empty. Receipts and complete streams are
`/tmp/puni-ci-budget-task1-{prettier,diff-check}.{json,stdout,stderr}`.
Self-review found only the four owned paths changed, no dependency/lockfile changes and no
transient production mutation. Normal commit-hook outcomes are retained in the implementation
report and `/tmp/puni-ci-budget-task1-commit.{json,stdout,stderr}`.
