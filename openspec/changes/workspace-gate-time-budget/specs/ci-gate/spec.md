## ADDED Requirements

### Requirement: Bounded whole-project workspace partitions

CI SHALL assign `wbs-be-01`, `tool-remote-scripts` and `wbs-fe-01` to dedicated runtime jobs and every other non-Twilight project to the residual workspace job. The residual workspace job SHALL have a finite 120-minute whole-job budget; other runtime jobs SHALL retain their finite 90-minute budgets, existing phase cutoffs and Nx parallelism of two. Non-remote runtime phases SHALL retain their 75-minute cutoff; fixed remote phase limits remain governed by ci-remote-capacity. The original runtime targets and Nx task dependencies SHALL remain required. The sole fixed physical execution exception is `ci-remote-capacity`: remote retains exactly one logical project owner and selection bit, with its complete physical leaf coverage and independently required jobs governed by that capability's validated contract. This exception SHALL preserve full module coverage, static/dependency ownership, source validation and the unchanged canonical local/host target.

#### Scenario: Full or shared-input scope

- **WHEN** the gate selects full scope or a change affects every runtime project
- **THEN** the four logical partitions cover the exact union of non-Twilight projects with no duplicate owner
- **AND** each whole-project job runs its selected test, lint, typecheck and build targets with their Nx dependency closure; the fixed remote leaves collectively retains those same obligations with complete disjoint test coverage

#### Scenario: Residual workspace completes within the raised allowance

- **WHEN** the workspace checks take more than 90 minutes but finish within 120 minutes
- **THEN** the job budget permits the remaining checks to execute
- **AND** their actual outcomes determine the gate verdict

#### Scenario: Affected or lint-only scope

- **WHEN** only one dedicated project, a newly added residual project, or independent lint input is affected
- **THEN** only selected dedicated jobs run, while the residual job always runs for a non-docs plan
- **AND** the residual job runs independent affected lint and Burokrat source lint even with no selected runtime project
- **AND** empty runtime selection never becomes an empty `nx run-many -p` argument

### Requirement: Required parallel non-Nx checks and exact verdict

CI SHALL run every former non-Nx workspace check in a required `gate_checks` job with a finite 30-minute ceiling. Each runtime job SHALL preserve checkout identity, native provisioning, real command failure, annotation failure, and an always-on unique log with missing-log refusal. The stable `gate` check SHALL require success for every selected job and accept a skip only when the validated plan proves that job out of scope.

#### Scenario: A job fails, times out, is cancelled, absent or unexpectedly skipped

- **WHEN** any required runtime or checks job has a non-success result
- **THEN** `gate` fails after all independent jobs have had an opportunity to finish

#### Scenario: Documentation-only plan

- **WHEN** the validated immutable plan selects documentation-only work
- **THEN** docs succeeds and every runtime, Twilight and checks job is explicitly skipped
- **AND** `gate` refuses an unexplained success or absent skip

#### Scenario: Residual workspace exhausts its outer allowance

- **WHEN** the workspace job reaches its 120-minute limit
- **THEN** GitHub Actions cancels the job and the required gate cannot pass
