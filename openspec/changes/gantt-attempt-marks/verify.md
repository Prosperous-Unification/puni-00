# verify — gantt-attempt-marks

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Commands

| Slice | Command | Result |
| ----- | ------- | ------ |
| —     | —       | —      |

## Failure proofs

| Check | Fault injected | Test that observed it | Observed |
| ----- | -------------- | --------------------- | -------- |
| —     | —              | —                     | —        |

## Not run

- Slices 0.2–3 (2026-10-12, lane `step-node-attempts-ui`): **blocked**. Task 0.1 makes this packet
  depend on `sub-day-gantt-axis` slices 1–3 (`AXIS_RUNGS`, the tick floor and collision list,
  `markCount` and the 2,500 offer rule), and none of them is implemented on
  `origin/batch-10/integration-10` `271604b0d` or on any pushed branch: `AXIS_RUNGS` is absent
  from fe-01 and every `sub-day-gantt-axis` task is open. At the day rungs this packet draws
  nothing by its own spec, so there is no slice that can land first. The project zone the marks
  need is on the tree read (`ChartRead.timezone`) since `step-node-attempts` slice 6.

—

## Architecture correction — 2026-10-12

Branch `batch-10/gantt-attempt-marks-rulings`, based on `origin/main`
`99f588257a0a7014ec9271224f7900ed588e6053`. This documentation change records completed-row
forecasts, explicit missing-calendar states, start-day clamping, display-range expansion,
actual-paint mutation proofs and the benchmark boundary. It also corrects the card file
ownership and makes the timezone read a declared prerequisite. No new domain term is
introduced; the existing deferred Attempt mark glossary task remains open.

| Command                                                       | Observed result            |
| ------------------------------------------------------------- | -------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`      | 183 items passed, 0 failed |
| `bunx prettier --check` over the seven changed Markdown files | Passed                     |
| `git diff --check`                                            | Exit 0                     |

Application tests, browser tests, mutation proofs, performance measurements and the host
gate were not run for this architecture-only draft PR. All implementation tasks remain
open. The mutation cases above are required future observations, not completed proofs.
