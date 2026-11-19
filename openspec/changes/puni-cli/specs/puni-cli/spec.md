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

#### Scenario: Typed Dash execution retains validation and lazy command ownership

- **WHEN** a caller supplies a typed Dash request independently of ambient argv
- **THEN** shared cross-option coherence refuses before operation IO, the selected release/token/pool/general handler is loaded lazily, and its numeric status returns only after completion without assigning process.exitCode
- **AND** token helpers avoid loading the heavy command graph, while generated pool helpers retain the selected protected PUNI launch followed by canonical dash/mcp/token

#### Scenario: Root execution uses captured installation and invocation context

- **WHEN** the root executes an already parsed namespace request
- **THEN** only the selected provider runtime is imported, ordinary executable lookup retains its independently captured origin, returned status waits for dispatch, and usage status follows the supplied invocation independently of ambient argv
- **AND** missing Burokrat installation assets refuse without checkout/source fallback; an absent lint PATH refuses through bounded owned reporting while an explicitly empty PATH remains valid lookup at the trusted origin

#### Scenario: Current toolkit metadata is planned without relabeling historical producers

- **WHEN** the current planner receives valid explicit PUNI release metadata and the five reviewed role byte sequences
- **THEN** it emits a canonical schema2 descriptor naming launcher.mjs, pins every role and the supplied closure identity, and emits ordered checksums for those five roles and the descriptor with a final LF
- **AND** malformed claimed metadata refuses before output, dependency arrays validate before normalization, and the legacy planner retains its original descriptor and checksum bytes without implying a completed producer switch

#### Scenario: Prepared activation self-certification retains execution authority and failure evidence

- **WHEN** a preparer supplies authenticated bootstrap bytes, native external placement, protected launch capability and its interruption owner
- **THEN** self-certification uses the existing private parent lane with a typed committed request, frozen explicit Git environment, required admission and the archive-default closure; successful certification requires all five enforce-certificate values while allowing extra report fields
- **AND** only matching recorded first cancellation returns130/143; normal1 remains a failure with complete replayed stderr, other interrupted output is labeled as a captured prefix, and unexpected decoder/transport failures retain their original context

#### Scenario: Current preparation selects source through explicit owned authority

- **WHEN** a caller supplies authenticated expected toolkit identity, captured paths and independently frozen runtime authority
- **THEN** source selection requires toolkit2 before candidate-dependent IO, checks native external placement of runtime/toolkit/descriptor/roles/closure, resolves exact full commit and HEAD equality, and requires Git-reported cleanliness through owned asynchronous Git
- **AND** configured clean/process filters and indexed submodules at every index stage refuse before status can execute them; prior and per-query cancellation preserve controlled130/143 and cleanup, while unexpected decode/spawn/cleanup failures propagate
- **AND** selection does not imply immutable capture, output reservation, preparer execution, archive certification or a producer-default change

#### Scenario: Current preparation captures selected committed bytes without live-tree substitution

- **WHEN** current preparation captures an explicitly selected full commit, including an earlier reviewed commit
- **THEN** it retains that commit/tree and all exact path/mode/blob tuples, reads each blob once through owned explicit Git, verifies actual Git content hashes and complete batch framing, and returns fresh metadata/file copies independent of caller or worktree mutations
- **AND** noncanonical/duplicate/file-ancestor paths, gitlinks, absent/substituted objects and malformed/extra batch bytes refuse; cancellation settles owned queries before returning controlled130/143 without parsing partial output
- **AND** capture does not imply physical materialization, valid native symlink/collision placement, completed preparation or producer cutover

#### Scenario: Current preparation materializes captured source without altering authority or hiding partial output

- **WHEN** captured source is materialized under caller-established preparation authority
- **THEN** the existing output parent resolves natively, a fresh private root refuses existing state, candidate/toolkit/runtime/native closure and authority targets stay protected, metadata names refuse, and exclusive directory/file/link creation prevents merging or overwrite
- **AND** exact regular bytes/modes and awaited descriptor closure precede link creation, preserved link targets must resolve natively inside the root before success, and failures retain original causes plus any owned partial root
- **AND** recorded cancellation stops later stages and remains controlled after release, while operation/close/release failures remain errors; no dependency/build/preparer/archive completion is inferred

#### Scenario: Current toolkit preparation assembles and certifies before publishing an archive

- **WHEN** an internal current toolkit preparation receives authenticated installed identity, explicit runtime authority and operator review/check inputs
- **THEN** it captures exact candidate and reviewed commits through owned Git, derives plans from regular captured source/Nx bytes, and refuses nonregular operator/check-record files without blocking on FIFOs
- **AND** native check-run directory selection preserves symlink-parent semantics, required runtime state refuses before output reservation, and fresh native-external work and activation roots are mutually disjoint
- **AND** the written activation uses schema4 and the selected Bun bootstrap/closure, whose actual bytes are checked before full enforce self-certification with required admission and archive-default closure
- **AND** only successful certification permits an exclusive PUNI archive; GNU tar, archive writes and descriptor close settle before its digest and success report, while faults preserve causes and owned partial outputs and cancellation returns no success instructions
- **AND** these internal paths do not imply usable released preparer roles, a public package or coordinated default cutover

#### Scenario: Current relocation uses verified lineage and selected source roles

- **WHEN** internal relocation receives a verified schema3/4 base and an authenticated current toolkit
- **THEN** every consumed base member is admitted as a native regular contained external file before full verification, and historical executable roles never execute
- **AND** new launcher, validator and snapshotter bytes derive from the captured candidate using only authenticated copied build dependencies and bounded captured configuration, preserving effective runtime transforms and import/require conditions
- **AND** macros, uncaptured source, unsupported opaque loaders, vendor imports into candidate source and external configuration roots refuse before a usable build, while sealed resolution/loading rejects unplanned requests
- **AND** the narrow pinned compiler preparation transform denies language-service plugin loading before resolution and delivers verified license/modification notices in the actual archive without modifying installed or historical compiler identities
- **AND** shared activation4 assembly requires full self-certification before archive reservation, interrupted in-process builds settle before returning, first cancellation remains controlled after release, and failures preserve original/aggregate causes and owned roots

#### Scenario: Current preparation entries share typed execution and own their lifetime

- **WHEN** either current preparation role receives its closed versioned invocation
- **THEN** malformed UTF8/JSON, unknown fields, invalid invocation context and command/role mismatch refuse before operation IO without retaining request secrets
- **AND** it dispatches the typed request without argv reconstruction under a signal/output/report owner that covers input, runtime/package selection, Git, in-process builds and archive settlement
- **AND** input cancellation settles, first interruption controls cancellation, original and cleanup failures retain their diagnostics and owned outputs, and the executable exits only after owner settlement
- **AND** usable five-role assets derive from one captured source and explicit verified dependencies, with compiler notices on both activation paths; no public/default cutover or release provenance is inferred from internal asset assembly

#### Scenario: Internal asset delivery binds independent installation and every written artifact

- **WHEN** the internal producer builds a current toolkit from one committed capture and an explicitly trusted stable operator installation
- **THEN** captured authority-file identities, the fixed selected dependency bytes and both copied closures must match; source, runtime, native installation/closure and authority targets remain protected by fresh disjoint output roots
- **AND** every emitted role, notice, descriptor and checksum is read back as regular planned bytes before final descriptor-identity verification; cancellation stops before later delivery or verification and failure retains all owned roots
- **AND** both actual produced preparers can complete current archive workflows, while public package/default cutover and clean-release admission remain separate requirements

#### Scenario: Historical current0.3 execution retains its distinct PUNI package profile

- **WHEN** the explicit historical0.3 PUNI profile executes ordinary Burokrat, selected lint or either preparation command
- **THEN** it requires the closed schema1 PUNI0.3.0 package profile and toolkit2, verifies the descriptor digest, and requires package/descriptor source revision and `puni-v0.3.0` tag agreement before operation inputs or executable roles
- **AND** historical0.2.1 package bytes and verification remain explicit independent paths, without a version-union fallback or a clean-release inference
- **AND** native installation selection precedes deriving the toolkit child, every verified role/closure obeys physical placement, and independently frozen caller runtime authority is retained

#### Scenario: Current root preparation settles bounded ownership before terminal exit

- **WHEN** either preparation command executes through the actual PUNI root, including absent PATH, closed/full stderr or unconfirmed child cleanup
- **THEN** its typed operation enters the existing signal/output owner before ordinary runtime admission, preserves owned roots and exact status, and the executable exits only after that owner settles
- **AND** ordinary commands continue to drain, while reusable entrypoints return completion without terminating their caller

#### Scenario: One captured package session delivers all current programs and Dash text assets

- **WHEN** the package producer builds one explicit committed source capture using an independently admitted stable installation
- **THEN** the PUNI root, five toolkit roles and separate pure observation service share one sealed dependency/compiler session and captured program bytes, without a live-source append or runtime source lookup
- **AND** the twelve SQL files and two unit templates replace only the fixed reviewed direct reads with captured regular valid-UTF8 strings, preserving BOM, CRLF, Unicode, exact SQL hashes and rendered template output
- **AND** missing/duplicate/extra reads, changed encodings, shadowed bindings and imports/loaders outside those two modules' fixed direct-read/import contract refuse; this is not arbitrary JavaScript effect isolation
- **AND** stable virtual module names preserve native filename characters and avoid global emitted-string normalization that could alter embedded asset values

#### Scenario: Local Bun packing preserves installed programs closure and package metadata

- **WHEN** Bun packs and installs the current local artifact into a spaced path outside its source/build checkout
- **THEN** its sole bin is `puni`, metadata contains no install hooks, documentation comes from the same capture, and `dist/puni.mjs` has the current manifest and toolkit child beside it
- **AND** every program, notice, checksum, manifest and documentation write is read back before success; interruption or failure retains owned package/work roots and original cleanup diagnostics
- **AND** installed discovery and representative Navigator, Burokrat and Dash storage operations work with Bun and declared utilities under poisoned candidate startup settings; the observation service retains its independent authority boundary
- **AND** registry publication authority, remaining script-backed client conversion and coordinated default/bootstrap/CI cutover remain separately required work

#### Scenario: Installed policy binds the emitted validator while snapshots retain original input identity

- **WHEN** direct installed policy lint or activation validation runs through a current producer-marked standalone validator
- **THEN** runtime identity uses that actual installed validator file, including its native path and bytes; omitted, changed or unrelated same-bytes references refuse
- **AND** a snapshot's authenticated original artifact manifest takes precedence over standalone output identity, preserving the original reference spelling and hash without inlining a union/source manifest into the base bundle
- **AND** unmarked source execution retains its existing source closure, the standalone marker is producer-defined only for validator roles, and both root and standalone preparation workflows retain real full semantic certification before archive creation

### Requirement: Installed push audit retains archive compatibility and required certification

The installed command `puni burokrat audit-push REPOSITORY REVISION` SHALL parse one typed request through `burokrat`, `bur` and `b` without operation IO. Execution SHALL share the current installed lint owner, preflight, verified launcher and selected snapshotter/captured-validator path; it SHALL NOT reparse public argv, invoke the public lint operation recursively, discover a checkout or fall back to a legacy runtime. Current installation/toolkit integrity, supported Git, actual candidate and external placement checks SHALL precede any inactive outcome.

Only an undefined or empty activation setting SHALL produce status 0 with the existing push report's schemaVersion 1, status inactive, certified false and reason `external activation marker is not provisioned`, followed by LF. Every nonempty configured activation SHALL be required: missing, unreadable, malformed or mismatched authority refuses 78. The operation SHALL force complete enforce certification for the committed selection; a false or invalid caller `TOOL_WIKI_REQUIRE_CERTIFIED` value SHALL NOT disable that obligation. Normal nonzero validator statuses and original output bytes SHALL remain unchanged.

A configured audit SHALL read `toolkit-release` from the physically verified configured archive root beside `selected.json`, not the selected version directory. It SHALL require a readable regular file physically contained in that external root and the complete exact UTF-8 record `TAG DIGEST` plus one LF, where TAG and DIGEST are the verified installed current toolkit's tag and descriptor digest. Missing final LF, extra records, altered identities and candidate/outside-root symlink targets SHALL refuse78 before snapshotter or validator execution. This compatibility assertion SHALL NOT replace current activation 4 selection/artifact verification or configured archive closure validation, nor authorize fallback to the installed closure.

#### Scenario: Every Burokrat spelling selects the same audit operation

- **WHEN** each of `puni burokrat`, `puni bur` and `puni b` parses `audit-push /absent/candidate HEAD`
- **THEN** it returns the same audit-push repository/revision request without loading a runtime or reading operands

#### Scenario: Optional absence follows installed preflight

- **WHEN** installation, Git, actual candidate and placement preflight succeeds and activation is undefined or empty
- **THEN** audit returns the explicit non-certifying inactive report and starts no activation role
- **AND** failed preflight remains failure even when activation is absent

#### Scenario: Configured authority cannot degrade into inactivity

- **WHEN** a nonempty activation path is missing or its marker, selection, release record, artifact set or closure cannot be verified
- **THEN** audit refuses 78 rather than returning an inactive success or selecting another profile

#### Scenario: The archive root binds the verified installed toolkit

- **WHEN** the configured root's release record exactly names the verified installed current toolkit with one final LF
- **THEN** audit retains current activation 4 and selected-archive closure verification before its authenticated roles
- **AND WHEN** the record instead exists only below the selected version, lacks LF, has trailing records, mismatches tag/digest or resolves outside that configured root
- **THEN** audit refuses 78 before either role executes

#### Scenario: Configured zero status requires a complete enforce certificate

- **WHEN** configured committed audit's captured validator returns zero without the complete existing enforce certificate
- **THEN** audit refuses 78 even if caller configuration tries to disable required certification
- **AND WHEN** the validator returns a normal nonzero verdict
- **THEN** its exact status and output are retained through existing owned settlement

### Requirement: Repository lint callers use an explicitly selected delivered PUNI main

Current Nx and staged-hook Tool Wiki lint callers SHALL use a Bun adapter with the shared protected initial startup controls. The adapter SHALL require an absolute `PUNI_EXECUTABLE` selecting a separately provisioned reviewed current PUNI entrypoint; it SHALL NOT select a default registry coordinate, search PATH for PUNI, import a checkout provider runtime as fallback, or change activation availability semantics.

The delivered ESM entrypoint SHALL export callable `main(args, context)` and importing it SHALL NOT dispatch ambient argv. Before its first import await, the adapter SHALL capture original operands, actual selected entrypoint/directory, caller cwd, Bun runtime, temporary directory, explicit lookup PATH/environment and native byte-output functions. It SHALL invoke `['bur','lint',...operands]` in the same process. The root SHALL retain its installed-toolkit, placement, activation and native-lifetime ownership; the adapter SHALL NOT add a child process or competing escalation policy. Returned completion SHALL contain `kind:'drain'|'exit'` and integer `status` in0..255; the caller SHALL honor drain versus terminal exit. Missing selection, an unreadable installation, unusable main export or malformed completion SHALL reject the reusable adapter call without a source fallback. Its executable failure boundary SHALL make one shared bounded terminal diagnostic attempt and exit1 even when failed imported code retains a timer. Diagnostic abandonment SHALL remain failure; terminating this executable SHALL NOT be described as arbitrary module-resource cleanup or native flush.

#### Scenario: A delivered import preserves the real lint outcome

- **WHEN** a source-built current installed fixture is imported while ambient argv requests another root operation, then its main is called with a valid lint request
- **THEN** import performs no ambient dispatch and the real installed lint chain retains exact binary stdout/stderr, verdict and terminal completion

#### Scenario: The actual Nx caller delegates without Bash or Node

- **WHEN** the uncached whole-workspace Nx vector runs under protected Bun startup with an explicit valid external PUNI selection
- **THEN** it forwards working/repository/HEAD through the installed bur lint route without executing Bash or Node, and the staged hook forwards staged/repository/HEAD through the same adapter

#### Scenario: An unusable delivered contract cannot become success

- **WHEN** selection is missing or relative, the selected module has no callable main, or main returns an invalid completion
- **THEN** the caller fails with an operator provisioning instruction and never invokes a source/provider fallback

#### Scenario: Import-time global changes do not replace caller context

- **WHEN** a controlled delivered module changes cwd, argv and environment while its import is awaited
- **THEN** main receives the original explicit operands and captured caller paths/environment

These local controls do not establish native cancellation during module import, complete packaged client-operation coverage, a public registry/default pin, CI reactivation or deployment activation. Those existing whole-change obligations remain open.

#### Scenario: Failed delivered code cannot retain the caller through a timer

- **WHEN** a selected controlled module retains a timer then throws during import or returns an invalid completion
- **THEN** the ready witness is reached and the executable attempts its bounded diagnostic before normal exit1, rather than waiting for the outer timeout; unrelated native resources are not claimed cleaned

### Requirement: Explicit local PUNI artifact installation

The installed PUNI surface SHALL expose `puni dash install-puni ARCHIVE --sha256 SHA256 --destination DIRECTORY` and its existing `d` namespace alias as one typed Optique operation. ARCHIVE SHALL name an explicit local PUNI package archive and SHA256 SHALL be a caller-supplied independent expected byte identity, not a digest recovered from that archive, an unverified sidecar or a registry default. Supplied digest agreement SHALL NOT itself be called release provenance or registry ownership. Cold start MAY use the external Bun package manager with an already authenticated local artifact; no owned standalone bootstrap script or self-update route is introduced.

The operation SHALL capture its request, caller and runtime authority before asynchronous work. It SHALL retain and authenticate regular archive bytes once and install the same protected owned copy, without reopening the original pathname for installation. Destination SHALL be fresh and native-external to the full real caller repository, controlling PUNI installation, selected runtime and archive authority. Occupied targets, including symlinks, SHALL refuse without installing over them. Missing/unreadable/nonregular inputs, unknown tool or custody state SHALL fail rather than default. The initial client purpose is invoked from an actual consumer Git repository; outside-repository cold start remains the external Bun operation.

Bun package installation SHALL use protected startup, a fresh private environment/home/cache and disabled lifecycle scripts. Only the current fixed PUNI profile is supported, without registry/dependency resolution or an arbitrary-package framework. The installed package, delivered main and current toolkit/role/closure/profile joins SHALL be verified before success. No source-provider or candidate-nominated executable fallback is permitted. Child and output ownership SHALL settle before terminal completion; partial owned output and original/cleanup failures SHALL remain visible. First controlled cancellation SHALL retain130/143; unresolved native custody SHALL never become success or automatic deletion.

Successful stdout SHALL contain exactly one LF-terminated JSON object `{schemaVersion:1,archiveSha256:SHA256,entrypoint:ABSOLUTE_NATIVE_PATH}`. The entrypoint SHALL resolve inside the new destination and be usable as an explicit `PUNI_EXECUTABLE`; no shell-eval/export program or global default is emitted. The operation SHALL leave the controlling installation and input archive unchanged. Digest mismatch SHALL return78 with empty stdout and `puni install-puni: archive digest mismatch` plus LF; an occupied destination SHALL return78 with empty stdout and `puni install-puni: destination already exists` plus LF. Other unexpected failures remain nonzero and retain their causes.

The `install-puni` grammar SHALL be exposed by composed PUNI Dash help/request parsing only. The legacy standalone Dash parser/help/runtime SHALL retain its existing supported surface without advertising an unimplemented operation. Before invoking Bun installation, authenticated package metadata SHALL be admitted as dependency-free/hook-free current PUNI metadata; post-install verification alone SHALL NOT justify no-registry or no-lifecycle claims. Successful output SHALL use exactly `JSON.stringify({schemaVersion:1,archiveSha256,entrypoint})` in that field order plus LF, with entrypoint equal to its native canonical spelling.

#### Scenario: Real local artifact provisions an external client

- **GIVEN** the existing local producer built, packed and independently installed the actual current package, and the operator supplied that local archive's expected digest
- **WHEN** the installed `dash install-puni` operation receives a fresh spaced external destination
- **THEN** it returns only the closed selection after validating the new installation, and the actual repository Nx caller can select its delivered entrypoint with no Bash/Node or source-provider fallback
- **AND** optional inactive lint remains inactive rather than certified; public pin/default/CI/activation and all configured semantic certification remain separate

#### Scenario: Explicit bytes and freshness refuse before installation

- **WHEN** the supplied digest differs or the selected destination already exists
- **THEN** the modeled78 diagnostic is returned without a selection; digest rejection creates no destination, and destination reuse preserves the previously delivered entrypoint bytes
- **AND** these ordinary controls receive no R5 necessity credit until the actual local checks are separately removed or their production dependencies broken and observed

### Requirement: Development ports execute as a closed PUNI Dash operation

PUNI SHALL expose `dash dev-ports <resolve|check|release> --repository DIRECTORY [--apps-dir DIRECTORY] [TIER:PORT ...]`, including the existing `d` alias, through its typed root grammar. Standalone legacy Dash SHALL remain unchanged. The operation SHALL use the explicit repository and captured caller/environment authority, never infer a client checkout from its installed artifact directory or require installation/Git verification for a local port query. Production SHALL run in Bun without invoking an owned shell script or arbitrary command operand.

#### Scenario: Current configured ports resolve visibly

- **WHEN** resolve addresses a repository, optionally an explicit apps directory
- **THEN** it reads the last decimal `PORT=` line of each backend/gateway/MCP `.env`, defaults the apps root to `apps/wbs`, uses captured frontend `PORT` or4200 when empty/unset, and prints tier:port lines; a missing/no-PORT tier is visibly omitted, while an unreadable environment file refuses

#### Scenario: Resolution precedes an IPv4 check

- **WHEN** check selects explicit pairs, otherwise present WBS_DEV_PORTS, otherwise configured ports
- **THEN** a present-empty override is visibly empty; resolution failure prevents probes; a127.0.0.1 listener produces refusal1 and remains alive, while a refused connection alone is the observed unserved result; unknown probe failures refuse rather than certify a free port
- **AND** malformed/out-of-range operation pairs return2, structural grammar refusal retains Dash's ordinary usage1, and IPv6-only listeners are outside this observation

#### Scenario: Explicit release keeps foreign holders alive

- **WHEN** release encounters a served port
- **THEN** required lsof inspection must retain a named listener and actual readable cwd within the selected repository, foreign/unreadable/unnameable holders or a changed selected listener PID refuse without signaling them, fixed lsof discovery selects the probed IPv4 loopback or wildcard listener, TERM precedes up to50 polling waits of100ms, and a still-serving same owner is requalified before KILL followed by up to50 further waits
- **AND** socket absence rather than a successful signal decides release; a still-served port refuses, and unknown native inspection errors are not success; fixed inspection uses a10s SIGKILL timeout and finite1MiB output cap, without claiming atomic PID-generation authority

#### Scenario: Client callers share the embedded operation

- **WHEN** current development callers are converted
- **THEN** package scripts and the actual pre-Nx start path select this embedded implementation using their retained checkout, and refuse before Nx on a busy port or unreadable environment; there is no shell implementation fallback

### Requirement: Repository development-port callers retain explicit delivered selection

The repository development-port adapter SHALL select only absolute PUNI_EXECUTABLE supplied by the operator and invoke that delivered module's callable main export in the same Bun process. It SHALL capture its own checkout, independent caller cwd, arguments, environment including present-empty WBS_DEV_PORTS, runtime, output functions and native diagnostic factories before import. The closed vector SHALL select dash dev-ports with the retained repository; installation dirname SHALL NOT supply repository authority. No PATH/source fallback, arbitrary command prefix, extra child or competing signal owner is permitted.

#### Scenario: Real package aliases select embedded check and release

- **WHEN** dev:ports or dev:kill runs through Bun's explicit internal package-script shell with a provisioned selected PUNI
- **THEN** it invokes the embedded check or release purpose, retains an explicitly empty override, and executes no owned Bash development-port implementation

#### Scenario: Invalid selection or ABI refuses visibly

- **WHEN** the selection is absent, nonabsolute, unreadable, missing, noncallable or returns a completion without a valid drain/exit kind and integer status0–255
- **THEN** reusable invocation rejects; the executable attempts one bounded diagnostic through native factories captured before import and terminates1, including when failed module code retains a timer
- **AND** this does not promise arbitrary imported-resource cleanup or flush of an abandoned sink

#### Scenario: Completion remains owned by the root

- **WHEN** delivered main completes normally
- **THEN** the adapter preserves binary stdout/stderr and the returned status, terminates for exit completion only after main settles, and otherwise drains; failures remain distinct from ordinary completion

### Requirement: PUNI owns the complete foreground development purpose

PUNI SHALL expose root-only `dash dev --repository DIRECTORY [--local-solver]`, including `d`, through typed Optique composition. Standalone legacy Dash SHALL remain unchanged. One REQUIRED PUNI-root-supplied port preflight SHALL run under the already-created Dash control owner before a native Nx launch. The provider SHALL NOT import PUNI, default the callback or invoke an owned shell/Node script. The addressed workspace's installed local Nx SHALL receive one fixed four-project run-many vector through Bun, without registry or PATH Node fallback.

Reusable main SHALL return terminal Completion rather than replace/exit its caller. The owned Bun parent PID intentionally differs from legacy Bash exec; native signals, terminal failure, stdin and output ownership remain required. Unified dev parse/usage failures SHALL use existing Dash status1, explicitly differing from legacy Bash status2. Runtime Nx failures SHALL retain their actual status after required native/IO settlement.

Nonempty WBS_DEV_LOG SHALL resolve relative to the captured caller cwd and select capture; absent/empty SHALL retain default mode. Capture SHALL use one physical merged stdout/stderr channel before the terminal/file split. It SHALL preserve terminal bytes, strip only the legacy CSI pattern across native chunks for the file, preserve other binary/UTF8/OSC bytes, and preserve legacy awk final-record LF normalization. Two independent pipe readers SHALL NOT be claimed to retain identical native cross-stream order. Capture, EOF and native exit SHALL settle separately before success; operation, delivery and cleanup failure causes SHALL remain visible.

#### Scenario: Default and local-solver retain the complete development vector

- **WHEN** a valid addressed workspace runs either mode
- **THEN** one owned local Bun Nx child receives run-many with all four namespaced projects and target serve or serve-local-solver
- **AND** separate actual Nx graph checks establish real target resolution rather than borrowing controlled dependency-fixture evidence

#### Scenario: Port admission prevents a supervisor launch

- **WHEN** the actual configured IPv4 port is serving
- **THEN** the required existing preflight names its tier/port and refuses before any Nx child starts, leaving that listener alive

#### Scenario: Capture drains a failed child before returning

- **WHEN** Nx emits both streams with split CSI and exits nonzero
- **THEN** terminal bytes are unchanged, the file contains the stripped line copy including final output, and the command retains failure only after native status, stream EOF and capture close settlement

#### Scenario: Native control or capture failure keeps one owner

- **WHEN** native interruption or a capture delivery/close failure occurs
- **THEN** one current child/session recipient is signalled with bounded escalation as required, native/IO joins precede retirement, and primary plus cleanup causes remain reported

#### Scenario: Client conversion does not leave an owned shell wrapper

- **WHEN** the real package aliases, dev container and installed client operation are qualified for cutover
- **THEN** they share the embedded Bun purpose with explicit installation selection and tested foreground/signal behavior, rather than wrapping old dev.sh or silently assuming provisioning

### Requirement: Development executable IO is explicit and settled

The actual PUNI executable SHALL supply a lazy development-only IO capability captured before dispatch awaits. Its default native path SHALL inherit the explicit standard descriptors, preserving child terminal flags and input. Captured mode SHALL await its native sink write and flush before terminal exit, retaining the one physical child merge. Ownership SHALL NOT be inferred from installation paths or ambient terminal detection. Existing Context.stdout/stderr callback signatures SHALL remain unchanged; reusable main without this capability SHALL return Completion and leave caller global exit state untouched.

One actual JobControl SHALL supply child control and output cancellation. A cancelled output outcome SHALL NOT authorize capture writes or a flush claim; 129/130/143 and interruption provenance SHALL come from the actual control observation, not a mapped output transport signal. Required root preflight diagnostics SHALL be queued and settled under that owner before launch or refusal. Native output failures SHALL wake peer API waits and owned termination deadlines. Original failures, reporting loss and teardown failures SHALL remain retained, including thrown primitives. Only an already-attempted matching native development diagnostic may suppress the root's duplicate generic callback writer; unrelated command/error paths SHALL remain unchanged.

#### Scenario: Captured executable bytes survive a slow consumer

- **WHEN** the actual source or installed root captures a finite binary producer while its outward consumer reads slowly
- **THEN** native/status/producer observations complete and the full terminal and stripped file match their exact expected lengths and digests before success

#### Scenario: Default executable keeps actual TTY input and one control route

- **WHEN** a Root-owned PTY invokes actual PUNI development with the known input line and one Ctrl-C
- **THEN** the controlled child observes all three terminal descriptors, the exact line and one forwarded signal, while Root's controlled130 remains distinct from the child's normal0 handler exit

#### Scenario: Reusable invocation is not an executable replacement

- **WHEN** an existing callback caller awaits main without the executable IO capability
- **THEN** main returns its Completion, preserves caller global exit state and delivers the exact callback bytes

### Requirement: Repository development callers select delivered PUNI coherently

The actual dev and dev:local-solver package aliases SHALL use a fixed-purpose Bun projection to delivered main with the closed dash/dev vector and retained physical checkout. It SHALL capture independent caller cwd/environment/runtime/output functions and lazy native executable-IO factories before import, preserve present-empty overrides, and supply the existing explicit IO capability. PUNI SHALL remain the sole preflight/process/signal/capture owner; the projection SHALL NOT invoke old shell, add a child/broker or copy supervisor logic. Absolute externally selected PUNI_EXECUTABLE SHALL be required with no source/PATH/registry fallback. Reusable projection SHALL return valid Completion or preserve a thrown failure; its executable SHALL honor exit/drain and make bounded terminal failure reporting from captured factories.

Package-default conversion SHALL co-land dev-image/Compose startup with protected Bun internal-shell vectors and explicit external whole-installation delivery. Compose SHALL require an absolute operator-owned host installation directory and mapped absolute container entrypoint, mount the complete installation read-only, and refuse implicit host-path creation. Selection presence SHALL NOT be described as authentication or public/default certification. Existing source/data/solver mounts, four continuous Nx tiers and MCP prepare to backend prepare-mcp-document dependencies SHALL remain. Historical shell/runner evidence SHALL remain until its remaining consumers and owning controls are migrated.

#### Scenario: Package callers retain the complete development vector

- **WHEN** actual dev or dev:local-solver script bytes run through an explicitly selected delivered main
- **THEN** no owned Bash executes, the local Nx receives the exact four-project serve or serve-local-solver vector once, and its status and default/captured bytes remain owned

#### Scenario: Missing delivered selection refuses before development effects

- **WHEN** the repository projection lacks a usable absolute PUNI selection
- **THEN** it gives an operator instruction and refuses without selecting a checkout/PATH substitute or launching Nx

#### Scenario: Source-development container requires external artifact delivery

- **WHEN** the image/Compose startup is configured for the converted package default
- **THEN** both operator installation inputs are mandatory and the complete reviewed installation is mounted read-only with its mapped entrypoint explicitly selected


### Requirement: Forge retains an independently selected complete PUNI installation

The explicit local install purpose SHALL retain its current schema1 stdout unchanged and, only after successful owned install, delivered-main probe and archive/package verification, write canonical puni-selection.json inside its fresh destination. The closed record SHALL name schemaVersion1, the canonical absolute installationDirectory, relative retained archive path and SHA256, and the relative delivered entrypoint. It SHALL be JSON with two-space indentation and one LF, written without replacing an existing file. Producing a digest beside these bytes SHALL NOT itself authenticate them.

Current Forge up SHALL require an absolute --puni-selection record and independently expected --puni-selection-sha256. Bounded regular-record acquisition and exact digest SHALL precede decoding. Verification SHALL admit raw archive members before normalized decoding, require exact current dependency-free metadata, compare the complete authenticated payload membership and bytes with the retained archive, require only the additional Bun-generated root .bun-tag regular file with its exact retained-archive SHA512 SRI, and verify the current installed profile. There SHALL be no registry, PATH, checkout or historical-profile fallback. The retained observation SHALL be checked again before admission, Pod creation and each supervisor launch. Repeated observations do not freeze files against an independently trusted host writer.

#### Scenario: Provisioner record follows actual successful installation

- **WHEN** the explicit local archive installs and its selected delivered-main probe succeeds
- **THEN** the canonical record names exactly that owned directory, retained archive SHA and native entrypoint, while the existing stdout schema and bytes remain unchanged

#### Scenario: Explicit installation mapping is owned by a new lab record

- **WHEN** lab creation receives --puni-installation-root
- **THEN** it records schema2 with the observed canonical root identity, includes the read-only native node mapping in its creation plan and binds the whole selected installation read-only at /opt/puni-dev
- **AND** historical lab schema1 stays separately decodable, but cannot authorize current Forge up or imply a missing installation mapping

#### Scenario: Installation admission is separate from worktree admission

- **WHEN** an environment claims, releases or restores one selected installation
- **THEN** the closed current ConfigMap retains installation owners and exact delimiter-safe installation roots separately from worktree roots, without dropping another environment's claim
- **AND** only those exact installation directories are admitted; their mounts are read-only for ordinary, init and ephemeral containers

#### Scenario: Forge owns the selected PUNI parent through restart

- **WHEN** a restart input changes or an actual stop arrives
- **THEN** Forge signals the PUNI parent, permits its existing native child/session owner to settle, and admits no successor until a normal signal-derived parent completion is confirmed
- **AND** a transport failure, hard escalation or unconfirmed native stop reports failure and forbids the successor; Forge does not infer detached Nx custody from the PUNI process-group absence

#### Scenario: Historical startup evidence stays frozen

- **WHEN** current PUNI startup is qualified
- **THEN** the historical source-cold-v1 decoder and its captured bytes remain unchanged; a distinct current source profile/producer and actual mounted runtime observations are required before current certification or shell retirement


### Requirement: Installed Forge supervision has a shipped closed runtime

The PUNI-only typed operation SHALL be `puni dash|d dev-env supervise --repository DIRECTORY --termination-log PATH`. Both placements SHALL be explicit absolute paths. Legacy standalone Dash SHALL retain its original grammar. The executable SHALL report terminal completion only after the supervisor owner settles; reusable main SHALL return Completion without exiting its caller.

The captured package producer SHALL emit `dist/forge-supervisor.mjs` in the same sealed source/dependency session as the PUNI root and toolkit. Its sibling `forge-supervisor.json` SHALL contain exactly format `puni-forge-runtime`, version1, entrypoint `forge-supervisor.mjs`, its SHA256 and the captured sourceRevision. The selected archive/payload verification SHALL authenticate the complete runtime before loading it and before any successor. The revision SHALL agree with the current package manifest. The executing root SHALL be the independently selected delivered entrypoint. The installed operation SHALL NOT compile or locate unshipped checkout TypeScript or fall back to source execution.

The closed core SHALL retain the Linux Bun/native executable mappings and refuse missing, unreadable, replaced or newly required unknown native edges. Its bundled JavaScript, explicit selected archive/package data and target worktree are distinct owners: the former is hash-bound to the selected installation, the archive/package is reverified, and the worktree uses the retained restart-input contract. Repeated reads require a stable trusted publisher and SHALL NOT be described as an atomic filesystem snapshot or arbitrary in-process sandbox.

#### Scenario: Real installed core survives checkout removal

- **GIVEN** the actual captured package has been installed outside its checkout and the producer checkout/output have been removed
- **WHEN** the selected PUNI root supervises an owned repository using the retained independently pinned selection
- **THEN** it loads only the shipped hash-bound core and preserves the real frozen-install native outcome and termination message
- **AND** absent or inconsistent core/manifest/package/native state refuses before admitting a successor

The separate source compiler API SHALL remain internal, SHALL own its actual source/bootstrap/runtime/data observations and SHALL NOT certify an installed core or serve as any client fallback. All client, Pod and advertised invocation routes SHALL select only the shipped/hash-bound runtime. No source/packed byte or sourceRevision equivalence is implied.

#### Scenario: Internal source supervision observes its actual loaded inputs

- **GIVEN** an explicitly trusted source library caller, a healthy native baseline and an actual emitted core with its SDK contribution
- **WHEN** a retained required SDK/configuration/package/native input changes after frozen install
- **THEN** the mandatory execution observation refuses a fresh development acquisition, with missing/unreadable/malformed required state throwing and changed captured state requiring reload
- **AND** the source compiler records its compiler/bootstrap/input/configuration/package observations separately from installed operation and never serves as its fallback


### Requirement: Producer admits only the closed retained Forge asset loader

The captured producer SHALL preserve generic macro, alias and opaque-load refusal. Its only Forge runtime exception SHALL authenticate the exact producer-owned loader source at its exact captured path, identify exactly one emitted ImportKeyword call in that source's AST and exempt only that node. The captured role graph SHALL establish that only the fixed puni.mjs root role reaches the loader; package mode or pathname alone SHALL NOT grant the exception. Source mismatch, additional opaque calls, aliases and other role reachability SHALL refuse before any Bun role build.

The runtime loader SHALL copy already archive-authenticated bytes, require exact computed SHA256 equality and construct only a hash-qualified JavaScript data URL from the retained copy. It SHALL NOT reopen a source pathname during import, accept a caller URL, locate a checkout or relax the caller's independent archive/manifest/native inspection. Same-byte module caching and changed-byte separation SHALL remain explicit; the SHA256 media-type parameter is not independently claimed necessary when the data URL already contains the bytes.

The producer SHALL record the audited source and emitted digests, canonical path, exclusive root role, one-import boundary and payload/cache profile as runtimeAssetLoads alongside its existing compiler transforms. The package SHALL retain the record in dist/runtime-asset-loads.json with its sourceRevision. This build observation grants no public release provenance. Genuine emitted-core execution outside the checkout SHALL qualify data-URL builtin/native/context compatibility before installed closure is claimed.

#### Scenario: Producer refuses a wider runtime-load capability

- **GIVEN** real captured source and dependency authority and a healthy actual producer baseline
- **WHEN** the audited source is changed, an extra opaque call or require alias is introduced, or another role reaches the loader
- **THEN** the actual producer refuses before any Bun role build and keeps every other generic safety check

#### Scenario: Retained bytes decide execution

- **GIVEN** an independently authenticated artifact supplies retained runtime bytes and its exact digest
- **WHEN** the runtime is loaded after its original pathname changes or disappears
- **THEN** only the retained data-URL snapshot can execute; mismatched retained bytes refuse before new module side effects
- **AND** the actual packed supervisor still reaches its real owned native outcome through the shipped core after checkout removal


### Requirement: Explicit current test-level tool source

PUNI0.4.0 SHALL require a new selected-source toolkit3, required testLevelIdentity and matching top-level sourceSelection in the package profile, installed selection record2 and test-level asset descriptor. Source selection SHALL be the closed committed{revision,tree} or working{base,identity} union. Existing sourceRevision SHALL equal revision or base respectively and SHALL be only a compatibility/display reference for working input. Historical0.2.1/profile0.3.0/toolkit1/2 and record1 byte contracts SHALL remain separately readable without relabelling old bytes.

#### Scenario: Working source cannot claim committed tool provenance

- **WHEN** a release, certification, activation or deployment consumer receives a valid new working selection
- **THEN** it refuses committed-source admission before candidate effects; a valid base commit or unchanged legacy sourceRevision does not grant it

#### Scenario: A claimed current capability has complete independent assets

- **WHEN** an actual selected0.4 installation is consumed for Browser, Performance or an ordinary current operation
- **THEN** its toolkit, profile, descriptor, worker, captured source manifest and full authenticated archive/membership agree; required assets and full sourceSelection cannot be omitted, mismatched or downgraded to record1

#### Scenario: Actual source root consumes separately authenticated installed assets

- **WHEN** explicit source composition is requested
- **THEN** the actual root main and complete current nonignored relative paths, bytes, modes and links match the produced source manifest through the existing owned Git capture before engine execution; a role flag, suffix, copied bundle or producer temporary absolute root is insufficient

#### Scenario: Explicit local provisioning supports edited tool source

- **WHEN** the uncached PUNI prerequisite prepares the four Browser/Performance Nx clients
- **THEN** actual current working bytes use the same compiler/package/install owners, retain the real base plus independent working identity without creating a source commit, and publish an explicit byte-preserving selection consumed by direct actual source-root commands; no external global PUNI, registry discovery, source forwarding runner or runtime repair of missing selection is used
- **AND** existing clean evidence-candidate checks remain; a target addressing a dirty workspace as its candidate refuses rather than weakening those checks
