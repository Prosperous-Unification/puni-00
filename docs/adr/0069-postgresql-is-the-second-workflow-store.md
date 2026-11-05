# PostgreSQL is the second workflow store

The owner selected PostgreSQL with serialized write transactions per physical execution store on 2026-11-04. Keep the existing provider-neutral RunStore/ArtifactStore ports and the SQLite adapter, and prove PostgreSQL against the same semantic conformance before enabling selection. Serialized store writes keep ownership, capacity and coupled histories atomic; agent execution remains parallel.

## Considered options

PostgreSQL has installed Bun SQL PostgreSQL support and observed exact-byte/index/concurrency feasibility. Selecting another database would add an untested engine and driver. Per-identity locking can improve write concurrency but requires a cross-family lock-order protocol without a measured bottleneck; the initial provider uses one short write transaction at a time per store. Concrete advisory-versus-metadata-row locking remains a private design obligation.

## Consequences

The [OpenSpec change](../../openspec/changes/workflow-postgres-provider/proposal.md) records the implementation and acceptance obligations. Full conformance, durable settings, bounded lifecycle, uncertain-commit behavior and paused-writer transfer remain unproved. This decision authorizes no operator migration or production deployment.
