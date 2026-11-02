## ADDED Requirements

### Requirement: A Twilight CLI parses its command line with Optique

Each Twilight CLI (Twilight Dash, Twilight Burokrat, Twilight Navigator) SHALL describe its
commands as `@optique/core` parsers in one module per CLI and SHALL run them through
`@optique/run` with injected stdout, stderr and exit, so the command handlers receive a typed
object and never read `argv`. No command's name, flags, files, outputs or semantics SHALL
change.

#### Scenario: The same command, the same output

- **WHEN** `twilight-dash inspect-authority <repository>` runs before and after the change on
  one repository
- **THEN** stdout is byte-identical and the exit code is 0 both times

### Requirement: Refusals keep their contracts

A parse failure SHALL produce exactly one `error: ` line on stderr, nothing on stdout, and the
exit code the CLI's entrypoint tests pin: 1 for Twilight Dash, 2 for Twilight Navigator, 1 for
Twilight Burokrat. An unknown command SHALL refuse with a line containing `Unsupported <tool>
command: <name>`; a missing or malformed argument SHALL refuse with one `error: ` line whose
message begins `usage: <tool> <command>`. No refusal SHALL run a handler or read a file.

#### Scenario: Unknown Dash command

- **WHEN** `twilight-dash apply` runs
- **THEN** stderr holds one line containing `Unsupported Dash command: apply`, stdout is empty,
  the exit code is 1, and no planner is called

#### Scenario: Missing Navigator flag

- **WHEN** `twin plan-reference` runs without `--export`
- **THEN** stderr holds one `error: ` line whose message begins `usage: twin plan-reference`,
  the exit code is 2, and
  no file is read

#### Scenario: Burokrat without `--now`

- **WHEN** `twib inspect-browser-t2 <repository> <sha> <policy> <capability> <ledger>` runs
  without `--now`
- **THEN** stderr holds one `error: ` line whose message begins
  `usage: twilight-burokrat inspect-browser-t2`, the
  exit code is 1, and no repository is read

### Requirement: Help, version and completion are generated from the parsers

`<tool> --help` and `<tool> help <command>` SHALL print generated help on stdout and exit 0;
`twib --version` SHALL print the package version; `<tool> completion <shell>` SHALL print a
completion script for bash, zsh and fish. Help SHALL name every command the dispatcher
accepts and no other.

#### Scenario: Help lists every command

- **WHEN** `twilight-dash --help` runs
- **THEN** stdout names every command `runDash` dispatches and the exit code is 0

#### Scenario: Completion

- **WHEN** `twib completion zsh` runs
- **THEN** stdout is a zsh completion script naming `inspect-manual` and the exit code is 0

### Requirement: Burokrat still reads no clock

Twilight Burokrat's parser module SHALL declare `--now` as a required option on every dated
command and SHALL contain no clock reference; `no-ambient-clock.test.ts` SHALL pass unchanged.

#### Scenario: The clock guard holds

- **WHEN** the Burokrat package sources are scanned after the change
- **THEN** `findClockReads` reports no read, and `cli-parser.ts` is among the scanned sources
