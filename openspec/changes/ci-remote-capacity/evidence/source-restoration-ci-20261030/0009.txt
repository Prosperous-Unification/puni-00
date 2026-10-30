# Remote CI cleanup and capacity

## Problem

Hosted run 40090762480 passed 3334 remote tests but failed global scratch cleanup: removal took 10400 ms against 10000 ms. Its 4191-second phase plus pending readiness work projected 4963.65 seconds against 4500. Run 40869279277 later hit that phase bound with 61 completed model cases and six incomplete.

After the source-restoration checkpoint, 23 individually selected case receipts project 2351.860495 seconds. Added to the published seven-parent source leaf's 2157.063 seconds, this is 4508.923495 against the unchanged 4500-second bound. This mixed-epoch sum is planning evidence, not a measured combined failure.

## Outcome

Give only global scratch cleanup an explicit 30000 ms allowance, retaining removal, markers, errors and ordinary budgets. Preserve one logical remote owner and canonical discovery through five complete disjoint fixed leaves: the 43-case core model, 24-case continuation, existing seven-source owner, exact source-restoration singleton and their complement. Only the new tracked source-restoration parent moves to a separate fourth isolated matrix runner; the seven-source list stays unchanged.

## Non-goals

No generic sharding, timing allocator, filtered registration, optional fallback, runner upgrade, production change, deadline increase, native policy change or canonical local/host target change. Capacity is accepted only after fresh published source/source-restoration/remainder jobs and strict aggregation finish successfully.

## Constraints

Rest owns Caddy, typecheck/build and full-mode lint once. Every fixed runner retains dependency builds, native provisioning, immutable plan/head/base/mode validation, noncached fresh execution and distinct always-upload logs. The matrix disables fail-fast and requires every selected member; missing, failed, cancelled, skipped-without-exclusion, unknown or wrong-head results refuse.

All retain 75-minute phases, 90-minute jobs, 30-second TERM cleanup and original child/parent/watchdog bounds. Both explicit source identities provision the same reviewed commit-pinned Node 24.20.0. One additional runner adds at most 90 job-minutes of allocation, not proof of sufficiency. Separate runners preserve fixed-port collision safety. Documentation/excluded plans retain explicit skips; hosted acceptance remains Root-owned.
