## ADDED Requirements

### Requirement: Producer authority is selected independently

A future authenticated progress admission path SHALL derive issuer authorization from independently selected protected policy, never from the requesting candidate's supplied artifacts. Until the owner decisions in design.md are resolved and reviewed, this change SHALL remain design-only and SHALL NOT introduce a production signed wire contract or enable authenticated admission.

#### Scenario: Candidate supplies its own apparent authority

- **WHEN** a candidate supplies a receipt and matching key or policy under its own control
- **THEN** their consistency alone SHALL NOT establish an authorized producer
- **AND** the future authenticated path SHALL require independently established issuer scope before publication

#### Scenario: Required policy cannot be read

- **WHEN** the future authenticated path encounters missing or unreadable required trusted policy
- **THEN** it SHALL refuse without output or a default policy
- **AND** later production proofs SHALL distinguish missing from unreadable state

### Requirement: Attribution covers the complete bounded assertion

The future authenticated path SHALL bind all progress entries and their planning identity to the authorized producer under the selected policy. Ordinary digest validation or a supplied verifier-success claim SHALL NOT replace actual authentication. Malformed or unauthorized input SHALL be refused before command publication.

#### Scenario: Entries change after attribution

- **WHEN** an attacker changes receipt entries or their reference binding and recomputes ordinary digests without authorization
- **THEN** the future authenticated path SHALL refuse despite ordinary consistency passing

#### Scenario: Issuer is valid outside the addressed scope

- **WHEN** an assertion authenticates to an issuer not authorized for the addressed planning scope
- **THEN** the future authenticated path SHALL refuse without proposing commands

### Requirement: Attribution preserves independent acceptance claims

Producer attribution SHALL NOT establish execution truth, current accepted-plan freshness, permission to apply progress or atomic replay protection. Existing schema-1/2 recording and proposal commands SHALL retain their documented semantics unless changed by a separately approved implementation contract.

#### Scenario: Authorized operator asserts unexecuted work

- **WHEN** an authorized operator's assertion authenticates but no trusted execution evidence exists
- **THEN** attribution SHALL remain an operator assertion without an execution-success claim

#### Scenario: Authenticated assertion addresses an obsolete selected plan

- **WHEN** an authenticated assertion matches a supplied accepted reference that is no longer current
- **THEN** producer attribution SHALL NOT be reported as live freshness or authority to mutate current WBS state

#### Scenario: Assertion is repeated during concurrent planning changes

- **WHEN** the same authenticated assertion is proposed again while accepted planning state changes
- **THEN** attribution SHALL NOT be reported as one-time consumption or atomic publication
- **AND** a later mutation authority SHALL establish its own accepted-basis and replay contract
