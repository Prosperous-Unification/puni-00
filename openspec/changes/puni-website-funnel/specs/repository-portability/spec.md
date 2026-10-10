## ADDED Requirements

### Requirement: Shared governed repository baseline

Public `puni-00` and private `puni-pr-00` SHALL consume a versioned pinned common governance and toolchain baseline with one update path. Both SHALL provide the same relative `apps/` and `libs/` layout, product tags, Nx target names and semantics, Bun/TypeScript and compatible pinned dependencies, and OpenSpec, AGENTS and wiki conventions. Each SHALL retain independent Git history, credentials and release authorization.

#### Scenario: Private bootstrap

- **WHEN** the empty private repository is bootstrapped from a pinned baseline revision
- **THEN** its Nx test, lint, typecheck and build commands and governance checks run without importing WBS product history or licensed theme source into public storage

#### Scenario: Baseline drift

- **WHEN** a repository has a missing or incompatible pinned baseline component
- **THEN** its conformance check names the divergence and blocks project transfer

### Requirement: Bidirectional project transfer

A transferable project SHALL declare its local dependency closure and retain unchanged relative source paths when copied between repositories. The transfer MUST detect missing dependencies and destination collisions before writing; clean-copy fixtures in both permitted directions SHALL run the same Nx test, lint, typecheck and build targets. A project classified private, including Novaform source and dependents, MUST be refused for public promotion.

#### Scenario: Public to private and eligible private to public

- **WHEN** a portable fixture project and its closure are copied in either permitted direction
- **THEN** identical Nx targets pass in clean destinations and no absolute checkout path is required

#### Scenario: Missing closure or collision

- **WHEN** a dependency is omitted or a destination path collides
- **THEN** transfer stops before destination mutation and reports the exact path and dependency

#### Scenario: Restricted source

- **WHEN** the Novaform site or a dependent project is requested for public transfer
- **THEN** classification rejects the transfer before source or artifacts enter the public checkout, cache or release
