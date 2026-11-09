## ADDED Requirements

### Requirement: One PUNI executable exposes the three tool namespaces

The installed command SHALL be `puni`. `navigator`, `nav` and `n` SHALL invoke PUNI Navigator; `burokrat`, `bur` and `b` SHALL invoke PUNI Burokrat; `dash` and `d` SHALL invoke PUNI Dash. Each alias SHALL select the same typed command and preserve its output, effects and exit status. Final distribution and current client instructions SHALL expose PUNI names rather than legacy Twilight executables.

#### Scenario: Canonical and alias invocations agree

- **WHEN** a valid command is invoked through each spelling of its namespace
- **THEN** its typed request, output, side effects and exit status are equivalent, and generated future invocations use the canonical PUNI namespace

### Requirement: Optique describes the complete command tree

The root and all client-facing command arguments SHALL use typed Optique grammars. Help and completion SHALL derive from the composed tree, including aliases and nested leaf flags. Invalid arguments SHALL refuse before operation IO, and cross-option guards SHALL remain enforced. Help, version and completion SHALL require no toolkit, clock, credential or connection.

#### Scenario: Nested discovery and refusal are complete

- **WHEN** a client requests root or nested help/completion, or supplies unknown, duplicate, missing, blank or malformed arguments
- **THEN** help/completion describe the selected real grammar and aliases, and invalid input prints one plain error line without invoking an operation

#### Scenario: Dash coherence guards survive composition

- **WHEN** a production release requests the development-only fast profile or account-outcomes inputs violate their existing coherence rules
- **THEN** the invocation refuses before an executor performs an operation

### Requirement: The root preserves each tool's authority and refusal contracts

The root SHALL preserve Navigator's offline behavior, Burokrat's explicit time and absence of ambient clock/runtime writes, and Dash's ownership of effects. Root/Navigator usage refusals SHALL exit 2, Burokrat 1, and Dash 1 except non-release `ops` usage, which SHALL exit 64. Missing required tools/ports/assets and malformed trusted state SHALL fail visibly.

#### Scenario: Refusal status follows the selected namespace

- **WHEN** malformed requests are sent through canonical names and aliases, including `dash ops` and `dash ops release`
- **THEN** each exits with its specified status and no operation occurs, including when ambient process arguments differ from the parsed invocation

### Requirement: An installed artifact contains the client operations

Every first-party operation exposed by current client instructions, generated helpers or a shipped executable SHALL run under its PUNI namespace from the installed artifact without a checkout, Bash, shell script or Node executable. Required external utilities SHALL be explicit prerequisites. Public help SHALL expose the installed Burokrat grammar rather than source-only commands.

#### Scenario: Installation works without the repository or shell runtimes

- **WHEN** the packaged artifact runs from a path containing spaces with no source checkout, Bash or Node on PATH
- **THEN** its help, completion and representative file/state operations succeed with Bun and their declared utilities, and a missing required utility refuses visibly

### Requirement: MCP helpers preserve installed invocation and startup obligations

The MCP token command SHALL load only its required execution modules and retain the existing 10-second helper budget. Pool import SHALL generate an installed `puni dash mcp token` invocation, using canonical `dash` even when import used `d`, preserving argument boundaries and existing secret handling.

#### Scenario: A generated helper executes from an installed path

- **WHEN** pool import runs through `puni d` from an installed path containing spaces and its stored helper is executed outside the checkout
- **THEN** it reaches `puni dash mcp token`, prints only the intended header response, preserves arguments and meets the startup obligation

### Requirement: Renaming does not counterfeit trusted historical identities

Changed launcher/package bytes SHALL receive a new versioned release and activation identity. Burokrat execution SHALL verify the installed toolkit before running its validator or launcher. Previously issued digested/signed record bytes and their historical identities SHALL remain unchanged and verifiable through explicit historical decoders where required.

#### Scenario: A renamed toolkit refuses substituted assets

- **WHEN** a new PUNI artifact's launcher, validator, dependency closure or activation identity is substituted or absent
- **THEN** execution refuses before candidate-controlled code runs, while an unchanged supported historical record still verifies under its original identity

### Requirement: Composition uses explicit provider facades

Root grammar composition SHALL import only the designated provider grammar facades. Runtime dispatch SHALL import only the designated runtime facades. Other root files SHALL NOT acquire these allowances; private/deep provider imports and unrelated product imports SHALL remain prohibited by the effective lint policy.

#### Scenario: Composition allowances do not expose provider internals

- **WHEN** controlled files import an approved facade, a provider-private path, a runtime from the grammar consumer, or a facade from an unapproved neighboring file
- **THEN** only the approved consumer/facade combinations pass the actual production lint policy, without parser errors concealing a boundary failure

### Requirement: Burokrat typed execution preserves the verified process boundary

Ordinary installed Burokrat operations SHALL verify the package and toolkit before starting a Bun validator child from the hashed validator role. A versioned transport SHALL validate an installed-validator-only request once, reject unknown fields and source-only operations, and invoke typed handlers without calling an argv parser. The child SHALL run outside the candidate with explicit trusted environment and dependency closure, preserving caller-relative host paths and repository-relative selectors. Lint SHALL retain external activation selection and the verified immutable validator snapshot; direct installed-validator dispatch SHALL NOT replace that authority path.

#### Scenario: Typed requests do not bypass toolkit authority or reparse argv

- **WHEN** a valid installed request reaches the verified child while its argv adapter is deliberately broken
- **THEN** the typed operation succeeds with its original output and verdict status, while a malformed transport, source-only request or missing/tampered toolkit fails before operation input access

#### Scenario: Candidate startup settings cannot execute in the trusted child

- **WHEN** the candidate supplies hostile Bun configuration, env files, preload options or dependency overrides and the caller uses relative paths
- **THEN** no candidate startup code runs, the verified closure remains selected, caller-relative inputs retain their meaning, and repository-relative selectors remain anchored to the selected candidate
