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
