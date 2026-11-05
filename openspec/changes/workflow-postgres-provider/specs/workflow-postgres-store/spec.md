## ADDED Requirements

### Requirement: PostgreSQL preserves the complete semantic store boundary

The PostgreSQL adapter SHALL implement every current RunStore and ArtifactStore operation plus awaited provider disposal without exposing vendor types or weakening guard/replay precedence, exact retained identities, local ownership, reservations, immutable acknowledgements or complete history correspondence.

#### Scenario: Same current conformance on a real second provider

- **WHEN** the current shared suites execute against a real PostgreSQL fixture
- **THEN** all 26 RunStore and two ArtifactStore operations preserve the same expected replies and complete snapshots as the existing providers
- **AND** provider-specific transaction, interprocess, integrity and lifecycle checks remain additional requirements

#### Scenario: Distinct long keys collide in a private digest bucket

- **WHEN** distinct admitted long or Unicode identities have the same private bucket
- **THEN** exact retained bytes distinguish both identities
- **AND** an identical retry preserves its original reply while conflicting content follows the existing refusal or integrity outcome

### Requirement: Serialized mutations publish durable atomic state

The adapter SHALL serialize short mutations per physical store, read current authority after lock acquisition, preserve existing adapter guards and planner ordering, and return success only after an acknowledged commit under verified durable settings. It MUST reject missing/corrupt metadata, inaccessible settings, asynchronous commit, unsafe WAL settings, unlogged provider relations and disabled required constraints.

#### Scenario: Independent writers compete for the last reservation

- **WHEN** two independent processes request the final capacity slot
- **THEN** the adapter commits one admitted attempt and reservation
- **AND** the other observes the committed capacity without publishing partial history or revisions

#### Scenario: Actual transaction failure between coupled writes

- **WHEN** an injected database failure occurs after the first affected row but before the final coupled row
- **THEN** independent reopen observes the complete prior state
- **AND** no outcome, acknowledgement, history count or capacity change is partially published

#### Scenario: Effective durability settings are weakened

- **WHEN** a required effective server/session setting or logged relation is weakened or unreadable
- **THEN** provider admission or the affected operation throws before claiming a durable write

### Requirement: Read snapshots and uncertain outcomes remain truthful

The adapter SHALL return detached, coherent multi-query snapshots. A lost COMMIT acknowledgement MUST NOT authorize automatic semantic replay, capacity release or a claim that the transaction was absent. Reconciliation SHALL claim only what the operation's retained evidence proves; nonjournaled ownership and clock-only calls can remain operationally unresolved.

#### Scenario: Concurrent commit during a multi-query read

- **WHEN** an independent writer commits between the reader's component queries
- **THEN** the returned run, attempts, histories, revisions and capacity belong to one coherent snapshot

#### Scenario: Same transport failure before and after commit

- **WHEN** connection loss yields the same driver failure for an uncommitted write and a committed write with a lost reply
- **THEN** the adapter fences the uncertain bundle and throws
- **AND** it neither guesses the outcome nor creates a replacement command

### Requirement: Provider disposal is bounded and observed

Close SHALL immediately fence both ports, reject queued operations, drain admitted work and preserve one sticky disposal outcome. It MUST NOT infer server quiescence or a known COMMIT outcome solely from client-close fulfillment or a fixed delay. The concrete same-server/backend observation protocol and finite budgets MUST be specified and proved before enabling the adapter.

#### Scenario: Client close fulfills while its transaction backend remains active

- **WHEN** client close fulfills before an owned in-flight transaction is verified quiescent
- **THEN** disposal does not report successful completion from that client signal
- **AND** an observation failure or exhausted bound rejects close with retained causes

### Requirement: Portability requires a complete paused-writer transfer

A versioned adapter-layer transfer SHALL preserve complete artifacts, manifests, ownership/clock/capacity, runs/attempts, original acknowledgements, inbox/outbox, runtime authority, claim/turn, recovery and coupled-write histories. It MUST pause every writer, capture an immutable source and import into an empty target atomically before reopen/comparison. Configuration selection alone SHALL NOT count as portability.

#### Scenario: Independent target resumes a transferred retained attempt

- **WHEN** a validated capture is imported into an empty other-provider target with all source writers paused
- **THEN** independent reopen yields matching public snapshots and original replay acknowledgements
- **AND** safe continuation preserves the recorded ownership, reservations and recovery barriers
