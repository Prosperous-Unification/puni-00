## ADDED Requirements

### Requirement: Navigator preserves native estimates from current exports

Navigator SHALL accept strict WBS plan document versions 7, 8 and 9, rejecting every other version and every undeclared key before output. Versions 8 and 9 SHALL require each step's native estimate unit and write task schema 2 with per-step `estimates` carrying `unit` equal to `minutes` or `workdays` and unchanged three-point values. Version 7 SHALL retain historical task schema 1 with `estimateDays`. References SHALL bind the original wire version and SHA-256 of the original export bytes.

#### Scenario: Mixed native units

- **WHEN** a current exporter-generated version-8 plan has a workday step and a minute step
- **THEN** Navigator writes schema-2 tasks preserving each unit and numeric estimate and a version-8 reference decodable by Burokrat

#### Scenario: Invalid current export

- **WHEN** version 8 omits a step unit, carries an unknown nested or root key, or the header names version 10
- **THEN** Navigator fails before creating outputs

#### Scenario: Historical export

- **WHEN** a version-7 export is supplied
- **THEN** Navigator writes the historical schema-1 tasks and a version-7 reference

### Requirement: Receipt conversion preserves task digest identity across versions

Receipt conversion SHALL decode task schemas 1 and 2 without normalization before verifying their canonical digest. Burokrat SHALL decode plan document versions 6, 7, 8 and 9 and refuse version 10. Unknown task keys and missing schema-2 estimate units SHALL fail before command output.

#### Scenario: Historical and current task exports

- **WHEN** a valid receipt is paired with its bound task export of either supported schema
- **THEN** the same step progress and measure commands are prepared

#### Scenario: Tampered native estimate

- **WHEN** a schema-2 task estimate unit or value changes after reference creation
- **THEN** receipt conversion refuses the digest mismatch before output

### Requirement: Strict direct facts in version 9

Navigator SHALL require strict root `stepBlockages` in external v9. Every fact SHALL name an existing leaf owner and existing step, each owner/step pair SHALL occur once, and `blockedAt` SHALL be a safe integer. Negative instants and facts retained on done progress SHALL be accepted. Facts SHALL stay in the original export without creating commands or deriving eligibility.

#### Scenario: Nonempty current export

- **WHEN** an exporter-generated v9 export carries mixed native units and a negative direct fact on done progress
- **THEN** Navigator preserves native estimates in schema 2 and binds the original v9 bytes

#### Scenario: Invalid direct fact

- **WHEN** v9 omits the collection, names a missing or parent owner, names an unknown step, repeats a pair, uses an unsafe or fractional time, or adds an unknown nested key
- **THEN** Navigator refuses before creating any output

#### Scenario: Only blockedAt changes

- **WHEN** two accepted exports differ only in one blockedAt value
- **THEN** tasks and tasksDigest remain equal while exportDigest and referenceDigest differ
