# Verification Report

**Change**: `website-request-retention-lifecycle`

**State**: tasks 1.1 and 1.2 implemented on `feat/puni-retention-deadlines` (stacked on PR #210). Tasks 2.x–4.x are not started. Deletion, designation, holds, the journal and backup changes stay disabled or absent.

## Slice 1: deadlines, backfill and count-only report (2026-09-30)

Implementation: migration `006_retention_subject` (paired `down.sql`), `libs/website/adapters/store-sqlite/src/request-retention.ts`, content-write anchoring in `store.ts`, the shared `checked-database.ts` validation, and `apps/website/be-01/src/request-retention-cli.ts` in the API bundle. The operator procedure is [request retention deadlines](../../../docs/website/request-retention.md).

### Tests added

`request-retention.test.ts` (store, 16 tests): calendar-month clamp including 2024-02-29 15:00 → 2025-02-28 15:00; a standalone manual proposal with no account or request; a draft-backed account request and its submission (one subject, not two); a blank account request through blank, first and later writes; a first chat message plus a later turn; schema refusal to move an anchor; four concurrent writer processes; 006 rollback to the exact 005 schema; historic backfill through the real 001–005 migrations (linked manual draft, 004-copied drafted and typed rows, 004 empty placeholders, placeholder chat, pre-draft chat, overlapping legacy lineage); an account submission sharing an unsubmitted request draft; activation coverage for an omitted accountless proposal, an ambiguous subject, an unanchored content write and a missing request subject; and evidence-backed operator resolution, including a no-content-change fingerprint.

`request-retention-cli.test.ts` (API, 2 tests): child-process report, coverage refusal, ambiguous listing, refused and accepted resolution, then coverage ready with content unchanged; malformed arguments and a missing database path refused without creating a file. `build-smoke.ts` also runs the bundled `request-retention-cli.js report`.

### Commands and results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build,test:package -p website-store-sqlite,website-be-01 --skip-nx-cache --output-style=static`: exit 0, `Successfully ran targets test, lint, typecheck, build, test:package for 2 projects and 1 task they depend on`. Store: `25 pass`, `0 fail`, 138 expect() calls. API: `56 pass`, `0 fail`, 350 expect() calls.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts <006 migration.sql> <006 down.sql>`: exit 0. The same path is live: appending `ALTER TABLE retention_subject DROP COLUMN ambiguity;` gave exit 1 with `migration.sql contains destructive statement: DROP COLUMN`, and moving `down.sql` away gave exit 1 with `006_retention_subject has no down.sql`. Both faults were restored. The lefthook `website-migration-lint` step also passed on the commit.
- `bunx @fission-ai/openspec@1.12.0 validate website-request-retention-lifecycle --strict`: `Change 'website-request-retention-lifecycle' is valid`, exit 0.
- `bunx prettier --check` on the 15 non-SQL files changed since `590d5efba`: `All matched files use Prettier code style!`, exit 0.

### Failure proofs

Each fault was applied to production code by a scratch runner, the named test run with `env -u CLAUDECODE bun test <file> -t <name>`, and the file restored. Every run exited 1. Each guard carries an adjacent `Proof:` comment.

| Guard                                             | Injected fault                                                      | Observed failure                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutable anchor, write path                      | Drop `AND resolution = 'pending_content'` in `anchorRequestContent` | `(fail) a blank account request anchors on its first nonempty write and later edits keep it` with `SQLiteError: retention anchor is immutable`                             |
| Immutable anchor, concurrent writers              | Same fault                                                          | `(fail) concurrent first writes from separate processes record exactly one anchor`: three of four writer processes exited with `retention anchor is immutable`             |
| Immutable anchor, schema                          | Trigger `WHEN` changed to `WHEN 0`                                  | `(fail) the schema refuses to move an anchored subject`: `Expected substring: "retention anchor is immutable"`, `Received function did not throw`                          |
| Manual subject                                    | Skip the `proposal_submission` subject insert in `submit`           | `(fail) a standalone manual proposal has its own subject anchored to the draft with no account`: `Expected length: 1`, `Received length: 0`                                |
| No duplicate subject                              | Drop the `software_request` exclusion from `untrackedSubmissions`   | `(fail) an account submission sharing an unsubmitted request draft is overlapping lineage, not a second subject`: `Received + 9`                                           |
| Ambiguous anchor: draftless content               | Draftless content classified as `pending_content`                   | `(fail) backfill anchors only durable draft lineage and reports historic ambiguity by count`                                                                               |
| Ambiguous anchor: foreign legacy lineage          | Drop `row.foreign_legacy === 1`                                     | `(fail) backfill anchors only durable draft lineage ...`                                                                                                                   |
| Ambiguous anchor: shared submission lineage       | Drop `row.foreign_submission === 1`                                 | `(fail) an account submission sharing an unsubmitted request draft ...`                                                                                                    |
| Ambiguous anchor: content predates draft          | Replace the earliest-content comparison with `false`                | `(fail) backfill anchors only durable draft lineage ...`                                                                                                                   |
| Activation coverage: omitted accountless proposal | Force proposal `uncovered` to 0                                     | `(fail) activation coverage refuses an omitted accountless submitted proposal or ambiguous subject`: `Expected: 1`, `Received: 0`                                          |
| Activation coverage refusal                       | `refusals.length > 0` changed to `< 0`                              | Both coverage tests failed: `Received function did not throw` for `1 uncovered proposal submission` and `1 unanchored software request`                                    |
| Evidence requirement                              | Evidence pattern check replaced with `false`                        | `(fail) an operator resolves an ambiguous anchor only with an evidence reference`: `Expected substring: "Evidence reference must be an opaque reference"`, `did not throw` |
| Anchor not after surviving content                | Bound check replaced with `false`                                   | Same test: `Expected substring: "Anchor cannot be later than surviving content"`, `did not throw`                                                                          |
| CLI anchor syntax                                 | Anchor pattern check replaced with `false`                          | `(fail) source command refuses malformed arguments without creating a database`: received the store's `Anchor must be UTC epoch milliseconds` instead of the CLI refusal   |
| CLI argument count                                | Remove `arguments_.length !== 2`                                    | Same CLI test: `Expected: not 0` (an extra-argument command succeeded)                                                                                                     |

### Assumptions

1. Subjects live in a separate `retention_subject` table keyed by `(subject_kind, subject_id)` rather than columns on each source table. It has no foreign key because the identity is polymorphic. The primary key refuses duplicates; coverage queries find omissions.
2. Backfill is TypeScript that runs at every API startup and only inserts missing subjects. It is not SQL inside the migration, so requests written by an older API process during a blue/green swap are covered on the next new-process start. Existing subjects are never updated. Maintenance commands do not backfill or migrate.
3. "Nonempty" means non-blank after trimming. First content on a blank request is a nonempty brief, an admitted chat message, a chat turn or a saved concept preview. The anchor is the `now` of the first committed write. Concurrent writers are ordered by SQLite commit order, and the losing writers' content shares that deadline.
4. A request with no subject row (created by an older process after startup) is not anchored by a new-process write. It stays `uncovered` in the report and becomes `unanchored_content` at the next startup backfill, so it is never given a guessed anchor.
5. A draft-backed subject anchors to `intake_draft.created_at`. Overlap is either an `account_request` for another account that names the same draft, or a submission on the request's draft whose `created_at` is not the request's `submitted_at`. Pre-004 submission timing is not in this repository's history, so the second rule could flag legacy rows as false positives. Those rows only become ambiguous, which is the safe direction. The same draft on a standalone submission and a legacy `account_request` is also overlap.
6. The `content_predates_anchor` check compares the draft time with `chat_turn`, `chat_operation` and `request_concept_preview` timestamps. `provider_call` is not content. When an operator resolves an anchor, it may not be later than the earliest surviving content timestamp, including the draft and submission times.
7. `classification` defaults to `non_client` and can also hold `client` or `hold`. Nothing writes the last two until task 2.3. The report already counts `client` and `dueHeld`.
8. The applied journal sequence is `retention_journal_position.applied_sequence`, a singleton row set to 0 and unused until task 2.1.
9. Operator anchor resolution is written only to SQLite. It is not a journal event, because the design journals only designations, corrections, holds and erasures. If an older snapshot is restored, the subject becomes ambiguous again and activation is blocked. Task 2.x should decide whether resolutions also belong in the journal.
10. An evidence reference must match `^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$`: no spaces and no `@`, so it points at evidence and cannot hold it. An actor must match `^[a-z][a-z0-9_-]{0,63}$`.
11. The count-only report omits all identifiers. The separate `ambiguous` command lists typed IDs and reasons without content, because the spec requires reporting the identity for adjudication.
12. Draft maintenance validates against the migration catalogue. A 005 database must be started once by the new API, which applies 006, before draft inspection accepts it.

### Unverified or deferred

- The h2puni host gate (`bin/h2puni-gate.sh`) has not run in this slice. The parent session runs it.
- The private recovery command's known migration list is not updated for 006. That repository is out of scope here, and task 4.1 owns it. Until then, the private restore path may not recognise a database that has migration 006 applied. This has not been checked.
- No live database was inspected. No content, backup or journal was changed.
