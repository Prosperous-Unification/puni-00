## ADDED Requirements

### Requirement: Strict consistency report

Burokrat SHALL accept exactly three nonempty positional paths to `validate-progress-receipt`, strictly decode the existing receipt, reference and task contracts, verify their embedded digests and existing plan/task invariants, compare the complete PlanRef, and require every entry task ID and step code to exist in the task export. It SHALL emit deterministic JSON with schemaVersion 1, scope `progress-receipt-consistency`, receiptDigest, referenceDigest, tasksDigest, plan and entryCount. The report SHALL confer no certification, approval or authority.

#### Scenario: Historical supported plans

- **WHEN** real Navigator v6, v7 or v8 documents and a consistent receipt are supplied
- **THEN** source and installed validators emit the scoped report without modifying any input

#### Scenario: Untrusted or inconsistent input

- **WHEN** a document has unknown fields, an invalid digest, mismatched complete PlanRef, absent task or step, parent-only task ID, or a plan/task semantic fault
- **THEN** validation fails with a diagnostic and no success stdout

#### Scenario: Invalid file boundary

- **WHEN** operands are missing, extra, empty or option-like, or a required file is missing, unreadable, malformed JSON or invalid UTF-8
- **THEN** validation fails with a named usage or file diagnostic and no success stdout

#### Scenario: Unsupported wire version

- **WHEN** a supplied reference names plan version 9
- **THEN** strict decoding refuses it

### Requirement: Shared Navigator validation

Navigator SHALL call the typed consistency checker before constructing commands and SHALL preserve valid batch bytes, command order, digest and exclusive output behavior.

#### Scenario: Existing conversion behavior

- **WHEN** a valid receipt is converted using supported task exports
- **THEN** the batch bytes and digest match the established command document and an existing output file is refused unchanged

#### Scenario: Shared semantic refusal

- **WHEN** a re-digested inconsistent plan or unknown receipt member is supplied
- **THEN** Navigator refuses before creating an output file
