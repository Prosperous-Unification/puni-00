# Request retention deadlines

Each retention subject (an account-owned software request, or a standalone manual proposal submission with no software request) gets a fixed deadline 12 UTC calendar months after its first stored nonempty content. The rules and state live on `backfillRetentionSubjects`, `anchorRequestContent` and `addUtcMonths` in `libs/website/adapters/store-sqlite/src/request-retention.ts`. The [retention change](../../openspec/changes/website-request-retention-lifecycle/design.md) owns the full lifecycle.

With `RETENTION_JOURNAL=disabled` the release **only reports**: no command deletes or blanks content, and the operator policy routes answer 503. Designation, holds and erasure run only through the [retention journal](#retention-journal). Its decision record is [ADR 0046](../adr/0046-retention-journal-is-a-hash-chain-in-the-versioned-backup-bucket.md).

## Commands

Use the website API build containing `request-retention-cli.js` and its `migrations/` directory against an existing, fully migrated website SQLite file. API startup applies migration 006 and records missing subjects; the commands never migrate.

```sh
bun apps/website/be-01/dist/request-retention-cli.js report /path/to/website.sqlite
bun apps/website/be-01/dist/request-retention-cli.js coverage /path/to/website.sqlite
bun apps/website/be-01/dist/request-retention-cli.js ambiguous /path/to/website.sqlite
bun apps/website/be-01/dist/request-retention-cli.js resolve /path/to/website.sqlite KIND SUBJECT_ID ANCHOR_MS EVIDENCE_REFERENCE ACTOR
```

- `report` prints counts per subject kind: anchored, due, due under a hold, client, pending first content, ambiguous, uncovered and content without an anchor. It contains no content, email or identifier.
- `coverage` prints the same report when every subject is anchored or still blank, and otherwise exits nonzero naming the counts that block activation.
- `ambiguous` lists typed identities (`kind`, `subjectId`, `reason`) for adjudication, without content. Treat its output as operator-private.
- `resolve` anchors one ambiguous subject in this database only, and refuses while `RETENTION_JOURNAL=s3`, because a local resolution would not survive a restore. `EVIDENCE_REFERENCE` is an opaque pointer to where the evidence is recorded (for example `ops-ticket:42`), never free text or an email. The anchor cannot be later than now or any surviving content timestamp. A resolved anchor never moves.

## Ambiguity reasons

- `unanchored_content`: content exists without a linked draft or recorded first write. Examples are migration 004's copied `account_request` rows, placeholder chat, or a blank request that an older API process filled during a blue/green swap.
- `content_predates_anchor`: chat, operation or preview rows are older than the linked draft.

Anonymous conversation turns and operation text count as content of the subject whose `draft_id` owns the conversation (`conversationContentTimes` in `request-retention.ts`); `eraseConversationContent` blanks that text and keeps the accounting columns for the later erasure slice.

- `overlapping_lineage`: the linked draft also belongs to another account's legacy row, or a submission shares the draft without being that request's own submission.

Migration 004 placeholders stay `pending_content` until their first nonempty write. Their copied `created_at` is never used as an anchor.

## Retention journal

The journal is a set of immutable event objects plus a head object under `RETENTION_JOURNAL_PREFIX` in the versioned bucket. The behaviour and every refusal are documented on `RetentionJournalSession` in `libs/website/adapters/store-sqlite/src/retention-journal/session.ts`. Configuration is read by `readRetentionJournalSetting` and `readRetentionErasure` in `apps/website/be-01/src/runtime-config.ts`:

- `RETENTION_JOURNAL` is required: `disabled` or `s3`.
- `s3` also needs `RETENTION_JOURNAL_ID`, `RETENTION_JOURNAL_BUCKET`, `RETENTION_JOURNAL_PREFIX`, the `S3_*` settings, `RETENTION_WRITER_RELEASE` and `RETENTION_WRITER_REVISION`.
- `RETENTION_ERASURE` is `report` or `erase`, and `erase` requires `s3`.

With `s3`, the API replays the journal before it listens. A journal it cannot verify stops the process.

```sh
bun request-retention-cli.js journal-init DATABASE     # new journal; attaches DATABASE; prints the id
bun request-retention-cli.js journal-attach DATABASE   # binds a detached database at sequence 0
bun request-retention-cli.js journal-status DATABASE   # local position and remote head; never replays
bun request-retention-cli.js journal-replay DATABASE   # replays into DATABASE; never writes the remote
bun request-retention-cli.js event DATABASE TYPE KIND SUBJECT_ID EVIDENCE_REFERENCE ACTOR
bun request-retention-cli.js erase-due DATABASE        # daily cleanup; counts only
```

`journal-init` needs only the bucket and writer settings. Every other command needs `RETENTION_JOURNAL=s3` and the id. `TYPE` is `designate_client`, `correct_classification`, `place_hold` or `release_hold`. The operator API offers the same events at `POST /operator/retention/events` with actor `operator`, and reports the position at `GET /operator/retention/status`.

`erase-due` refuses unless the journal is open and in sync and coverage is ready. In `report` mode it prints the due, held and client counts and changes nothing. In `erase` mode it does the following for each due non-client subject, in deadline order:

1. Rehearse the erasure, so shared draft lineage is refused before anything is journaled.
2. Fence the subject.
3. Journal the `erase` event and blank the content.

After the run it compacts the file with `secure_delete` and `VACUUM`. A refused subject counts as an exception and makes the exit code nonzero.

### Activation order

1. Every API and cleanup environment sets `RETENTION_JOURNAL=disabled` and `RETENTION_ERASURE=report`. Then pin the journal-aware release; its `capabilities.json` lists `retention-journal/1`.
2. Run `journal-init` once against the live database and record the printed id.
3. Set `RETENTION_JOURNAL=s3` and `RETENTION_JOURNAL_ID`, then restart the API. A Ready pod means the chain verified.
4. Run the drill on a disposable copy with its own prefix: designate, hold, erase, restore an older snapshot, `journal-replay`. Delete the drill prefix afterwards.
5. Designations and holds may now be recorded. Only Dany enables `RETENTION_ERASURE=erase`.

### Incidents

- **`behind`**: the remote holds an event this database has not applied. The API route has already replayed and answers `retention_journal_replayed`, so retry the request. A CLI command replays when it opens.
- **`stale`**: the remote head is older than what this database has seen, for example after a bucket rollback. Do not serve. Find the newest head version in the bucket's version history.
- **`forked`**: a read-back differed, or the chain does not close. The database stays `forked` and refuses every policy change. Compare `journal-status` with the bucket's versions before deciding which history is authoritative; repair is a manual, reviewed step.
- **`detached`**: a restored pre-journal snapshot. Run `journal-attach`, after which the next start replays from sequence 0. A snapshot that lacks a subject named by a later designation, hold or resolution is refused as `ineligible` and must not serve.
- **`RetentionPolicyBusyError`**: another process held the policy lock for 30 s. Retry after the other command finishes.
