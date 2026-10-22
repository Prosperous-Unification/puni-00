## ADDED Requirements

### Requirement: Dash claims, reports and releases through WBS as a fleet

Twilight Dash SHALL read startable work and write claims, progress, measures, releases and
external refs through the WBS HTTP API under one fleet credential pinned to one agent person,
using the shared contracts shapes. Each execution write SHALL be one conditional runtime
plan command batch. Every refusal code the WBS specs name SHALL be a typed outcome; an
unlisted code SHALL throw. A claim SHALL carry the attempt's agent run. `token_actual`
SHALL be written only when usage is measured. Ordinary WBS APIs SHALL retain their current behavior.

#### Scenario: A startable step is claimed with the run id

- **WHEN** the bridge claims step `impl` of leaf `080.25` for an attempt whose adapter session is `sess-42`
- **THEN** WBS holds one claim on that step with the fleet's agent person and run id `sess-42`
- **AND** the step's progress reads `in_progress`

#### Scenario: A conditional claim loses its observed revision

- **WHEN** another holder changes the observed local revision basis before the conditional claim commits
- **THEN** the bridge returns typed `runtime_revision_conflict` and the conditional batch writes nothing
- **AND** it does not reinterpret that conflict as executor completion or rerun an effect

#### Scenario: An ordinary claim loses a holder race

- **WHEN** an ordinary claim encounters another current holder of its requested step
- **THEN** the existing `already_claimed` refusal still names the holder and writes nothing else

#### Scenario: An unbound credential refuses before work starts

- **WHEN** the coordinator's credential is not linked to an account that may act as the agent person
- **THEN** the first execution write returns `person_not_bound` and no attempt leaves `queued`

#### Scenario: Unknown usage does not write a measure

- **WHEN** an attempt succeeds with usage `unknown`
- **THEN** progress is stated `done`, no `token_actual` command is written, and the attempt record names the reason
- **AND** a previously absent measure stays absent while any previously measured value is not silently erased

### Requirement: Runtime writes use receiver-owned exact execution authority

WBS SHALL mint monotonic owner generations within its current organization/project/person
scope. A runtime write SHALL check the receiver owner/generation, exact current claim ID,
target, person, parent claim, session and retained runtime attempt binding in its mutation
transaction. A local RunStore epoch SHALL NOT substitute for receiver authority. WBS business
attempt ordinals SHALL NOT substitute for runtime attempt identity. Continuation or reattachment
SHALL retain the same runtime attempt, session and claim. A genuinely new execution attempt
SHALL retain the logical operation but obtain a new exact claim after predecessor quiescence
and effect reconciliation and guarded exact release. It SHALL NOT rebind the old claim.
Release/reclaim SHALL recheck normal eligibility and the current basis without promising
continuous reservation. Takeover SHALL NOT automatically release claims. Ordinary APIs SHALL remain
available under their existing rules; this fence SHALL apply to the conditional runtime channel.

#### Scenario: Same-person stale release cannot release a replacement

- **WHEN** claim A was replaced by claim B for the same person and a request names A with a fresh basis and current receiver grant
- **THEN** the receiver returns `runtime_claim_mismatch` and leaves B and its progress unchanged

#### Scenario: Takeover fences a surviving owner without releasing work

- **WHEN** a valid compare-and-swap advances receiver generation g to g+1
- **THEN** existing claims and execution bindings are retained
- **AND** a new mutation carrying g is refused even if its claim and basis remain current
- **AND** takeover is not evidence that a worker stopped or an effect did not occur

#### Scenario: Runtime attempt cannot silently adopt an ordinary claim

- **WHEN** a runtime claim request encounters an ordinary holding without a runtime binding
- **THEN** it returns `runtime_claim_unmanaged` rather than adopting an alreadyHeld response
- **AND** a runtime attempt already bound to a claim cannot allocate a second claim under another command ID

#### Scenario: Continuation retains exact execution identity

- **WHEN** a surviving execution is reattached or continued
- **THEN** its runtime attempt, session and exact claim remain the same
- **AND** coordinator takeover does not turn that continuation into a new execution attempt

#### Scenario: A new attempt requires a new exact claim

- **WHEN** attempt B tries to reuse attempt A’s still-held runtime-bound claim, even with the same person and session
- **THEN** the receiver returns `runtime_claim_mismatch` without altering A’s claim or immutable binding
- **AND** after predecessor quiescence/effect reconciliation and guarded exact release, B must acquire a newly minted claim while retaining the logical operation

#### Scenario: Release and retry do not reserve the gap

- **WHEN** another holder acquires the step between the predecessor’s exact release and the new attempt’s claim
- **THEN** the retry rechecks the current basis and ordinary eligibility and can be refused
- **AND** it does not reclaim the competing holder’s claim or promise uninterrupted reservation

#### Scenario: Old-attempt release cannot affect the new-attempt claim

- **WHEN** A has been exactly released and new attempt B holds a new exact claim, then a fresh command names A’s old claim with a current grant and fresh basis
- **THEN** the receiver returns `runtime_claim_mismatch` and preserves B’s claim and both historical execution bindings

#### Scenario: A legacy access context lacks runtime scope

- **WHEN** existing access resolution yields legacy access without an organization scope
- **THEN** the conditional runtime channel returns `runtime_scope_unavailable`
- **AND** ordinary APIs retain their existing legacy behavior

### Requirement: Runtime preconditions represent a coherent local revision basis

The receiver SHALL read a complete local project observation under admitted coordination and
return an `rb1:` SHA-256 token over its versioned canonical ledger/project identity, project
revision and sorted complete work-item ID/revision set. A new conditional mutation SHALL
compare the token recomputed inside its transaction. The token SHALL NOT claim cross-project,
directory-policy or authorization snapshot consistency. Current business admission SHALL still run.

#### Scenario: Membership or a covered revision changes

- **WHEN** a local work item is added, deleted or revision-changed, or the project revision changes after observation
- **THEN** a new write using the old basis returns `runtime_revision_conflict` without mutation

#### Scenario: Observation races an open transaction

- **WHEN** a runtime observation is requested while a project mutation is partially applied
- **THEN** it returns facts and a basis from one admitted complete state, never a mixture

#### Scenario: Reference replacement uses the observed basis

- **WHEN** another writer changes external references before a runtime whole-list replacement commits
- **THEN** the stale replacement is refused and preserves the newer references

#### Scenario: Receipt basis follows committed mutations

- **WHEN** a runtime claim or write is accepted
- **THEN** its retained `basisAfter` describes the actual post-mutation local revision state
- **AND** replay returns that historical token without claiming it is current

### Requirement: Accepted runtime commands have permanent payload-bound receipts

Within a receiver scope, authority acquisition and runtime commands SHALL share a caller
command-ID namespace. The receiver SHALL commit the canonical request bytes, digest and
immutable successful reply atomically with mutations, exact bindings, revision changes,
ledger counts, journal and committed fanout capture. An accepted identical request SHALL return
its original reply without repeating a write. A different request under the accepted ID SHALL
return `runtime_command_conflict`. Refused attempts SHALL write no acceptance receipt.

#### Scenario: An exact retry follows release or later state

- **WHEN** an accepted request is retried identically after takeover, release or later progress
- **THEN** its original acceptance is returned without changing current authority, revisions, journal or mutation fanout

#### Scenario: A duplicate is no longer authorized

- **WHEN** the current request lacks project/person/credential permission for an accepted command's scope
- **THEN** the receiver refuses before revealing or replaying that acceptance

#### Scenario: A fresh runtime claim reaches the organization cap

- **WHEN** an otherwise eligible new conditional runtime claim would exceed the organization's current bound-claim cap
- **THEN** the ordinary transaction-bound gauge refuses it with `claim_limit`, `cap`, `current` and the command context
- **AND** no claim, binding, acceptance receipt, mutation journal or ledger count is added

#### Scenario: A runtime claim is below the organization cap

- **WHEN** current authorization and basis permit a new exact runtime claim below the cap
- **THEN** the same ordinary claim transaction commits exactly one claim, immutable binding and matching receipt

#### Scenario: An exact accepted claim is replayed after a cap reduction

- **WHEN** an accepted exact claim is retried under current authorization after the cap is lowered below existing usage
- **THEN** the original complete receipt returns without fresh acquisition or any additional claim, binding, journal or ledger mutation

#### Scenario: A receipt insert fails after mutation

- **WHEN** persistence of the acceptance receipt fails after batch changes were attempted
- **THEN** all mutation, binding, revision, journal, fanout capture and ledger-count writes roll back
- **AND** the failure throws instead of becoming a successful or retryable domain outcome

#### Scenario: A refused command is retried

- **WHEN** a previously refused request is sent again and no acceptance exists for its command ID
- **THEN** current admission conditions are evaluated again
- **AND** refusal history is not synthesized as an immutable acceptance

### Requirement: Runtime receipt reconciliation preserves transport ambiguity

The receiver SHALL expose authorized receipt lookup independent of current holding state.
The bridge SHALL preserve dispatched intent when a reply is lost, cancelled, malformed or
otherwise unvalidated. Receipt absence SHALL NOT establish nonacceptance while an old request
can still commit. Recovery SHALL fence the old receiver generation and use the same pinned,
validated ledger before classifying absence. Remote acceptance SHALL NOT prove executor quiescence.

#### Scenario: Commit succeeds but its reply is lost

- **WHEN** a real runtime batch commits and the caller loses the response
- **THEN** restart can retrieve or exactly replay the stored acceptance without repeating the batch or activity effect

#### Scenario: An absent receipt precedes fencing

- **WHEN** lookup reports no accepted receipt while an old-generation request may still arrive
- **THEN** recovery retains uncertainty
- **AND** after takeover commits that delayed old-generation mutation cannot be newly accepted

#### Scenario: Conditional runtime capability is missing

- **WHEN** the backend does not expose the required conditional routes or returns an unvalidated response
- **THEN** the bridge fails closed with unresolved dispatch where applicable
- **AND** it does not fall back to ordinary unguarded commands

### Requirement: Receiver ledger continuity survives supported lifecycle changes

The receiver SHALL retain one versioned ledger ID and authority/binding/receipt row counts.
Runtime mutations and receipt lookup SHALL require the expected ledger ID; the bridge SHALL
pin it durably before first dispatch and retain it for existing intents. Missing, unreadable,
malformed or inconsistent trusted ledger state SHALL throw, never initialize an empty scope
or return receipt absence. Only explicit installation migrations SHALL create the ledger.

#### Scenario: A new scope belongs to a valid existing ledger

- **WHEN** a validated ledger has no authority for the requested project/person scope
- **THEN** it may report `uninitialized` after integrity validation
- **AND** this does not permit creation or repair of a missing ledger

#### Scenario: History prevents rollback

- **WHEN** rollback reaches the runtime migration after any authority, binding or accepted receipt has been retained
- **THEN** its down script refuses before schema deletion and preserves that migration's schema and applied identity
- **AND** releasing claims does not make the history disposable

#### Scenario: Unused rollback and re-upgrade change identity

- **WHEN** a valid ledger with zero history is rolled back and explicitly installed again
- **THEN** the new ledger has a different ID
- **AND** requests carrying the former ID return `runtime_ledger_mismatch` before replay, acquisition or receipt absence

#### Scenario: A trusted table disappears or is recreated empty

- **WHEN** a required table or marker is missing, or a recreated-empty record table conflicts with retained counts
- **THEN** runtime boot/read refuses trusted state rather than treating it as new scope or nonacceptance

#### Scenario: A valid concurrent commit overlaps startup inspection

- **WHEN** another server attempts a valid atomic runtime history/count commit during startup ledger inspection
- **THEN** readiness validates one coherent admitted snapshot before listening or starting background work
- **AND** it does not classify mixed reads from separate committed states as ledger corruption

#### Scenario: A fully new valid ledger replaces the prior installation

- **WHEN** a caller with an existing pinned identity reaches a different valid receiver ledger
- **THEN** the receiver returns `runtime_ledger_mismatch` before replay or absence
- **AND** the bridge does not replace its stored pin automatically

#### Scenario: Lifecycle guarantee has a bounded threat model

- **WHEN** the system describes its continuity guarantee
- **THEN** it covers supported migration/recreation and missing or inconsistent trusted tables
- **AND** it does not claim detection of coherent older whole-database restoration preserving identity and counters, or hostile DBA forgery

### Requirement: Runtime payload identity is available through shared contracts

WBS contracts SHALL expose the receiver's existing canonical runtime request encoder, decoder and strict request parsers. The receiver SHALL consume that same implementation. Version 1 bytes and validation SHALL remain compatible, including ordered content, explicit null and input detachment before queued admission. Payload identity SHALL NOT establish permission or authenticated acceptance.

#### Scenario: A contracts caller retains a runtime request

- **WHEN** the caller canonicalizes a valid authority, claim or ordered write operation with its complete scope
- **THEN** it obtains the existing fixed version 1 UTF-8 JSON bytes and can strictly decode them
- **AND** a real receiver acceptance identifies those same bytes by its request digest

#### Scenario: Stored bytes are not canonical

- **WHEN** trusted request bytes contain undeclared fields, a malformed operation or a different byte representation
- **THEN** the shared decoder throws rather than treating those bytes as an accepted equivalent request

#### Scenario: Caller mutation overlaps queued admission

- **WHEN** a caller changes the original request after submission while a real transaction delays admission
- **THEN** the receiver preserves the originally detached operation and canonical identity

### Requirement: Runtime and ordinary batches retain the shared command bound

The published command limit SHALL remain 200. Canonical runtime requests, HTTP command and applied arrays, and the existing ordinary application service SHALL consume that same bound without changing their current rejection ordering.

#### Scenario: A batch reaches the bound

- **WHEN** a valid runtime command or applied array contains 200 entries
- **THEN** its boundary accepts the array
- **AND** 201 entries are refused; an empty runtime command list remains invalid

#### Scenario: The ordinary application receives 201 commands

- **WHEN** a semantically valid ordinary batch contains 201 commands
- **THEN** its existing too_many_commands refusal identifies index 200 before any command applies

### Requirement: Retained runtime requests and receipts have shared correspondence checks

For already boundary-validated runtime values, contracts SHALL compare a receipt with the complete retained request scope, ledger, command, expected digest and request-derived acceptance. The receiver SHALL consume the same identity and acceptance predicates. Existing decoding, storage, permission and digest checks SHALL remain. A matching receipt SHALL NOT alone establish authenticity, current authority or effect success.

#### Scenario: A complete receipt matches its retained request

- **WHEN** authority, claim or ordered-write acceptance identifies the same scoped request and independently computed digest
- **THEN** the shared predicate returns true using the existing receiver acceptance rules
- **AND** receiver-generated claim IDs and distinct actor-account/person identities do not invent request preconditions

#### Scenario: An otherwise valid receipt identifies something else

- **WHEN** any scope identity, ledger, command, digest, request-known claim/execution field, authority or applied sequence disagrees
- **THEN** the shared predicate returns false
- **AND** the receiver still refuses corrupted retained acceptance before returning a success

#### Scenario: Historical matching acceptance is inspected

- **WHEN** all retained fields match an earlier accepted request
- **THEN** correspondence does not refresh a current grant or authorize another effect
- **AND** authenticated transport and existing current permission checks remain separate requirements
