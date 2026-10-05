# Request retention deadlines

Each retention subject (an account-owned software request, or a standalone manual proposal submission with no software request) gets a fixed deadline 12 UTC calendar months after its first stored nonempty content. The rules and state live on `backfillRetentionSubjects`, `anchorRequestContent` and `addUtcMonths` in `libs/website/adapters/store-sqlite/src/request-retention.ts`. The [retention change](../../openspec/changes/website-request-retention-lifecycle/design.md) owns the full lifecycle.

This release **only reports**. No command deletes or blanks content, and there is no schedule or HTTP endpoint. Designation, holds, erasure and the recovery journal are later slices.

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
- `resolve` anchors one ambiguous subject. `EVIDENCE_REFERENCE` is an opaque pointer to where the evidence is recorded (for example `ops-ticket:42`), never free text or an email. The anchor cannot be later than now or any surviving content timestamp. A resolved anchor never moves.

## Ambiguity reasons

- `unanchored_content`: content exists without a linked draft or recorded first write. Examples are migration 004's copied `account_request` rows, placeholder chat, or a blank request that an older API process filled during a blue/green swap.
- `content_predates_anchor`: chat, operation or preview rows are older than the linked draft.

Anonymous conversation turns and operation text count as content of the subject whose `draft_id` owns the conversation (`conversationContentTimes` in `request-retention.ts`); `eraseConversationContent` blanks that text and keeps the accounting columns for the later erasure slice.

- `overlapping_lineage`: the linked draft also belongs to another account's legacy row, or a submission shares the draft without being that request's own submission.

Migration 004 placeholders stay `pending_content` until their first nonempty write. Their copied `created_at` is never used as an anchor.
