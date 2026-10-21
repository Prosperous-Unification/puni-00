## ADDED Requirements

### Requirement: Classify changes from immutable evidence

CI SHALL classify the complete diff between the validated PR synthetic merge first parent and the checked-out candidate. It MUST account for old and new paths, object modes and deletions. Missing commits, malformed output or inconsistent identity MUST fail selection. Empty or unknown impact MUST NOT qualify as prose-only.

#### Scenario: An assessment prose change

- **WHEN** a nonempty diff changes only reviewed Markdown prose paths and supported documentation index memberships
- **THEN** the plan selects documentation validation and omits unrelated runtime tests, builds and browsers

#### Scenario: A mixed or deceptive diff

- **WHEN** the diff also changes code, a fixture, an unreviewed path, a policy, a symlink or renames code into a prose path
- **THEN** the plan includes code checks or refuses invalid evidence, rather than granting a prose exemption

### Requirement: Validate documents instead of retesting the validator

The prose path SHALL run formatting, current-document link/anchor/path checks, index validation, relevant specification validation, secrets and private-nesting checks. It MUST NOT represent an inactive trusted-wiki check or an omitted validator test suite as certified or executed.

#### Scenario: Broken prose link

- **WHEN** a prose change introduces an unresolved local link or invalid index membership
- **THEN** the required gate fails through the production documentation validator

#### Scenario: Metadata and consumed Markdown

- **WHEN** Markdown is a fixture, policy input, module authority change or application-consumed guide
- **THEN** its relevant consumer checks remain required, rather than being suppressed by the file extension

### Requirement: Select code checks by runtime dependencies

Code-check selection SHALL include affected owning modules and transitive dependents according to runtime target inputs. An unrelated repository-wide lint input MUST NOT by itself select a runtime test suite. Source, test, fixture, subprocess and configuration inputs MUST remain covered. File selection SHALL narrow only when dependency coverage is established; otherwise the owning module suite remains required with an explicit reason.

#### Scenario: Unrelated lint input

- **WHEN** a file affects a validator lint target but not its runtime inputs or dependencies
- **THEN** the lint remains selected as required and its unrelated test suite is omitted

#### Scenario: Transitive or dynamic input

- **WHEN** a source dependency, fixture or subprocess input changes
- **THEN** all known consumer tests are selected, or the affected module suite is selected where precise test ownership is unavailable

#### Scenario: Rename and deletion

- **WHEN** an imported source or test input is deleted or renamed
- **THEN** selection retains its previous consumers or selects broader module coverage; a zero-test native selector verdict is insufficient

#### Scenario: Eligible test file change

- **WHEN** an isolated test file changes and its complete impact is established
- **THEN** that file and any consuming tests run without unrelated test files

### Requirement: Preserve full gates and required verdicts

Push, merge-group, manual dispatch and canonical host gates SHALL retain full validation. PR aggregates SHALL require the selected checks to succeed and MUST reject failed, cancelled, absent or unexplained skipped work. Scope failure MUST prevent a successful aggregate.

#### Scenario: A required selected check is skipped

- **WHEN** a required documentation or code job fails, is cancelled or is unexpectedly skipped
- **THEN** the stable gate reports failure

#### Scenario: A full validation event

- **WHEN** the event is push, merge-group or manual dispatch
- **THEN** the previous full suites remain selected regardless of prose classification

### Requirement: Explain and measure selection

CI SHALL retain a machine-readable plan containing immutable revisions, scope, selected checks and reasons, and execution timing/count evidence sufficient to distinguish reduced work from checks that did not run.

#### Scenario: Review a prose verdict

- **WHEN** a prose PR completes
- **THEN** reviewers can identify the diff boundary, document checks executed, deliberately omitted runtime checks and measured duration
