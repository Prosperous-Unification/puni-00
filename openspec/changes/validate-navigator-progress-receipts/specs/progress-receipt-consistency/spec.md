## ADDED Requirements

### Requirement: Strict consistency report

Burokrat SHALL accept exactly three nonempty positional paths to `validate-progress-receipt`, strictly decode the existing receipt, reference and task contracts, verify their embedded digests and existing plan/task invariants, compare the complete PlanRef, and require every entry task ID and step code to exist in the task export. It SHALL emit deterministic JSON with schemaVersion 1, scope `progress-receipt-consistency`, receiptDigest, referenceDigest, tasksDigest, plan and entryCount. The report SHALL confer no certification, approval or authority.

#### Scenario: Historical supported plans

- **WHEN** real Navigator v6, v7, v8 or v9 documents and a consistent receipt are supplied
- **THEN** source and installed validators emit the scoped report without modifying any input

#### Scenario: Untrusted or inconsistent input

- **WHEN** a document has unknown fields, an invalid digest, mismatched complete PlanRef, absent task or step, parent-only task ID, or a plan/task semantic fault
- **THEN** validation fails with a diagnostic and no success stdout

#### Scenario: Invalid file boundary

- **WHEN** operands are missing, extra, empty or option-like, or a required file is missing, unreadable, malformed JSON or invalid UTF-8
- **THEN** validation fails with a named usage or file diagnostic and no success stdout

#### Scenario: Unsupported wire version

- **WHEN** a supplied reference names plan version 10
- **THEN** strict decoding refuses it

### Requirement: Shared Navigator validation

Navigator SHALL call the typed consistency checker before constructing commands and SHALL preserve valid batch bytes, command order, digest and exclusive output behavior.

#### Scenario: Existing conversion behavior

- **WHEN** a valid receipt is converted using supported task exports
- **THEN** the batch bytes and digest match the established command document and an existing output file is refused unchanged

#### Scenario: Shared semantic refusal

- **WHEN** a re-digested inconsistent plan or unknown receipt member is supplied
- **THEN** Navigator refuses before creating an output file

### Requirement: V9 receipts preserve reference binding without blockage authority

Consistency SHALL admit version-9 references paired with task schema 2 and refuse re-digested v9/schema1 pairs and version 10. Both consistency commands and receipt conversion SHALL preserve the existing six-field PlanRef binding. Direct blockage facts SHALL remain in the export and SHALL NOT create commands, eligibility calculations or blockage freshness claims.

#### Scenario: V9 native task receipt

- **WHEN** a receipt binds a strict v9 reference and native-unit schema-2 task export
- **THEN** consistency succeeds and receipt conversion emits only existing progress and measure commands

#### Scenario: Unsupported v9 schema pairing

- **WHEN** a v9 reference is re-digested around schema-1 tasks
- **THEN** both consistency commands and receipt conversion refuse before creating output
