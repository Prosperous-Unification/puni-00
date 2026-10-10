## Why

The approved website plan gives anonymous drafts a 24-hour lifetime. The API already refuses expired claims, but their descriptions remain in SQLite. Operators need a reviewable way to inspect and remove abandoned drafts without affecting submitted requests, account-owned work or active AI operations.

## What Changes

- Add an operator command that reports eligible expired anonymous drafts as counts and an opaque plan fingerprint, without returning descriptions, claims or emails.
- Permit explicit application of an unchanged inspected plan. Remove only unconsumed drafts with no proposal, request, legacy account-request or replay association, in one transaction.
- Refuse missing, unreadable, unsupported or changed database state. Inspection and cleanup must not migrate the database or invoke API startup recovery.
- Ship reproducible fixture tests, negative proofs and the operator procedure.

## Non-Goals

This slice does not complete the separate 12-month prospect/client policy, backup deletion, aggregate telemetry or scheduled cleanup. It does not activate deletion on a live host, modify the current Build release, change expired-claim access behavior, or delete submitted/account-linked records.

## Constraints

Use the existing SQLite schema, Bun/Nx and independent PUNI storage. Keep the running preview and queued release immutable. The user's standing instruction authorizes assumptions and implementation without an interview; live deletion remains unperformed while backup lifecycle work is pending. No new runtime dependency or migration is expected.

## Capabilities

### New Capabilities

- `anonymous-draft-retention`: Inspect and explicitly apply cleanup of expired unlinked anonymous drafts.

## Domain Terms

Expired anonymous draft, recorded in the website glossary.

## Decisions Recorded

None.

## Impact

Public website SQLite adapter and API command/build, website operating documentation, and later private snapshot integration. The full privacy lifecycle remains a separate completion requirement.
