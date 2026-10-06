## Why

A deployment can apply an older branch migration after a newer migration is already recorded.
Current rollback selects only timestamps above the previous maximum, leaving that migration
applied while the CLI reports success. PR #259 reproduced this with lifecycle
`20261001020000` after shared people `20261005110000`. AGENTS requires restoration of the
recorded applied set; Kubernetes detects the mismatch, while Compose can report success.

## What Changes

Failed WBS deployment restores exactly the captured migration identities, including older
newly introduced migrations. Capture and candidate script identities survive interruption.
Invalid capture, unexpected ledger changes, changed scripts and incomplete restoration fail
explicitly, retain recovery evidence and identify a usable manual completion command.
Before Kubernetes captures a candidate, its pinned backend must advertise both versioned
capture and digest-pinned restoration through a database-free capability CLI. An older or
incompatible image is refused before SQLite is opened or a snapshot is created.

## Non-Goals

No migration restamping, product schema changes, database snapshot replacement, host
enrollment, new cluster access, deployment, Dash authority relocation, or general migration
dependency graph. Do not reopen 070.01's completed synthetic lab fixture fix.

## Constraints

Preserve additive forward migrations, existing deployment locks and recovery boundaries,
Kubernetes writer fencing, and manual timestamp rollback compatibility. Use Bun/Nx and watched
production-path R5 negatives. This planning draft claims no implementation or safety proof.
With authoritative nondeployment inventory unavailable, integrate this repair before #259;
a separately proven safe restamp can remove that prerequisite without completing this work.

## Capabilities

### New Capabilities

- `applied-migration-set-rollback`: attempt-bound capture and exact migration restoration.

### Modified Capabilities

None. Cross-reference [k3s-wbs-delivery F8/F11](../k3s-wbs-delivery/tasks.md); its release
contract remains applicable.

## Domain Terms

None. Migration identities, capture and rollback are existing technical concepts; no new
business term is introduced into CONTEXT.md.

## Decisions Recorded

[Proposed ADR 0036](../../../docs/adr/0036-deployment-rollback-restores-a-captured-migration-set.md).

## Impact

SQLite migration runner and backend CLIs, Compose swap executor, Kubernetes release capture,
schema Jobs, recovery journal compatibility, tests and deployment runbooks.
