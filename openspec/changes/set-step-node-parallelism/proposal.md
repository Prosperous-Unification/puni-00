## Why

WBS 010.4.13.3 needs a leaf's individual step to state maximum parallelism while the row
continues to supply its default. Stage 7a exposes resolved node resources but has no sparse
node policy. A row-wide edit cannot express Dev at four and QA at one.

## What Changes

- Store an optional integer maximum parallelism, 1 through 1000, per concrete leaf/step pair.
  Absence inherits; an explicit value equal to the row default remains an authored fact.
- Eventually expose authorized set/clear commands, history and step-cell editing, resolve the
  override before person/team clamps, and preserve it across lifecycle, transfer and snapshots.
- Ship additive persistence first. This bounded foundation introduces only the type, internal
  port, source inventory, memory/SQLite stores and guarded migration with parity and proofs.

## Non-Goals

Node team overrides, new workflows, executor kinds, participation, StepBlockage activation,
portfolio capacity, dispatch, changes to Stage 7a's resolver, and deployment in this foundation.

## Constraints

Identity follows ADR 0031: `(workItemId, stepId)`, never a parent or synthetic boundary.
Validate range, uniqueness, leaf ownership and shared project membership. Corrupt trusted
facts throw on reads. Writes are atomic with the surrounding source unit of work. Old
writers cannot be assumed compatible after authored overrides exist; rollout requires guards
and draining incompatible writers before enabling a public writer. Rollback refuses retained
facts. This packet describes the full feature; unchecked work is required before release.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wbs-domain`: sparse authored node parallelism, future resolution, lifecycle and transports.

## Impact

`@wbs/domain`, `@wbs/core`, source conformance, memory/SQLite adapters and additive migration
in this foundation. Later slices reach commands, history, HTTP/MCP, UI, scheduling, import,
copy, saved plans and deployment compatibility guards.
