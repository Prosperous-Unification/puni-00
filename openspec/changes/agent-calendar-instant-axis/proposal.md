## Why

Field data (WBS 020.09) shows agents "ran through the night and the weekend" while the only
calendar the WBS has is Monday–Friday whole days. `estimate-units` places a minute slice on
that axis through a constant; it cannot say that an agent's work continues at 02:00 while a
human's resumes at 09:00.

## What Changes

- Every project step gains an **executor kind**, `human | agent | either`, `either` unless
  set (unless 010.4.13.3 (`configure-project-step-workflows`) has created the column first; then this change reads it).
- A project gains a **working window** — start and end hour in the **project timezone**,
  09:00–17:00 unless set — with weekends outside it.
- The schedule's internal axis becomes instants (epoch ms). Human-kind and either-kind slices
  occupy the working window; agent-kind slices run on the **agent calendar**, every hour of
  every day; a human successor of agent work rolls forward to the next working instant. Both
  engines read the same axis; CP-SAT's quantum is restated in minutes.
- Provider quota is not a calendar: agent concurrency stays the existing capacity pools.
- At sub-day rungs the Gantt greys non-working hours as it greys weekends, and the
  before-instant-axis clamp of attempt marks is retired.
- Last slice, **forecast-remaining-work**: a done node takes zero remaining duration placed at
  its attempts' span; a running node pins to its first attempt's start; both engines agree.

## Non-Goals

Quota windows (own WBS item); per-node calendar overrides; a per-person calendar; changing
what the estimate unit means; progress-aware forecasting before the instant axis exists.

## Constraints

**Gated**: no engine slice is specified beyond its red test until a proof script beside
`puni-plan/wbs-feedback-2026-09-26/cpsat-proof/prove_dependencies.py` shows a mixed-calendar
plan solving in OR-Tools (Dany, 2026-09-26). Under the default window every plan placed by
`estimate-units` keeps its dates; the live-plan identity oracles prove it and are
re-baselined only by `forecast-remaining-work`, explicitly. Scheduler contract, cache DTO,
plan document and saved-plan versions and the migration stamp are allocated at packet time.
Depends on `estimate-units` and `step-node-attempts` (the timezone).

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: executor kind, working window, instant axis, agent calendar, remaining work.
- `scheduler-optimization`: minute quantum, mixed calendars, the proof script.
- `plan-import`: kind and window in the plan document.
- `saved-plans`: kind and window in the canonical input.
- `deployment-pipeline`: additive migration and rollback.

## Domain Terms

Agent (rewritten); Executor kind, Working window, Agent calendar — applied to `CONTEXT.md` by
task 0.3 from the glossary delta.

## Decisions Recorded

[ADR 0043](../../../docs/adr/0043-agent-steps-run-on-a-continuous-calendar-and-quota-is-not-a-calendar.md).

## Impact

`@wbs/domain` (`schedule.ts`, `workday.ts`, calendars), solver contracts and Python, `@wbs/core`,
contracts, be-01 (migration, settings), fe-01 (steps settings, project settings, Gantt).
