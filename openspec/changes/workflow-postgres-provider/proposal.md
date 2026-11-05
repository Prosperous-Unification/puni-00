## Why

The S0 workflow foundation needs a real second durable provider. The current production factory selects SQLite; SQL feasibility alone does not prove portability. The owner selected PostgreSQL with serialized writes per physical store on 2026-11-04.

## What Changes

Implement the current 26 RunStore and two ArtifactStore operations plus awaited provider disposal against PostgreSQL, preserving existing semantic ports, exact identities, original replies where retained, ownership, capacity and complete recovery histories. Run the unchanged shared conformance oracles and real-process fault cases. Prove versioned transfer with all writers paused before claiming interchangeability.

## Non-Goals

No operator-store migration or production deployment; no tenant onboarding, credentials, limits, compute-provider work, CTT changes, new public ID rule, tool-output profile or ACP selection. This does not complete S7a. The existing SQLite adapter and migration identities remain intact.

## Constraints

Use Bun and Nx, existing pure planners and adapter guard precedence. Private indexes retain complete reversible bytes; digests are lookup buckets. Verify durable-commit settings, bounded lifecycle and uncertain COMMIT handling through production-path negatives. Missing or corrupt trusted state throws. Lifecycle topology, concrete bootstrap coordination and the transfer envelope remain explicit design tasks, not adopted choices.

## Capabilities

### New Capabilities

- `workflow-postgres-store`: PostgreSQL conformance and controlled execution-store transfer.

### Modified Capabilities

None.

## Domain Terms

None; existing store vocabulary is sufficient.

## Decisions Recorded

[PostgreSQL direction](../../../docs/adr/0069-postgresql-is-the-second-workflow-store.md). Only engine selection and serialized writes are approved; this initial packet publishes design and evidence, with implementation tasks open.

## Impact

Twilight Dash runs, a private PostgreSQL adapter, provider selection and shared conformance. Existing WBS and external dependency implementations remain owned by their current sessions.
