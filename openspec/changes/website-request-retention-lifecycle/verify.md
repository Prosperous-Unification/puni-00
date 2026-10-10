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
3. "Nonempty" means nonblank: the text is not empty after trimming ASCII whitespace (tab, LF, VT, FF, CR, space). One SQL predicate, `nonblank` in `request-retention.ts`, decides this for write-time anchoring, backfill, the report and the content bounds. First content on a blank request is a nonblank brief, an admitted chat message, a chat turn or a saved concept preview. The anchor is the `now` of the first committed write. Concurrent writers are ordered by SQLite commit order, and a later writer sees the earlier content, so it does not anchor.
4. **Corrected 2026-10-01.** The original assumption covered only a request with no subject row. It missed a `pending_content` subject (created by the new API's `ensureBlankRequest`) that a still-serving 005 API then fills without an anchor. The next new-API write would have anchored it as `first_write` at that later time, and coverage would have reported `ready`: a guessed, too-late deadline. Now `anchorRequestContent` runs before each write, in the same transaction. If the request already holds nonblank content, the subject becomes `ambiguous` (`unanchored_content`) instead. Startup backfill also moves every filled `pending_content` subject to `ambiguous`, so `resolve` can adjudicate it. A request with no subject row still stays `uncovered` until the next startup backfill classifies it. Between an older-API write and the next new-API write or startup, the report shows `unanchoredContent` and coverage refuses.
5. A draft-backed subject anchors to `intake_draft.created_at`. Overlap is either an `account_request` for another account that names the same draft, or a submission on the request's draft whose `created_at` is not the request's `submitted_at`. Pre-004 submission timing is not in this repository's history, so the second rule could flag legacy rows as false positives. Those rows only become ambiguous, which is the safe direction. The same draft on a standalone submission and a legacy `account_request` is also overlap.
6. The `content_predates_anchor` check compares the draft time with `chat_turn`, `chat_operation` and `request_concept_preview` timestamps. `provider_call` is not content. When an operator resolves an anchor, it may not be later than the earliest surviving content timestamp, including the draft and submission times.
7. `classification` defaults to `non_client` and can also hold `client` or `hold`. Nothing writes the last two until task 2.3. The report already counts `client` and `dueHeld`.
8. The applied journal sequence is `retention_journal_position.applied_sequence`, a singleton row set to 0 and unused until task 2.1.
9. Operator anchor resolution is written only to SQLite. It is not a journal event, because the design journals only designations, corrections, holds and erasures. If an older snapshot is restored, the subject becomes ambiguous again and activation is blocked. Task 2.x should decide whether resolutions also belong in the journal.
10. An evidence reference must match `^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$`: no spaces and no `@`, so it points at evidence and cannot hold it. An actor must match `^[a-z][a-z0-9_-]{0,63}$`.
11. The count-only report omits all identifiers. The separate `ambiguous` command lists typed IDs and reasons without content, because the spec requires reporting the identity for adjudication.
12. Draft maintenance validates against the migration catalogue. A 005 database must be started once by the new API, which applies 006, before draft inspection accepts it.

## Review fixes (2026-10-01)

An independent review of `c121e386f` found one blocker and four non-blockers. Each was fixed test-first: every new test was watched fail (11 failing before implementation), then pass.

1. **Blocker: an older-API write to a pending subject.** `anchorRequestContent` takes the text being written and runs before the write. It moves a subject that already holds content to `ambiguous` instead of anchoring it, and startup backfill moves filled pending subjects too (see assumption 4). Tests: `an older API {brief,description,chatTurn,chatOperation,conceptPreview} write on a pending subject becomes ambiguous, never a late anchor`. Each one uses raw 005-style SQL and checks two things: a new write with no restart in between, and a restart. Then resolution with evidence lets coverage pass. Also `a new write refuses to anchor a pending subject that already holds older content` and `startup moves a pending subject holding older content to ambiguous`.
2. **Busy startup.** The store sets `PRAGMA busy_timeout = 5000` (`busyTimeoutMilliseconds`), and backfill runs as an immediate transaction. SQLite throws `SQLITE_BUSY` once the bounded wait expires. Test: `startup waits for a concurrent write lock instead of failing busy`. A child process opens the store while this process holds `BEGIN IMMEDIATE` for 700 ms.
3. **Resolve lock scope.** `resolveRetentionAnchor` validates on a read-only connection, then takes `BEGIN IMMEDIATE` (with the same busy timeout) only for the content bound and update. Test: `resolution validates the database before taking the write lock`. An edited-migration database under a held write lock is refused for the edit within 2 s.
4. **Trigger coverage.** The immutability trigger now also covers `resolution`, `ambiguity`, `evidence_reference`, `resolved_by` and `resolved_at`. Test: `the schema refuses to rewrite an operator resolution`.
5. **One content predicate.** Anchoring, backfill, the report and the bounds all use `nonblank`. Blank chat turns, operations and previews no longer count as content. Test: `blank writes neither anchor a subject nor count as content`. It covers an empty assistant reply, a whitespace brief and a whitespace user turn, and reopens the store to check backfill too.

### Failure proofs

The same scratch runner applied each fault, ran the named test with `env -u CLAUDECODE bun test <file> -t <name>`, and restored the file. All 20 fault runs (P1–P13 re-run plus these) exited 1.

| Guard                               | Injected fault                                                       | Observed failure                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prior-content check before anchor   | `state.prior === 1` changed to `=== 99`                              | All five `an older API ... write on a pending subject becomes ambiguous, never a late anchor` tests failed (`0 pass`, `5 fail`) on `toMatchObject`                                      |
| Startup reclassification of pending | Remove `database.run(pendingWithContent)` from backfill              | `(fail) startup moves a pending subject holding older content to ambiguous`                                                                                                             |
| Bounded busy wait                   | Remove the constructor's `PRAGMA busy_timeout`                       | `(fail) startup waits for a concurrent write lock instead of failing busy`: the child printed `database is locked`                                                                      |
| Validate before write lock          | Drop read-only validation; validate after `BEGIN IMMEDIATE`          | `(fail) resolution validates the database before taking the write lock` after 5085 ms: `Expected substring: "unexpected or edited migration"`, `Received message: "database is locked"` |
| Trigger covers resolution columns   | Drop `evidence_reference, resolved_by, resolved_at` from the trigger | `(fail) the schema refuses to rewrite an operator resolution`: `Received function did not throw`                                                                                        |
| Single nonblank predicate           | `trim(x, char(9, 10, 11, 12, 13, 32))` changed to `trim(x)`          | `(fail) blank writes neither anchor a subject nor count as content`: `Expected: "pending_content"`, `Received: "anchored"`                                                              |

The concurrent-writer test no longer proves the `pending_content` predicate. Once the first writer commits, the prior-content check already stops later writers from anchoring. The predicate is still proven by the later-edits test, which clears the brief and then rewrites it.

### Commands and results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build,test:package -p website-store-sqlite,website-be-01 --skip-nx-cache --output-style=static`: exit 0, `Successfully ran targets test, lint, typecheck, build, test:package for 2 projects and 1 task they depend on`. Store: `36 pass`, `0 fail`, 176 expect() calls. API: `56 pass`, `0 fail`, 350 expect() calls.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on the edited 006 `migration.sql` and `down.sql`: exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate website-request-retention-lifecycle --strict`: `Change 'website-request-retention-lifecycle' is valid`.
- `bunx prettier --check` on all files changed since `590d5efba` (non-SQL): `All matched files use Prettier code style!`, exit 0.

### Unverified or deferred

- The h2puni host gate (`bin/h2puni-gate.sh`) has not run in this slice. The parent session runs it.
- The private recovery command's known migration list is not updated for 006. That repository is out of scope here, and task 4.1 owns it. Until then, the private restore path may not recognise a database that has migration 006 applied. This has not been checked.
- No live database was inspected. No content, backup or journal was changed.

## Stage 2 (WBS 060.06.2, batch 10)

Design: Fable 5.1 retention stage 2 design and its slice list (private planning repository, `batch-10/design/060-06-2-*`). Each slice is one stacked PR; commands below ran in `/home/df/wd/puni/b10-retention` under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

### Slice 0: immediate write transactions and bounded read-only waits (2026-10-11)

Every `database.transaction(...)` in `store.ts`, `conversation-store.ts` and `guardrail-store.ts` now runs `.immediate()` (22 of 22), and the read-only validation connection of the retention commands sets `PRAGMA busy_timeout`.

| Guard                             | Injected fault                                       | Observed failure                                                                                                                       |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Immediate content write           | `updateAccountBrief` as a deferred transaction       | `(fail) a content write waits for a concurrent writer instead of failing busy`: child stderr `SQLiteError: database is locked`, exit 1 |
| Read-only validation busy timeout | No `PRAGMA busy_timeout` on the read-only connection | `(fail) resolve validation waits for a concurrent writer`: child stderr `SQLiteError: database is locked`                              |

- `bun test libs/website/adapters/store-sqlite/src`: `82 pass`, `0 fail`, 389 expect() calls.
- `bun test apps/website/be-01/src --timeout=30000`: `153 pass`, `0 fail`.
- `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p website-store-sqlite,website-be-01`: `Successfully ran targets lint, typecheck for 2 projects`. The projects have no `lint:fast` target.
- `bunx prettier --check` on the changed files: `All matched files use Prettier code style!`

### Slice 1: migration `010_retention_journal` and content fences (2026-10-11)

The migration adds the journal-position columns, classification-evidence and erasure columns on `retention_subject`, the append-only `retention_journal_applied` mirror, an erasure-is-final trigger, and twenty content fences: an insert trigger and a nonblank-update trigger on each of `software_request`, `intake_draft`, `proposal_submission`, `chat_turn`, `chat_operation`, `request_concept_preview`, `conversation_turn`, `conversation_operation`, `account_request` and `concept_preview`. Tests are in `retention-journal-schema.test.ts` (16). Three older rollback tests now roll back 010 before 006 or 009, because 010 extends 006's tables.

Each fault below was applied to `migration.sql` by a scratch runner. The runner then ran the named test with `bun test … -t` and restored the file. Every run exited 1.

| Guard                                         | Injected fault        | Observed failure                                                                      |
| --------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Each of the 20 fence triggers (one at a time) | trigger removed       | `(fail) a fenced subject refuses an older binary's content write: <that table>`       |
| `chat_turn` update fence condition            | `WHEN 0`              | refusal case for `chat_turn` failed; `a fenced subject accepts blanking` stayed green |
| Mirror `no_update` / `no_delete`              | trigger removed       | `(fail) the applied-event mirror is append-only`                                      |
| Erasure is final                              | trigger removed       | `(fail) erasure is final in the schema`                                               |
| Migration lint pairing                        | `down.sql` moved away | `010_retention_journal has no down.sql`, exit 1                                       |

- `bun test libs/website/adapters/store-sqlite/src`: `98 pass`, `0 fail`.
- `bun test apps/website/be-01/src --timeout=30000`: `153 pass`, `0 fail`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts $(git ls-files '*.sql') <010 files>` (the CI step plus the new files): exit 0.
- `nx run-many -t lint,typecheck -p website-store-sqlite,website-be-01`: success.

### Slice 2: journal records, chain verification, port and memory remote (2026-10-11)

New files in `libs/website/adapters/store-sqlite/src/retention-journal/`:

- `record.ts` holds canonical JSON, `hashEvent`, `sealEvent`, the encoders and the strict parsers. One validator is used both to build and to parse. Parsers refuse unknown or extra fields at every level, a bad hash, an off-pattern evidence reference or actor, and non-canonical bytes. A missing trailing newline counts as truncated.
- `remote.ts` holds the `RetentionJournalRemote` port. The version-id check lives at the adapter boundary.
- `memory-remote.ts` is a versioned test double with fault switches.
- `chain.ts` holds `readJournalTip` and `verifyChain`, which refuse with `uninitialised`, `missing`, `unreadable`, `malformed`, `truncated`, `gapped`, `stale`, `forked` and `foreign`.

Tests: `record.test.ts` (11), `chain.test.ts` (11) and `memory-remote.test.ts` (3).

The fault proofs below were run by the slice's helper agent and are carried by the adjacent `Proof:` comments. In each case one check was removed or broken, the named test was run with `-t`, and the observed failure is listed.

| Check                                       | Observed failure with the check removed                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| unknown fields                              | `parse refuses …`: "hash does not match" instead of the unknown-field refusal   |
| schema string                               | same test: "hash does not match", not "schema is not one of"                    |
| evidence pattern                            | `a record with an email-shaped evidence reference is refused`: no error         |
| hash hex, hash equals body, canonical bytes | the respective parse test: no `JournalRecordError`                              |
| trailing newline, JSON end-of-input         | `truncated and malformed …`: received `malformed`                               |
| uninitialised, missing head, gapped         | the refusal test failed with a `TypeError`                                      |
| unreadable and record-error mapping         | the refusal test received the raw port or record error class                    |
| foreign (genesis, head, position, event)    | the refusal blamed the wrong key or reported `forked`                           |
| stale against applied and against seen      | `a rolled-back head is refused as stale naming both sequences` failed           |
| previousHash, head closes the chain         | `a forked journal is refused` resolved                                          |
| fork at the same sequence                   | the message lost "head and database disagree" (the closing check still refuses) |

- `bun test libs/website/adapters/store-sqlite/src/retention-journal` (this slice): `25 pass`, `0 fail`.

### Slice 3: S3 journal adapter against a local stand-in (2026-10-11)

`retention-journal/s3-remote.ts` (`S3JournalRemote`, `readS3JournalConfig`) PUTs and GETs through presigned URLs with `fetch` so that `x-amz-version-id` can be read. It sends `If-None-Match: *` on request and lists with `client.list` continuation. `s3-stand-in.ts` is a `Bun.serve` path-style emulation on a loopback port. It refuses an object request without `X-Amz-Signature` and a listing without a SigV4 `Authorization` header. No real endpoint or credential was used.

| Check                        | Observed failure with the check removed                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| PUT version id required      | `an unversioned bucket is refused`: no `JournalRemoteError`            |
| non-2xx is an error          | `a 5xx is a JournalRemoteError naming the key`: received `unversioned` |
| 412 mapping                  | received `unreadable`                                                  |
| fetch failure wrapped        | raw `TypeError` "Unable to connect"                                    |
| truncated list without token | `a truncated list without a token throws`: no error                    |
| endpoint loopback rule       | config test accepted `http://storage.example.test`                     |
| prefix segments              | config test accepted `retention-journal/../website/`                   |

- `bun test libs/website/adapters/store-sqlite/src/retention-journal/s3-remote.test.ts`: `10 pass`, `0 fail`.

### Slice 4: the eraser, without the journal (2026-10-11)

`request-erasure.ts` contains:

- `fenceSubject`: moves a `non_client` subject from `none` to `fenced` and turns in-flight chat and conversation operations `unknown`, keeping their reservations.
- `releaseFence`.
- `eraseSubjectContent`: blanks the current and legacy rows of both subject kinds and their claim replay rows, refuses shared draft lineage, and treats an absent subject as a tombstone.
- `eraseAccountIdentityIfUnneeded`: sets the email to `erased:<id>` and deletes the OIDC link and sessions.
- `prepareErasureConnection` (`secure_delete`) and `compactAfterErasure` (`VACUUM`).

`admitChatOperation` maps a content-fence ABORT to `request_unavailable`. Tests: `request-erasure.test.ts` (9).

| Guard                           | Injected fault                               | Observed failure                                                                            |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Blanking list (request)         | `chat_turn` update removed                   | `(fail) a due account request is blanked …`: `+ "chat_turn.content"`                        |
| Blanking list (legacy)          | `account_request` update made a no-op        | same test: `+ "account_request.description"`, `+ "account_request.brief"`                   |
| Claim replay blanking (manual)  | `submission_replay` update made a no-op      | `(fail) a standalone manual proposal …`: `+ "submission_replay.body_hash"`, `"…receipt"`    |
| Held-request shared identity    | `others.some(...)` check removed             | `(fail) two due requests sharing an account …`: `identityErased` `true` instead of `false`  |
| Fence only `non_client`         | classification condition removed             | `(fail) fencing refuses a client or held subject`: did not throw                            |
| Shared draft (request / manual) | refusal replaced by `if (false)`             | `(fail) shared draft lineage is refused, not erased`: did not throw (each fault separately) |
| Fence turns operations unknown  | chat `state = 'unknown'` update made a no-op | `(fail) unknown provider usage keeps its reservation`: `"state": "inflight"`                |
| Fence ABORT mapped at admission | mapping removed                              | same test failed (the SQLite fence error escaped)                                           |
| `secure_delete` plus `VACUUM`   | both removed                                 | `(fail) erased text is absent …`: `"file": true`. Either one alone cleared this fixture.    |

- `bun test libs/website/adapters/store-sqlite/src`: `142 pass`, `0 fail`. `bun test apps/website/be-01/src`: `153 pass`, `0 fail`.
- `nx run-many -t lint,typecheck -p website-store-sqlite,website-be-01`: success.

### Slice 5: policy lock, append protocol, replay and startup (2026-10-11), task 2.1

- `retention-journal/policy-lock.ts`: `withPolicyLock` runs `BEGIN IMMEDIATE` on `<database>.policy-lock`, polling without blocking the event loop, and throws `RetentionPolicyBusyError` after 30 s.
- `retention-journal/session.ts`:
  - `openRetentionJournal` and `RetentionJournalSession.synchronise` bind the database to the journal three ways (env/options, database, genesis and head) and refuse a stale head before settling an orphan. They verify the chain and replay each event in its own immediate transaction together with its mirror row.
  - `append` refuses while the remote is ahead (`behind`). It writes the event and then the head; each write is read back and compared by bytes and version id. Only then does the primary transaction commit.
  - `initJournal`, `attachJournal`, `status`.

Task 2.1 is ticked. Its "local fsync followed by remote failure" case is `remote failure before head leaves the database unchanged`: this design writes no local candidate. "Host loss" is the older-snapshot replay, with the remote as the authority.

| Guard                                   | Injected fault                           | Observed failure                                                               |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Read-back comparison                    | condition reduced to `readBack === null` | `(fail) append detects an overwritten event`: the append resolved              |
| Stale before orphan settlement          | stale check removed                      | `(fail) startup refuses a rolled-back head`: event 2 re-adopted, open resolved |
| Orphan settlement                       | returns the tip unconditionally          | `(fail) an orphan event is settled before new appends`                         |
| Policy lock                             | `work()` run without the lock            | `(fail) concurrent appends serialise under the policy lock`: one `rejected`    |
| Remote-ahead refusal                    | `behind` check removed                   | `(fail) another process refuses cleanup until it replays`                      |
| Transition check                        | always allowed                           | `(fail) an erase of a newly designated client is refused after replay`         |
| Snapshot missing a named subject        | refusal skipped                          | `(fail) restore refuses a snapshot missing a designated subject`               |
| Database journal-id binding             | comparison removed                       | `(fail) startup refuses a foreign journal`                                     |
| Lock expiry                             | never expires                            | `(fail) policy lock expiry refuses, not hangs` (resolved after the 3 s holder) |
| `journal-init` over an existing journal | refusal skipped                          | `(fail) journal-init refuses an existing genesis`                              |
| `journal-attach` only at sequence 0     | applied condition dropped                | `(fail) journal-attach refuses applied_sequence > 0`                           |

The lock test uses a 300 ms wait against a child holding the lock for 3 s and asserts the 30 000 ms production constant. It does not wait out 30 s.

- `bun test libs/website/adapters/store-sqlite/src`: `161 pass`, `0 fail` (`session.test.ts`: 19). `bun test apps/website/be-01/src`: `153 pass`, `0 fail`.
- `nx run-many -t lint,typecheck,build,test:package -p website-store-sqlite,website-be-01`: success.

### Slice 6: API configuration, startup replay and operator routes (2026-10-11), task 2.3

- `runtime-config.ts`:
  - `readRetentionJournalSetting` reads `RETENTION_JOURNAL`, which is required and has no default. `s3` also needs `RETENTION_JOURNAL_ID`, the `S3_*` and bucket and prefix variables, `RETENTION_WRITER_RELEASE` and `RETENTION_WRITER_REVISION`.
  - `readRetentionErasure` takes `report` or `erase`, and `erase` requires `s3`.
- `main.ts` awaits `api.openRetentionJournal()` before `Bun.serve`.
- `server.ts` adds two routes:
  - `POST /operator/retention/events` requires an operator session and CSRF. It answers 400 for a malformed event, 404 for an unknown subject, 409 for an invalid transition, 503 `retention_journal_disabled`, 503 `retention_journal_unavailable`, and 503 `retention_journal_replayed` after it synchronises a remote that was ahead.
  - `GET /operator/retention/status`.
- `.env.example` sets `RETENTION_JOURNAL=disabled`.
- Tests: `retention-routes.test.ts` (8) and two in `runtime-config.test.ts`.

| Guard                            | Injected fault                       | Observed failure                                                                                     |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Required `RETENTION_JOURNAL`     | absent value defaulted to `disabled` | `(fail) a missing RETENTION_JOURNAL refuses startup`: did not throw                                  |
| `erase` requires `s3`            | refusal removed                      | `(fail) erase without s3 is refused`: received `"erase"`                                             |
| Operator session and CSRF        | both checks removed                  | `(fail) designation requires an operator session and CSRF`: `Expected: 401`, `Received: 201`         |
| Journal disabled                 | refusal removed                      | `(fail) journal disabled answers 503 …`: `retention_journal_unavailable` instead of `…_disabled`     |
| Remote failure mapping           | error rethrown                       | `(fail) a remote failure answers 503 and changes nothing`                                            |
| Evidence validation at the route | pattern check removed                | `(fail) an invalid transition is 409`: the record layer's refusal escaped instead of a 400           |
| Stream fence (slice 4 fence)     | chat `unknown` update made a no-op   | `(fail) a fenced stream completion becomes unknown and keeps its reservation`: `"state": "inflight"` |

The pre-hold snapshot replay that task 2.3 names is `an old snapshot replays designation, hold and erasure` (slice 5).

- `bun test apps/website/be-01/src --timeout=30000`: `163 pass`, `0 fail`.
- `nx run-many -t lint,typecheck,build,test:package -p website-store-sqlite,website-be-01`: success.
