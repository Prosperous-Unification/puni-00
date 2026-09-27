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

### Requirement: Operator and concept security at the public boundary

The operator password SHALL be checked with an adaptive password hash. Opaque random tokens and CSRF proofs MAY continue using SHA-256. A generated concept subject SHALL contain only a bounded prefix from an explicit plain-text character set, or a fixed fallback.

#### Scenario: Wrong operator password

- **WHEN** a visitor submits an incorrect operator password
- **THEN** the mounted API returns 401 and grants no operator session

#### Scenario: Markup or URL scheme in request description

- **WHEN** a request description contains nested markup or begins with a URL scheme, including `vbscript:`
- **THEN** the generated concept uses only an initial allowed plain-text prefix or the fixed fallback, and never carries markup or a URL scheme into the subject
