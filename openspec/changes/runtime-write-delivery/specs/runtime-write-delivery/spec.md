## ADDED Requirements

### Requirement: Completion and request stage together

Dash MUST atomically retain a validated business outcome, determinate quiescence evidence,
exact canonical WBS write request, write obligation and original stage acknowledgement.
The locked transition MUST verify current ownership, independently submitted run/attempt/scope
revisions, pinned scope/ledger, accepted current authority, original claim/session and every
command target. The caller supplies the outcome and ordered command batch. Staging MUST
retain the existing determinate-completion capacity release and MUST NOT imply WBS acceptance.

#### Scenario: Late staging failure rolls back every consequence

- **WHEN** SQLite fails after staging part of the completion/request/obligation bundle
- **THEN** reopening exposes the complete preceding histories, revisions and reservation
- **AND** no partial completion, runtime intent, write event or obligation remains.

#### Scenario: Valid staging releases only the local reservation

- **WHEN** one claimed turn has validated settled evidence and a matching approved write batch
- **THEN** staging retains all exact inputs and one original acknowledgement together
- **AND** local capacity is released once while the remote claim and write remain unconfirmed.

#### Scenario: Fresh authority and target conflicts preserve state

- **WHEN** a fresh request has stale revisions, wrong authority, ledger, claim, session or command targets
- **THEN** the transition refuses without publishing or releasing its reservation.

### Requirement: Replay preserves original identities

Dash MUST distinguish bounded local submission identities from unbounded receiver command
identities. Exact stage/acceptance retries MUST return their immutable original complete
acknowledgements after current-owner and complete-history checks, before new-work revision
exclusions. Changed reuse or a different local identity borrowing an existing wire association
MUST refuse. Caller inputs and returned records MUST remain detached across asynchronous reads.

#### Scenario: Another sender wins during a held verification read

- **WHEN** an identical stage commits while the first caller awaits artifact verification
- **THEN** the first caller receives the original duplicate acknowledgement
- **AND** only the winning applied acknowledgement elects an initial send.

#### Scenario: Delayed replay does not return today's attempt

- **WHEN** an exact stage or acceptance is retried after later history or ownership changes
- **THEN** a valid current owner receives the stored original acknowledgement
- **AND** changed identity or payload refuses without consuming a new revision.

#### Scenario: Mutable caller values cannot change retained work

- **WHEN** the caller edits nested input or a returned evidence buffer during an awaited operation
- **THEN** validation, staging and acknowledgement remain bound to the captured original bytes.

#### Scenario: A permitted lexical ID match remains recoverable

- **WHEN** a write's distinct local acceptance ID equals its original receiver command ID and its reply is lost
- **THEN** bounded write recovery can retain that exact local acceptance and recover the original receipt
- **AND** unrelated local/wire lexical equality is permitted, borrowed associations refuse and legacy recovery exclusions remain unchanged.

### Requirement: Initial delivery follows durable election

The sender MUST await an applied durable stage and current ownership renewal before its one
initial conditional POST. Duplicate staging MUST verify a retained winner or look up the same
immutable command; it MUST NOT elect another POST. Cancellation, typed refusal and transport
uncertainty MUST leave the staged obligation inspectable. Unexpected post-stage failure MUST
retain original intent correlation. Network cancellation MUST NOT rewrite the business outcome.

#### Scenario: A lost sender reply does not repeat an effect

- **WHEN** the receiver commits the exact write but its reply is lost
- **THEN** ordinary retry performs immutable lookup rather than another initial POST
- **AND** receiver reopen followed by lookup recovers the original ordered effects and release once.

#### Scenario: A crash before POST remains conservatively pending

- **WHEN** staging commits and the coordinator stops before its first POST
- **THEN** restart retains the original completion, request and obligation
- **AND** an ordinary absent lookup preserves uncertainty and does not authorize changed work.

#### Scenario: Aborted delivery retains durable completion

- **WHEN** the delivery signal is aborted after staging or was already aborted on entry
- **THEN** no conditional POST occurs after cancellation is observed
- **AND** an already staged outcome remains pending with its original business kind and capacity status.

### Requirement: Verified acceptance closes one obligation

Dash MUST verify original response media type, artifact bytes, UTF-8, complete public receipt
shape, independent request digest and exact write correspondence before deriving its local
projection. One transaction MUST publish runtime acceptance, terminal write receipt, original
acknowledgement, attempt/run changes and obligation removal. A receipt match MUST NOT establish
transport authenticity or current execution permission by itself.

#### Scenario: Malformed or mismatched accepted bytes cannot close work

- **WHEN** retained response bytes are missing, unreadable, malformed or differ in claim, authority or applied sequence
- **THEN** verification throws with original cause where applicable
- **AND** no local terminal receipt, scope acceptance or obligation closure is published.

#### Scenario: Late closure failure preserves the pending bundle

- **WHEN** a late SQLite insertion fails during verified acceptance
- **THEN** reopening finds the original pending obligation and preceding revisions
- **AND** exact retry can publish the complete closure once.

#### Scenario: Another local acceptance identity cannot borrow a winner

- **WHEN** a caller supplies a different acceptance command ID for already accepted work
- **THEN** it cannot receive another command's original acknowledgement or manufacture a second closure.

### Requirement: Write recovery preserves the bounded fence protocol

Write recovery MUST use the existing journaled chronology and fence bounds: durable fence
staging before POST, retained accepted fence before original lookup, and exact contextual
evidence for every observation. At most three fence identities and the existing per-invocation
POST bound apply. A pre-fence missing lookup MUST NOT establish nonacceptance. Recovery MUST
preserve historical authority/claim versions and their capacity-held invariants.

#### Scenario: Accepted write recovery closes both histories atomically

- **WHEN** an accepted original write is found behind a verified dominating receiver fence
- **THEN** one transaction publishes write acceptance, terminal acknowledgement, obligation closure and generation barrier
- **AND** the attempt transition is counted once and no capacity is reacquired.

#### Scenario: Fenced nonacceptance remains unsendable

- **WHEN** the original command is absent after the required accepted dominating fence
- **THEN** closure retains the original outcome/request and an explicit unsendable write obligation
- **AND** replacement and ordinary redispatch remain blocked while the preceding capacity status is preserved.

#### Scenario: Bounded contention preserves unresolved work

- **WHEN** three durable fence identities cannot establish a supported resolution
- **THEN** recovery remains explicitly unresolved with complete original evidence
- **AND** no automatic rebase, new business attempt or claim release is inferred.

### Requirement: Complete history reconstructs write facts

Every public read, replay, mutation and reopen MUST reconstruct one consistent scope/attempt
history. Write stages, acceptances, obligations and recovery consequences MUST have reciprocal
links and independent provider-owned scope cuts. The fold MUST enforce global identities,
original acknowledgements, event order, generation floors and reservation consistency without
counting coupled consequences twice. New read versions MUST preserve strict historical decoders.

#### Scenario: Coherent projection cannot hide missing provenance

- **WHEN** an attempt projection remains plausible but a write event, scope link, obligation or original acknowledgement is removed or altered
- **THEN** affected reads, replays, mutations and reopen reject corrupt trusted state.

#### Scenario: Historical generic outboxes stay local facts

- **WHEN** a preserving upgrade reads a predecessor generic completion/outbox
- **THEN** its original bytes and replay semantics remain intact and inspectable
- **AND** it is not converted into an executable runtime write.

### Requirement: Storage upgrade preserves genuine format5

Incompatible ordinary access MUST refuse before changing PUNI records, physical schema,
migration identities or persistent database settings. Database-engine bookkeeping is permitted;
it MUST NOT establish compatibility, ownership or permission to publish. Compatibility and
complete trusted-state checks MUST be authoritative under the database transaction or native
lock that excludes a conflicting format transition through the protected operation.
As an additional SQLite property, a closed predecessor detected by initial private inspection
MUST retain its original bytes and sidecar set. If a supported inspection races a committed
format transition, later incompatible refusal MAY create SQLite WAL/SHM bookkeeping files,
but MUST preserve the logical-state and persistent-settings guarantees above.
An explicit additive format5-to-successor transition MUST validate full migration identities,
physical declarations and complete histories before and after atomic copy. It MUST preserve
original payload bytes, JSON private identities and migration artifacts. Semantic use of the
successor MUST refuse destructive downgrade. Actual old open, queued and BUSY writers MUST be
fenced while the existing compatible artifact/refusal-clock exceptions remain precise.

#### Scenario: A downgrade wins between inspection and authoritative admission

- **WHEN** private inspection observes supported format6 and a legitimate unused downgrade commits before source admission
- **THEN** ordinary opening refuses without changing the resulting predecessor's records, schema, migration identities or persistent settings
- **AND** WAL/SHM bookkeeping may appear without granting access or changing the predecessor's semantic state.

#### Scenario: Supported non-WAL state retains safe admission

- **WHEN** a supported SQLite store uses a supported non-WAL journal mode
- **THEN** ordinary opening retains its existing supported behavior
- **AND** any persistent journal-mode conversion follows authoritative compatibility checks with native exclusion retained across the configuration handoff
- **AND** a separate normal-connection admission revalidates complete state before exposing stores; a later incompatible transition cannot authorize another configuration change or undo an earlier conversion validly completed on supported state.

#### Scenario: Genuine populated predecessor round-trips while unused

- **WHEN** a verified c12 format5 producer supplies populated generic, terminal, authority, claim and recovery histories
- **THEN** explicit upgrade preserves all original records and acknowledgements
- **AND** unused downgrade returns a state the genuine predecessor can read and use.

#### Scenario: Used successor cannot discard write history

- **WHEN** successor semantic work exists or a migration artifact differs from its applied identity
- **THEN** downgrade refuses without partial DDL or ledger changes.

#### Scenario: Old writer crosses the migration boundary

- **WHEN** an actual already-open, queued or BUSY format5 writer reaches its locked operation after upgrade
- **THEN** incompatible semantic writes refuse before touching stale predecessor state
- **AND** captured predecessor protocols and permitted compatibility exceptions retain their behavior.

### Requirement: Storage admission is feasible on PostgreSQL

The shared refusal contract MUST concern PUNI state and persistent settings rather than
physical engine files. The design MUST document a feasible PostgreSQL transaction-scoped
guard that excludes conflicting format transitions, checks complete format and current
ownership, and retains protection through the corresponding workflow mutation. A read-only
transaction alone MUST NOT be treated as proof of zero disk writes or as a migration-admission
guard. This packet MUST distinguish that feasibility argument from an implemented adapter
or completed conformance; exact locking, isolation, schema and driver choices remain future
adapter work under the full foundation goal.

#### Scenario: The design maps admission to PostgreSQL transaction locks

- **WHEN** the shared admission contract is reviewed for PostgreSQL feasibility
- **THEN** the design describes shared operation and exclusive migration guards, bounded contention and validation of the actual state under the guard
- **AND** physical zero-write promises are excluded and actual PostgreSQL adapter conformance remains explicitly unproved.

### Requirement: Both providers prove the same behavior

The memory fixture and SQLite adapter MUST run the same stage/acceptance/recovery semantic
contracts. SQLite MUST additionally prove late rollback, close/reopen and real process-crash
cuts. New safety checks and consumed verification dependencies MUST have observed independent
production-path negatives with exact restoration and adjacent truthful Proof comments.
Source-specific review, CI and canonical acceptance MUST precede any completion or merge claim.

#### Scenario: Real crash cuts distinguish committed bundles

- **WHEN** separate owned processes stop before and after actual staging or acceptance COMMIT
- **THEN** reopening exposes respectively the complete preceding or committed bundle
- **AND** original process exits, stream handling and cleanup are recorded without a power-loss claim.

#### Scenario: Bypassed guard makes the named negative fail

- **WHEN** one new safety check or verification dependency is independently removed or broken
- **THEN** its retained production-path negative fails for the intended semantic reason
- **AND** exact restored source returns the same case to green before final verification.
