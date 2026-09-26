## Why

An unestimated step currently takes the same assumed two workdays in the schedule as its Gantt bar depicts. This delays successors, occupies people and capacity, and moves projected dates even though nobody supplied an estimate. The visual placeholder should remain available without becoming planning time.

## What Changes

- A slice with unknown days has zero scheduling duration in Fast and optimized CP-SAT, while retaining its unknown status and dependency node.
- Draw its Gantt placeholder across the existing assumed span, visually marked as uncertain, with a tooltip explaining that the span is excluded from scheduling.
- Keep explicit zero-day estimates distinct from unknown slices and preserve real date and dependency constraints.

## Non-Goals

No change to estimate entry, the configured assumed visual span, dependency reach rules, or the meaning of an explicitly estimated zero-day milestone.

## Constraints

The archived assumed-duration-schedules delta is the only available wbs-domain base in this checkout; no main wbs-domain spec exists. Its scheduling rule must be removed, while its not-an-estimate rule remains and is modified for a drawing-only assumption. The active dual-optimized-scheduler delta is the solver base.

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
