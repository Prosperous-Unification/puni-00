## ADDED Requirements

### Requirement: Editable brief and immediate proposal request

A visitor SHALL be able to review and edit a request brief separately from any conversation, then explicitly submit a proposal request with one contact email after a description exists, without a PUNI account. The manual draft SHALL be browser-claim scoped until submission; signed-in requests SHALL be account-owned. Chat turns and a concept preview SHALL not be prerequisites. Submission SHALL be durable and idempotent, consume the anonymous write claim, and return a minimal opaque receipt.

#### Scenario: Manual path without AI

- **WHEN** inference and prospect sign-in are unavailable and a visitor with a valid browser claim edits the brief and selects Request a proposal
- **THEN** one submission is stored, an opaque receipt confirms it, the write claim is consumed, and no provider call occurs

#### Scenario: Repeated submit

- **WHEN** the same submission idempotency key is retried after a lost response
- **THEN** the API checks a bounded replay proof of the consumed claim hash, key and body hash, returns the original opaque receipt, and the operator inbox has exactly one entry

#### Scenario: Changed body after consumed claim

- **WHEN** the consumed claim and key are replayed with a different body hash
- **THEN** the API answers 409 and grants no edit or read authority

#### Scenario: Other account reads or edits

- **WHEN** an authenticated account requests another prospect's brief or submission
- **THEN** the API refuses access and leaves that request unchanged

#### Scenario: Receipt or email disclosure attempt

- **WHEN** a public caller presents only a contact email or opaque receipt after anonymous submission
- **THEN** no brief, contact detail or operator status is disclosed

### Requirement: Private human follow-up

Only an authorized operator SHALL list submitted proposal requests and update contact status through submitted, reviewing, contacted and closed. The public app SHALL not imply that an email was sent or a human has replied until the recorded state proves it.

#### Scenario: Operator and non-operator access

- **WHEN** an operator opens the inbox and a prospect attempts the same route
- **THEN** the operator sees owner and contact details while the prospect receives a refusal

#### Scenario: Status transition

- **WHEN** an operator records a permitted status change
- **THEN** the change survives reload with who and when recorded
