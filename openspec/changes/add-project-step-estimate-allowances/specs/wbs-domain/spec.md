## ADDED Requirements

### Requirement: A project step defines its estimate allowance

Every project step SHALL have one allowance percentage, defaulting to zero, editable in Project settings → Steps and applying to all current and future work-item estimates for that step. It SHALL be finite, between 0 and 1000 inclusive, with at most two decimal places. There SHALL be no per-work-item override. An omitted create value SHALL mean zero; invalid updates SHALL be refused without changing the policy.

#### Scenario: A QA policy covers every QA estimate

- **GIVEN** a project step QA with a 30% allowance and two work items with QA estimates
- **WHEN** either estimate is read or a later QA estimate is entered
- **THEN** the same 30% project-step policy applies to each base estimate
- **AND** their entered O/R/P values remain unchanged

#### Scenario: Invalid allowance is refused

- **GIVEN** a step whose allowance is 30%
- **WHEN** a client submits a negative, non-finite, over-1000 or more-than-two-decimal percentage
- **THEN** the update is refused and 30% remains in effect

### Requirement: Charged effort applies the allowance once before rounding

For each estimated leaf step, charged days SHALL equal project rounding of the project's O/R/P combination multiplied by `1 + allowancePercent / 100`. Work-item totals SHALL sum charged steps; parent totals SHALL sum charged descendant leaves without applying an allowance to the parent. Missing estimates SHALL stay missing and take zero scheduling duration; explicit zero SHALL stay estimated zero. Actual recorded work and progress SHALL not be uplifted.

#### Scenario: Allowance precedes ceiling

- **GIVEN** QA base estimate 2 days, QA allowance 30% and project ceiling rounding
- **WHEN** charged effort is computed
- **THEN** the before-rounding value is 2.6 days and charged effort is 3 days

#### Scenario: Rounding the base first gives the wrong charge

- **GIVEN** QA base estimate 1.1 days, QA allowance 30% and project ceiling rounding
- **WHEN** charged effort is computed
- **THEN** the before-rounding value is 1.43 days and charged effort is 2 days
- **AND** rounding the base to 2 before allowance would incorrectly produce 3 days

#### Scenario: A parent does not double-charge

- **GIVEN** two leaf QA estimates each charged 3 days under a 30% step allowance
- **WHEN** their parent's QA total is computed
- **THEN** it is 6 days, without a second 30% uplift

#### Scenario: Unknown is not estimated zero

- **GIVEN** an unknown QA estimate and an explicitly entered zero QA estimate
- **WHEN** a nonzero allowance is applied
- **THEN** the former remains missing with zero scheduling duration and the latter remains an estimated zero
