## ADDED Requirements

### Requirement: The published dependency supplies coordination

PUNI SHALL pin `configurable-tree-traversal` to 0.12.0, retain its locked dependency identities, and execute its supported native exports under the repository's pinned Bun and TypeScript. The production integration SHALL use native materialization, preparation and independent work sessions rather than reproduce removed 0.11 APIs or maintain a second graph interpreter.

#### Scenario: Real package consumer

- **WHEN** the production coordination adapter runs under the normal Dash test and typecheck targets
- **THEN** it imports the installed 0.12.0 package, obtains actual work tickets and observes accepted/duplicate completion receipts
- **AND** package and toolchain pin checks reject an unintended version change

### Requirement: Complete topology precedes admission

The integration SHALL prepare and validate the entire declared native CTT input before exposing admissible work. Ordered compatibility steps SHALL use the existing WBS step ordering and step-node identity rules and explicit work prerequisites. Disconnected components, missing prerequisites and milestone cycles SHALL be included in validation. Invalid input SHALL produce no reservation, claim or external launch. Inspection SHALL invoke no workflow callbacks.

#### Scenario: Disconnected cyclic component

- **GIVEN** an otherwise ready activity and a disconnected component containing a dependency cycle
- **WHEN** the coordinator prepares the complete input
- **THEN** validation refuses the topology before any RunStore admission

#### Scenario: Stable compatibility order

- **WHEN** step names, codes or row numbering change without changing step identities or their positions
- **THEN** step-node identities remain stable and the ordered compatibility dependencies retain their meaning
- **AND** equal positions use the existing bytewise ID ordering

### Requirement: Host acceptance controls completion

Work sessions SHALL use external completion. A ready or admitted ticket SHALL remain unfinished until current WBS facts establish accepted completion for its exact step node. Local executor return, local outcome retention, failed claim and generic local receipt content SHALL NOT seed or complete CTT work. Work and subgraph-completion dependencies SHALL retain CTT's separate meanings.

#### Scenario: Parallel join

- **GIVEN** review depends on backend and frontend work
- **WHEN** only backend has accepted completion
- **THEN** review remains blocked until frontend is also accepted

#### Scenario: Admission is not completion

- **WHEN** an activity reserves local capacity or a subsequent claim refuses
- **THEN** its dependency milestone remains unfinished and no successor is released

### Requirement: Reconstruction preserves business facts and discards local tickets

The coordinator SHALL rebuild sessions from the current complete topology and accepted WBS completion facts. It SHALL preserve durable attempt identities and operation keys, and SHALL reject retained history that cannot be matched to the supplied activity identities. Traversal queues, ticket objects and settlement generations SHALL NOT be serialized or adopted into a replacement session.

#### Scenario: Restart with running work

- **GIVEN** accepted predecessor work and an unfinished durable attempt
- **WHEN** a new coordinator reconstructs its session
- **THEN** dependency readiness matches the accepted facts while the durable attempt prevents duplicate admission
- **AND** an old ticket cannot complete work in the replacement session

### Requirement: Host state filters readiness before atomic admission

The coordinator SHALL overlay current WBS eligibility and durable execution, wait and retry state on CTT readiness before selecting new work. It SHALL connect selected work to the existing atomic RunStore admission boundary and preserve owner, revision, immutable replay, retry, identity and global-capacity semantics. Readiness SHALL convey no distributed claim or launch authority. Missing or inconsistent trusted input SHALL throw; expected conflicts SHALL remain explicit typed outcomes.

#### Scenario: Waiting or exhausted work

- **WHEN** CTT lists a node whose durable attempt is running, awaiting a person, awaiting reconciliation or blocked by the existing retry rules
- **THEN** it is excluded from new admission without consuming another reservation

#### Scenario: Concurrent capacity

- **GIVEN** two kernel-ready activities and one available local slot
- **WHEN** both race through the production coordination admission path
- **THEN** exactly one atomic admission reserves that slot and the other reports the existing conflict without an external launch

#### Scenario: Owner or revision changes

- **WHEN** a ticket's admission reaches a stale owner or stale run revision
- **THEN** the existing store refusal propagates without reservation or traversal completion

### Requirement: Ticket reports retain local identity and generation

The integration SHALL accept completion reports only for tickets issued by its current session and exact activity identity after verifying the supplied accepted WBS facts. Foreign, fabricated, retargeted and pre-rebuild tickets SHALL refuse without satisfying a dependency. Exact repeated accepted reports SHALL preserve the original acknowledgement and SHALL NOT repeat durable or remote effects. Retryable business failures SHALL remain host policy and SHALL NOT be translated into a fatal traversal failure automatically.

#### Scenario: Stale and duplicate reports

- **WHEN** the same accepted ticket is reported twice
- **THEN** the second report is an explicit duplicate with no extra effects
- **AND WHEN** a ticket belongs to a different or replaced session
- **THEN** it is refused and the target dependency remains unchanged

### Requirement: Guard evidence exercises the production integration

Every newly introduced safety boundary SHALL have an observed production-path negative with its check removed or dependency broken, followed by exact restoration and a passing run. Tests SHALL use the actual CTT package and the existing memory and SQLite stores for admission/reconstruction behavior. Required native resources SHALL close before their scratch is removed. Source-specific reviews, CI and canonical gates SHALL remain separate from focused test evidence.

#### Scenario: Independent faults

- **WHEN** preparation, accepted-completion filtering, durable-state exclusion, ticket ownership or guarded admission is independently bypassed
- **THEN** a named production-path test fails on the unsafe consequence
- **AND** restored source passes with original fault streams and source identities retained
