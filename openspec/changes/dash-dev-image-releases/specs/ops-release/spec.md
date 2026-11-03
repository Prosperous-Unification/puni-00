## ADDED Requirements

### Requirement: Explicit release profile and configured target

Dash SHALL accept `ops release plan|run TARGET --config PATH --environment development|production --profile dev-fast|full`, with optional `--ref REF` and `--public-ref REF`. `dev-fast` SHALL be refused outside development without an implicit fallback.

#### Scenario: Branch development plan

- **WHEN** the operator plans a configured website target with `dev-fast`, private branch `feature/home`, and public branch `feature/app`
- **THEN** Dash invokes the selected adapter's plan command with both exact source selections and labels the operation `DEV-FAST`

#### Scenario: Invalid production fast release

- **WHEN** the operator requests `dev-fast` for production
- **THEN** Dash refuses before opening the configuration or launching any adapter

### Requirement: Central typed release grammar

The central typed grammar SHALL reject duplicate, absent, unknown or malformed arguments before any handler runs. Generated help and completion SHALL include both release actions. Options SHALL accept spaced and equals forms in any order around the target. Release usage errors SHALL exit 1; host-job/pool usage errors SHALL retain exit 64.

#### Scenario: Refused release arguments

- **WHEN** a release request contains missing, unknown, repeated or malformed arguments
- **THEN** Dash exits 1 before reading dispatch configuration or invoking any adapter

#### Scenario: Generated release help and standard options

- **WHEN** an operator asks for `help ops release` or uses `--profile=dev-fast` with options before the target
- **THEN** generated help names both actions and the typed release request reaches the lightweight handler with unchanged option values

### Requirement: Owner-controlled adapter configuration

Dispatch configuration SHALL be a readable regular owner-only file belonging to the invoking account, with schema version 1 and named targets containing absolute adapter and adapter-configuration paths. Missing, unreadable, malformed, exposed or symlink configuration and unknown targets SHALL refuse before adapter execution. The configuration is executable authority belonging to its owner.

#### Scenario: Protected full release target

- **WHEN** a valid owner-only configuration selects an existing target with profile `full`
- **THEN** Dash executes only that target's configured adapter through the current Bun interpreter, with argument boundaries preserved and no shell interpolation

#### Scenario: Exposed dispatch configuration

- **WHEN** another account can read or write the dispatch configuration
- **THEN** Dash refuses without running the configured adapter

### Requirement: Truthful adapter execution outcome

Dash SHALL print the chosen profile, environment, target and action, stream adapter output, preserve its nonzero exit status or report abnormal termination as failure, and never claim a deployed revision merely from dispatch. Plan SHALL invoke only adapter planning; run SHALL invoke execution explicitly.

#### Scenario: Adapter failure

- **WHEN** a release adapter exits with code 23
- **THEN** Dash exits with code 23 and emits no successful deployment claim

#### Scenario: Plan cannot execute run

- **WHEN** the operator chooses plan
- **THEN** the adapter receives plan and no run invocation occurs
