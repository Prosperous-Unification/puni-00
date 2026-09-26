## MODIFIED Requirements

### Requirement: Saved plans retain project-step policy history

A saved plan SHALL capture the allowance of each project step and the charged estimate readings as immutable historical values. Later edits to live project-step policy SHALL not change those values. The saved-plan and archive formats SHALL distinguish records carrying allowances from legacy records explicitly converted to zero allowance. Saved plans SHALL remain inspection records and SHALL not restore policy into a live project.

#### Scenario: A later policy edit does not rewrite history

- **GIVEN** a saved plan captured with a 30% QA allowance and its charged estimates
- **WHEN** the live project's QA allowance becomes 50%
- **THEN** the saved plan still shows 30% and its original charged estimates
