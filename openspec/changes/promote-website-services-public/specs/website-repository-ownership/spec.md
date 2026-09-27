# Website repository ownership

## ADDED Requirements

### Requirement: Canonical service ownership

The public repository SHALL own the website frontend, API, contracts, and SQLite adapter at their existing `apps/website` and `libs/website` paths. The private repository MAY retain a pinned snapshot for a local demo and SHALL identify the public source revision. The licensed marketing site SHALL remain in the private repository.

#### Scenario: Reviewed public promotion

- **WHEN** the four eligible service projects are promoted
- **THEN** public source contains their tracked authored files and no Novaform site, licensed font, generated output, database, or environment secret
- **AND** the four projects declare public portability visibility and their local dependency closure

#### Scenario: Private source selected for promotion

- **WHEN** the transfer command selects a private classified project or the Astro site for a public destination
- **THEN** it refuses the copy before writing project files

### Requirement: Public workspace gates

Each promoted project SHALL have an Nx identity with the product, scope, ring, and runtime tags required by workspace policy. Its targets SHALL run with the public Bun toolchain and use real ESLint for lint. The public project inventory and dev restart fingerprint SHALL include the added projects.

#### Scenario: Public source verification

- **WHEN** the promoted projects are checked in the public workspace
- **THEN** their tests, lint, typecheck, and builds pass through their Nx targets
- **AND** project inventory and restart coverage tests pass

### Requirement: Behavior preservation

The transfer SHALL preserve existing API routes, frontend journeys, migration files and paired rollback files, and local ports. It SHALL not enable provider calls or deploy hosts as a side effect.

#### Scenario: Existing API contract

- **WHEN** the transferred API tests run
- **THEN** the anonymous intake, proposal replay, auth, provider admission, concept, and migration refusal cases retain their prior outcomes
