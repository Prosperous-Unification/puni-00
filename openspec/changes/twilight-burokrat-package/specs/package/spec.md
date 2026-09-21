## ADDED Requirements

### Requirement: Independently installable package

The system SHALL build `twilight-burokrat@0.1.0` into an allowlisted tarball whose executable and record validation work without repository source, workspace aliases, Nx, or network access.

#### Scenario: Clean external installation

- **GIVEN** only the tested tarball and a clean Bun repository outside the checkout
- **WHEN** the tarball is installed with lifecycle scripts disabled
- **THEN** `twilight-burokrat --version` reports `0.1.0` and record validation matches the source fixture result

#### Scenario: Workspace dependency is missing from the tarball

- **GIVEN** a build that leaves an unresolved workspace import
- **WHEN** package acceptance runs without monorepo resolution
- **THEN** acceptance fails before the tarball is eligible for release

#### Scenario: Installed command receives an unknown operation

- **GIVEN** the compiled package executable in a clean external repository
- **WHEN** `twilight-burokrat not-a-command` runs
- **THEN** the dispatcher reports an unknown command and exits nonzero before loading a toolkit role

#### Scenario: Installed toolkit role is missing

- **GIVEN** an installed tarball whose validator role was removed
- **WHEN** `twilight-burokrat validate-record` runs against the acceptance fixture
- **THEN** role manifest verification refuses before executing any remaining role

#### Scenario: Bun runtime is incompatible

- **GIVEN** an installed package invoked with a Bun version other than the package's exact supported runtime
- **WHEN** `twilight-burokrat validate-record` reaches runtime compatibility validation
- **THEN** the command refuses before validator execution and names the required Bun version

#### Scenario: Trusted compiler closure is incompatible

- **GIVEN** an installed package whose consumer compiler does not match the trusted compiler closure
- **WHEN** `twilight-burokrat prepare-activation` validates the consumer workspace
- **THEN** activation preparation refuses before writing or selecting an activation

### Requirement: Package and activation identities remain distinct

The system SHALL bind reusable toolkit bytes to package identity while preserving the separately selected activation identity bound to one consumer commit.

#### Scenario: Candidate changes after activation preparation

- **GIVEN** a valid installed package and an activation prepared for one candidate SHA
- **WHEN** the candidate receives another commit
- **THEN** admission refuses the stale activation before validator execution

#### Scenario: Packaged validator is corrupted

- **GIVEN** a prepared activation and a modified installed `validator.mjs`
- **WHEN** admission verifies its trusted closure
- **THEN** admission refuses the digest mismatch before executing the validator

### Requirement: Releases publish tested bytes

The release workflow SHALL publish the exact tarball that passed package acceptance and SHALL refuse tag/version mismatch, dirty source, missing assets, or an existing version.

#### Scenario: Publish job receives changed bytes

- **GIVEN** a verified tarball digest from the test job
- **WHEN** the publishing job receives a different tarball
- **THEN** it refuses publication

#### Scenario: Registry authority is unavailable

- **GIVEN** a tested tarball and no verified publishing authority
- **WHEN** release preparation completes
- **THEN** the tarball remains ready and publication is recorded as pending without selecting a different package name
