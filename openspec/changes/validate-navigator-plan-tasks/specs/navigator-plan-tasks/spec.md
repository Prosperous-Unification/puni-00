## ADDED Requirements

### Requirement: Validate a supplied plan reference and task export

Burokrat SHALL strictly decode both documents without transformation, verify the reference's embedded digest and canonical task digest, require task plan identity and count to match the reference, and refuse duplicate task IDs, step IDs or step codes. References naming plan document versions 6 or 7 SHALL pair with task schema 1; version 8 SHALL pair with task schema 2.

#### Scenario: Navigator output is consistent

- **WHEN** the command receives a reference and task export produced together by Navigator
- **THEN** it emits a deterministic `plan-task-consistency` report with the reference digest, task digest, plan and task count

#### Scenario: Installed executable exposes the validator

- **WHEN** the built Twilight Burokrat executable runs outside the source repository
- **THEN** its help lists `validate-plan-tasks`, a valid Navigator pair emits the consistency report, and a tampered task export is refused with empty stdout and nonzero exit

#### Scenario: Bound documents disagree

- **WHEN** either digest is stale or a re-digested pair has a mismatched plan, count, version pair or repeated identifier
- **THEN** the command refuses with empty stdout and nonzero exit

#### Scenario: Strict input and invocation boundaries

- **WHEN** either document contains an unknown key, is missing, unreadable, malformed or invalid UTF-8, or the invocation has missing, empty, flag-shaped or extra operands
- **THEN** the command refuses with empty stdout and nonzero exit

### Requirement: Bounded report meaning

The report SHALL describe only consistency between the two supplied documents. It SHALL grant no approval, admission, certification, requirements validation or composite dependency closure.

#### Scenario: Stable bounded report

- **WHEN** the same pair is validated repeatedly
- **THEN** the output is identical and contains only its schema version, scope, reference digest, task digest, plan and task count
