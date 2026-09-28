## Context

The website adapter owns five additive migrations. `findDraft` already rejects expired claims, but no maintenance path removes their content. `WebsiteStore` construction creates/migrates a database and marks in-flight chat unknown for process recovery, so a maintenance command must not construct it. The private backup validator separately checks schema and migration integrity; this slice adds a public maintenance boundary without importing private source.

## Goals / Non-Goals

Build a reviewable inspect/apply command for expired unlinked anonymous drafts. Preserve live request and accounting state. The original 12-month prospect/client policy, backup deletion, scheduling and telemetry remain required later slices. No live database is purged by implementation or verification.

## Decisions

- Put maintenance SQL and connection ownership in `libs/website/adapters/store-sqlite/src/draft-retention.ts`, exported through the existing adapter entrypoint. Extract the existing migration catalogue only if needed to share its exact five migration inputs; keep API startup behavior unchanged.
- Open only existing database files. Inspection uses a read-only connection. Validate known migration checksums, integrity and the complete supported schema, including triggers, without applying migrations. Unknown triggers are refused because they could suppress deletions or change protected rows. Missing files and permission failures propagate with context.
- Eligibility uses the existing `expires_at` and `consumed_at` fields and independent anti-joins for all four association paths. Preserve legacy rows, replay authority and every provider/chat row. No schema change is needed.
- Return `{ cutoff, eligibleDrafts, fingerprint }`. The SHA-256 fingerprint binds the actual database identity, cutoff and stable ordered candidate identities/expiry values; no content or raw identity leaves the command. Use `BEGIN IMMEDIATE` for application, recompute under that transaction and require equality before deletion. Delete the stable ordered candidates with a prepared per-candidate statement inside that transaction. An injected failure on a later delete, after one succeeds and after schema validation, proves rollback; removing the outer transaction must leave a partial deletion. A single multi-row DELETE would be statement-atomic even without the outer transaction and would not prove this guard.
- Add `apps/website/be-01/src/draft-retention-cli.ts`: `inspect DATABASE` uses the current clock and prints the plan; `apply DATABASE CUTOFF FINGERPRINT` requires explicit reviewed values. A future cutoff is refused. Parse command/number/hash input once, print only aggregate JSON on success and fail nonzero on errors.
- Include the command in the existing API build beside `main.js`, using its copied migration inputs. Verify the actual built command on a disposable database.

## Risks / Trade-offs

A live API may associate a draft after inspection. Fingerprint comparison under the write transaction refuses that stale plan. A separate maintenance connection must not trigger startup recovery or change active usage holds. Schema drift is a refusal, never an empty cleanup. Removing active rows does not erase backup copies; the operator guide must preserve that distinction and leave live activation pending the backup policy.

## Migration Plan

No migration. Keep this work on a separate branch from the immutable Build release currently in its host gate. Transfer the finished public adapter/API only after review, required gates and private snapshot checks in a later release.

## Open Questions

None for this slice. Twelve-month/client and backup-lifecycle policy remain explicit follow-up requirements of the overall website plan.

## Interfaces

`DraftCleanupPlan` contains `cutoff: number` (UTC epoch milliseconds), `eligibleDrafts: number` and `fingerprint: string` (lowercase SHA-256 hex). `inspectExpiredDrafts(databasePath: string, cutoff: number): DraftCleanupPlan` owns a read-only connection. `purgeExpiredDrafts(databasePath: string, cutoff: number, expectedFingerprint: string, now: number): { deletedDrafts: number }` owns its write transaction and rejects a cutoff later than `now`. External numeric/hash parsing belongs to the CLI boundary; database state is validated in the adapter. If shared migration metadata is extracted, both normal startup and maintenance consume the same catalogue and copied SQL inputs.
