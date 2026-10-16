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
