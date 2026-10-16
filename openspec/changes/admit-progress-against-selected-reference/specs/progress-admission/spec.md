## ADDED Requirements

### Requirement: Bound progress receipt

The system SHALL decode strict progress receipt schema 2 with required referenceDigest covered by receiptDigest, and SHALL retain strict schema 1 decoding and conversion. Dash record-progress-v2 SHALL produce schema 2 from the validated producer reference and entries.

#### Scenario: Explicit versioned producer

- **WHEN** Dash record-progress-v2 receives consistent inputs
- **THEN** it writes a schema 2 receipt whose referenceDigest equals the producer reference digest

#### Scenario: Historical conversion

- **WHEN** a valid schema 1 receipt is converted by receipt-to-commands
- **THEN** conversion retains its existing behavior

### Requirement: Admission against selected accepted reference

Navigator admit-progress SHALL require receipt, producer reference, tasks, independently supplied accepted reference and exclusive output. It SHALL strictly decode all documents, require schema 2, require the receipt reference digest to equal the producer digest and the producer digest to equal the accepted digest, and check existing plan/task/entry consistency before proposing a command batch. It SHALL grant only local admission relative to the caller-selected reference.

#### Scenario: Matching selected reference

- **WHEN** a bound receipt and consistent planning documents match the selected accepted reference
- **THEN** Navigator writes the proposed batch once

#### Scenario: Export-only change

- **WHEN** real v9 exports A and B differ only in blockedAt and have equal PlanRef and tasks but different reference digests, and a receipt bound to A is submitted with accepted B
- **THEN** admission refuses without output

#### Scenario: Redigested substitution

- **WHEN** a receipt is redigested after substituting the selected reference digest while its producer reference differs
- **THEN** admission refuses without output

#### Scenario: Legacy admission

- **WHEN** an unbound schema 1 receipt is submitted for admission
- **THEN** admission refuses without output

#### Scenario: Required accepted reference

- **WHEN** the selected accepted reference is missing, unreadable, malformed or contains unknown keys
- **THEN** admission refuses without output and distinguishes missing from unreadable

#### Scenario: Occupied output

- **WHEN** the output already exists
- **THEN** admission refuses and preserves its bytes
