## ADDED Requirements

### Requirement: Consistency precedes receipt conversion

Navigator SHALL require Burokrat plan/task consistency before building task or step lookups and before writing a command batch. The typed checker SHALL enforce digest binding, plan identity, task count, document/task version pairing, unique task IDs, unique step IDs and unique step codes. The Burokrat CLI SHALL retain strict unknown-input decoding.

#### Scenario: Re-digested semantic faults

- **WHEN** validly decoded, correctly re-digested documents disagree on plan identity or count, pair v6/schema2, v7/schema2 or v8/schema1, or duplicate a task ID, step ID or step code named by the receipt
- **THEN** receipt conversion exits 1 with the violated invariant, empty stdout and no output batch

#### Scenario: Digest faults

- **WHEN** the tasks digest differs from the reference, or a reference contains a malformed digest
- **THEN** receipt conversion exits 1 with empty stdout and no output batch

### Requirement: Supported batches retain their contract

Navigator SHALL preserve receipt/reference equality, receipt task and step membership, historical task values and native estimates, deterministic batch digest, owner-only exclusive output and WBS command shape.

#### Scenario: Supported versions

- **WHEN** a receipt names tasks and steps in consistent v6/schema1, v7/schema1 or v8/schema2 documents
- **THEN** conversion emits progress and present measure commands in receipt order, prints the deterministic batch digest and writes mode 0600 output conforming to the WBS endpoint contract

#### Scenario: Receipt binding remains required

- **WHEN** a receipt names another plan reference or absent task or step
- **THEN** conversion refuses before writing a batch
