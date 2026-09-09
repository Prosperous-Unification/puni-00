# Verification

## Starting state

- Work began from clean `8214af98` on 2026-09-09; `origin/main` was `5516d453`
  and already an ancestor.
- The inspected two-schedule/cue baseline `aca7a5c9` and its `5375cf5f` follow-up
  are both ancestors of this branch. The current interface carries both optimized
  schedules and Fast's seventh deadline argument.

## Slice 1.1 — scheduler value port

- `bun test` in `libs/runtime-portable`: **13 pass / 0 fail**. The scheduler cases
  cover both engines, both objectives, enabled and disabled reads, absent and installed
  adapters, live and capture readers, all seven optimization states, ready-with-null,
  unexpected adapter failure and a domain cycle.
- Five existing optimizer/read files in `be-01`: **56 pass / 0 fail**.
- Core, runtime-portable and `be-01` typechecks: clean, including spec projects.
- ESLint over core, runtime-portable and every touched `be-01` file: clean.
- Removing the selected missing-adapter guard returned a scheduled Fast plan instead of
  `engine_unavailable`; the test failed before its zero-Fast-call assertion.
- Dropping Fast's seventh argument removed the literal `Map { "leaf" => 9 }` deadline
  from every recorded call.
- Removing the ready-schedule invariant returned `kind: scheduled` with a null PRI
  schedule instead of throwing.

## Slice 1.2 — synchronous cache hash move

- `scheduleInputHash` now lives at the repository cache boundary; all eight importing
  production/test files use that adapter, while canonicalization and its mutation corpus
  remain in domain. The scheduler contract version is unchanged.
- The focused domain, hash, cache and coordinator/service run completed with **143 pass /
  0 fail**. The restored final domain/hash/cache run completed with **94 pass / 0 fail**.
- Fresh `tsc --build --force` runs for domain, contracts and `be-01`: clean. Fresh ESLint
  runs for all three projects: clean. Prettier over every touched TypeScript file: clean.
- `rg` found no production `node:crypto` import under `libs/domain/src` (exit 1, no
  matches); the SHA-256 import exists only in the new repository adapter.
- Hard-coding canonical `reach` to `whole-item` made the real published-cache read serve
  the stored schedule in array slot 0 instead of returning `null`. Emptying canonical
  `deadlines` served it in slot 1. Both faults ran through `publishedScheduleReaderOf`
  against a real SQLite row and were restored.
- Changing the adapter from SHA-256 to SHA-1 changed the literal address from
  `e35e9e9c28d2d392bfca660c9892de1682ddbf7e86ede0878bd8eafa26167e14` to
  `db508ad760d4acd7813774dd6674d5e7cbaf47d3`; the literal test observed and names that
  failure.

## Slice 1.3 — nonadmitting captured cache read

- `capturedOptimizationReaderOf` reads the exact input hash, contract, budget and current
  generation directly from SQLite. It projects ready, pending, retrying, failed, corrupt,
  plan-infeasible and idle states plus both decoded schedules.
- Four real-database captured-reader cases plus the existing normalizer and coordinator
  suites completed with **39 pass / 0 fail**. Fresh `be-01` typecheck, full source lint and
  touched-file Prettier checks are clean.
- Replacing the unallocated captured read with the production coordinator's
  `readPlan({ enabled:true })` returned generation 1 instead of `null`; the state-table
  snapshot sits immediately after that assertion and would also see its slots and queue.
- Reusing live `readPlan`'s `enabled:false` early return for capture returned a null
  generation instead of 1 and removed the stored ready PRI schedule. The restored reader
  ignores admission enablement and reads that exact row.
