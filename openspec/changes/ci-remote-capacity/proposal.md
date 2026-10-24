# Remote CI cleanup and capacity

## Problem

Exact-head hosted run 40090762480 passed 3334 remote tests but failed its global scratch cleanup: synchronous removal returned after 10400 ms, exceeding the inherited 10000 ms allowance. Its remote runtime phase took 4191 seconds. Separately measured pending readiness work adds about 785 seconds, giving an estimated updated test duration of 4963.65 seconds, above the existing 75-minute phase bound. That estimate is not an observed integrated phase.

## Outcome

Give only the global scratch cleanup hook an explicit 30000 ms allowance. Preserve its entry/return markers, removal implementation, error policy and ordinary test budgets. Execute the remote project's complete canonical test scope through two fixed independent CI VM leaves: its entire process-model wrapper and the canonical selection excluding exactly that file. Preserve one logical remote project owner and selection bit, exact immutable plan/head validation, complete discovery, fresh execution and strict required aggregation.

## Non-goals

No generic sharding, timing allocator, filtered test registration, new optional skip, runner upgrade, production behavior change, global test or CI deadline increase, native policy change or canonical local/host target change. No claim of capacity until both cold hosted leaves and their required aggregate actually succeed.

## Constraints

The remainder owns existing remote Caddy, typecheck/build and full-mode lint obligations once. The model leaf retains dependency builds and native provisioning. Both keep 75-minute phases and 90-minute jobs, distinct always-upload logs, original child statuses and independent execution after failure of the other leaf. Docs/excluded plans explain both skips; every missing, failed, cancelled, unknown or wrong-head required result refuses.
