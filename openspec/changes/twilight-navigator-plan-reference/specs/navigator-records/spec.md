## ADDED Requirements

### Requirement: Burokrat decodes plan references and progress receipts

Burokrat's contracts library SHALL declare the record kinds `plan-reference` and
`progress-receipt` at schema version 1, and `decodeRecord` SHALL validate each against its
declared shape, rejecting undeclared keys, another schema version, a malformed digest or Git
object id, an empty receipt entry list and an unknown progress status. The declared kind set
SHALL be exactly the documented list.

#### Scenario: A well-formed record decodes

- **WHEN** a plan reference or progress receipt matching version 1 is decoded under its kind
- **THEN** the decoded record is returned unchanged

#### Scenario: A malformed record is refused

- **WHEN** the record carries an undeclared key, `schemaVersion` other than `'1'`, a non-hex digest, no receipt entries or a status other than `in_progress` or `done`
- **THEN** decoding throws and names the failing path

### Requirement: Records carry a verifiable canonical digest

Each record SHALL carry a SHA-256 digest of its canonical JSON (sorted keys, no whitespace)
computed without the digest field. `verifyDigest` SHALL refuse a record whose embedded digest
does not match.

#### Scenario: Key order does not change the digest

- **WHEN** the same record is digested with its keys in two different orders
- **THEN** both digests are equal

#### Scenario: A tampered record is refused

- **WHEN** any field of a digested record changes after the digest was embedded
- **THEN** `verifyDigest` throws
