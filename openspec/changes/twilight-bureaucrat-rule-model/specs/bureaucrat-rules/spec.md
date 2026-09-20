## ADDED Requirements

### Requirement: Rule registry

Every rule SHALL be exposed under a stable identifier, family, statement, source, and input list.

#### Scenario: Explain a registered rule

- **GIVEN** a registered rule identifier
- **WHEN** a caller runs `explain` for that identifier
- **THEN** Twilight Bureaucrat prints the rule's registry record

#### Scenario: Refuse an unregistered rule

- **GIVEN** an identifier absent from the registry
- **WHEN** a caller runs `explain` for that identifier
- **THEN** Twilight Bureaucrat refuses it and names every registered identifier

### Requirement: Rule modes come from trusted policy

A rule's mode SHALL be read from a document outside the candidate's Git worktree, and every registered rule SHALL have a stated mode.

#### Scenario: Refuse candidate-owned policy

- **GIVEN** a rule policy inside the worktree and an interior repository argument
- **WHEN** Twilight Bureaucrat loads the policy
- **THEN** it refuses the policy as candidate-owned

#### Scenario: Refuse an absent mode

- **GIVEN** a policy that states no mode for one registered rule
- **WHEN** Twilight Bureaucrat loads the policy
- **THEN** it refuses the policy and names that rule

#### Scenario: Refuse ratchet mode

- **GIVEN** a policy that assigns `ratchet` to a rule
- **WHEN** Twilight Bureaucrat loads the policy before an adopted set exists
- **THEN** it refuses the mode

### Requirement: One verdict per candidate

`check` SHALL run the selected rules over one candidate selection and print exactly one verdict naming the candidate identity, the policy, the rules that ran, every finding, and every rule it could not evaluate.

#### Scenario: Allow a candidate

- **GIVEN** a candidate satisfying every selected rule
- **WHEN** a caller runs `check`
- **THEN** Twilight Bureaucrat prints one allowed verdict

#### Scenario: Narrow a check

- **GIVEN** a registered rule identifier
- **WHEN** a caller supplies `--rule` with that identifier
- **THEN** the verdict names only that rule as having run

### Requirement: Mode decides the effect

A finding SHALL be debt in observe mode and a refusal otherwise. A verdict carrying a refusal SHALL exit non-zero while still printing the verdict.

#### Scenario: Enforce direct-entry debt

- **GIVEN** direct-entry debt and an enforced direct-entry rule
- **WHEN** a caller runs `check`
- **THEN** the finding is a refusal and the command exits non-zero after printing the verdict

### Requirement: A failure to evaluate is never debt

A rule that could not be evaluated SHALL be named in the verdict and SHALL disallow it in every mode. Because no check distinguishes a candidate violation from an unusable input by type, every thrown refusal SHALL be treated as a failure to evaluate; in this slice only checks with structured output report debt.

#### Scenario: Observe an unindexed candidate

- **GIVEN** an unindexed candidate and the module-index rule in observe mode
- **WHEN** a caller runs `check`
- **THEN** the rule is unevaluated and the verdict is disallowed

#### Scenario: A prerequisite fails

- **GIVEN** a rule whose prerequisite check failed
- **WHEN** a caller runs `check`
- **THEN** the verdict names the unevaluated rule instead of reporting debt

### Requirement: A verdict never certifies

Every verdict SHALL state that it does not certify, and certification SHALL remain the sole output of `lint-ci`.

#### Scenario: Inspect certification state

- **GIVEN** any completed rule check
- **WHEN** Twilight Bureaucrat prints its verdict
- **THEN** the verdict carries `certifies: false`

### Requirement: Module index declarations

Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.
Twilight Bureaucrat SHALL enforce this statement as the module-index declaration rule.

#### Scenario: Check module index declarations

- **GIVEN** a selected candidate containing module indexes
- **WHEN** the module-index rule evaluates the candidate
- **THEN** it checks exact nearest-index membership and candidate-contained Markdown references

### Requirement: Module index direct entry limit

A module index declares no more direct entries than the reviewed limit.
Twilight Bureaucrat SHALL enforce this statement as the module-index direct-entry rule.

#### Scenario: Report direct-entry debt

- **GIVEN** a module index over the reviewed direct-entry limit
- **WHEN** the direct-entry rule evaluates the candidate
- **THEN** it reports the index path, direct-entry count, and limit

### Requirement: Inventory classification

Every tracked entry is classified by exactly one rule of the classification policy.
Twilight Bureaucrat SHALL enforce this statement as the inventory-classification rule.

#### Scenario: Classify tracked entries

- **GIVEN** a candidate and a classification policy
- **WHEN** the inventory rule evaluates the candidate
- **THEN** every tracked entry is classified exactly once or the rule is not evaluated

### Requirement: Relationship resolution

Every declared relationship of the candidate resolves to an extracted selector.
Twilight Bureaucrat SHALL enforce this statement as the relationship-resolution rule.

#### Scenario: Report an unresolved declaration

- **GIVEN** a candidate declaring a relationship that remains unresolved
- **WHEN** the relationship rule evaluates the candidate
- **THEN** it reports a finding naming the relationship and its reason

### Requirement: Explain reports what B0 knows

`explain` SHALL print a rule's static record and its stated mode when a rule policy is named. It SHALL NOT report a last negative proof until the proof register arrives with slice B4.

#### Scenario: Explain a policy mode

- **GIVEN** a registered rule and an external rule policy
- **WHEN** a caller runs `explain` with both
- **THEN** Twilight Bureaucrat prints the rule record, policy identifier, and stated mode
