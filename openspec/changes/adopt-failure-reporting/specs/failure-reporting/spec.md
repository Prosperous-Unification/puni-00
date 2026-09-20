## ADDED Requirements

### Requirement: One call captures both reports of one occurrence

The reporting boundary SHALL produce its diagnostic and public reports with one reporting call and one shared occurrence identifier for object and primitive failures alike.

#### Scenario: An object failure is captured once

- **GIVEN** an object failure
- **WHEN** the reporting boundary captures it
- **THEN** the diagnostic and public reports carry the same occurrence identifier

#### Scenario: A primitive failure is captured once

- **GIVEN** a thrown primitive
- **WHEN** the reporting boundary captures it
- **THEN** the diagnostic and public reports carry the same occurrence identifier

### Requirement: Unknown failures disclose only the generic public contract

A failure without a disclosure policy SHALL disclose the `INTERNAL_ERROR` code and a generic message, and SHALL disclose nothing read from the caught value.

#### Scenario: An unknown value reaches a public audience

- **GIVEN** a caught value with no disclosure policy
- **WHEN** its public report is produced
- **THEN** the report contains `INTERNAL_ERROR` and the generic message
- **AND** the report contains no content read from the caught value

### Requirement: Sensitive properties are skipped everywhere

The reporting policy SHALL skip named sensitive properties in diagnostic and public reports at every depth and regardless of property-name capitalisation.

#### Scenario: A capitalised nested sensitive property is reported

- **GIVEN** a caught value with a nested sensitive property whose name is capitalised
- **WHEN** both reports are produced
- **THEN** neither report contains the property's value

### Requirement: Caller-owned secrets are scrubbed as text

The reporting policy SHALL scrub a secret owned by the calling boundary from messages, stacks and context text, and from details selected by a disclosure policy into the public report, rather than only hiding a property that held it.

#### Scenario: A secret appears outside its original property

- **GIVEN** a caller-owned secret repeated in a message, stack and context
- **WHEN** both reports are produced with that secret in the redaction policy
- **THEN** neither report contains the secret text

#### Scenario: A disclosure selector chooses a secret

- **GIVEN** a disclosure policy that selects a caller-owned secret into public details
- **WHEN** the public report is produced with that secret in the redaction policy
- **THEN** the selected value is redacted

### Requirement: Diagnostic reports are bounded visibly

One byte budget and the configured depth and breadth limits SHALL bound the diagnostic report, and the report SHALL identify which limit caused content to be omitted or truncated.

#### Scenario: The byte budget is reached

- **GIVEN** failure content larger than the diagnostic byte budget
- **WHEN** the diagnostic report is produced
- **THEN** its encoded size stays within the budget
- **AND** the report marks the affected content as omitted or truncated

#### Scenario: The cause depth is reached

- **GIVEN** a cause chain deeper than the configured depth
- **WHEN** the diagnostic report is produced
- **THEN** the deepest reported child identifies the depth limit

#### Scenario: The child count is reached

- **GIVEN** an aggregate failure wider than the configured child limit
- **WHEN** the diagnostic report is produced
- **THEN** the report identifies the child limit

### Requirement: Reporting does not invoke accessors

Reporting SHALL NOT execute property accessors on the caught value.

#### Scenario: A caught value has a throwing getter

- **GIVEN** a caught value with an enumerable getter that throws
- **WHEN** the diagnostic report is produced
- **THEN** the getter is not invoked
- **AND** the property is represented as not inspected

### Requirement: Reporting loss is returned visibly

If reporting fails, the wrapper SHALL return a visible reporting loss with a correlation handle and a fixed reason, SHALL NOT throw, and SHALL NOT represent the failed report as successful.

#### Scenario: The report library throws

- **GIVEN** a caught value the report library cannot inspect
- **WHEN** the reporting wrapper is called
- **THEN** it returns a failed reporting outcome with a correlation handle and reason
- **AND** it neither throws nor returns reports

### Requirement: Redacted and truncated reports satisfy installed schemas

The diagnostic and public reports SHALL validate against their installed report schemas after redaction and truncation.

#### Scenario: Both transformations affect one occurrence

- **GIVEN** a failure whose reports contain a secret and exceed their size limits
- **WHEN** both reports are redacted and truncated
- **THEN** the diagnostic report validates against the installed diagnostic schema
- **AND** the public report validates against the installed public schema
