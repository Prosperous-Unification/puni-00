## ADDED Requirements

### Requirement: One report library copy serves every report

The installed dependency tree SHALL resolve `caught-object-report-json` from the repository root
and from `application-exception` to the same installed copy, and that copy SHALL be the version
the root manifest pins.

#### Scenario: The pins agree

- **WHEN** the pins suite resolves the report library from the root and from application-exception
- **THEN** both resolutions name the same file
- **AND** that copy's version is the pinned one

#### Scenario: A second copy is installed beside application-exception

- **WHEN** a copy of the report library is nested under application-exception
- **THEN** the pins suite fails on the two resolutions

### Requirement: Operator records stay readable across a report-format change

The log schema SHALL accept a diagnostic record of any `corj/` report version, so that records
written before a report-format change validate after it, and every boundary's diagnostic record
SHALL carry the version the installed report library writes.

#### Scenario: A record written before the move is read

- **WHEN** a failure record carrying `v: "corj/v0.14"` is validated against the log schema
- **THEN** it is accepted

#### Scenario: A boundary logs a failure after the move

- **WHEN** the backend, gateway or MCP boundary logs an unexpected failure
- **THEN** its record carries `v: "corj/v0.15"` and validates against the log schema
