## ADDED Requirements

### Requirement: The package installs a short command

An installed Twilight Burokrat package SHALL link the command `twib` to the same executable as
`twilight-burokrat`, and both installed launchers SHALL be executable.

#### Scenario: Both installed launchers run the same program

- **GIVEN** the packed tarball is installed with lifecycle scripts disabled
- **WHEN** `node_modules/.bin/twib --version` and `node_modules/.bin/twilight-burokrat --version`
  are spawned directly
- **THEN** both exit zero and print the same version

#### Scenario: The short command is absent from the manifest

- **GIVEN** a packed tarball whose `bin` map lacks `twib`
- **WHEN** the package install test runs
- **THEN** it fails on the manifest expectation

#### Scenario: The short launcher is not executable

- **GIVEN** an installed package whose `node_modules/.bin/twib` has lost its executable mode
- **WHEN** the package install test spawns it directly
- **THEN** the spawn raises `EACCES` and the test fails before it can read an exit status
