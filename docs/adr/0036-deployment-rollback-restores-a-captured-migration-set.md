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
