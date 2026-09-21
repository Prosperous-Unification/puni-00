## ADDED Requirements

### Requirement: A failure log record carries the diagnostic report

A log line about a failure SHALL carry that failure's sanitized diagnostic report, with its occurrence identifier, under the record's failure field, and SHALL validate against the declared log schema.

#### Scenario: A boundary logs a caught value

- **GIVEN** a logger built for a service
- **WHEN** a caught value is logged as a failure
- **THEN** the emitted line validates against the declared log schema
- **AND** the failure field carries the occurrence identifier of that failure

#### Scenario: The failure has a cause

- **GIVEN** a caught value whose cause is another failure
- **WHEN** it is logged as a failure
- **THEN** the record reports that cause as a child of the failure

### Requirement: A failure a boundary logged is never dropped

A log call that carries a failure field SHALL produce a failure record even when the caught value has no value at all, that record SHALL report the value the boundary logged rather than a substitute, and a log call carrying no failure field SHALL produce no failure record.

#### Scenario: The caught value has no value

- **GIVEN** a boundary that caught a value with no value and logs it as the failure
- **WHEN** the line is emitted
- **THEN** the line carries a failure record with an occurrence identifier

#### Scenario: The caught value is an ordinary failure

- **GIVEN** a boundary that logs a failure carrying a message
- **WHEN** the line is emitted
- **THEN** the record reports that failure rather than a substitute

#### Scenario: The line is not about a failure

- **GIVEN** a log call carrying no failure field
- **WHEN** the line is emitted
- **THEN** the line carries no failure record

### Requirement: The public report never replaces the diagnostic one

A failure log record SHALL NOT carry the public report of the failure in place of the diagnostic report, and the log schema SHALL refuse a record that carries one.

#### Scenario: An unknown failure is logged

- **GIVEN** a caught value with no disclosure policy
- **WHEN** it is logged as a failure
- **THEN** the emitted line carries the diagnostic report version rather than the public report version
- **AND** the line carries neither the generic public message nor a public code

#### Scenario: A public report is offered as a failure record

- **GIVEN** a candidate log record whose failure field is a public report
- **WHEN** it is validated against the log schema
- **THEN** validation refuses it

### Requirement: Only this process's own reporting outcomes are reused

A reporting outcome SHALL be reused for a log record only when this process registered it, and every other value SHALL be reported afresh under the logger's redaction policy. Deciding this SHALL NOT read any property of the value and SHALL NOT invoke any accessor on it.

#### Scenario: A caught value imitates a reporting outcome

- **GIVEN** an unregistered value shaped like a successful reporting outcome and carrying a secret
- **WHEN** it is logged as a failure
- **THEN** the record is a fresh report of that value
- **AND** the record does not contain the secret

#### Scenario: A caught value imitates a reporting loss

- **GIVEN** an unregistered value shaped like a reporting loss whose reason carries a secret
- **WHEN** it is logged as a failure
- **THEN** the record is a fresh report of that value
- **AND** the record does not contain the secret

#### Scenario: A caught value exposes an accessor with the deciding name

- **GIVEN** a caught value with an accessor named as the reporting outcome's discriminator
- **WHEN** it is logged as a failure
- **THEN** the accessor is not invoked

#### Scenario: A boundary logs its own registered outcome

- **GIVEN** a boundary that reported a failure and registered the outcome
- **WHEN** it logs that outcome
- **THEN** the record is the diagnostic report of that outcome, with the occurrence identifier the boundary already holds

### Requirement: Failure records are redacted once and bounded

A failure log record SHALL be written as the shared reporting module produced it, without a second redaction pass and without the raw caught value, and SHALL stay within the shared report byte budget.

#### Scenario: A failure quotes a secret the process owns

- **GIVEN** a logger holding a caller-owned secret and a failure whose message quotes it twice
- **WHEN** the failure is logged
- **THEN** the emitted line does not contain the secret text
- **AND** each occurrence of it is replaced exactly once

#### Scenario: A failure carries far more content than the budget

- **GIVEN** a failure whose content greatly exceeds the report byte budget
- **WHEN** it is logged
- **THEN** the failure record stays within the budget

### Requirement: A failure record carries the retry signal when there is one

A failure log record SHALL carry the failure's fingerprint when the report libraries published one, and two occurrences of the same failure from the same place SHALL share that fingerprint while carrying distinct occurrence identifiers.

#### Scenario: The same failure occurs twice

- **GIVEN** one throwing operation run twice
- **WHEN** each occurrence is logged as a failure
- **THEN** the two records carry the same fingerprint
- **AND** the two records carry different occurrence identifiers

### Requirement: Logging a failure never throws

Serializing a failure for a log line SHALL NOT throw for any value, and a failure no report could be built for SHALL be recorded as a visible loss carrying a correlation handle and a reason, which the log schema SHALL require together.

#### Scenario: No report can be built for the failure

- **GIVEN** a caught value the report library cannot inspect
- **WHEN** it is logged as a failure
- **THEN** a line is still emitted
- **AND** the failure record states that it was not reported and carries a correlation handle and a reason

#### Scenario: Two failures lose their reports

- **GIVEN** two failures no report can be built for
- **WHEN** both are logged
- **THEN** their records carry different correlation handles
- **AND** both records name the same fixed reason

#### Scenario: A hostile value is logged

- **GIVEN** a revoked proxy, a null, an undefined and a thrown primitive
- **WHEN** each is logged as a failure
- **THEN** each produces a record and none of them throws

#### Scenario: A loss names no reason

- **GIVEN** a candidate log record whose failure field states a loss but names no reason
- **WHEN** it is validated against the log schema
- **THEN** validation refuses it
