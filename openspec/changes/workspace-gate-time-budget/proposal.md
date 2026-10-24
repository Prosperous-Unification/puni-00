# Workspace gate capacity

## Problem

PR #535 run `38858776285` exhausted the former 60-minute workspace allowance after Nx passed. Raising the single job to 90 minutes did not establish a complete verdict: later run `40060433745` spent nearly the whole 90 minutes in workspace work and was cancelled with the frontend test and required post-Nx checks unfinished. Its incomplete artifact also contains independent test failures, tracked separately.

## Outcome

Partition the cold workspace Nx gate by whole project: backend, remote scripts, frontend and the complement. Give each runtime job a 90-minute whole-job ceiling and a 75-minute Nx phase ceiling. Run every former non-Nx workspace check in a separate required 30-minute job, concurrently. Keep one validated source plan and a strict `gate` reducer so a skipped, failed, cancelled or absent required job cannot pass.

## Non-goals

No target, test file, dependency, native provision, assertion, retry, cache policy or parallelism change. The Twilight, docs, browser and canonical host gates keep their contracts. A configured budget is not proof of hosted capacity or a complete green verdict.

## Constraints

The affected plan must retain exact immutable base/head and target-specific selection. Full mode must cover every configured non-Twilight project, including future projects. Each runner must retain the original Nx exit status, annotations and always-on logs. Hosted exact-head cold CI is required before calling the partition sufficient.
