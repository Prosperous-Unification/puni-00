## ADDED Requirements

### Requirement: Persistence is abstract and providers satisfy semantic contracts

Twilight Dash SHALL depend on RunStore and ArtifactStore ports independent of storage
engine, SQL, file layout and adapter schema migration mechanisms. SQLite MAY implement the
current deployment adapter; any provider satisfying the same contracts MAY replace it.
RunStore SHALL support atomic admission with identity/capacity/owner checks, immutable
binding manifests, atomic outcome-plus-outbox writes, deduplicated signals/receipts, and
consistent or revision-validated snapshots. ArtifactStore SHALL verify durable content
before a successful outcome references it. Portable record versions SHALL be distinct from
adapter schema versions. Memory SHALL NOT establish durability.

#### Scenario: Providers preserve semantics

- **WHEN** the admission, outcome/outbox, fencing, revision and restart suite runs against
  the current durable adapter and a second durable adapter
- **THEN** both satisfy the same invariants without provider-specific types in core ports

#### Scenario: A provider lacks a required atomic operation

- **WHEN** an adapter cannot atomically reserve capacity and persist admission intent
- **THEN** it is refused as nonconformant rather than weakening the coordinator's guarantee

### Requirement: Execution observations carry retry identities

Execution observations SHALL carry caller-assigned stable command identities. Replaying a
command under current ownership with the same run, attempt and fact SHALL return its original
reply without changing current state; changed content SHALL refuse. Fresh command identities
SHALL pass current revision and state checks even when their facts match an older command.

#### Scenario: Reattachment repeats an earlier locator

- **WHEN** a running attempt enters recovery and a fresh command records reattachment to its same claim and known locator with current revisions
- **THEN** the observation applies and the attempt returns to running without RunStore launching any work

#### Scenario: An earlier observation is redelivered

- **WHEN** the original execution command is redelivered after later state transitions under current ownership
- **THEN** its original reply is returned as duplicate and the current attempt state and revisions remain unchanged

#### Scenario: An execution command identity is reused with different content

- **WHEN** an existing execution command ID names a different run, attempt or fact
- **THEN** the request refuses as an identity conflict without changing state

### Requirement: Coordination uses the unified hints API

The coordinator SHALL rebuild CTT hints from versioned WBS facts and accepted outcomes.
It SHALL defer unfinished work rather than return successful no-op visitors. It SHALL use
ID-keyed summary and generation-checked settlement within the existing API, not require a
second public graph format. Complete WBS topology SHALL be discovered and validated before
admission; deferral SHALL NOT hide remaining vertices. Summary SHALL invoke no user code
and SHALL state incomplete discovery for a partial lazy graph. Host wait/running/retry
facts and WBS eligibility SHALL filter the kernel frontier before admission.

#### Scenario: Parallel join remains blocked

- **WHEN** backend and frontend are ready and backend alone reports accepted success
- **THEN** verification remains blocked until frontend also has accepted success

#### Scenario: A parent is deferred during inspection

- **WHEN** its declared child or a disconnected cyclic component is not yet inspected
- **THEN** discovery/validation continues independently and no incomplete summary authorizes work

#### Scenario: A stale settlement arrives

- **WHEN** a result belongs to an old runner or execution generation
- **THEN** settlement is refused without publishing output or satisfying a dependency

### Requirement: Admission and outcomes preserve exact authority

Admission SHALL atomically reserve capacity and record intent before external launch.
Claims, progress and release SHALL check exact current claim/run/attempt authority and
expected revisions. Validated outcomes and outbound WBS commands SHALL commit atomically
in RunStore. Successors SHALL wait for confirmed WBS acceptance. Effect success awaiting
its progress receipt SHALL be retained without rerunning the effect. Retries SHALL use a
new attempt ID/ordinal within a durable budget and keep the logical operation identity.

#### Scenario: Progress acknowledgement is lost

- **WHEN** WBS applied a success update but the coordinator died before saving the receipt
- **THEN** recovery reconciles the command receipt and never reruns the recorded successful effect

#### Scenario: A stale worker releases a claim

- **WHEN** a replacement attempt now owns the claim
- **THEN** the stale completion/release is refused and cannot affect the replacement

### Requirement: Restart reconciles surviving workers and uncertain effects

On boot the coordinator SHALL acquire or fence ownership before admitting work or changing
attempt states. It SHALL inventory running attempts, locate surviving workers/sessions and
reconcile effects by operation identity. It SHALL reattach safely or verify cancellation
and quiescence before replacement. It SHALL NOT infer interruption from coordinator death
alone. Unresolved worker/effect state SHALL require operator reconciliation and SHALL NOT
be automatically retried. Capacity SHALL remain reserved while physical work may survive.

#### Scenario: The worker survives coordinator death

- **WHEN** the coordinator restarts while its worker is still executing
- **THEN** it reattaches or quiesces that worker and admits no concurrent replacement

#### Scenario: An external effect cannot be determined

- **WHEN** launch or effect completion is ambiguous and the executor cannot inspect or deduplicate it
- **THEN** the attempt becomes unresolved, preserves its evidence and awaits an operator

#### Scenario: The owner is stale

- **WHEN** another coordinator holds a newer ownership generation
- **THEN** the old owner cannot admit work or commit/release protected state

### Requirement: Human waits and execution outcomes remain distinct

The coordinator SHALL persist human prompts, correlation keys and allowed response shapes,
consume authorized decisions through a deduplicated inbox and retain the configured claim.
Waiting SHALL NOT satisfy a dependency. Compute capacity SHALL be released only after
physical execution settles. End-of-turn SHALL NOT itself mean business success.

#### Scenario: A decision is delivered twice

- **WHEN** the same authorized response arrives before and after restart
- **THEN** it is consumed once and launches at most one logical continuation

### Requirement: Distinct human waits carry distinct correlation keys

Each distinct wait within an attempt SHALL have a fresh correlation key. Retrying a
consumed decision SHALL return its original continuation acknowledgement without changing
the current wait, state or capacity.

#### Scenario: An attempt waits again

- **WHEN** an attempt resumes from one wait and later records another wait
- **THEN** the later wait uses a fresh correlation key, redelivery of the first decision does not satisfy it, and a new command trying to reuse the first wait's key is refused

### Requirement: Safe compatibility execution precedes deployment and dogfood

S7a SHALL implement the abstract-port coordinator over a linear compatibility workflow,
including surviving-worker, uncertain-effect, stale-owner and lost-receipt tests, before
I5.02 deployment or I5.04 real dogfood. S7b SHALL reuse it for pinned type-specific instances,
parallel joins and repair. W0–W12 SHALL remain the acceptance scope for type-specific DAGs.
A linear dogfood SHALL NOT be presented as completion of that product scope.

#### Scenario: Coordinator code or its baseline recovery proof is missing

- **WHEN** deployment or real dogfood is requested
- **THEN** its S7a prerequisite is unmet and the milestone cannot be declared ready

#### Scenario: A branching workflow is repaired

- **WHEN** an operator approves a new execution epoch for one changed activity
- **THEN** affected downstream results are invalidated with provenance retained, and old outcomes cannot complete the repaired join

### Requirement: Sender authority history preserves exact local provenance

RunStore SHALL retain an immutable receiver pin and exact canonical authority intents before dispatch. One command may remain pending per scope. Acceptance SHALL retain its exact intent and artifact link; exact duplicate replies SHALL remain immutable after current-owner validation. A local epoch SHALL remain distinct from receiver authority generation.

#### Scenario: A replacement owner records a late acceptance

- **WHEN** a current owner records verified acceptance of an intent staged in an older local epoch
- **THEN** the acceptance remains inspectable history and does not establish the replacement owner's grant
- **AND** only an accepted acquisition staged in the current local epoch may establish that epoch's historical mapping

#### Scenario: A current-epoch intent has a different local owner label

- **WHEN** a retained current-epoch intent owner label differs from the owner retained in the admitted OwnershipStatus
- **THEN** inspection and mutation throw before returning history
- **AND** different local and receiver owner labels remain valid

#### Scenario: An unresolved authority command is followed by another

- **WHEN** a different authority command is staged while one remains unresolved in the scope
- **THEN** it is refused without replacing the retained intent
- **AND** timeout, receipt absence or later refusal does not clear or expire that intent

#### Scenario: A runtime history family disappears

- **WHEN** trusted runtime rows, links, consecutive revisions or required retained counts disagree
- **THEN** inspection and mutation throw before reporting absence or an uninitialized scope

### Requirement: RunStore opens complete named physical formats

SQLite RunStore SHALL preserve the original migration identities and bootstrap the complete ordered schema2 bundle atomically. Opening SHALL validate complete bundle identity, required markers and the entire physical schema, including empty tables. Opening SHALL NOT create, repair or upgrade an older format.

#### Scenario: A format1 store is opened by the schema2 adapter

- **WHEN** a genuine format1 store reaches the schema2 opener
- **THEN** compatibility inspection rejects it before mode-changing configuration
- **AND** its bytes, declarations and retained records remain unchanged

#### Scenario: An intermediate bootstrap statement fails

- **WHEN** an ordered complete forward statement fails during bootstrap
- **THEN** bootstrap stops, throws and leaves neither a published store nor staging
- **AND** physical reference construction follows the same fail-fast statement contract

#### Scenario: Runtime history reaches the new down script

- **GIVEN** the complete installed format was validated and the caller executes trimmed complete statements in order within an explicit transaction, rolling back and throwing on the first error
- **WHEN** a pin, intent, acceptance, invalid required schema2 metadata or inconsistent retained count exists
- **THEN** the new down script refuses before deleting runtime history
- **AND** only an unused consistent reverse restores the original schema and records

### Requirement: Verified sender history reads complete retained receipt artifacts

Application acceptance and history reads SHALL read actual artifact bytes, validate strict UTF-8 and the complete existing receipt schema, and match the exact retained canonical request with an independently computed digest. Async validation SHALL occur outside SQLite transactions. Raw persistence SHALL document this trusted precondition; correspondence SHALL NOT imply authenticity or current permission.

#### Scenario: A receipt is valid but belongs to another request

- **WHEN** a retained artifact has valid wire shape but differs in scope, ledger, command, digest or request-derived acceptance
- **THEN** verified acceptance and history inspection throw without recording a local acceptance

#### Scenario: A compatible receipt adds wire fields

- **WHEN** a retained receipt adds fields ignored by the existing public response schema and all known fields and correspondence validate
- **THEN** verified acceptance and history reads preserve that response compatibility
- **AND** strict local persistence records do not gain unknown fields

#### Scenario: Caller input changes during artifact verification

- **WHEN** caller-owned guard, intent or reference values change after submission and before verification returns
- **THEN** the verified operation retains and submits only its original detached snapshot
