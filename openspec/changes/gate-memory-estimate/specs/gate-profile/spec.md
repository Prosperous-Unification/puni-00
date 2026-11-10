## ADDED Requirements

### Requirement: Provisional full-memory gate admission

The gate descriptor SHALL reserve 10 GiB estimated memory with observe enforcement, keeping its CPU, temporary disk, exclusive units and container bounds unchanged. The estimate SHALL remain explicitly provisional until actual full-gate measurement supports a reviewed replacement.

#### Scenario: Another native admission consumes memory

- **GIVEN** a host has 10 GiB allocatable memory
- **WHEN** another admitted use reserves positive memory
- **THEN** the revised gate does not fit until that reservation returns

#### Scenario: The gate occupies all allocatable memory

- **WHEN** the revised gate is admitted against 10 GiB allocatable memory
- **THEN** a further positive-memory admission does not fit while it runs

### Requirement: Caller and target stay distinct

The isolated caller commit SHALL use the unchanged canonical gate launcher with frozen target fe7178a6c363053390849bc98daaad10297c5aae. The assigned gate unit SHALL differ from the caller checkout. No trust, checkout, admission, script or full-check behavior SHALL change.

#### Scenario: The caller catalogue is selected

- **WHEN** Dash reads this caller's committed catalogue
- **THEN** it admits with the revised estimate while the canonical gate payload checks out the separately specified frozen target inside its assigned unit
