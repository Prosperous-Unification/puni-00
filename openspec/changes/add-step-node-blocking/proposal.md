## Why

The plan can say whether an entire work item is blocked, but cannot identify which step is stopped. Step progress only records `in_progress` and `done`, and the existing work-item proxy calculation intentionally loses step-level precision. Teams need an explicit, auditable statement about the affected step without changing schedule forecasts or redefining work-item status.

## What Changes

Add a distinct step blockage fact and an undoable command to set or clear it. Plan reads and saved plans expose the fact and a step-level status with dependency-derived blockage causes. The step cell and card identify the blocked step accessibly. Work-item status and schedule calculations retain their current semantics.

## Non-Goals

- Step readiness, step `on_hold`, cancellation, skipped work, and per-step capacity.
- Replacing or refining work-item status folding or its known leaf-grain proxy behavior.
- Removing blocked nodes from forecasts or changing solver inputs.

## Constraints

Keep `StepState` as `in_progress | done`, with unknown represented by absence. Store blockage separately from derived readings. Use additive SQLite migration with a guarded `down.sql`; rollback must preserve or refuse stored blockage facts. Preserve blockage across import/export and saved-plan history with backward-compatible version upgrades. All blockage facts and readings are schedule-neutral. The blue/green processes share SQLite during deployment.

## Capabilities

### New Capabilities

- `step-node-blocking`: Record explicit step blockage, derive node readings and causes, and present them in working and saved plans.

### Modified Capabilities

None. The feature contract is scoped to the new capability; existing work-item status, scheduling, and generic dependency behavior remain unchanged.

## Domain Terms

Step blockage

## Decisions Recorded

[ADR 0053: A step blockage is separate from step progress](../../../docs/adr/0053-step-blockage-is-a-separate-fact.md)

## Impact

`@wbs/domain`, the SQLite adapter and migration/swap checks, the core work-item command and read path, plan import/export and saved plans, fe-01 step cells/cards, and relevant contracts and tests. No external service or solver dependency is introduced.
