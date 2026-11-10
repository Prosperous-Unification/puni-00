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

#### Scenario: Typed operations return their own status

- **WHEN** reusable Dash operations succeed, return a modeled nonzero status, or run sequentially or overlap in one process
- **THEN** each returns its numeric status only after its work settles, without reading or writing the executable's global exit status; a later success returns0 independently from an earlier failure, and only the executable assigns its exit code

### Requirement: An installed artifact contains the client operations

Every first-party operation exposed by current client instructions, generated helpers or a shipped executable SHALL run under its PUNI namespace from the installed artifact without a checkout, Bash, shell script or Node executable. Required external utilities SHALL be explicit prerequisites. Public help SHALL expose the installed Burokrat grammar rather than source-only commands.

#### Scenario: Installation works without the repository or shell runtimes

- **WHEN** the packaged artifact runs from a path containing spaces with no source checkout, Bash or Node on PATH
- **THEN** its help, completion and representative file/state operations succeed with Bun and their declared utilities, and a missing required utility refuses visibly

### Requirement: MCP helpers preserve installed invocation and startup obligations

The MCP token command SHALL use the same protected startup as the installed entrypoint, load only its required execution modules and retain the existing 10-second helper budget. Pool import SHALL generate an installed `puni dash mcp token` invocation, using canonical `dash` even when import used `d`, preserving argument boundaries and existing secret handling.

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

### Requirement: Initial startup excludes candidate-controlled Bun hooks

The installed entrypoint and every generated helper SHALL remove the declared Bun startup controls before the Bun runtime interprets application code and SHALL disable candidate config and dotenv autoload. Helpers SHALL use the selected Bun executable with the shared sanitizer and canonical namespace; they SHALL NOT bypass executable shebang protection through a bare Bun-plus-entrypoint invocation. The OS env utility, an absolute selected Bun path without an equals sign, and supported invocation behavior SHALL be explicit installation prerequisites, with visible refusal when unavailable. Compilation alone SHALL NOT be treated as startup isolation.

#### Scenario: Startup hooks cannot precede PUNI code

- **WHEN** an installed invocation or generated helper starts inside a candidate with preload config, dotenv and hostile startup controls, including BUN_INSPECT_PRELOAD
- **THEN** no candidate preload runs and no candidate dotenv contaminates the application, while installed paths, selected Bun paths and operand paths containing spaces retain their boundaries

### Requirement: Installed Burokrat has an explicit external runtime and Git trust boundary

Ordinary validator execution SHALL require a verified, physically external installation, executed role and dependency closure relative to the selected candidate. A symlink SHALL NOT establish external placement. Installation and operator-owned Git metadata, including worktree/common and included configuration, SHALL remain trusted and stable throughout execution; protection against a concurrent hostile metadata writer is outside this contract.

The ordinary child SHALL use a trusted executable search path and supported Git release version at least 2.36.0 before repository operations. Plain upstream and canonical Apple/Windows vendor forms SHALL be accepted; release candidates and unknown suffixes SHALL refuse. Its explicit environment SHALL exclude ambient global/system Git configuration, disable hooks and fsmonitor, replacement objects, interactive prompts and remote transport protocols. The shared working-selection boundary SHALL refuse any loaded nonempty clean/process filter definition before freezing bytes, including definitions not selected by current attributes or overridden by later empty values, rather than changing their semantics silently. Other operator environment and dependency overrides SHALL NOT reach this child. Only lint-ci SHALL receive the selected caller-anchored CI binding.

#### Scenario: Candidate-local or symlinked runtime assets refuse

- **WHEN** a candidate-local installation or an external toolkit whose executed validator resolves into the candidate is selected
- **THEN** execution refuses before candidate-controlled code or operation inputs run; a verified external installation retains its declared output and status

#### Scenario: Configured Git execution cannot run candidate programs

- **WHEN** working selection encounters loaded nonempty clean/process commands, or the repository supplies fsmonitor/index-change hooks or ambient global/system configuration
- **THEN** filters receive a named pre-freeze refusal, hooks and ambient configuration do not execute, and marker files remain absent

#### Scenario: Git prerequisites and protocol denial remain enforced

- **WHEN** Git is missing, malformed or below the supported minimum, or a missing promised object would invoke a configured remote helper
- **THEN** the operation fails visibly before unsupported Git behavior or the helper executes, without converting failure into an empty or passing observation

### Requirement: Preparation retains caller context and installed toolkit authority

Preparation SHALL consume the typed request without another argv parse. Host inputs SHALL retain the captured caller context while repository selectors and opaque identities remain unchanged. Unselected parser options SHALL preserve provider defaults. Toolkit preparation SHALL use the verified installed toolkit by default and SHALL retain its expected identity when an explicit toolkit is selected. Package/toolkit verification SHALL precede operation input reads. Returned report lines SHALL use LF separation and a final LF; asynchronous preparation SHALL complete before its status is returned. Provider refusals and existing partial-destination behavior SHALL remain visible.

#### Scenario: An explicit toolkit cannot replace installed authority

- **WHEN** toolkit preparation selects a self-consistent toolkit whose descriptor identity differs from the verified installation
- **THEN** preparation refuses with the package identity mismatch before candidate policy work, rather than accepting the selected toolkit as its own authority

#### Scenario: Preparation uses captured caller paths

- **WHEN** preparation runs with a captured caller directory different from the process directory and relative host inputs
- **THEN** it resolves those inputs against the caller, preserves repository selectors and SHA/lane/cwd identities, and retains unselected defaults

#### Scenario: Preparation output follows completed work

- **WHEN** the typed preparation operation completes with report lines
- **THEN** the caller receives those lines separated and terminated by LF, and asynchronous work completes before the returned status

### Requirement: Bun execution formats preserve historical verification

Current Bun toolkit execution SHALL use descriptor schema 2 with launcher.mjs and activation manifest schema 4 with artifacts/launcher.mjs. Supported historical toolkit schema 1 (the pre-migration five-role layout with launcher.sh and a verified trustedNodeModulesIdentity) and activation schema 3 SHALL retain original-byte/hash verification without requiring the current Bun to equal the historical build runtime. Earlier four-role or closure-unbound toolkit layouts SHALL remain unsupported without synthesizing missing authority. Historical role maps SHALL reject additional keys, including those ignored by the former permissive reader. New Bun execution SHALL refuse historical formats before launching a role, retain the current format's exact runtime pin, and reject unknown versions, extra/missing roles and mixed layouts. It SHALL NOT select an interpreter from artifact text or fall back to Bash. Schema 1 package manifests and selection descriptors, the active-v1 marker, and validator request transport v1 SHALL retain their meanings.

#### Scenario: Historical bytes verify but cannot enter Bun execution

- **WHEN** an unchanged supported historical toolkit or activation is verified using a different current Bun runtime
- **THEN** its original identity verifies, while requesting current Bun execution refuses before a launcher or validator can run

#### Scenario: Current version and fixed layout govern execution

- **WHEN** a current artifact has a mismatched Bun runtime, unknown schema, missing or extra role, mixed legacy path, altered descriptor or changed role bytes
- **THEN** verification or execution compatibility refuses at the relevant boundary before launch

### Requirement: Installed lint preserves selected authority and process ownership

Installed lint SHALL execute its verified package launcher, verify the selected activation's complete current artifact set, and execute the selected authenticated snapshotter before the captured validator. It SHALL use a separate closed version1 lint request transport with fatal UTF-8 decoding; only working, staged and committed selections SHALL parse before operation IO. Working SHALL use local observe, staged local ratchet, and committed CI with only that selection's CI binding. Snapshot and validator children SHALL retain the explicit C11 Git environment and protected Bun startup. The configured archive root SHALL supply the default closure before selecting its version, independently from the installed toolkit closure.

#### Scenario: Broken configured authority cannot become optional inactivity

- **WHEN** a configured root/selection/role/metadata/closure is unreadable, malformed, candidate-contained or a dangling symlink
- **THEN** lint refuses before role execution, with no alternate flat-root or installed-closure fallback

#### Scenario: Required admission judges the actual validator report

- **WHEN** required lint receives validator status zero with malformed UTF-8/JSON or without schema1 enforce CI-preselected accepted certified output
- **THEN** it preserves the original output bytes and returns78; a normal nonzero validator verdict retains its exact bytes and status

#### Scenario: Cancellation retains child ownership through cleanup

- **WHEN** SIGINT or SIGTERM arrives during either stage or between stages
- **THEN** the launcher forwards cancellation to the owned stage group, escalates after bounded grace or repeated cancellation, starts no next stage, and settles group ownership and outward output waits before scratch cleanup and controlled130/143 completion; unconfirmed group cleanup instead fails and retains scratch

#### Scenario: Installed cancellation is ordered before launcher work

- **WHEN** the installed parent records cancellation during launcher startup or receives repeated/mixed cancellation
- **THEN** the distinct closed --puni-lint-parent-v1 mode requires real IPC and a ready/start handshake delivering recorded controls in order through the existing broker before operation IO, preserving the first reason without native signal coalescing; the launcher reports finished only after executable settlement
- **AND** older v1-only launchers reject the distinct mode before request IO with no standalone retry, and missing IPC, unknown/duplicate controls or premature channel loss fail visibly and request child-owned cleanup; unsolicited launcher death leaves nested cleanup explicitly unconfirmed, normal status1 after cancellation is preserved, and no parent escalation competes with detached stage ownership

#### Scenario: Installed and archive launchers retain distinct existing authority

- **WHEN** a complete current activation's reviewed launcher differs from the verified installed package launcher
- **THEN** installed lint retains its package launcher and selected snapshot/validator authority without recursive execution, while archive admission retains its toolkit-release join

#### Scenario: Executable lookup remains fixed across stage directories

- **WHEN** trusted PATH contains relative or empty components and the selected snapshotter or captured validator runs from another directory
- **THEN** each component retains the executable identity selected against the physical trusted runtime directory, without lexical symlink/parent normalization; an unrepresentable anchored PATH refuses before role execution

#### Scenario: Installed provider selection cannot rebase trusted Git lookup

- **WHEN** installed preflight selects a provider toolkit using a caller-created frozen runtime, including a relative or empty original PATH component
- **THEN** both probes and the delivered launcher retain that independently selected lookup origin; candidate-local provider files cannot become Git merely by changing the selected toolkit directory, and a candidate-contained runtime cwd refuses

#### Scenario: Output failure cleans its stage and releases a stalled peer

- **WHEN** stdout or stderr fails while a lint stage is live, including when its other output consumer is stalled
- **THEN** the launcher fails, cleans the owned group and removes scratch only after confirmed absence; a later cancellation cannot replace a previously recorded output failure

#### Scenario: Cancellation releases output without claiming abandoned bytes were flushed

- **WHEN** an output consumer stalls and cancellation arrives
- **THEN** both outward API waits settle with the first cancellation reason, remaining child bytes are drained without delivery, replayed cancellation does not shorten first-signal grace, and abandoned native output is unreferenced rather than described as flushed

#### Scenario: Terminal reporting remains owned and bounded

- **WHEN** unexpected failure encounters failed, stalled or still-pending stderr, or native output release fails
- **THEN** the standalone executable returns a failure after at most one bounded diagnostic through the existing stderr operation tail, starts no diagnostic write/flush after abandonment or disposal, and invokes no automatic or alternate reporter

#### Scenario: Ordinary output completes before executable exit

- **WHEN** the validator completes normally with arbitrary binary stdout/stderr and a nonzero verdict
- **THEN** all bytes are written and flushed before the executable returns that verdict

#### Scenario: Git preflight participates in owned cancellation

- **WHEN** cancellation arrives while the required Git version or actual-worktree-root query is still running, including a child that ignores the first signal
- **THEN** the launcher forwards the signal to that probe's owned group, escalates only through its bounded owner or repeated signal, returns the first controlled130/143 after cleanup, and starts no subsequent probe or activation role

#### Scenario: Typed installed lint shares executable ownership without transport re-entry

- **WHEN** the installed root invokes a typed lint request with its independently captured lookup origin
- **THEN** the same executable owner contains runtime-construction failures, delivers native cancellation, preserves required admission and exact output/verdict status, and reaches installed execution without reading stdin or reparsing argv
- **AND** a lint-specific terminal exit follows ownership settlement; reusable provider APIs continue returning or throwing, and other namespaces retain ordinary output draining
