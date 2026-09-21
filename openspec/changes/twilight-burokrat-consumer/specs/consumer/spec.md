## ADDED Requirements

### Requirement: Trusted consumer bootstrap

Trusted admission SHALL install the pinned package from base-owned inputs with lifecycle scripts disabled before reading candidate-controlled bytes.

#### Scenario: Candidate adds an install script

- **GIVEN** a candidate that changes package metadata to add a sentinel lifecycle script
- **WHEN** trusted admission bootstraps Twilight Burokrat
- **THEN** the sentinel never executes and admission uses the base-owned pin

#### Scenario: Candidate changes the package pin

- **GIVEN** a candidate-controlled manifest, lockfile, or registry configuration with a different package identity
- **WHEN** trusted admission runs
- **THEN** those inputs cannot change the installed trusted package

### Requirement: Existing admission semantics remain stable

Package-backed admission SHALL preserve the `trusted-wiki`, `gate`, and `pixels` check names and distinguish unconfigured, inactive, incompatible, and certified activation states.

#### Scenario: Package and activation are incompatible

- **GIVEN** a valid package and a selected activation for an incompatible trusted closure
- **WHEN** admission runs
- **THEN** it refuses without replacing the activation

### Requirement: Deployment carries all admission identities

Deployment preparation SHALL require the admitted source SHA, package identity, activation identity, and staged image digest.

#### Scenario: Candidate edits a compatibility wrapper

- **GIVEN** a candidate that changes a repository shell wrapper to report certification
- **WHEN** deployment preparation evaluates admission
- **THEN** the wrapper cannot manufacture the required trusted identities
