## ADDED Requirements

### Requirement: Website deployment log commands

The development and production log commands MUST read Kubernetes deployment logs for their respective website namespaces through the H4 SSH alias.

#### Scenario: Read recent logs

- **WHEN** an operator runs either command without arguments
- **THEN** the command MUST read up to 100 API log lines from the last 30 minutes in the selected namespace

#### Scenario: Follow a selected deployment

- **WHEN** an operator selects the API, app or site deployment and requests follow mode
- **THEN** the command MUST stream logs from that deployment in the selected namespace

#### Scenario: Refuse an unsupported input

- **WHEN** the operator passes an unsupported workload or argument
- **THEN** the command MUST exit unsuccessfully before invoking SSH

#### Scenario: Display command help

- **WHEN** an operator runs `puni-website-dev-logs` or `puni-website-prod-logs` with `-h` or `--help`
- **THEN** the command MUST describe its usage, defaults and follow option without invoking SSH

#### Scenario: Discover the command on PATH

- **WHEN** an operator finds either executable through a symlink on PATH
- **THEN** it MUST resolve its shared reader relative to the repository script
