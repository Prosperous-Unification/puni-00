## Why

WBS 010.4.13.3 needs a leaf's individual step to state maximum parallelism while the row
continues to supply its default. Stage 7a exposes resolved node resources but has no sparse
node policy. A row-wide edit cannot express Dev at four and QA at one.

## What Changes

- Store an optional integer maximum parallelism, 1 through 1000, per concrete leaf/step pair.
  Absence inherits; an explicit value equal to the row default remains an authored fact.
- Eventually expose authorized set/clear commands, history and step-cell editing, resolve the
  override before person/team clamps, and preserve it across lifecycle, transfer and snapshots.
- Add a bounded saved-plan prerequisite: schema8 captures sparse facts, schema7 upgrades empty, and comparisons report capacity differences.
- Present existing sparse-preservation refusals in the browser plan writer for step removal
  and commands, preserving completed-prefix refresh and busy-state settlement.
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

## Current transport intent (2026-11-09)

Problem: current archival versions 11/12 cannot carry sparse authored policy. Outcome:
freeze ordinary13 and connected14 as reader prerequisites, with required structured
`stepParallels`, explicit historical-family decoding and lossless measures and connected
evidence. Historical1–12 upgrade only absent/empty policy; other declarations refuse.
Non-goals: activating output, import persistence, duplication/replay, scheduling or public
authoring in this prerequisite. Constraints: current exports remain11/12; mounted import
rejects13/14; normalized `PlanDocumentImport` and existing preservation fences remain.
Complete importer ownership, durable admission, compatible lifecycle/scheduling consumers
and installed rollout/recovery remain required before enabling any sparse writer.
