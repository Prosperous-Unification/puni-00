## ADDED Requirements

### Requirement: Fixed non-client retention deadline

The system SHALL assign each retention subject, whether an account-owned software request or a standalone manual proposal submission with no `software_request`, one non-sliding retention deadline exactly 12 UTC calendar months after its first stored nonempty request content. Adding months SHALL clamp an unavailable day to the destination month's final day. Later brief, chat, preview and contact content on that subject SHALL share the existing deadline. An empty account request SHALL acquire its deadline when it first stores content. A submitted manual proposal SHALL use its linked intake draft's first-content timestamp. A historic subject whose first-content timestamp or draft lineage cannot be established from durable evidence SHALL remain visibly unresolved and SHALL NOT be automatically erased from a guessed timestamp.

#### Scenario: Month-end and later content

- **WHEN** a request first stores content at 2024-02-29 15:00 UTC and receives another chat turn later
- **THEN** its deadline remains 2025-02-28 15:00 UTC and it is due when the clock reaches that instant

#### Scenario: Ambiguous historic request

- **WHEN** a migrated request contains content but its first-content timestamp cannot be derived from a known source row
- **THEN** automatic cleanup refuses that request, reports its identity without content, and requires an auditable operator resolution before activation can claim coverage

#### Scenario: Manual proposal without an account

- **WHEN** an anonymous visitor submits a manual proposal from a draft and never creates an account or `software_request`
- **THEN** the proposal has its own typed retention identity and deadline anchored to the draft's first content, and due-work reporting includes it

### Requirement: Explicit client designation

Only an authenticated operator SHALL designate either retention subject type as belonging to a contracted client, recording the operator, UTC time and non-content evidence reference in an append-only audit. Proposal contact status, including `closed`, SHALL never create that designation. A designated client subject SHALL be excluded from automatic non-client content cleanup; its later deletion requires a separate client-record policy. Classification holds, hold releases, designation corrections and operator anchor resolutions SHALL use the same durable recovery record as designations and erasures. A designation made through the operator API SHALL record the actor `operator`, because the operator session carries no individual identity.

#### Scenario: Closed proposal remains non-client

- **WHEN** an operator advances a proposal to `closed` without recording client designation
- **THEN** its request retains the non-client deadline and remains eligible for cleanup when due

#### Scenario: Designated client survives deadline

- **WHEN** an operator records a client designation with a valid evidence reference before a request's deadline
- **THEN** the transition is auditable and non-client cleanup preserves that request's content after the deadline

#### Scenario: Uncertain classification

- **WHEN** a due request has an explicit unresolved client-classification hold
- **THEN** cleanup does not guess, reports an overdue exception to the operator, and does not claim the retention policy has been satisfied

#### Scenario: Restored classification hold

- **WHEN** a backup taken before an operator placed a classification hold is restored
- **THEN** the hold is replayed before cleanup can run, and the due subject remains protected

#### Scenario: Restored anchor resolution

- **WHEN** a backup taken before an operator resolved an ambiguous anchor is restored
- **THEN** the journaled resolution is replayed before serving, so activation coverage does not regress to ambiguous

#### Scenario: Manual proposal designated as client

- **WHEN** an operator designates a standalone manual proposal as contracted-client work
- **THEN** its draft, submission and contact content remain outside automatic non-client erasure even without an account row

### Requirement: Non-client content erasure and accounting preservation

After activation, cleanup SHALL atomically erase due, non-client subject content from current and legacy website records, including description, brief, chat, chat-operation text, concept preview and proposal contact email. For a standalone manual proposal it SHALL erase its linked draft and submission content and claim-scoped replay identifiers without requiring an account. It SHALL erase a prospect account's email and sign-in link unless another content-bearing request that is not due, is client-designated or has an unresolved classification hold still needs that identity; an empty placeholder request SHALL NOT retain it. Cleanup SHALL fence new content writes, cancel an in-flight provider stream, retain an unknown spending reservation when final usage is unavailable, and preserve non-content billing and audit records. Repeating cleanup SHALL not restore content or duplicate erasure records.

#### Scenario: Shared prospect email

- **WHEN** one account owns a due non-client request and a newer retained request
- **THEN** only the due request's content and submission email are erased while the account email and newer request remain usable

#### Scenario: Empty request does not retain an email

- **WHEN** a due account-owned request is the account's only content-bearing request and an empty `ensureBlankRequest` or migration-created placeholder also exists
- **THEN** cleanup erases the due content and account email/sign-in link while retaining non-content accounting identity

#### Scenario: Held due request retains shared identity

- **WHEN** two content-bearing requests share an account, both are due, and one has an unresolved classification hold
- **THEN** cleanup may erase the unheld request but retains the account email and sign-in link needed by the held request

#### Scenario: Standalone manual proposal is due

- **WHEN** a due non-client manual proposal has a linked draft, submission and claim-scoped replay row but no account or software request
- **THEN** all draft/submission text, contact email and linked replay identifiers are erased and a typed erasure record prevents their revival after restore

#### Scenario: Unknown provider usage at deadline

- **WHEN** a due request has an in-flight or unknown paid operation without final usage
- **THEN** no completion can add another turn, content is erased, and its unsettled spending reservation remains held for reconciliation

#### Scenario: Legacy duplicate content

- **WHEN** a due request has copies in legacy request or concept tables and current request, turn and submission tables
- **THEN** no request description, chat text, concept body or contact email remains in those active database rows

### Requirement: Durable recovery of retention decisions

The system SHALL confirm each designation, correction, hold change and erasure event in a remote durable record with a monotonic latest-head witness before destructive database commit or success acknowledgment. A local fsync or queued off-host copy alone SHALL NOT authorize either action. Every policy mutation SHALL serialize across API processes and require the primary database's applied position to match the authoritative record head. Startup and restore SHALL apply every later valid event to the selected database before the API accepts traffic. Missing, unreadable, malformed, gapped or stale remote recovery state SHALL refuse service rather than treat the record as empty. A crash between remote durability and primary-database commit SHALL converge by idempotent replay. A restored snapshot missing a subject named by a later designation or hold SHALL refuse service.

#### Scenario: Old backup after erasure and designation

- **WHEN** an older valid database snapshot is restored after one request was erased and another was designated a client
- **THEN** startup reapplies both decisions before serving, so erased content stays inaccessible and the client request is preserved

#### Scenario: Missing or damaged recovery record

- **WHEN** the independent retention record is absent, truncated or has a sequence gap
- **THEN** restore and API startup refuse to serve the database with a named recovery error

#### Scenario: Off-host copy fails after local fsync

- **WHEN** a local event has been fsynced but the remote event or monotonic latest-head confirmation fails before erasure
- **THEN** no destructive database commit or success acknowledgment occurs, and host-loss recovery refuses stale state rather than reviving erased content

#### Scenario: Crash after durable append

- **WHEN** the process stops after recording a decision durably but before committing its database change
- **THEN** restart replays that decision once and reaches the same protected or erased state

#### Scenario: Another process sees an uncommitted decision

- **WHEN** a journal append survives but its database commit fails and another API process attempts cleanup
- **THEN** the second process refuses cleanup until the journal position is replayed, so it cannot erase a newly designated client request

### Requirement: Journal-aware release compatibility

After any retention journal event has been activated, deployment and recovery SHALL refuse to promote or roll back to an API binary that cannot replay the authoritative journal and enforce erasure and hold fences. This refusal SHALL rely on the external activation/head witness, not solely on the database being restored.

#### Scenario: Rollback after erasure

- **WHEN** the release path selects a pre-journal-aware binary after an erasure event exists
- **THEN** promotion refuses that binary before it serves a restored or current database

### Requirement: Safe activation

The rollout SHALL first expose a read-only due-work report without deleting current live content. Automatic erasure SHALL remain disabled until backfill coverage, crash replay and restored-snapshot proofs pass against disposable data. Activation and later cleanup runs SHALL report unresolved records and failures without logging request content or credentials.

#### Scenario: Planning-only release

- **WHEN** the new schema and due-work report are deployed with cleanup disabled
- **THEN** current live request content remains unchanged and the report identifies due and unresolved counts without raw text
