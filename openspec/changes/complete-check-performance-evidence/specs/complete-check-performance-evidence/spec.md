## ADDED Requirements

### Requirement: Complete checks accept bound Performance evidence

The CLI SHALL accept `--performance-evidence <json>` on a complete check, evaluate every registered rule, and retain `certifies: false`. PERF-THRESHOLD SHALL evaluate observations only when evidence binds to the candidate, external policy, committed declaration, and runner selection.

#### Scenario: Complete check with valid evidence

- **WHEN** a complete committed check receives valid bound evidence
- **THEN** its rule list includes every registered rule and PERF-THRESHOLD is evaluated
- **AND** the verdict has `certifies: false`

#### Scenario: Evidence absent or invalid

- **WHEN** evidence is absent, missing, malformed, or bound to another candidate or policy
- **THEN** PERF-THRESHOLD cannot silently pass
- **AND** malformed or missing evidence is reported as an input failure

### Requirement: Check flags are unambiguous

The CLI SHALL preserve existing complete and selected-rule forms, accept each recognized optional flag at most once, and reject unknown flags or evidence paired with a selected rule other than PERF-THRESHOLD.

#### Scenario: Existing selected Performance check

- **WHEN** `--rule PERF-THRESHOLD --performance-evidence <json>` is supplied
- **THEN** only PERF-THRESHOLD is selected with the supplied evidence

#### Scenario: Duplicate or unknown flags

- **WHEN** a flag is repeated or an unknown flag is supplied
- **THEN** the command fails with a flag diagnostic

#### Scenario: Evidence for an unrelated selected rule

- **WHEN** evidence is supplied with `--rule MOD-INDEX`
- **THEN** the command fails because PERF-THRESHOLD was not selected
