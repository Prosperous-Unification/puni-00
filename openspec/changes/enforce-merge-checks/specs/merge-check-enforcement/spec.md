## ADDED Requirements

### Requirement: Main has enforced pull request verdicts

The main branch SHALL require pull requests and the existing `gate` and `pixels` contexts from the observed GitHub Actions integration. The active repository ruleset SHALL include main, have no standing bypass actors, and preserve unrelated rules. A main merge request with a failed, cancelled, or absent required context SHALL be refused, including when requested by an administrator.

#### Scenario: A required verdict is not successful

- **WHEN** a harmless candidate's required verdict is failed, cancelled, or absent
- **THEN** an actual head-pinned merge request is refused
- **AND** main is unchanged by the refused request

#### Scenario: The required contexts are produced by another source

- **WHEN** a caller posts a same-name status from another integration
- **THEN** it cannot replace the required GitHub Actions verdict

#### Scenario: Live enforcement is removed in an isolated control

- **WHEN** the same enforcement is removed from a disposable target branch containing a deliberately failing candidate
- **THEN** the actual merge request is accepted there
- **AND** this control never removes main's enforcement or merges the fault into main

### Requirement: Enforcement preserves the existing delivery path

Required checks SHALL remain the stable aggregate names; path-filtered leaf jobs SHALL NOT be required globally. Approval count SHALL be zero, latest-base strictness SHALL be disabled, and the policy SHALL NOT add a merge queue, deployment prerequisite, additional test suite, or serializing workflow. The existing docs-only and affected-module selection SHALL remain intact.

#### Scenario: A documentation-only change passes

- **WHEN** a reviewed prose-only PR passes its document checks and the two aggregates
- **THEN** it can merge into main without application runtime, build, or browser suites
- **AND** evidence records the real selection plan, skipped jobs, queue time, execution time and merge time

#### Scenario: An unrelated PR changes main

- **WHEN** main advances without a conflict after another PR was tested
- **THEN** the policy does not demand a base refresh or repeated test run solely because main advanced
- **AND** the evidence does not claim that this proves the new composed tree

### Requirement: Operational evidence and recovery are attributable

The owning change SHALL record the before and after settings, rule identity, exact candidate and merge revisions, refused and accepted API responses, failure-control evidence, timing, and remaining limitations. Recovery SHALL change only this ruleset, preserve unrelated settings, require an attributable operator decision, and restore enforcement after repair.

#### Scenario: A required check stops being reported

- **WHEN** a workflow or check-name change leaves a required verdict absent
- **THEN** the merge remains blocked
- **AND** the runbook gives the check repair and emergency policy recovery procedure without a standing automatic bypass
