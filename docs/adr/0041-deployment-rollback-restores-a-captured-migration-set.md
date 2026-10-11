# Deployment rollback restores a captured migration set

**Status:** proposed, 2026-10-06. Change: `restore-applied-migration-set`; WBS 070 follow-up.

Deployment rollback will use an immutable, attempt-bound record of the applied migrations
and candidate scripts instead of inferring the original set from its newest timestamp.
This makes a delayed branch migration reversible without renaming an identity that a durable
database may already contain. Persisted recovery records outlive executors and image changes,
so their format and compatibility rules must remain explicit.

## Considered Options

- **Capture the exact set and candidate identities.** Recommended: handles older newly
  introduced stamps, partial application and resumed rollback; requires both deployment
  callers to transport the record and verify restoration.
- **Require every pending stamp to exceed the current maximum.** Useful prevention, but
  rejects delayed migrations and cannot recover existing non-prefix sets. It does not fulfill
  the recorded-set contract by itself.
- **Restore a database backup on every abort.** Rejected: Compose keeps the old release
  serving during the swap, so restoring the snapshot could discard acknowledged writes.

## Consequences

The existing manual `--to=<name>` operation remains available with its timestamp semantics.
Deployment automation uses exact-set mode and refuses incomplete legacy capture instead of
silently falling back. No database schema or existing migration identity changes.

## Candidate compatibility amendment

The offline compatibility RED found that Kubernetes could capture an old backend through its
own SQL script, then discover missing exact-set down support only during rollback. Require an
executed, versioned, database-free capability response from the pinned backend before capture.
The response advertises both capture-v1 and digest-pinned restore-v1 support; contract tests
exercise the actual backend CLIs that implement those claims.

- **Dedicated executable protocol:** chosen; absence fails closed and discovery needs no
  database observation. It adds one small executable surface in the backend image.
- **Existing `status --capture` alone:** rejected; capture-v1 does not establish digest-pinned
  down support, and legacy status opens SQLite before printing its incompatible scalar.
- **File presence, inferred flag support, or a trial rollback:** rejected; presence does not
  establish the executable contract, and a capability probe must not mutate SQLite.

Keep the existing capture and journal versions and all recovery boundaries. This is a protocol
check, not a general capability registry, automatic legacy migration, or deployment approval.
