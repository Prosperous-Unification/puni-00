# Remote CI cleanup and capacity

## Problem

Exact-head hosted run 40090762480 passed 3334 remote tests but failed its global scratch cleanup: synchronous removal returned after 10400 ms, exceeding the inherited 10000 ms allowance. Its remote runtime phase took 4191 seconds. Separately measured pending readiness work adds about 785 seconds, giving an estimated updated test duration of 4963.65 seconds, above the existing 75-minute phase bound. That estimate is not an observed integrated phase.

Hosted run 40869279277 subsequently reached the 4500-second phase bound: 61 completed model cases passed, while six remained incomplete. Its 67-case model wrapper therefore also needs a fixed whole-file split; completed historical cases do not prove the extracted source.

## Outcome

Give only the global scratch cleanup hook an explicit 30000 ms allowance. Preserve its entry/return markers, removal implementation, error policy and ordinary test budgets. Execute the remote project's complete canonical test scope through three fixed independent CI VM leaves: the 43-case core process-model owner, the 24-case solver/backend/gateway continuation owner and canonical selection excluding exactly those two files. Preserve one logical remote project owner and selection bit, exact immutable plan/head validation, complete discovery, fresh execution and strict required aggregation.

## Non-goals

No generic sharding, timing allocator, filtered test registration, new optional skip, runner upgrade, production behavior change, global test or CI deadline increase, native policy change or canonical local/host target change. No claim of capacity until all cold hosted leaves and their required aggregate actually succeed.

## Constraints

The remainder owns existing remote Caddy, typecheck/build and full-mode lint obligations once. Both model leaves retain dependency builds and native provisioning. All three keep 75-minute phases and 90-minute jobs, distinct always-upload logs, original child statuses and independent execution after a peer failure. Docs/excluded plans explain every skip; every missing, failed, cancelled, unknown or wrong-head required result refuses.

The stable required model job uses a closed two-entry matrix, one separate runner per model file, with fail-fast disabled. Each model allocation retains its original limit; combined model allocation is now two 75-minute phases and two 90-minute jobs. Child, parent and watchdog bounds remain unchanged.
