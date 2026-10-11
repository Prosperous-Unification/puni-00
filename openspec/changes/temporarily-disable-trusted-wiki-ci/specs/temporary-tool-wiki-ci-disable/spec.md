## ADDED Requirements

### Requirement: Pause trusted-wiki CI admission

The repository SHALL skip the trusted-wiki pull request job and its diagnostic and push-audit steps in the main CI workflow while the external activation archive is unavailable.

#### Scenario: Pull request has no activation archive

- **WHEN** a pull request runs with no trusted activation configured
- **THEN** trusted-wiki CI steps are skipped and ordinary CI checks still run

### Requirement: Preserve local Tool Wiki invocation

The repository SHALL retain the local Tool Wiki launcher and pre-commit hook so an operator with an activation can invoke the check locally.

#### Scenario: Operator invokes the local hook

- **WHEN** an operator invokes the local Tool Wiki launcher with an activation root
- **THEN** the existing local validation path remains available
