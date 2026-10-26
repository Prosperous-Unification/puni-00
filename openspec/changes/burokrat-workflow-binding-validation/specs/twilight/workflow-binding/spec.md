## ADDED Requirements

### Requirement: Static binding validation is independently available

Burokrat SHALL expose `twib validate workflow-binding <file> --steps <comma-list>` without a configured runtime, storage adapter or credentials. It SHALL only inspect files and SHALL NOT contact providers or execute configured activities.

#### Scenario: A standalone binding validates

- **GIVEN** a complete binding, readable referenced prompts and supplied project steps
- **WHEN** the optional command runs from the repository root
- **THEN** it prints the deterministic static acceptance digest and exits zero

### Requirement: Binding acceptance preserves strict static semantics

The validator SHALL preserve the strict class, complete-type coverage, prompt-byte snapshot and named refusal semantics in this change's design. Static acceptance SHALL confer no runtime admission or execution authority.

#### Scenario: An unknown project step is refused

- **WHEN** a binding maps a step outside the supplied project-step set
- **THEN** the real CLI refuses unknown_step with nonzero exit and no success stdout

### Requirement: Optional validation preserves existing command behavior

Success SHALL print only the digest and newline. Failure SHALL exit nonzero with a named diagnostic and no success stdout. Existing JSON validation commands SHALL retain their behavior. The optional command SHALL introduce no persisted runtime state.

#### Scenario: Legacy validation remains available

- **WHEN** an existing valid JSON record is supplied through validate or validate-record
- **THEN** its existing output and exit behavior are preserved

#### Scenario: Removing the command needs no migration

- **WHEN** the optional command is reverted
- **THEN** there is no runtime table, stored execution record or activation to migrate
