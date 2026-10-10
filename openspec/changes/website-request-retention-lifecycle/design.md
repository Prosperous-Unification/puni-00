## Context

The public website store keeps request content in `intake_draft`, `software_request`, `chat_turn`, `chat_operation`, `request_concept_preview` and `proposal_submission`; older `account_request` and `concept_preview` tables can still hold copies. An anonymous manual proposal has `intake_draft`, `proposal_submission` and `submission_replay` rows but no `software_request`. `prospect_account` holds a shared email; `provider_call` holds spending reservations, including unknown usage. Existing claim and replay expiry checks deny access but do not remove those rows. The private recovery command creates a checked SQLite snapshot and can restore it while the API is stopped. It has no retention record that survives restoration of an older snapshot. The [funnel operations delta](../puni-website-funnel/specs/website-operations/spec.md) approves 12 months for non-client content and 24 hours for anonymous claims, leaving the operating details open.

## Goals / Non-Goals

**Goals:** assign a fixed deadline to both retention subject types, classify contracted-client work explicitly, remove due non-client content without losing spending evidence, and ensure database or host recovery cannot reverse those decisions. Make rollout inspectable before enabling deletion.

**Non-Goals:** automatic deletion of client records, changing anonymous-claim authority, adding analytics, starting Google/OpenRouter, or making a regulatory compliance claim.

## Decisions

### Deadline and backfill

The operational default is 12 UTC calendar months from the first stored nonempty request content, without extension on later activity. Month addition preserves UTC time and clamps the day to the target month's last day. A retention subject has a typed, immutable identity: `software_request` ID for account-owned work, `proposal_submission` ID for a standalone manual proposal. A manual proposal uses its linked `intake_draft.created_at` as the first-content anchor; it needs no account or `software_request`. A new draft-backed software request uses that same draft anchor; a blank account request acquires an anchor on its first nonempty content write. Add nullable deadline/anchor and resolution state for both subject types with an additive migration and paired `down.sql`. Backfill only when a durable source proves first capture, such as a linked draft. Migration 004 copied `account_request` into `software_request` and created empty account requests using account creation time; neither copied `created_at` nor an empty row alone proves first content. Legacy descriptions, briefs, chat and previews may have been edited or mapped to a newer request, so a minimum surviving timestamp is insufficient without complete lineage. Detect overlapping draft/request lineage and refuse a duplicate or guessed subject. Report ambiguous typed identities for operator adjudication without showing content. No cleanup activation while unresolved due content exists; an operator resolution records the evidence used to choose an anchor. The approved 24-hour anonymous-claim rule remains independent for unsubmitted drafts.

### Client designation and request erasure

An operator-only action records a client designation for either retention subject type with actor, UTC time and an opaque contract reference; `closed` never implies client status. An explicit unresolved classification hold blocks that subject's purge and remains an overdue exception. Designations, corrections, hold placement and hold release are all durable journal events, replayed after restore. Automatic cleanup excludes designated clients and never deletes them under this change.

At a due non-client subject, fence all writes and any running stream before removing content. A stream that cannot return final usage becomes unknown and keeps its `provider_call` reservation. For an account-owned request, remove or blank request text in current and legacy tables, including chat-operation message/reply and linked submission email, in one SQLite transaction. For a standalone manual proposal, erase its linked draft description/brief, submission brief/email and claim-scoped replay identifiers in one transaction, without assuming an account row. Refuse unexpected shared draft lineage rather than erase another subject. Keep non-content provider cost, timestamps and audit identities needed for accounting. Retain `prospect_account.email` while another content-bearing request is not due, is client-designated, or has an unresolved classification hold; a due held subject still depends on that identity. Migration 004's blank placeholder and `ensureBlankRequest` do not qualify. Otherwise remove the email, OIDC link and sessions while retaining a pseudonymous account ID for billing. Test that the active database and its WAL no longer expose removed content after the checkpoint/compaction procedure. A repeat erasure is idempotent.

### Recovery journal and ordering

[ADR 0038](../../../docs/adr/0038-retention-journal-survives-website-database-restore.md) owns the decision to keep a separate recovery record, and [ADR 0046](../../../docs/adr/0046-retention-journal-is-a-hash-chain-in-the-versioned-backup-bucket.md) owns its shape.

**Record.** The journal lives under `retention-journal/<environment>/` in the existing versioned backup bucket. It has three kinds of object:

- `genesis.json`, written once;
- one immutable `events/<12-digit sequence>.json` per event;
- `head.json`, rewritten after every event.

Events are canonical JSON: sorted keys, no whitespace, a trailing newline. Each carries the journal id, sequence, previous hash, UTC time, typed subject, writer release, and its own SHA-256. The event types are designation, correction, classification hold, hold release, anchor resolution and erasure. They carry an opaque evidence reference and actor where applicable, and never any content. The operator API records the actor `operator`; the CLI takes an explicit one.

**SQLite.** Migration `010_retention_journal` adds:

- on the journal position: the journal id, applied hash, last head version and highest head sequence seen, and a `detached | attached | forked` state;
- an append-only mirror of applied events;
- erasure state on each subject;
- content fences: triggers that refuse any content insert, and any nonblank update, for a fenced or erased subject. Because they are triggers, they bind an older binary too.

**Append.** Every policy change runs under a cross-process policy lock, a separate SQLite file beside the database. In order:

1. Read the head and require it to equal the database's applied position. A remote that is ahead refuses with `behind` until replay; a head that is behind refuses as stale; a mismatch is a fork.
2. Adopt an orphan event that continues the head.
3. Write the event with `If-None-Match: *`, read it back, and compare the bytes and the version id.
4. Do the same for the head.
5. Only then apply the event, its mirror row and the new position in one primary transaction.

A remote failure changes nothing in the database. A read-back difference marks the database `forked`, and then no policy change runs until an operator resolves it.

**Replay.** Startup, restore and every mutating command verify the chain from the applied position to the head, then replay each later event in order. Missing, unreadable, malformed, truncated, gapped, stale, forked and foreign states are each refused. A designation, correction, hold or resolution naming a subject absent from a snapshot makes that snapshot ineligible; an erasure for an absent subject is a tombstone. A pre-journal snapshot is `detached` and serves policy changes only after an explicit attach. A crash after the head is written replays exactly once.

**Release gate.** The public build writes `capabilities.json` (`retention-journal/1`). The private release pin and `fleet-check` refuse a release without it once the fleet configuration enables the journal. The database fences hold regardless.

### Backup lifecycle and activation

The private recovery path records snapshot instant, migration ledger and journal sequence/head. Its known migration list must advance with the new public migration; both forward and rollback paths need a real schema/ledger fixture. An isolated restore drill must prove current and older snapshots, including standalone manual proposals and pre-hold states, recover with later designation, hold and erasure events before any schedule or pruning starts. Backups run hourly, so the minimum of one consistent backup per UTC day is exceeded. Aging keeps every snapshot under 48 hours and the last snapshot of each UTC day up to 30 days, and never the newest verified copy. On the versioned bucket a delete leaves a noncurrent version; the bucket's noncurrent-version expiration of 30 days removes it physically, so physical retention is at most 60 days. Age deletion waits for a newer proven-restorable copy. A failed snapshot, missing remote journal/witness or explicit incident hold produces an overdue operator exception; it never silently removes the last usable copy or claims the age target was met. New backups and journal copies remain outside the web root and release directories. Initial deployment runs deadline backfill and a count-only due report with deletion and pruning disabled; no existing live file is removed by deployment.

## Risks / Trade-offs

- An old API could add content after a new cleanup fences a request. Delay activation until old processes have drained, and guard every new content write and chat completion against erased state.
- A remote journal write can succeed while the SQLite transaction fails. Replay is mandatory before further policy mutation; an unconfirmed remote write never authorizes deletion.
- A total host loss without the authoritative latest journal and monotonic witness cannot be safely recovered from an old snapshot. Recovery refuses rather than guessing what was erased, held or designated.
- Shared account email can remain because another content-bearing not-due, client-designated or classification-held request still needs it. The due-work report must distinguish subject erasure from account-identity erasure.
- The 30-day backup age and first-content clock are defaults selected for this plan. Their operational outcomes need observation before they are described as achieved.

## Migration Plan

1. Add paired, additive schema for both subject types and deterministic backfill; deploy only count-only reporting. Refuse ambiguous records and keep cleanup/pruning disabled.
2. Establish authoritative remote journal/head durability, replay and the release compatibility gate. Prove host-loss, failed remote confirmation and pre-journal rollback refusals before any designation or hold write activates.
3. Add operator designation, correction and hold actions, then transactional erasure and content-write fences for both subject types. Prove old snapshots cannot revive erased content or remove restored holds. Activate on disposable data before any live cleanup.
4. Extend the private backup job and restore command with journal/head checks. Prove a daily snapshot and the rolling age rule in an isolated environment before scheduled live backup creation or pruning.

## Open Questions

No product decision is required for this plan. Implementation must provision a durable remote journal with a monotonic latest-head witness and prove the private release gate before activating designation, holds or erasure; without it, those operations remain disabled.
