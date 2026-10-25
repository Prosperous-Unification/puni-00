## 1. Backend tracking

- [x] 1.1 Define source-reported use/event shapes and test transitions, retention and evidence.
- [x] 1.2 Add additive persistent schema, guarded rollback, immutable history, atomic revision
      updates and idempotent replay under the existing write coordinator.
- [x] 1.3 Bind typed HTTP routes and production composition with project/organization access;
      expose eligible MCP tools through existing derivation.
- [x] 1.4 Integrate matching attempt/claim-release/expiry cleanup signals without changing
      logical occupancy or schedules.
- [x] 1.5 Prove deletion/orphan access, machine ownership, concurrent writes and selected guard
      negatives through real composed SQLite tests.

## 2. Resource management UI

- [x] 2.1 Integrate resource-use listing into the Resources screen with local failures and paging.
- [x] 2.2 Add history and cleanup/block/retention/release-report actions with validation and conflicts.
- [x] 2.3 Prove request versus release, retention, stale responses and parent-screen integration.

## 3. Review and verification

- [x] 3.1 Independently review backend and UI against this increment and fix important findings.
- [x] 3.2 Run affected tests, lint, typechecks, migration validation and formatting.
- [ ] 3.3 Validate OpenSpec and record exact evidence, remaining runtime scope and resource cleanup.

## Companion runtime implementation

Verified physical settlement, managed-pool reservation accounting, managed creation and
automatic cleanup are tracked in `../dash-resource-cleanup/tasks.md`. This tracking increment
alone does not establish those capabilities.
