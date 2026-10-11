## Context

Planning baseline: `eaaa14b28664986e4ab84ddc2710c01615abcdc2`.
`migrate-status-cli.ts` returns the newest applied name. Compose `swap.ts` captures that
string immediately before migrate and calls `migrate-down-cli.ts --to=` on abort.
`migrationsToRollback` filters `created_at > baseline.created_at`.

Kubernetes `captureFromReport` already records applied names/hashes and pending down hashes.
Its `rollbackSchema` still receives only `capture.baseline`; `BACKEND_TASK_SCRIPT` calls the
same CLI. `assertRestoredSet` catches leftover names after rollback but cannot undo them.

The [F8/F11 packet](../k3s-wbs-delivery/tasks.md) remains the deployment owner. The
[070.01 incident](../k3s-wbs-delivery/verify.md#lab-migration-stamp-overtaken-on-main-2026-09-27)
fixed only the synthetic lab stamp and its ordering test. Neither artifact is reopened here.

The combined brainstorming, grilling and domain review uses the user's standing delegation:
an older new migration must be reversed; an already-applied older migration must survive;
partial migration and resumed rollback must converge; denied inventory access is unknown.
These are proposed architecture defaults, not a claim of a separate human interview.
No new glossary term is necessary: this packet uses existing technical migration concepts.

## Goals / Non-Goals

**Goals:** restore the exact captured migration identities with existing SQL rollback scripts;
give both deployment callers the same production CLI guarantee; preserve evidence for recovery.

**Non-Goals:** no schema migration, migration rename, general dependency graph, backup restore,
host operation, new access route, writer-fencing redesign, or change to post-write recovery.
Do not alter the already-correct LAB_MIGRATION ordering check from 070.01.

## Decisions

The persistence and compatibility choice is in [proposed ADR 0041](../../../docs/adr/0041-deployment-rollback-restores-a-captured-migration-set.md).

### Capture and SQLite boundary

Add a small module beside `migrate-down.ts` for the versioned capture boundary and exact-set
selection; reuse the existing transaction executor rather than duplicating down-script SQL.
Capture includes a schema version, deployment target/attempt/candidate identity supplied by
the trusted caller, the complete baseline names and forward hashes, and pending names,
forward hashes and down hashes in the actual forward runner's deterministic order.
Do not use ledger autoincrement IDs as migration identities.

Validate external capture once. Reject null names, duplicates, unknown versions, invalid
hashes, overlap between baseline and pending, and inconsistent order. Read script bytes once
for validation and execution, preventing a checked script from being swapped before use.
Validate the complete observed ledger and all required scripts before reversing anything.
Every baseline identity must still exist unchanged; every extra must match captured pending.
Reverse observed pending entries in reverse captured order, regardless of their relationship
to baseline timestamps. Retain existing duplicate-stamp checks and per-migration transaction
semantics, including foreign-key rebuild handling. Final equality compares names and forward
hashes, not row IDs. An already-restored set is a verified no-op.

Extend the stable backend CLI paths with explicit capture/exact-set modes; retain manual
`--to=` semantics. Mutually exclusive modes, missing input and unsupported capture versions
must refuse. Capture must use a read-only existing database connection; bootstrap's explicit
empty ledger is allowed, but opening an absent database must not create one by accident.

### Compose

Before migrate, capture through the incoming pinned image while holding the existing deploy
lock. Persist an immutable attempt-specific record under the existing owner-controlled state
root, atomically write/read back its identity, and retain it across failure. Pass the recorded
capture to the same image's exact-set CLI over the existing command boundary; transport must
not rely on shell interpolation of unvalidated JSON. On abort, verify the actual restored
ledger through the CLI before printing success.

Keep the old release's serving behavior and existing abort boundary. Failure remains nonzero
with both original and recovery errors. The manual command must use retained capture and the
pinned image after cleanup; it cannot refer only to a container that cleanup stops/removes.
Do not automatically replace SQLite with the pre-swap snapshot.

### Kubernetes

The offline compatibility audit observed an old `--to`-only image pass the generated capture
script and create a snapshot: that script reads SQLite and migration folders itself. A later
exact-set rollback would fail because the candidate CLI does not recognize its arguments.
Capture-format support alone is insufficient: digest-pinned down support arrived separately.

Add `apps/wbs/be-01/src/migrate-capabilities-cli.ts` as a small executable protocol boundary.
With no arguments it prints exactly one JSON object:

```json
{ "protocol": "wbs-migration", "version": 1, "capabilities": ["capture-v1", "restore-v1-sha256"] }
```

It imports no database/configuration module, requires no DB_PATH or migration directory, and
rejects unexpected arguments. The response has exactly these keys; the capability array has
exactly these two unique strings, with order insignificant. The names describe capture format
1 and exact-set restoration that verifies the supplied SHA-256 before parsing or opening SQLite.
Production contract tests exercise both advertised operations through the existing CLIs; a
marker file or a process exit code alone does not establish this contract.

In `BACKEND_TASK_SCRIPT`, mode `capture` executes that CLI and validates its entire stdout and
exit status before the first SQLite open, snapshot directory creation or VACUUM. Refuse absent,
unreadable, failing, malformed, unsupported and partial responses explicitly. Keep the existing
single SQLite capture/snapshot observation afterward: do not probe by running down SQL or add
a second status/capture database read. The coordinator journals capture only after this Job
succeeds, so refusal cannot reach forward migration. The pinned backend image is the authority;
the capability response adds neither another deployment identity nor a journal field.

This amendment changes only backend capability advertisement and Kubernetes candidate admission.
It does not alter Compose, captured bytes or their format/version, journal schema 2, manual
`--to` behavior, image admission policy, fencing, Lease/Flux order, or legacy-journal recovery.
Compatibility alternatives are recorded in ADR 0041. The handshake is not a claim that a
candidate passes live rehearsal, trusted activation, or the canonical gate.

Extend `MigrationCapture` and the durable journal with the complete pending identities;
carry the capture through `rollbackSchema`, rendered schema Job and `BACKEND_TASK_SCRIPT`.
Continue validating the observed restored identities independently at the coordinator.
Do not change Lease acquisition, writer fencing, Flux suspension or writes-reopened behavior.
Retained Job manifests and manual commands must carry the same attempt-bound capture.

### Legacy records

Keep old manual CLI mode. Do not automatically synthesize absent capture identities from
the current image for an interrupted legacy transaction. Refuse with the original journal
preserved and an explicit route to the prior executor/manual recovery procedure. Finish any
in-flight deployment with its compatible executor before adopting the new protocol. This
packet does not introduce an automatic legacy-journal migration.

## Risks / Trade-offs

- Checking only set names misses changed applied hashes; both identities must be compared.
- Computing observed-minus-baseline alone could reverse an unrelated migration; captured
  pending identities constrain membership under the existing single-migration-actor contract.
- Whole-database rollback can destroy acknowledged Compose writes; it remains excluded.
- Partial down failure must retain per-migration atomicity, and interruption between migrations
  must remain resumable. Existing stored-vocabulary guards remain effective.
- Old executor/new CLI compatibility and candidate image identity need direct caller tests.
- Capture files are recovery authority; protect their ownership and reject replacement or
  malformed contents. They contain schema identities only, never application rows or secrets.

## Migration Plan

No database migration is needed. First land the shared runner/CLI, then Compose and Kubernetes
callers, then integrated rehearsal and exact-SHA gate. Do not activate partially migrated
deployment automation as a completed fix.

Tasks 3.2a/3.2b are offline compatibility preparation after slices 1 and 2; they may proceed
while the 3.1 live rehearsal awaits permitted candidate availability. Rehearse and gate the
resulting implementation revision after the handshake is integrated. Neither the pre-live
fixture checkpoint nor planning validation completes 3.1/3.2 or unblocks #259. The h2puni route
is unavailable until that candidate revision is present there through a permitted path.

PR #259's old lifecycle identity is not currently cleared for renaming: h4claw inventory
access was denied and supported-store absence remains incomplete. Therefore this packet
precedes #259 integration unless a separately authorized, authoritative bounded inventory
proves a narrow restamp safe. This supersedes the initial after-#259 sequencing suggestion.
There is no dependency on node enrollment 070.02/.03/.06, Dash 080.19, or 070.09 completion.

## Open Questions

No product choice blocks the proposed implementation. The PM selected this prerequisite
route; a separately evidenced safe #259 restamp would require an explicit dependency update.
Denied access cannot establish rename safety. Before enabling the new deployment protocol, inventory active release journals
and finish any legacy attempt using its compatible executor. No host action is authorized
by this planning artifact alone.
