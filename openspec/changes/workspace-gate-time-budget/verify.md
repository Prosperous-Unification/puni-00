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

## Whole-project capacity partition, 2026-10-24

The older [run 40060433745](https://github.com/Prosperous-Unification/puni-00/actions/runs/40060433745)
cancelled the 90-minute workspace job. Its artifact records Nx starting at 04:02:13 UTC
and cancellation about 86m11s later without a final Nx summary. The backend and remote
suite elapsed times were 42m57s and 31m18s respectively; the frontend main test and final
typecheck were unfinished. Five remote-script cases and one contracts matrix failed
independently. The partition does not repair or waive those failures.

The parsed former workspace job has 23 non-Nx steps after removing only the old runtime
and upload steps. The new `gate_checks` steps compare equal as parsed YAML, in order,
including all commands, environment and conditions. Four runtime jobs have distinct
whole-project ownership, exact full-depth checkout, pinned Bun and Python, shellcheck,
native bubblewrap/BusyBox provision, frozen install, 90-minute job limits and 75-minute
runtime phase cutoffs. `ci-run-runtime` emits the selected project/target roster, Nx command
elapsed time and exit code; the pinned Nx task-timings lifecycle logs per-task durations
when each command completes. Each runtime job uploads a unique per-attempt log with
missing-log refusal. The `gate` reducer requires every selected runner and checks job.

Focused local commands and observed outcomes:

| Command or check                                                                                                                                 | Outcome                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight focused Bun suites: CI plan, capacity workflow, runtime partitions, reducer, PR shell, corpus workflow, toolchain and Burokrat entrypoints | 175 pass, 0 fail, 1,118 assertions with `TOOL_WIKI_TRUSTED_NODE_MODULES` set to this checkout's installed `node_modules` for the existing scratch fixture |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects --json`                                                                          | JSON roster includes all three dedicated names and the residual projects                                                                                  |
| Pinned OpenSpec validation for `workspace-gate-time-budget`                                                                                      | 1 change passed, 0 issues                                                                                                                                 |
| Scoped ESLint, TypeScript builds for hooks/devsync/Burokrat CLI, Prettier and `git diff --check`                                                 | Exit 0 after formatting the runner                                                                                                                        |

Watched fault injections were applied only to the isolated worktree and restored in
`finally` blocks. In each row, the named focused test became red with the fault:

| Fault                                                                 | Observed focused test                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Map `wbs-fe-01` to the backend owner                                  | `partitions all three heavy projects`: 1 fail                                   |
| Change first runtime phase from 75m to 90m                            | `each whole-project runtime`: 1 fail                                            |
| Remove BusyBox from first runtime provision                           | `every runtime keeps exact checkout`: 1 fail                                    |
| Change workspace log upload to `if-no-files-found: warn`              | `each whole-project runtime`: 1 fail                                            |
| Remove selected-owner success assertions from reducer                 | `requires each selected dedicated runner`: 1 fail                               |
| Remove checks-job success assertion from reducer                      | same reducer test: 1 fail                                                       |
| Remove backend plan ownership equality from published scope validator | `refuses malformed, inconsistent and polluted plans`: 1 fail                    |
| Remove full inventory name-shape guard                                | `full runner refuses stale head, missing owner and failed Nx inventory`: 1 fail |
| Remove published-plan project-name refusal                            | `refuses malformed, inconsistent and polluted plans`: 1 fail                    |
| Remove frontend `test:unit` dependency or Pacific/Auckland command    | `retains frontend node dependency and both timezone suites`: 1 fail for each    |
| Replace Caddy network assertion with gateway                          | `non-Nx checks retain their own finite budget`: 1 fail                          |
| Remove duplicate-owner or unknown runtime mode refusals               | corresponding focused partition/CLI tests: 1 fail each                          |
| Rename the runtime phase end record in the production shell           | `gate_workspace propagates runtime and annotation failures`: 1 fail             |

The GitHub job and `timeout` ceilings are declaration proofs only. The new partition has
not run on a hosted runner, so no complete exact-head cold gate, post-partition elapsed
times, or sustainable-capacity claim exists yet. The h2/h4 canonical host gate was not
run under this local source-only task. Docker release shape timeout and the remote
global cleanup-hook incident remain separate investigations, not capacity fixes.
