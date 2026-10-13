## ADDED Requirements

### Requirement: Navigator preserves native estimates from current exports

Navigator SHALL accept strict WBS plan document versions 7 and 8, rejecting every other version and every undeclared key before output. Version 8 SHALL require each step's native estimate unit and write task schema 2 with per-step `estimates` carrying `unit` equal to `minutes` or `workdays` and unchanged three-point values. Version 7 SHALL retain historical task schema 1 with `estimateDays`. References SHALL bind the original wire version and SHA-256 of the original export bytes.

#### Scenario: Mixed native units

- **WHEN** a current exporter-generated version-8 plan has a workday step and a minute step
- **THEN** Navigator writes schema-2 tasks preserving each unit and numeric estimate and a version-8 reference decodable by Burokrat

#### Scenario: Invalid current export

- **WHEN** version 8 omits a step unit, carries an unknown nested or root key, or the header names version 9
- **THEN** Navigator fails before creating outputs

#### Scenario: Historical export

- **WHEN** a version-7 export is supplied
- **THEN** Navigator writes the historical schema-1 tasks and a version-7 reference

### Requirement: Receipt conversion preserves task digest identity across versions

Receipt conversion SHALL decode task schemas 1 and 2 without normalization before verifying their canonical digest. Burokrat SHALL decode plan document versions 6, 7 and 8 and refuse version 9. Unknown task keys and missing schema-2 estimate units SHALL fail before command output.

#### Scenario: Historical and current task exports

- **WHEN** a valid receipt is paired with its bound task export of either supported schema
- **THEN** the same step progress and measure commands are prepared

#### Scenario: Tampered native estimate

- **WHEN** a schema-2 task estimate unit or value changes after reference creation
- **THEN** receipt conversion refuses the digest mismatch before output
