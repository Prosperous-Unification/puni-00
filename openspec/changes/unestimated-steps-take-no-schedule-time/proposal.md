## Why

An unestimated step currently takes the same assumed two workdays in the schedule as its Gantt bar depicts. This delays successors, occupies people and capacity, and moves projected dates even though nobody supplied an estimate. The visual placeholder should remain available without becoming planning time.

## What Changes

- A slice with unknown days has zero scheduling duration in Fast and optimized CP-SAT, while retaining its unknown status and dependency node.
- Draw its Gantt placeholder across the existing assumed span, visually marked as uncertain, with a tooltip explaining that the span is excluded from scheduling.
- Keep explicit zero-day estimates distinct from unknown slices and preserve real date and dependency constraints.

## Non-Goals

No change to estimate entry, the configured assumed visual span, dependency reach rules, or the meaning of an explicitly estimated zero-day milestone.

## Constraints

Before archiving this change, restore/sync the already archived `2026-08-30-assumed-duration-schedules` requirements at `openspec/changes/archive/2026-08-30-assumed-duration-schedules/specs/wbs-domain/spec.md:3,39` into `openspec/specs/wbs-domain/spec.md`; verify both `An unestimated slice takes an assumed duration in the schedule` and `An assumed duration is not an estimate` exist there as REMOVED/MODIFIED targets. Archive `dual-optimized-scheduler` first so `Every duration crossing the solver boundary is computed by the caller` at `openspec/changes/dual-optimized-scheduler/specs/scheduler-optimization/spec.md:343` exists before this scheduler MODIFIED delta is archived. The assumption becomes drawing-only.

## Capabilities

### Modified Capabilities

- wbs-domain: unknown steps consume no scheduled time or resources; their chart placeholders remain visible.
- scheduler-optimization: solver requests carry zero duration for unknown slices and publication agrees with Fast.

## Domain Terms

An assumed span is a drawing length only. Scheduling duration is the time used by planners and projections.

## Decisions Recorded

None; this reverses the archived scheduling assumption at the product owner's direction.

## Impact

Fast scheduling, solver wire computation and cache versions, optimized validation, Gantt geometry and tests. No stored estimate migration.
