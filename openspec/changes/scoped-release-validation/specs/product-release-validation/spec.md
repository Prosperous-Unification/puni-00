## ADDED Requirements

### Requirement: Product-scoped release qualification

A product release MUST validate its selected Nx projects, their transitive workspace and task dependencies, and its product-specific deployment requirements. A whole-repository gate MUST NOT be a release prerequisite. Repository integration gates SHALL remain independently available and unchanged. This supersedes the prospective host-gate prerequisite in the active `website-production-release` requirement “Release claims distinguish local and live evidence”.

#### Scenario: Website release excludes unrelated WBS suites

- **WHEN** the website release selects its site, app, API and deployment tooling
- **THEN** validation includes their complete dependency closure and mandatory product checks without requiring WBS project suites
- **AND** the website source and artifact identities remain bound to their actual revisions

### Requirement: Scope evidence refuses missing work

Release scope evidence MUST use exact source identities and fail on empty or unknown roots, malformed or partial graphs, missing required targets, or unvalidated dependency changes. A checks-enabled complete isolated product workspace SHALL satisfy the closure when its complete declared source and required targets are independently verified.

#### Scenario: Nx reports zero tasks for a misspelled root

- **WHEN** a requested release root is missing even though Nx exits zero
- **THEN** release preflight refuses before build authorization

#### Scenario: A changed import adds a shared dependency

- **WHEN** a released project imports another workspace library
- **THEN** release validation includes that dependency and its required checks

### Requirement: Preflight and completed qualification are distinct

Website release preflight MUST bind the exact public, private-role, tooling and runtime identities and the checks-enabled execution plan. It MUST explicitly report validation incomplete. A scoped result MUST NOT claim an ordinary full repository gate passed.

#### Scenario: Start website validation before a public repository gate passes

- **WHEN** scoped preflight is accepted and owned redundant work is retired
- **THEN** the unchanged checked website build can start with the full private profile and checks enabled
- **AND** preflight alone cannot authorize publication or application activation

### Requirement: Each release stage has its own prerequisites

Each release stage MUST refuse missing product-specific prerequisites. For the website, source/runtime/image/rehearsal checks precede publication, Fleet validation and the database seal precede application activation, and actual request/notification/log/restore proofs precede final production acceptance.

#### Scenario: Live acceptance awaits the initial deployment

- **WHEN** checked artifacts and the schema seal permit initial application activation while live request and recovery proofs are pending
- **THEN** initial activation can proceed
- **AND** final production acceptance remains incomplete until those live proofs pass

### Requirement: One retained production attempt

The scoped website handoff MUST preserve the original parent, sources, deadlines, capacity floors, resource accounting and immutable historical publishers. It MUST refuse conflicting attempts across every old and new begin route and require positive retirement of the superseded owned gate before build dispatch.

#### Scenario: A previous begin publication is uncertain

- **WHEN** any original or replacement begin attempt exists or cannot be read safely
- **THEN** the scoped route refuses another publication and observes the original attempt

### Requirement: Deployment proofs survive scope reduction

Scope reduction MUST preserve the existing website deployment contract: frozen source checks and runtime/image evidence, migrations and rollback, Fleet and schema seal, durable request/owner notification, retained logs and versioned backup with both restores. It MUST preserve the live landing site throughout backend preparation.

#### Scenario: Product checks fail

- **WHEN** a prerequisite of the requested release stage fails or its evidence is incomplete
- **THEN** that stage remains refused without adding an unrelated repository suite as a substitute
