## ADDED Requirements

### Requirement: Bound progress receipt

The system SHALL decode strict progress receipt schema 2 with required referenceDigest covered by receiptDigest, and SHALL retain strict schema 1 decoding and conversion. Dash record-progress-v2 SHALL produce schema 2 from the validated producer reference and entries. Every receipt consistency consumer SHALL require a schema 2 receipt referenceDigest to equal its supplied producer reference digest, while retaining schema 1 consistency semantics.

#### Scenario: Explicit versioned producer

- **WHEN** Dash record-progress-v2 receives consistent inputs
- **THEN** it writes a schema 2 receipt whose referenceDigest equals the producer reference digest

#### Scenario: Historical conversion

- **WHEN** a valid schema 1 receipt is converted by receipt-to-commands
- **THEN** conversion retains its existing behavior

#### Scenario: Shared consistency rejects export substitution

- **WHEN** a schema 2 receipt bound to real v9 export A is checked or converted alongside export B that differs only in blockedAt, with equal PlanRef and task digest
- **THEN** both validate-progress-receipt and receipt-to-commands refuse without a consistency report or batch output

#### Scenario: Shared consistency retains historical semantics

- **WHEN** schema 1 progress has equal PlanRef and consistent tasks despite differing export digests
- **THEN** consistency validation and conversion retain their historical behavior

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
