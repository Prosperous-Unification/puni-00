## ADDED Requirements

### Requirement: Estimate detail distinguishes base and charged values

For an estimated step, the estimate detail SHALL show the editable base O/R/P, its combined base days, project-step allowance percentage, value before rounding and charged days. The step heading SHALL expose a nonzero allowance, such as `QA +30%`. Main totals and schedule figures SHALL read charged days. An unknown estimate SHALL not show an invented charged estimate.

#### Scenario: The planner can audit a charged estimate

- **GIVEN** a QA base of 2 days, allowance 30% and ceiling rounding
- **WHEN** estimate detail is opened
- **THEN** it shows base 2 days, allowance +30%, before rounding 2.6 days and charged 3 days
- **AND** the raw O/R/P fields remain editable and unchanged
