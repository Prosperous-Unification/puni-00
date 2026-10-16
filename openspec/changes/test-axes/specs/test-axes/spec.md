## ADDED Requirements

### Requirement: Browser scenario observations join isolated publication and whole-tree specifications

`inspect-browser-scenarios` SHALL join the real isolated Browser levels observation to complete B3 specification evaluation before filtering the requested capability. It SHALL require exact committed revision, candidate, mode, policy and canonical upstream digest identity and explicit external scenarios authority. It SHALL preserve full nested levels and specifications reports and policy identity. Only a terminal title prefix `[SCENARIO-ID] ` SHALL cite an adopted active scenario. Missing, malformed and inactive citations SHALL remain findings with case identity and outcome; active citations for other capabilities SHALL remain visible. Every adopted requested scenario SHALL have its observed cases with original passed/failed/skipped outcomes or unobserved-in-selection. Findings SHALL emit JSON and exit one; unobserved rows alone SHALL exit zero. Refusals SHALL emit stderr without JSON. The schema-1 envelope SHALL bind the complete canonical digest, absent authentication and false certification. Candidate files SHALL never execute and supplied observation JSON SHALL not be accepted. No coverage or admission follows.

#### Scenario: [TEST-AXES-128] Browser scenarios preserve complete outcomes and unobserved rows

- **GIVEN** an isolated real Browser publication and adopted requested scenarios
- **WHEN** production joins complete B3 selection
- **THEN** all passed failed skipped observations and unobserved rows remain visible with full noncertifying identity

#### Scenario: [TEST-AXES-129] Browser scenarios diagnose only terminal active citations

- **GIVEN** missing malformed unknown retired and other-capability citations
- **WHEN** production reads terminal titles only
- **THEN** invalid citations produce findings and other active capability observations remain visible

#### Scenario: [TEST-AXES-130] Browser scenarios refuse authority and selection drift

- **GIVEN** identity digest policy isolation or whole-tree B3 disagreement
- **WHEN** production joins its real dependencies
- **THEN** it refuses by name without partial JSON

#### Scenario: [TEST-AXES-131] Browser scenarios preserve installed dispatch and canonical identity

- **GIVEN** supported and unsupported operands and the built installed executable
- **WHEN** scenario inspection runs
- **THEN** source and installed observations agree and every envelope field is digest bound

### Requirement: Browser Performance explicitly reviewed-empty membership

Version 1 Browser Performance authority SHALL retain its committed behavior and output. Version 2 SHALL require the same revision/candidate/mode/report/project-root/manifest identity and a closed `performance` disposition: `{kind:'reviewed-empty'}` or `{kind:'committed',declaration,config,project}` with the existing path/digest pins. It SHALL validate every Browser selected source and pinned manifest before membership. Reviewed-empty SHALL reject any own `test:performance` or `test:performance:level` target, and any selected entry at `<projectRoot>/performance-cases.json` or beneath that path, including malformed, symlink or directory declarations. Working-tree replacement or deletion SHALL not repair selected contradictions. Empty authority SHALL emit exactly reviewed-empty membership with complete Browser/manifest source union, preserving all report outcomes, unknown unrelated rows, absent authentication, false certification and full-envelope digest. It SHALL not claim a Performance execution or coverage result.

#### Scenario: [TEST-AXES-125] Browser Performance admits explicit reviewed-empty selected scope

- **GIVEN** exact real Browser publication and explicit v2 empty authority over a committed manifest without Performance target or declaration
- **WHEN** source and installed commands inspect selected Git bytes
- **THEN** they preserve complete report identity and outcomes and emit only reviewed-empty Performance membership with false certification

#### Scenario: [TEST-AXES-126] Browser Performance refuses contradictory empty authority

- **GIVEN** selected Performance targets or a declaration entry, malformed authority or mismatched source identity
- **WHEN** reviewed-empty authority is inspected despite working repairs
- **THEN** production refuses by name without JSON

#### Scenario: [TEST-AXES-127] Browser Performance preserves committed authority versions

- **GIVEN** equivalent v1 and explicit v2 committed authorities
- **WHEN** production inspects the entire declaration and source selection
- **THEN** committed membership remains identical and legacy output remains unchanged

### Requirement: Browser level composition joins complete real observations

`inspect-browser-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>` SHALL invoke the real Browser Memberships, Conformance, Architecture and Performance readers and accept no supplied observation JSON. It SHALL require an exact committed requested snapshot, matching revision/candidate/mode, independently correct full report and observation digests, identical complete nonempty sorted unique collection, matching project roots and manifest pins and agreeing overlapping selected-source tuples. Missing, extra or duplicate collection or source identities, missing Browser or pinned manifest source tuples, unreadable authority and inherited upstream refusals SHALL refuse without JSON. A final real Browser report read SHALL refuse any publication identity, complete collection or digest drift during composition.

The generic review SHALL contain exactly Manual reviewed-empty and Conformance/Architecture/Performance unknown. Each source adapter's unrelated memberships SHALL remain unknown. The composer SHALL preserve all four full observations and digests, all sources and all passed/failed/skipped cases. Unknown SHALL never become an empty assertion. It SHALL invoke classifyDeclaredTest using the complete admitted Browser collection and validated earlier memberships, preserving Conformance before Architecture before Performance. Only an admitted collection member with no earlier match SHALL become Browser. It SHALL emit canonical per-file bindings and typed Browser isolated or wrong-level findings. Isolated SHALL exit zero, valid wrong-level findings SHALL emit complete JSON and exit one, and refusals SHALL emit no JSON. Authentication SHALL remain absent, certification false and the full canonical observation digest SHALL bind every field except itself. No T2, coverage or admission follows.

#### Scenario: [TEST-AXES-120] Browser levels preserve complete isolated real observations

- **GIVEN** real committed Browser reports, explicit Manual empty, generic other rows unknown and disjoint earlier memberships
- **WHEN** source composition validates the complete common identity and source unions
- **THEN** every admitted file becomes Browser, complete upstream observations and outcomes remain intact, and the noncertifying observation is isolated

#### Scenario: [TEST-AXES-121] Browser levels refuse identity collection and pin substitutions

- **GIVEN** mismatched revision candidate mode report or envelope digest, incomplete duplicate or foreign collection, differing scope or manifest pins, or contradictory source tuples
- **WHEN** the production command joins the real inspectors
- **THEN** it refuses by name without JSON, including coherent dependency substitutions

#### Scenario: [TEST-AXES-122] Browser levels require explicit complete review and stable publication

- **GIVEN** unknown Manual, promoted generic or adapter unknown rows, absent unreadable authority, inherited report failure or publication drift between real reads
- **WHEN** production composition validates review and rereads publication
- **THEN** it refuses without classifying unknown state or emitting JSON

#### Scenario: [TEST-AXES-123] Browser levels preserve first-match precedence and typed isolation

- **GIVEN** complete Browser collection files also selected by Conformance Architecture or Performance, including overlap and disjoint selected sources
- **WHEN** the shared declared-level classifier resolves every admitted file
- **THEN** Conformance precedes Architecture before Performance and only unmatched admitted files become Browser, with deterministic wrong-level findings and nonzero CLI status

#### Scenario: [TEST-AXES-124] Browser levels bind canonical identity and installed dispatch

- **GIVEN** reordered report enumeration or changed authority bytes, complete outcomes and supported or unsupported command operands
- **WHEN** source and built installed executable dispatch inspect the selection
- **THEN** outputs agree, full-envelope digest binds all observations and sources, bounded usage refuses, authentication stays absent and certification false

### Requirement: Every test resolves to exactly one level

Every test file SHALL have exactly one level, selected by the first matching rule of the level-selection table. The table, not any single suffix, SHALL be the statement of the rule.

| Order | The file                                                                                                                                                                                                                                                           | Level        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1     | A manual procedure file declared by a scenario's manual disposition                                                                                                                                                                                                | Manual       |
| 2     | Named by a project's `test:conformance` target                                                                                                                                                                                                                     | Conformance  |
| 3     | Declared in the policy as a rule's own negative fixture                                                                                                                                                                                                            | Architecture |
| 4     | A member of a declared Playwright suite, and carrying declared thresholds                                                                                                                                                                                          | Performance  |
| 5     | A member of a declared Playwright suite: today the three configurations `apps/wbs/fe-01/playwright.config.ts`, `apps/wbs/fe-01/playwright.packaged.config.ts` and `libs/wbs/application/core/playwright.config.ts`, each through its own `testDir` and `testMatch` | Browser      |
| 6     | Ending `.db.test.ts`                                                                                                                                                                                                                                               | API          |
| 7     | Listed in the FE-owned `apps/wbs/fe-01/vitest.node-suites.json` manifest backing the `NODE_SUITES` export                                                                                                                                                          | Unit         |
| 8     | Under `apps/wbs/fe-01/src`, ending `.test.tsx` or `.test.ts` and not in that manifest                                                                                                                                                                              | View         |
| 9     | Ending `.test.tsx` anywhere else                                                                                                                                                                                                                                   | View         |
| 10    | Ending `.test.ts` anywhere else                                                                                                                                                                                                                                    | Unit         |

Browser membership SHALL be read from the Playwright configurations, never from a directory name. Classification SHALL rename nothing and repurpose no existing target; a level target SHALL be added alongside the targets that exist. Whether `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts` gains a distinguishing suffix SHALL remain an open item owned by rollout Task 5, which names the level targets.

#### Scenario: [TEST-AXES-001] A file matches no level

- **GIVEN** a tracked test file
- **WHEN** it matches no row in the level-selection table
- **THEN** classification fails and names the file

#### Scenario: [TEST-AXES-002] A plain suffix belongs to Conformance

- **GIVEN** `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts`
- **WHEN** the level table is applied in precedence order
- **THEN** it resolves to Conformance through target membership despite its plain suffix

#### Scenario: [TEST-AXES-003] A database suffix belongs to Conformance first

- **GIVEN** `libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts`
- **WHEN** the level table is applied in precedence order
- **THEN** it resolves to Conformance through target membership before the API suffix rule

#### Scenario: [TEST-AXES-024] A portable suite outside the frontend is Browser

- **GIVEN** `libs/wbs/application/core/testing/portable-composition.spec.ts`
- **WHEN** its Playwright configuration's `testDir` and `testMatch` are evaluated
- **THEN** it resolves to Browser without relying on a directory name

### Requirement: Each level has an isolated Nx target

Each level SHALL be runnable alone through one Nx target. An existing aggregate target SHALL NOT be renamed or removed, and SHALL be exempt from the isolation rule as long as it is declared as an aggregate.

#### Scenario: [TEST-AXES-004] A level target collects another level

- **GIVEN** an Nx target declared for one test level
- **WHEN** it also runs a file classified at another level
- **THEN** target isolation fails and names the file and both levels

#### Scenario: [TEST-AXES-005] An aggregate target spans levels deliberately

- **GIVEN** one target declared as an aggregate and one undeclared target
- **WHEN** each runs files from two levels
- **THEN** the declared aggregate passes and the undeclared target fails

### Requirement: Performance execution measures the declared real WBS fixture

The Performance target SHALL execute its declared fixture against the real WBS FE/BE/GW stack in a detached committed checkout. Its selection environment SHALL be exactly `CI=1` and a canonical decimal `E2E_PORT_SHIFT` from 1 through 9999 excluding 100, 1000 and 1100; the same captured pair SHALL reach setup, services, discovery and execution, SHALL NOT be overridden by a descriptor, and SHALL be bound into evidence, manifest and Burokrat selection digest. Before admitting an invocation, it SHALL refuse if any selected shifted port is already occupied and SHALL preserve that unrelated listener. The WBS rendering case SHALL verify the seeded server plan contains exactly 100 logical rows and two steps, and SHALL sample nonempty geometry at logical rows 0, 50 and 99 at a 1400×900 viewport with Gantt closed and estimates folded. It SHALL retain and count the active editor row in the final sample. Its measured value SHALL be the maximum actual mounted table-cell count from those settled samples and SHALL pass only at or below 1200 cells; waiting for the count to meet the threshold SHALL NOT be a readiness condition. A runner startup/readiness failure, execution timeout, or failed cleanup SHALL refuse the invocation without publishing a current-success pointer. Before launch, the Linux runner SHALL verify child-subreaper, `pidfd_open` and `pidfd_send_signal` support, otherwise refusing before services start. It SHALL keep the subreaper alive through cleanup, stop launching before draining, repeatedly discover descendants and adopted children during a bounded graceful/forced cleanup loop, await directly spawned child exits, reap adopted children, and verify no live/adopted child remains. It SHALL signal only revalidated pidfd identities. A pre-existing or unexpected foreign listener SHALL cause a named refusal and SHALL NOT be killed. Evidence publication SHALL be an immutable per-invocation bundle plus one atomic current pointer; a new admitted attempt invalidates the old pointer, successful passing evidence publishes it only after cleanup, and an older invocation SHALL NOT publish after a newer admission. Failed threshold measurements SHALL retain diagnostic JUnit and observations in their immutable invocation bundle without a current-success pointer. Successful sequential invocations SHALL publish distinct fresh evidence and leave all owned shifted listeners closed. All evidence remains noncertifying.

#### Scenario: [TEST-AXES-038] A folded 100-row plan stays within its mounted-cell budget

- **GIVEN** the real WBS stack and the declared 100-row sparse plan fixture
- **WHEN** the Performance case verifies 100 logical rows and samples settled, nonempty mounted-cell geometry at logical rows 0, 50 and 99 with Gantt closed and estimates folded at a 1400×900 viewport
- **THEN** it records the maximum sampled count, retains the active editor row in the final sample, and passes only when the count is at most 1200, with noncertifying evidence

#### Scenario: [TEST-AXES-039] A timed-out Performance run leaves no owned process or listener

- **GIVEN** an admitted Performance invocation whose actual supervised WBS stack starts an intermediate wrapper that exits immediately after starting a separate-session child with a shifted listener and a second child with no listener
- **WHEN** the runner deadline expires
- **THEN** child-subreaper adoption retains both children, the runner repeatedly discovers and signals their stable pidfd identities with bounded graceful then forced cleanup, reaps both and verifies neither remains without signaling an unrelated process, retains failure diagnostics without a current-success pointer, and refuses publication

#### Scenario: [TEST-AXES-040] A required service fails readiness before Performance execution

- **GIVEN** a required WBS service does not become ready after admission, or a selected shifted port is occupied before admission
- **WHEN** the runner performs bounded stack startup
- **THEN** an occupied-port refusal preserves the existing listener; a readiness refusal occurs before test-case execution, cleans up only owned processes, and publishes no current-success pointer

#### Scenario: [TEST-AXES-041] Sequential Performance invocations own fresh reports and ports

- **GIVEN** two successful Performance invocations run sequentially with validated shifted ports
- **WHEN** each completes against its own fresh committed checkout
- **THEN** each passing run publishes a distinct immutable invocation bundle through the atomic current pointer and all owned shifted listeners are closed after each run

### Requirement: Browser observations bind one committed candidate

A version-1 Browser bundle SHALL carry its `candidate` as one canonical lowercase SHA-256 digest. The Browser inspector SHALL independently select the committed revision and recompute its candidate digest before reporting an observation. A valid observation SHALL remain `certifies:false` with authentication absent.

#### Scenario: [TEST-AXES-034] A bundle matches its committed selection

- **GIVEN** a complete Browser bundle with the exact candidate digest and revision
- **WHEN** the inspector reads it under an external Browser policy pin
- **THEN** it reports the observed cases with absent authentication and no certification

#### Scenario: [TEST-AXES-035] A candidate digest is absent or foreign

- **GIVEN** a bundle whose candidate digest is missing, malformed, an object, or from another commit with the same tree
- **WHEN** the inspector independently selects the committed revision
- **THEN** it refuses the bundle, including when a distinct empty descendant has identical file bytes

#### Scenario: [TEST-AXES-036] A manifest names another revision

- **GIVEN** a bundle with the exact candidate digest but a different manifest revision
- **WHEN** the inspector compares it with the committed selection
- **THEN** it refuses the bundle

#### Scenario: [TEST-AXES-037] An opt-in Browser case carries Playwright annotation metadata

- **GIVEN** raw Playwright JUnit places descriptive `properties` and `property` elements before a testcase's skipped outcome, with matching JSON selection and outcome
- **WHEN** the Browser inspector reconciles the bundle
- **THEN** it keeps that case skipped and noncertifying, while malformed property placement, blank names, attributes, or character data refuse

### Requirement: Diagnostic test observations bind committed case sources

The `inspect-test-reports` command SHALL inspect one ordinary, packaged or portable Browser publication through the existing Browser inspector, under an external Browser policy, for an explicitly selected full committed revision. It SHALL emit a versioned diagnostic observation binding the revision, candidate digest, policy digest, mode and invocation identity. Each observed case SHALL retain its exact config, project, workspace-relative file, full ordered title path and passed, failed or skipped outcome. Its case identity SHALL bind config, project, file and title path independently of outcome. Duplicate case identities SHALL refuse, including duplicates with different outcomes. Each case file SHALL resolve to a regular blob in that same committed candidate; the observation SHALL bind the selected file mode and SHA-256 content digest. Missing, nonregular, malformed or escaping file identities SHALL refuse. Working files SHALL NOT supply missing committed bytes.

The observation digest SHALL bind the complete versioned normalized observation, including outcomes and source bindings, in deterministic case-identity order. It SHALL describe the inspected observation, not authenticate a runner receipt. Every successful inspection SHALL emit `authentication:{kind:'absent'}` and `certifies:false`, including all-passing observations. Inspection SHALL preserve the existing Browser publication, policy, discovery, JUnit and race refusals. A successful command exit SHALL mean the diagnostic inspection completed; it SHALL NOT mean tests passed, scenarios were covered, or admission was granted. This slice SHALL neither resolve scenario citations nor bypass a refused B3 selection to grant coverage.

#### Scenario: [TEST-AXES-042] A diagnostic observation binds its committed test file

- **GIVEN** a valid Browser publication and its exact committed candidate and external policy
- **WHEN** the diagnostic command inspects the publication
- **THEN** every observed case SHALL bind its complete case identity, outcome and selected regular test-file bytes
- **AND** the observation SHALL retain its invocation and authority identities with authentication absent and certification false

#### Scenario: [TEST-AXES-043] A reported case has no regular committed source

- **GIVEN** internally matching Browser reports and manifest naming a missing, nonregular or escaping case file
- **WHEN** the diagnostic command joins the case to its committed candidate
- **THEN** it SHALL refuse with a named source-boundary diagnostic even if a working file exists at that path

#### Scenario: [TEST-AXES-044] Two outcomes claim one observed case identity

- **GIVEN** two observations with equal config, project, file and full title path
- **WHEN** the diagnostic command inspects them
- **THEN** it SHALL refuse the duplicate identity whether their outcomes agree or differ

#### Scenario: [TEST-AXES-045] An observation preserves outcomes without coverage credit

- **GIVEN** a valid publication containing passing, failing or skipped observations
- **WHEN** the diagnostic command completes
- **THEN** it SHALL retain each actual outcome without turning a failed or skipped case into a pass
- **AND** it SHALL produce no scenario coverage or admission credit, including when every observed case passed

#### Scenario: [TEST-AXES-046] The diagnostic observation digest binds outcomes and source

- **GIVEN** the same validated observations presented in a different case order
- **WHEN** their diagnostic digests are computed
- **THEN** the digests SHALL agree
- **AND** changing an outcome, selected source binding or provenance identity SHALL change the digest while changing only an outcome SHALL preserve the case identity

#### Scenario: [TEST-AXES-047] A diagnostic inspection preserves Browser refusals

- **GIVEN** a Browser publication with invalid policy, candidate, report parity or publication-token stability
- **WHEN** the diagnostic command invokes the Browser inspector
- **THEN** it SHALL refuse rather than normalize unvalidated report claims

### Requirement: Diagnostic test sources bind exact indexed ownership

The `inspect-test-sources <repository> <full-committed-sha> <external-policy> <ordinary|packaged|portable>` command SHALL inspect a Browser publication through `inspectTestReports` and resolve each reported case file through `checkIndexes` on the same selected committed candidate. It SHALL accept no caller-supplied observation, ownership map or level-membership facts. It SHALL preserve existing report and index refusals and refuse a case with no unique validated index owner. It SHALL read source and index bytes only from selected Git blobs; working files SHALL NOT repair missing committed state. Source ownership SHALL identify the module containing the test file, and SHALL NOT claim which module's behavior the test proves.

The version-1 observation SHALL bind the exact revision and candidate digest, upstream report observation digest, validated index report identity and index review debt. Every case binding SHALL retain its case ID, file, outcome and source mode/content digest, and identify its owner's module ID, index path and index identity. Bindings and review debt SHALL have deterministic ordering. The observation digest SHALL bind the entire versioned payload excluding itself. Every binding SHALL state `level:{kind:'unresolved',reason:'complete-level-membership-unavailable'}`; the diagnostic SHALL NOT replace unknown higher-precedence facts with empty sets or infer Browser level from Playwright membership. Authentication SHALL remain absent and certification false, without scenario coverage, structural coverage, admission or capability-chain credit. Exit zero SHALL mean ownership inspection completed, including admitted failed/skipped observations and explicit unresolved level classification; malformed or unsupported input SHALL exit nonzero with a named refusal and no partial success JSON.

#### Scenario: [TEST-AXES-048] A reported case binds its exact nested index owner

- **GIVEN** an inspected Browser case whose selected regular source belongs to a validated nested module index
- **WHEN** source ownership is inspected
- **THEN** its binding SHALL name that nested module and exact index identity rather than an enclosing module or a module inferred from imports
- **AND** its case ID, source binding and outcome SHALL remain those of the inspected report

#### Scenario: [TEST-AXES-049] A reported source has no unique validated owner

- **GIVEN** a reported case outside every validated module boundary, or index metadata that makes ownership invalid or ambiguous
- **WHEN** source ownership is inspected
- **THEN** inspection SHALL refuse with a named diagnostic and no partial success JSON
- **AND** a working-tree index SHALL NOT supply missing committed ownership

#### Scenario: [TEST-AXES-050] Ownership and report observations select different candidates

- **GIVEN** the report inspector and source-ownership reader report different committed revisions or candidate digests
- **WHEN** the observations are joined
- **THEN** inspection SHALL refuse the mismatch rather than bind an owner from another selection

#### Scenario: [TEST-AXES-051] Ownership diagnostics preserve upstream refusals

- **GIVEN** missing, unreadable, malformed or inconsistent committed index state, or an invalid Browser policy, source, publication or report binding
- **WHEN** source ownership is inspected through the production command
- **THEN** the responsible upstream refusal SHALL remain observable without a directory-based fallback
- **AND** omitted, extra or unsupported command arguments SHALL refuse before observation emission

#### Scenario: [TEST-AXES-052] Ownership identity includes index membership and review debt

- **GIVEN** valid observations whose case and index-debt presentation order differs
- **WHEN** ownership observation digests are computed
- **THEN** equivalent observations SHALL have equal digests
- **AND** changing a source binding, outcome, report provenance, owner, index identity, membership identity or index review debt SHALL change the digest

#### Scenario: [TEST-AXES-053] Source ownership does not determine test level or coverage

- **GIVEN** a valid ownership inspection with passing, failing or skipped Browser observations and possibly index review debt
- **WHEN** the command completes
- **THEN** it SHALL preserve every outcome and review-debt entry, report level classification explicitly unresolved, and emit authentication absent and certification false
- **AND** it SHALL emit no tested-module, service-kind, scenario-coverage, structural-coverage or admission claim

### Requirement: Diagnostic Performance sources bind exact indexed ownership

The `inspect-performance-sources <repository> <full-committed-sha> <external-policy>` command SHALL invoke the real current-success Performance publication inspector and `checkIndexes` on the same committed candidate. It SHALL bind each inspected case to exactly one validated nearest index owner and to its selected regular source tuple. It SHALL preserve all inherited publication and index refusals, including missing or unreadable state; working files SHALL NOT repair missing committed sources or indexes. A mismatch between the captured candidate and publication revision or candidate identity SHALL refuse.

The version-1 observation SHALL bind revision, candidate, publication observation digest, overall index identity, sorted index review debt, and each case ID, fixture, status, comparison judgment, source mode/content digest, and owner module ID/index path/index identity. Bindings SHALL be sorted by case ID, debt by index path, and the observation digest SHALL cover the complete normalized payload excluding itself. Every binding SHALL report level unresolved because complete precedence facts are unavailable. Authentication SHALL remain absent and certification false. The diagnostic SHALL emit no tested-module, service-kind, scenario-coverage, structural-coverage, admission or capability-chain claim. An upstream current-success refusal SHALL never be normalized into a successful source observation.

#### Scenario: [TEST-AXES-061] A Performance case binds its exact nested index owner

- **GIVEN** a valid current-success Performance publication whose selected fixture belongs to a nested module
- **WHEN** the source diagnostic inspects that committed candidate
- **THEN** it SHALL bind the exact nested owner, source tuple, case judgment and publication/index identities

#### Scenario: [TEST-AXES-062] A Performance case lacks unique validated ownership

- **GIVEN** absent or ambiguous committed ownership, including a working-tree repair
- **WHEN** the source diagnostic joins the case fixture to checked indexes
- **THEN** it SHALL refuse without a partial success observation

#### Scenario: [TEST-AXES-063] Performance publication and ownership select different identities

- **GIVEN** a publication revision, candidate identity or source tuple that differs from the captured selection
- **WHEN** the diagnostic joins publication cases to ownership
- **THEN** it SHALL refuse the mismatch

#### Scenario: [TEST-AXES-064] Performance source diagnosis preserves upstream refusals

- **GIVEN** a missing, unreadable, malformed or unsuccessful current-success publication, or invalid committed index state
- **WHEN** the diagnostic invokes the production readers
- **THEN** the responsible upstream refusal SHALL remain observable
- **AND** symbolic revisions, annotated tag-object SHAs and unsupported operand counts SHALL refuse before success JSON

#### Scenario: [TEST-AXES-065] Performance source observation identity is complete and canonical

- **GIVEN** valid cases and index review debt presented in different orders
- **WHEN** the diagnostic computes observations
- **THEN** equivalent observations SHALL have equal digests
- **AND** changes to source, judgment, owner, publication or index identity, or review debt SHALL change the digest

#### Scenario: [TEST-AXES-066] Performance source diagnosis grants no coverage

- **GIVEN** a valid passing current-success publication
- **WHEN** the source diagnostic completes
- **THEN** it SHALL keep authentication absent, certification false and level unresolved
- **AND** it SHALL make no test-level, tested-module, service-kind, coverage or admission claim

### Requirement: Manual observation preserves the inspected verdict without certification

`inspect-manual-observation <repository> <full-committed-sha> <external-policy> <report-path> --now <UTC instant>` SHALL call the real Manual inspector for one exact committed candidate and caller-supplied instant. Its version-1 envelope SHALL contain the selected revision and candidate identity, canonical `evaluatedAt`, the complete nested Manual inspector result, `authentication:{kind:'absent'}`, `certifies:false`, and an observation digest over the complete envelope before the digest field. It SHALL preserve the Manual `current`, `stale`, `failed` and `overdue` judgments and emit JSON for each evaluated result, exiting zero only for `current`. Missing, unreadable, malformed or untrusted inputs and unresolved B3 selection SHALL refuse with a named error and no success JSON. It SHALL NOT grant a Manual level, coverage, admission or trusted human identity.

#### Scenario: [TEST-AXES-067] A current Manual report is wrapped intact

- **GIVEN** a valid committed candidate and exact external approval chain
- **WHEN** the command inspects the supplied UTC instant
- **THEN** it SHALL bind the complete Manual result, candidate, time and noncertifying markers in one digest

#### Scenario: [TEST-AXES-068] Noncurrent Manual judgments remain noncurrent

- **GIVEN** a valid stale, failed or overdue Manual result
- **WHEN** the adapter emits its observation
- **THEN** it SHALL retain the exact nested judgment and exit nonzero with JSON

#### Scenario: [TEST-AXES-069] The Manual review deadline uses the caller instant

- **GIVEN** a review deadline date and canonical UTC evaluation instants at its end and next day's start
- **WHEN** the command inspects each instant
- **THEN** it SHALL return current through the deadline and overdue immediately after it

#### Scenario: [TEST-AXES-070] Manual observation refuses invalid selection and evidence

- **GIVEN** a symbolic SHA, annotated tag-object SHA, staged reader fault, mismatched inspector revision or missing external report
- **WHEN** the command attempts observation
- **THEN** it SHALL refuse with a named error and no JSON

#### Scenario: [TEST-AXES-071] Manual observation retains B3 and immutable selection

- **GIVEN** staged source repair or unresolved effective scenario selection
- **WHEN** the adapter invokes the Manual inspector on the committed candidate
- **THEN** staging SHALL NOT change the observation and B3 refusal SHALL remain a refusal

#### Scenario: [TEST-AXES-072] Manual observation identity and installed dispatch are complete

- **GIVEN** a valid observation and installed package executable
- **WHEN** an envelope or nested field changes or the packaged command is invoked
- **THEN** every changed field SHALL change the digest and the installed command SHALL reach the validator
- **AND** authentication SHALL remain absent and certification false

### Requirement: Diagnostic committed SHA is the requested commit object

The `inspect-spec-sources`, `inspect-test-reports`, `inspect-test-sources` and `inspect-performance` commands SHALL require the selected committed revision to equal the caller's full SHA before downstream source, publication or policy inspection. A full-hex annotated tag-object SHA that Git peels to a different commit SHALL refuse with a named error and no JSON. The Performance inspector SHALL also refuse a noncommitted selection returned by a faulty reader. The generic candidate reader's revision-peeling behavior for other callers SHALL remain unchanged.

#### Scenario: [TEST-AXES-073] Specification sources reject a tag object

- **GIVEN** a valid committed specification fixture and an annotated tag object pointing to it
- **WHEN** the source diagnostic receives the tag object's full SHA
- **THEN** it SHALL refuse before inventory with no JSON

#### Scenario: [TEST-AXES-074] Browser test reports reject a tag object

- **GIVEN** a valid Browser report publication and an annotated tag object pointing to its candidate
- **WHEN** the report diagnostic receives the tag object's full SHA
- **THEN** it SHALL refuse before Browser publication inspection with no JSON

#### Scenario: [TEST-AXES-075] Browser test sources reject a tag object

- **GIVEN** a valid indexed Browser source publication and an annotated tag object pointing to its candidate
- **WHEN** the source diagnostic receives the tag object's full SHA
- **THEN** it SHALL refuse before report publication inspection with no JSON

#### Scenario: [TEST-AXES-076] Performance inspection requires the exact committed object

- **GIVEN** a valid Performance publication with either an annotated tag-object SHA or a faulted noncommitted reader selection
- **WHEN** the inspector captures its candidate
- **THEN** it SHALL refuse with the responsible named selection error and no JSON

### Requirement: Tests live inside their modules

A test SHALL live inside the module it tests, resolved from the module index.

#### Scenario: [TEST-AXES-006] A test belongs to no module

- **GIVEN** a tracked test file
- **WHEN** no module index includes its location
- **THEN** module classification reports and names the file

### Requirement: Scenarios carry stable identifiers

Every OpenSpec scenario SHALL carry a stable identifier in square brackets at the start of its title.

#### Scenario: [TEST-AXES-007] A scenario has no identifier

- **GIVEN** an OpenSpec requirement
- **WHEN** one of its scenarios has no leading bracketed identifier
- **THEN** identifier validation fails and names the requirement

#### Scenario: [TEST-AXES-008] A scenario is renamed

- **GIVEN** an identified scenario
- **WHEN** its title text changes
- **THEN** it keeps the same identifier

### Requirement: Twilight Burokrat allocates identifiers and predecessors

Twilight Burokrat SHALL allocate every scenario identifier and SHALL record a predecessor when a scenario is renamed or split, the way ADR 0020 treats module identities. Before allocator provenance is enforced, the allocator SHALL import the identifiers that already exist in the repository and reserve them unchanged, so no hand-written identifier in an earlier change is invalidated or reissued.

#### Scenario: [TEST-AXES-009] An identifier has no allocator provenance

- **GIVEN** allocator provenance enforcement is active
- **WHEN** a hand-written identifier was neither issued nor imported by the allocator
- **THEN** identifier validation fails and names it

#### Scenario: [TEST-AXES-010] A scenario splits

- **GIVEN** one identified scenario
- **WHEN** it is split into two scenarios
- **THEN** both new records name the original as their predecessor

#### Scenario: [TEST-AXES-025] Existing change identifiers are reserved

- **GIVEN** the hand-written identifiers in the `service-taxonomy` and `test-axes` changes
- **WHEN** allocator provenance enforcement begins
- **THEN** the allocator imports and reserves them unchanged and they remain valid

### Requirement: An identifier is never reused

A scenario identifier SHALL never be reused.

#### Scenario: [TEST-AXES-011] A removed scenario's identifier is allocated again

- **GIVEN** an identifier once held by a removed scenario
- **WHEN** an allocation requests that identifier
- **THEN** allocation fails and names the removed scenario

### Requirement: Production scenario provenance is pinned to a reviewed base

Twilight Burokrat SHALL select an externally pinned full Git commit as the predecessor of a committed candidate, or the exact base named by a staged or working selection. Its specifications rule SHALL read the base and candidate journals as immutable regular Git blobs, require the base event values to be an exact prefix of the candidate event values, and reject a missing or malformed journal. A first adoption without a base journal SHALL require an external reviewed bootstrap record binding the base SHA, candidate journal digest, reviewer and reference. Local Git replacement objects SHALL NOT change selected authority or journal bytes. Every rule mode SHALL leave an unjudgeable provenance result unevaluated and disallowed.

#### Scenario: [TEST-AXES-026] A retirement event disappears

- **GIVEN** a reviewed base journal that retires an identifier
- **WHEN** a candidate deletes the retirement event and restores the identified heading
- **THEN** the specifications rule refuses the journal rewrite even if the candidate journal and spec agree

#### Scenario: [TEST-AXES-027] Initial journal lacks reviewed bootstrap

- **GIVEN** a selected base commit without a scenario journal
- **WHEN** the candidate first adds a journal without a matching external reviewed bootstrap record
- **THEN** the specifications rule leaves the candidate unevaluated and disallowed

### Requirement: Canonical scenarios reconcile in both directions

The specifications rule SHALL select active OpenSpec spec paths, excluding archived changes and headings in fenced code, and compare identified headings with the current journal index in both directions. A missing allocation, duplicate identifier or active allocation without a selected heading SHALL refuse evaluation. Unidentified legacy headings SHALL appear as findings subject to rule mode. The evidence identity SHALL bind the external policy bytes, resolved base, base and candidate journal bytes, selector version and selected spec bytes.

The active selector SHALL parse immutable specification ASTs and apply `ADDED`, `MODIFIED`, `REMOVED` and explicit `RENAMED Requirements` `FROM:`/`TO:` pairs by exact capability and requirement title. A rename SHALL preserve canonical position and all canonical scenarios by identifier, or by exact title when unidentified; it SHALL not require a scenario journal event. One `MODIFIED` requirement at the destination in the same change MAY accompany the pair in either section order. Scenario title changes SHALL still require a journal `rename` event. A rename SHALL refuse malformed, missing or duplicate endpoints, absent predecessors, occupied destinations, chains, cycles and any other operation targeting either endpoint, including in another active change. It SHALL retain canonical requirement order and append new requirements in stable key order. A `MODIFIED` requirement SHALL retain every canonical scenario by identifier, or by exact title when unidentified. A removed adopted identifier SHALL have a journal retirement. Duplicate or competing operations, absent predecessors, unsupported operation sections and scenario headings outside a requirement SHALL refuse evaluation. Synced identical `ADDED` requirements SHALL share one lineage. Selector version 3 evidence SHALL bind every active input path and content digest, effective requirements and source aliases, applied operations including rename endpoints, paths and digests, and removals. The effective requirement digest SHALL bind the renamed title and effective body.

#### Scenario: [TEST-AXES-028] An allocated heading disappears

- **GIVEN** an active journal identity and its canonical identified heading
- **WHEN** the heading is removed while the journal identity remains active
- **THEN** the specifications rule leaves the candidate unevaluated and disallowed

#### Scenario: [TEST-AXES-029] Only the reviewed base changes

- **GIVEN** two valid ancestor commits holding the same journal bytes
- **WHEN** the external policy pins each base for the same candidate
- **THEN** their specifications evidence identities differ

#### Scenario: [TEST-AXES-030] A modified requirement loses a canonical scenario

- **GIVEN** an active canonical requirement with an adopted scenario
- **WHEN** a change modifies that requirement without retaining the scenario identifier
- **THEN** the specifications rule refuses the overlay

#### Scenario: [TEST-AXES-031] Concurrent changes modify one requirement

- **GIVEN** two active changes target the same capability and requirement title
- **WHEN** both declare an operation on that requirement
- **THEN** the specifications rule refuses the competing operations without choosing by path order

#### Scenario: [TEST-AXES-032] A removed adopted requirement lacks retirement

- **GIVEN** a canonical requirement with an active allocated identifier
- **WHEN** an active change removes the requirement without a journal retirement
- **THEN** the specifications rule refuses the removal

#### Scenario: [TEST-AXES-033] An active input changes without changing effective requirements

- **GIVEN** a synced duplicate requirement in an active change
- **WHEN** the active change spec path or content changes
- **THEN** the selector version 3 evidence identity changes and records the input and alias

### Requirement: T1 unit tests need no scenario citation

The scenario-citation check SHALL accept a unit test that cites no scenario.

#### Scenario: [TEST-AXES-012] A unit test has no citation

- **GIVEN** a test classified at Unit level
- **WHEN** its title has no scenario identifier
- **THEN** the scenario-citation check passes it

### Requirement: T2 higher-level tests cite scenarios

A test at the API, View, Browser, Performance or Manual level SHALL cite a scenario in its title. Conformance and Architecture tests SHALL be outside T2 because a conformance case proves a port contract and an architecture fixture proves a rule, and neither is a scenario.

#### Scenario: [TEST-AXES-013] A browser test has no citation in enforce mode

- **GIVEN** T2 in enforce mode
- **WHEN** a Browser test title cites no scenario
- **THEN** the verdict refuses it

#### Scenario: [TEST-AXES-014] A browser test has no citation in observe mode

- **GIVEN** T2 in observe mode
- **WHEN** a Browser test title cites no scenario
- **THEN** the verdict reports debt without refusing it

### Requirement: Every scenario is covered or disposed

Every scenario SHALL have a test at its lowest sufficient level or an explicit disposition. A disposition SHALL be either manual or inapplicable with a recorded reason, and SHALL NOT be anything else.

#### Scenario: [TEST-AXES-015] A scenario is uncovered

- **GIVEN** passing totals elsewhere
- **WHEN** one scenario has neither a test nor a disposition
- **THEN** scenario coverage fails and names it

#### Scenario: [TEST-AXES-016] A disposition has no allowed form

- **GIVEN** an uncovered scenario
- **WHEN** its disposition is neither manual nor a reasoned inapplicability
- **THEN** scenario coverage fails and names the scenario

### Requirement: Every module has structurally required levels

Every module SHALL have the test levels its kinds require, as the code organization design's table states them.

#### Scenario: [TEST-AXES-017] A repository adapter lacks conformance coverage

- **GIVEN** a module containing a repository adapter
- **WHEN** it has no Conformance test
- **THEN** structural coverage fails and names the module

### Requirement: Every capability crosses its whole chain

Every capability SHALL have at least one Browser or Manual scenario that passes through its whole chain, from delivery to the store.

#### Scenario: [TEST-AXES-018] Capability tests stop at the feature-service

- **GIVEN** a capability with tests
- **WHEN** every test stops at its feature-service
- **THEN** capability coverage fails and names the capability

### Requirement: Manual cases are reviewed scenarios with steps

A manual case SHALL be a scenario with a manual disposition carrying a reviewed reason why it cannot be automated and a steps file.

#### Scenario: [TEST-AXES-019] A manual disposition has no reason

- **GIVEN** a scenario with a manual disposition
- **WHEN** it carries no reviewed reason
- **THEN** manual-case validation fails

#### Scenario: [TEST-AXES-020] A manual disposition has no steps

- **GIVEN** a scenario with a manual disposition
- **WHEN** it names no steps file
- **THEN** manual-case validation fails

### Requirement: Manual reports bind environment and source

Every manual run SHALL produce a report bound to an environment observation and to a source revision, and the report SHALL go stale when the scenario changes or when a module it touches changes.

#### Scenario: [TEST-AXES-021] A manual report lacks a binding

- **GIVEN** a manual-run report
- **WHEN** it names no environment observation or no source revision
- **THEN** report validation refuses it

#### Scenario: [TEST-AXES-022] A manual report predates its inputs

- **GIVEN** a manual-run report
- **WHEN** it predates the scenario's last change or a touched module's change
- **THEN** report validation marks it stale

### Requirement: Manual dispositions expire for review

A manual disposition SHALL be reviewed again on a schedule and SHALL become a refusal when its review is overdue, so the Manual level does not become a place to avoid writing tests.

#### Scenario: [TEST-AXES-023] A manual disposition is overdue

- **GIVEN** a manual disposition with a review date
- **WHEN** that date has passed
- **THEN** the verdict refuses it and names the scenario and date

### Requirement: Active source inventory precedes reviewed lineage reconciliation

The committed `inspect-spec-sources` diagnostic SHALL inventory every parsed active canonical requirement and overlay operation before effective lineage selection. It SHALL bind the exact committed revision, candidate identity, every source path and byte digest, canonical requirement and operation fragment digests, scenarios and explicit rename endpoints in a deterministic complete-payload observation digest. It SHALL emit `certifies:false`. It SHALL ignore archive paths, refuse malformed or unreadable active sources, and preserve the selector's refusal of unresolved lineage. Inventory membership SHALL NOT establish accepted predecessors or authorize source synchronization or archive.

#### Scenario: [TEST-AXES-054] Competing groups remain visible without selecting lineage

- **GIVEN** multiple active groups containing competing modifications and rename endpoints
- **WHEN** the committed diagnostic runs
- **THEN** all parsed operations and canonical requirements remain visible with exact source and fragment identities
- **AND** effective selection still refuses the competing lineage

#### Scenario: [TEST-AXES-055] Committed source identity resists staging and ordering

- **GIVEN** a full committed revision with staged replacements and archived specifications
- **WHEN** its sources are inventoried in any input enumeration order
- **THEN** only committed active bytes contribute and canonical output and its complete-payload digest are identical
- **AND** changing any identity or the noncertifying marker changes that digest

#### Scenario: [TEST-AXES-056] Invalid active source parsing refuses inventory

- **GIVEN** a malformed active requirement or rename pair, absent committed object, unreadable selected blob or invalid UTF-8
- **WHEN** the diagnostic reads or parses that source
- **THEN** it refuses at the responsible shared reader or parser boundary without emitting an inventory

### Requirement: Performance publication inspection reconciles immutable evidence

The read-only `inspect-performance` command SHALL bind a current-success publication to an exact full committed SHA and external policy. It SHALL validate exact identities, normalized regular paths and artifact digests, independently decode discovery and execution through the shared collector parser, reconcile exact measured cases with committed declarations and policy, recompute thresholds, and reconcile normalized JUnit. It SHALL reread the pointer and refuse a changed publication. Its deterministic complete-payload observation digest SHALL bind authentication absent and `certifies:false`. Historical failures SHALL remain diagnostics and SHALL NOT become success publications.

#### Scenario: [TEST-AXES-057] Stable Performance publication is a noncertifying observation

- **GIVEN** a stable passing publication bound to committed sources and external policy
- **WHEN** the production command inspects it despite staged replacements
- **THEN** it emits deterministic observations binding exact source and artifact identities with authentication absent and certifies false

#### Scenario: [TEST-AXES-058] Invalid Performance publication refuses inspection

- **GIVEN** foreign identities, missing or unreadable files, malformed encodings, unsafe paths, symlinks, special files or altered artifact digests
- **WHEN** the production command inspects the current pointer
- **THEN** it refuses at the responsible boundary

#### Scenario: [TEST-AXES-059] Semantic Performance conflicts refuse despite matching digests

- **GIVEN** duplicate, missing, extra or disagreeing raw cases, conflicting evidence, changed thresholds, skipped or failed execution, breached thresholds or forged JUnit semantics with updated digests
- **WHEN** the production command independently reconciles the publication
- **THEN** it refuses without emitting an observation

#### Scenario: [TEST-AXES-060] Performance publication changes during inspection

- **GIVEN** a publication that changes its current pointer after bundle capture
- **WHEN** inspection rereads that pointer
- **THEN** it refuses the changed publication

### Requirement: Candidate-bound level facts have explicit authority

For one complete committed Performance declaration, a facts-only diagnostic SHALL require a
strict version-1 external authority pinning the exact committed revision, candidate identity,
project root and manifest, declaration, config, Playwright project and every fixture. It SHALL
read candidate bytes only from selected regular Git blobs and distinguish an explicit
reviewed-empty Manual, Conformance or Architecture membership from missing or unknown evidence.
It SHALL preserve legitimate overlap between precedence rows. Its digest SHALL bind the complete
noncertifying observation; it SHALL NOT classify tests, inspect a publication, issue coverage,
authenticate a reviewer or change the version-1 source-owner outputs.

#### Scenario: [TEST-AXES-077] Explicit reviewed absence is bound to one Performance scope

- **GIVEN** a complete pinned declaration and explicit reviewed-empty membership for all three earlier rows
- **WHEN** the facts diagnostic reads the exact committed candidate despite staged replacements
- **THEN** it emits the selected source tuples, explicit scope and membership states, absent authentication and false certification in a complete-payload digest

#### Scenario: [TEST-AXES-078] Missing or contradictory authority refuses facts

- **GIVEN** a missing Manual state, unsupported Manual form, absent source pin, duplicate fixture, altered pin, scope gap or contradictory membership assertion
- **WHEN** the facts diagnostic validates external authority
- **THEN** it refuses by name with no JSON observation

#### Scenario: [TEST-AXES-079] Committed Performance scope resists working repair

- **GIVEN** a selected source that is missing, unreadable, malformed, symlinked or nonregular, even if the working tree has a valid replacement
- **WHEN** the facts diagnostic reads the scope
- **THEN** it refuses before producing facts or executing candidate code

#### Scenario: [TEST-AXES-080] Exact committed selection and fact identity resist substitution

- **GIVEN** a symbolic revision, annotated tag object, changed candidate, reordered fixture enumeration or changed authority bytes, source or certification identity
- **WHEN** the facts diagnostic evaluates the request
- **THEN** unsupported selections refuse and normalized fixture order retains one facts ordering, while any changed bound byte or fact changes the observation digest

### Requirement: Committed Conformance facts select a bounded target

A committed Conformance authority SHALL pin the same path and digest as the scope project manifest.
The diagnostic SHALL select only `test:conformance`, requiring exactly executor `nx:run-commands`
and options `command`, `cwd` equal to the project root and `forwardAllArgs:false`. Only optional
`cache:false` and `inputs:["default","^production"]` SHALL be accepted, plus the exact
`["default","^production","{workspaceRoot}/apps/wbs/be-01/drizzle"]` tuple only for project
root and cwd `libs/wbs/adapters/store-sqlite`. These inputs are dependency metadata and SHALL
NOT select test sources. Task dependencies and other target/options keys SHALL be refused. The command SHALL be
`bun test ./<path>... --timeout=<positive decimal>` with single ASCII spaces and unique safe
project-relative `.test.ts` paths, each prefixed by exactly one literal `./`, without flags,
shell syntax, globs or traversal. Bare Bun filter operands SHALL be refused even if an exact
file exists. Only the required leading `./` SHALL be stripped when binding selected Git paths.
The Memory and SQLite `test:conformance` commands SHALL use explicit `./` file operands.
Every selected
path SHALL be a regular selected Git blob, including paths outside the Performance fixture set.
The observation SHALL bind every selected source tuple and emit committed Conformance path,
digest and sorted workspace-relative files intersecting the Performance fixtures. Legitimate
Performance overlap and an empty intersection SHALL remain valid, noncertifying observations.
Manual remains reviewed-empty; Architecture follows the committed policy requirement below.

#### Scenario: [TEST-AXES-081] Complete committed Conformance membership preserves overlap

- **GIVEN** a pinned supported target selecting committed tests both inside and outside the Performance fixture set
- **WHEN** the facts command inspects the exact candidate despite working replacements
- **THEN** it binds all selected source tuples and emits the sorted intersection, with absent authentication and false certification
- **AND** selecting only tests outside the fixture set emits an explicit empty committed membership
- **AND** an explicit file operand selects only that literal committed path despite a nested matching decoy

#### Scenario: [TEST-AXES-082] Unsupported committed Conformance authority and target refuse

- **GIVEN** a mismatched authority pin, missing target, extra target or option key, foreign executor, wrong cwd, forwarded arguments or unsupported cache or inputs
- **WHEN** the facts command validates committed Conformance
- **THEN** it refuses by name without JSON

#### Scenario: [TEST-AXES-083] Unsafe or incomplete Conformance selection refuses

- **GIVEN** a command with bare filters (including one with an exact file and a nested matching decoy), flags, shell syntax, globs, traversal, duplicates, whitespace variants, invalid timeout, or a selected file that is missing, nonregular or unreadable even outside the fixture intersection
- **WHEN** the facts command validates the complete committed selection
- **THEN** it refuses by name despite a working-tree repair

### Requirement: Committed Architecture facts bind declared rule fixtures

Committed Architecture authority SHALL pin `<projectRoot>/src/architecture-fixtures.json` and its selected blob digest. The shared runner policy SHALL require closed version 1, a nonempty fixture list, known unique rule IDs and each exact `src/architecture/<lowercase-rule-id>.architecture.test.ts` relation. Every mapped fixture SHALL be a regular readable selected Git blob before intersection, including disjoint fixtures. Immediate children ending `.architecture.test.ts` SHALL be mapped, including directory names with selected descendants; ordinary nested fixtures SHALL be ignored. Reviewed-empty Architecture SHALL refuse a present fixed policy or `test:architecture:level` target. Sources SHALL include the policy and every mapping once in canonical order; Architecture files SHALL be the sorted intersection with the complete Performance declaration. Membership describes policy declarations, not Bun execution collection, authentication, classification or certification. The runner SHALL preserve report creation, stale report clearing and validation error order.

#### Scenario: [TEST-AXES-084] Architecture declared membership preserves overlap and disjoint sources

- **GIVEN** pinned committed Architecture mappings and a complete Performance fixture scope
- **WHEN** source or packaged facts inspection runs
- **THEN** it binds every selected source, emits a sorted unique intersection and stays unauthenticated and noncertifying without executing candidate code

#### Scenario: [TEST-AXES-085] Architecture authority and complete selected mappings refuse substitution

- **GIVEN** a wrong policy path or digest, malformed policy, unknown or duplicate rule, wrong rule-file relation, or missing, unreadable, symlinked or nonregular mapping outside the intersection
- **WHEN** the facts command inspects committed Architecture
- **THEN** it refuses with no observation despite working-tree repairs

#### Scenario: [TEST-AXES-086] Architecture immediate children and reviewed empty contradictions refuse

- **GIVEN** an unmapped immediate suffix child including a directory with descendants, or reviewed-empty authority with a policy or Architecture target
- **WHEN** the facts command inspects the selected candidate
- **THEN** it refuses, while nested ordinary fixtures remain outside declared membership and the runner retains stale-report and error precedence behavior

### Requirement: Performance level observations join complete facts and publication

`inspect-performance-levels <repository> <committed-sha> <external-facts-authority> <external-rule-policy>` SHALL call the real level-facts and Performance publication inspectors. It SHALL require exact requested revision and matching candidate identity, matching declaration/config paths and Playwright project, matching config and selected fixture byte identities and modes, and equality of the complete Performance fixture scope, declared cases and recorded publication collection with no missing, extra or duplicate cases. It SHALL decode the same selected committed declaration through the shared decoder before comparing its semantic digest to publication; its raw byte pin is a separate identity. Any join or inherited inspector refusal SHALL emit no JSON observation.

The shared test-levels library SHALL expose the earlier first-match rows without requiring unknown later-row facts. Existing complete classification SHALL reuse those rows unchanged. The diagnostic SHALL classify the complete Performance fixture scope using Manual, Conformance, Architecture and Performance membership, with recorded Playwright membership required by the Performance row. Conformance SHALL precede Architecture, and Architecture SHALL precede Performance. Legitimate overlap SHALL produce a typed wrong-level isolation observation and nonzero CLI exit, preserving actual classified levels. A fully isolated Performance observation SHALL exit zero. Both outcomes SHALL bind both upstream observation digests and their complete own payload digest, with authentication absent and certification false. The diagnostic SHALL grant no coverage or admission and SHALL preserve existing version-1 source-owner outputs.

#### Scenario: [TEST-AXES-087] Complete Performance joins classify only the recorded fixture scope

- **GIVEN** matching real facts and publication inspectors bound to a selected committed declaration whose raw bytes have a different digest from normalized semantics
- **WHEN** source or packaged Performance level inspection runs
- **THEN** every declared and recorded fixture is classified Performance, isolation is typed successful and both upstream digests and the complete observation digest are bound without candidate execution or promotion

#### Scenario: [TEST-AXES-088] Performance facts and publication substitutions refuse joins

- **GIVEN** a changed revision, candidate, declaration path or semantic digest, config path or digest, project, source tuple or missing, extra or duplicate declared or recorded case
- **WHEN** the diagnostic joins the real inspector observations
- **THEN** it refuses by name without JSON, including coherent substitutions supplied by a broken inspector dependency

#### Scenario: [TEST-AXES-089] Higher precedence membership yields typed Performance isolation failure

- **GIVEN** valid complete Performance fixtures also declared by Conformance or Architecture, including a three-way overlap
- **WHEN** the shared earlier-row classifier applies first-match precedence
- **THEN** Conformance precedes Architecture, Architecture precedes Performance, and the CLI emits a typed wrong-level observation with nonzero exit while remaining unauthenticated and noncertifying

#### Scenario: [TEST-AXES-090] Performance level dispatch preserves inherited refusals and bounded inputs

- **GIVEN** unsupported CLI operands or an inherited facts or publication failure
- **WHEN** source or installed Performance level dispatch runs
- **THEN** it refuses without success JSON and preserves existing source-owner version-1 behavior

### Requirement: Architecture runner executes exact mapped files

The Architecture runner SHALL derive execution only from its validated `src/architecture-fixtures.json` policy, sort its selected canonical paths and pass every Bun test operand with exactly one literal `./` prefix. Policy and JUnit file identities SHALL remain canonical bare paths. Existing report clearing, validation order and refusal behavior SHALL be preserved.

#### Scenario: [TEST-AXES-091] Architecture execution excludes nested matching decoys

- **GIVEN** a valid mapped Architecture fixture and an unselected nested file whose path contains the same canonical fixture path, writes a marker and fails
- **AND** a stale JUnit report
- **WHEN** the real Architecture runner executes
- **THEN** the runner succeeds, the decoy marker is absent and fresh JUnit contains only the mapped canonical testcase
- **AND** with two mapped fixtures every operand excludes its matching nested decoy

### Requirement: Find-based Bun level targets execute literal selected files

The six existing find-based Memory Unit/Conformance, SQLite API/Unit/Conformance and core Unit commands SHALL emit `./src` or `./src/testing` operands and pass them unchanged to Bun. Memory Unit SHALL exclude `./src/testing/source-conformance.test.ts`. Collection identities SHALL remove exactly one leading `./` for canonical project-relative comparison. Existing selector scopes, report clearing, empty-selection and selector-error refusals SHALL remain intact. This contract covers existing shell-compatible paths and establishes no whitespace or glob safety.

#### Scenario: [TEST-AXES-092] Find-based level execution excludes nested matching decoys

- **GIVEN** each declared find-based level command, selected shell-compatible fixture paths, stale JUnit and nested matching marker/throw decoys outside the selector root
- **WHEN** the real manifest command executes through `sh -c`
- **THEN** it succeeds without executing a decoy and writes fresh JUnit containing exactly the selected canonical passing identities
- **AND** Unit and API select two files, Conformance selects its source filename, and Memory Unit excludes its Conformance fixture
- **AND** removing exactly one leading `./` preserves canonical collection identities without stripping a second prefix

### Requirement: Browser membership review facts preserve unknown earlier rows

The `inspect-browser-memberships` diagnostic SHALL consume the real Browser report inspector and strict external version-1 authority pinned to its exact committed revision, candidate, mode and report observation digest. The authority SHALL name each earlier Manual, Conformance, Architecture and Performance row exactly once, with either `unknown` or `reviewed-empty` state. Missing, duplicate or unsupported rows and states SHALL refuse. These are explicit external review assertions over the complete recorded Browser fixture collection, not discovered membership, authenticated reviews or classification authority. The observation SHALL retain complete source-bound report cases, sorted unique collection paths, all review states, both upstream authority/report identities, authentication absent, certifies false and a full-payload digest. It SHALL provide no classification, isolation, T1/T2 or coverage claim.

#### Scenario: [TEST-AXES-093] Browser review states bind the exact real recorded collection

- **GIVEN** a real immutable Browser bundle and an exact-bound external review authority with both unknown and reviewed-empty earlier rows
- **WHEN** source or installed Browser membership inspection runs
- **THEN** it preserves both states, all source-bound case identities and outcomes, the complete sorted collection and full-envelope digest without classifying tests or awarding credit

#### Scenario: [TEST-AXES-094] Browser membership authority refuses incomplete or inconsistent review facts

- **GIVEN** absent, unreadable, malformed or invalid authority, changed candidate, revision, mode or report digest, or missing, duplicate or unsupported membership row or state
- **WHEN** the production diagnostic runs
- **THEN** it refuses without success JSON at the responsible boundary

#### Scenario: [TEST-AXES-095] Browser membership inspection preserves upstream refusals and bounded dispatch

- **GIVEN** unsupported CLI operands, invalid committed selection or broken Browser evidence
- **WHEN** source or installed Browser membership dispatch runs
- **THEN** it preserves named usage and upstream refusals without JSON or promotion

### Requirement: Performance scenario observations are bounded to selected publication

`inspect-performance-scenarios <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability>` SHALL reuse the validated committed snapshot, decoded declaration, Performance publication and level observation. It SHALL require isolated Performance classification and the same external RulePolicy identity with `policy.scenarios`. It SHALL evaluate B3 over the entire selected active specification tree against its pinned predecessor before filtering the requested capability. Absent capabilities and unidentified requested scenarios SHALL refuse without JSON; unrelated unidentified B3 debt SHALL remain visible.

Only a terminal test-title prefix `[CAPABILITY-001] ` SHALL cite a scenario. A valid citation SHALL name an effective active B3 scenario. Missing, malformed, unknown or retired citations SHALL produce separate diagnostic findings and nonzero exit. The observation SHALL list every adopted requested scenario with sorted passing case IDs or `unobserved-in-selection`, meaning only absence from this selection. It SHALL bind revision, candidate, external policy, declaration, publication, level and B3 identities, complete selection, absent authentication, `certifies:false` and the complete payload digest. Source, policy, isolation or B3 failure SHALL produce no partial observation. Existing Performance level output SHALL be preserved. No global uncovered status, certified coverage, receipt, admission or Browser classification is introduced.

#### Scenario: [TEST-AXES-096] Complete Performance scenario rows retain selection limits

- **GIVEN** an isolated exact-bound Performance publication and an adopted capability with observed and unobserved scenarios
- **WHEN** source or installed scenario inspection runs
- **THEN** every adopted requested scenario carries passing case IDs or unobserved-in-selection and all identities bind the noncertifying payload

#### Scenario: [TEST-AXES-097] Terminal Performance citations diagnose invalid identities

- **GIVEN** missing, malformed, unknown or retired terminal citation prefixes
- **WHEN** scenario inspection runs
- **THEN** separate citation findings cause nonzero exit without granting those cases a scenario observation

#### Scenario: [TEST-AXES-098] Whole-tree B3 authority precedes capability filtering

- **GIVEN** unrelated active conflicts, an absent capability or an unidentified requested scenario
- **WHEN** scenario inspection runs
- **THEN** it refuses without JSON, while unrelated unidentified debt remains visible in an otherwise valid observation

#### Scenario: [TEST-AXES-099] Performance scenario dispatch preserves source and authority refusals

- **GIVEN** unsupported operands or changed selected source, declaration pin, external policy or publication
- **WHEN** source or installed dispatch runs
- **THEN** it refuses without partial observation and preserves existing Performance level output

### Requirement: Browser Conformance observations bind complete committed selections

`inspect-browser-conformance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>` SHALL consume the real Browser report inspector and one exact committed snapshot without executing candidate code. Its closed version-1 external authority SHALL contain revision, candidate, mode, reportObservationDigest, projectRoot and projectManifest with path and digest. The manifest path SHALL equal `<projectRoot>/project.json`. The command SHALL require exact requested/selected commit identity, matching report and authority pins, a complete nonempty Browser file collection inside that root, and exact selected regular-source mode/digest joins for every reported file. Multiple cases sharing a file SHALL retain their distinct case identities. Missing, unreadable, malformed or escaping authority, unsupported fields and inherited report failures SHALL refuse without JSON.

The selected manifest SHALL contain a supported `test:conformance` target interpreted with the same closed envelope and literal Bun command grammar as committed Performance Conformance facts. Its exact SQLite-only third input exception SHALL remain dependency metadata. Missing targets, unsupported shells, bare filters, globs, traversal, duplicate selectors, options or paths SHALL refuse. Every selected test SHALL be a readable regular selected Git blob before intersection, including disjoint files. Working-tree repairs SHALL confer no authority. Existing diagnostic contracts and Performance refusal behavior SHALL remain unchanged.

The observation SHALL retain the complete report, raw authority digest, project root and manifest pin, sorted unique Browser collection and complete union of manifest/Browser/Conformance source tuples. It SHALL report Conformance as committed with target, complete selectedFiles and sorted intersection files; Manual, Architecture and Performance memberships SHALL each remain unknown. Same-path source disagreement SHALL refuse. An empty intersection SHALL remain valid. All report outcomes SHALL be preserved. The complete canonical envelope digest SHALL bind all output fields except itself, including authentication absent and certifies false. Successful inspection SHALL exit zero; refusals SHALL produce named stderr, nonzero exit and no JSON. It SHALL establish no classification, isolation, execution guarantee, scenario join, coverage or admission.

#### Scenario: [TEST-AXES-100] Browser Conformance binds real reports and complete overlapping or disjoint selection

- **GIVEN** one real immutable Browser publication and an exact authority naming one committed project with a supported Conformance target
- **WHEN** source or installed inspection reads the selected Git objects
- **THEN** it binds the entire declared selection and every source tuple, preserves all report cases and outcomes, and emits the sorted overlap or an explicit empty intersection
- **AND** other earlier memberships remain unknown and the observation remains unauthenticated and noncertifying

#### Scenario: [TEST-AXES-101] Browser Conformance refuses authority and report scope substitutions

- **GIVEN** absent, unreadable, malformed UTF-8 or JSON, escaping, extra-field or unsupported-version authority, a mismatched revision, candidate, mode, report digest or manifest pin, an empty or out-of-root collection, or a report source tuple differing from selected Git bytes
- **WHEN** the production command inspects the exact selection
- **THEN** it refuses by name without JSON, including annotated tag peeling and coherent substitutions from a broken inspector dependency

#### Scenario: [TEST-AXES-102] Browser Conformance refuses unsupported or incomplete committed targets

- **GIVEN** a missing or malformed manifest/target, unsupported envelope, cwd, input tuple or command, a duplicate selector or a missing, nonregular or unreadable selected source even outside the Browser intersection
- **WHEN** the command validates the complete committed selection
- **THEN** it refuses without JSON despite working-tree repairs, and a bare filter with a nested matching decoy cannot establish membership
- **AND** the existing Performance decoder and diagnostic contracts retain their behavior

#### Scenario: [TEST-AXES-103] Browser Conformance preserves canonical identity and bounded dispatch

- **GIVEN** reordered report cases or target selectors, multiple cases sharing a source, changed source bytes, changed authority bytes or unsupported CLI operands
- **WHEN** source and installed executable dispatch inspect the input
- **THEN** canonical arrays are sorted and deduplicated, distinct cases remain intact, the complete envelope digest reflects all identity changes, and unsupported operands or inherited report failures refuse
- **AND** removing source validation, pin joins, collection completeness, digest binding or noncertifying output invariants makes its named production-path assertion fail

### Requirement: Browser Conformance permits explicit reviewed-empty authority

The existing command SHALL preserve version-1 committed-selection observations byte-for-byte for identical inputs. A closed version-2 external authority SHALL retain every version-1 identity and project pin and require `conformance:{kind:'committed'}` or `conformance:{kind:'reviewed-empty'}` with no additional fields. Version-1 SHALL continue to refuse a conformance field. Missing, malformed, unsupported or unreadable authority SHALL refuse without JSON.

Reviewed-empty SHALL be an explicit external assertion over the complete Browser collection. The selected regular manifest SHALL remain readable, pinned and valid with object-valued targets. Any own `test:conformance` property, including null, false or an unsupported envelope, SHALL contradict reviewed-empty and refuse without JSON. Missing, malformed or unreadable selected manifests SHALL refuse despite working-tree repairs. Committed authority SHALL use the unchanged complete bounded selection and an empty intersection SHALL remain committed.

Version-2 observations SHALL retain schemaVersion 1, the complete real report, Browser collection, manifest and sorted source union, full raw-authority digest, all identity joins, unknown other memberships, absent authentication, certifies false and full-envelope digest. Reviewed-empty membership SHALL be exactly `{kind:'reviewed-empty'}`. Source and installed dispatch SHALL agree.

#### Scenario: [TEST-AXES-116] Browser Conformance explicit reviewed-empty succeeds

- **GIVEN** an explicit version-2 reviewed-empty authority and a pinned committed manifest with valid targets and no Conformance property
- **WHEN** the existing production command inspects a real complete Browser publication
- **THEN** it emits exactly reviewed-empty membership with complete report, collection and Browser/manifest sources

#### Scenario: [TEST-AXES-117] Browser Conformance contradictory or invalid empty authority refuses

- **GIVEN** any present Conformance property, invalid or missing disposition, unsupported version or keys, or missing malformed unreadable manifest
- **WHEN** production inspection validates reviewed-empty authority and selected state
- **THEN** it refuses by name without JSON despite working-tree repairs

#### Scenario: [TEST-AXES-118] Browser Conformance version-1 compatibility is preserved

- **GIVEN** unchanged version-1 committed authority or explicit version-2 committed authority
- **WHEN** the existing command inspects complete overlapping or disjoint selections
- **THEN** version-1 output bytes remain unchanged and disjoint version-2 selection remains committed with empty intersection

#### Scenario: [TEST-AXES-119] Browser Conformance empty identity and installed dispatch remain complete

- **GIVEN** a real reviewed-empty publication with failed and skipped cases, reordered authority bytes or substituted identity pins
- **WHEN** source and installed executable dispatch inspect it
- **THEN** complete identities and raw-byte/full-envelope digests remain bound, substitutions refuse, other memberships remain unknown and certification remains false

### Requirement: Capability scenario ledger remains a diagnostic

`inspect-scenario-ledger` SHALL enumerate every adopted effective scenario of the requested capability from the complete isolated Performance scenario observation. The external version-1 ledger authority SHALL pin exact committed revision, candidate, capability and Performance observation digest and contain unique obligations. Omitted obligations SHALL remain named unassigned debt. Foreign, retired, duplicate, malformed and conflicting obligations SHALL refuse without partial JSON.

An automated obligation SHALL name its lowest sufficient level explicitly. Performance SHALL require a passing cited case in the selected isolated publication; other levels SHALL remain unsupported-level debt. Inapplicability SHALL have a nonblank reason. Manual SHALL call the existing Manual observation inspector on an external report and join exact scenario, revision, candidate, policy, evaluation instant and observation digest. Current, stale, failed and overdue verdicts SHALL remain typed observations.

The ledger SHALL preserve the full upstream B3 report, citation findings and unidentified debt, normalize obligation order, digest the complete payload, emit absent authentication and `certifies:false`, and exit nonzero for diagnostic debt. Malformed authority, unreadable evidence and join failures SHALL emit no partial JSON. This command SHALL register no coverage rule, admission or certification.

#### Scenario: [TEST-AXES-104] Ledger enumerates effective scenarios despite missing obligations

- **WHEN** one adopted scenario has a passing automated obligation and another has no obligation
- **THEN** the second scenario is named unassigned debt and the command exits nonzero

#### Scenario: [TEST-AXES-105] Ledger validates exact closed authority and upstream identity

- **WHEN** authority shape, obligation identity, external file or candidate publication pins differ
- **THEN** the command refuses without partial JSON

#### Scenario: [TEST-AXES-106] Ledger preserves upstream debt and diagnostic identity

- **WHEN** a publication loses a citation or has unrelated unidentified B3 debt
- **THEN** the complete upstream observation and debt remain in the noncertifying ledger

#### Scenario: [TEST-AXES-107] Ledger joins real Manual observations

- **WHEN** an obligation references a current, stale, failed or overdue external Manual observation
- **THEN** the exact joined typed verdict is retained and noncurrent observations remain debt

### Requirement: Browser Architecture membership observations

Twilight Burokrat SHALL expose `inspect-browser-architecture <repository> <full-committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>` as a noncertifying observation over one real complete Browser report and one project. A closed version-1 external authority SHALL pin revision, candidate, mode, report observation digest, project root, project manifest path and digest, and an explicit Architecture `reviewed-empty` or committed fixed policy path and digest. The inspector SHALL read exact selected regular Git blobs, validate the complete mapped Architecture selection through the existing rule mapping and immediate-child discovery validators before Browser intersection, and refuse contradictory empty assertions. It SHALL retain complete report and raw authority, raw authority digest, sorted complete Browser collection, sorted selected files and intersection, and the sorted deduplicated source union with same-path mode and digest agreement. Manual, Conformance and Performance SHALL remain unknown; authentication SHALL be absent and certification false. The observation digest SHALL bind the complete payload. Invalid inputs SHALL produce named stderr, nonzero exit and no partial JSON.

#### Scenario: [TEST-AXES-108] Committed Browser Architecture complete overlap and disjoint observations

- **WHEN** a complete real Browser report and exact external authority select committed Architecture fixtures overlapping or disjoint from the Browser collection
- **THEN** the observation preserves all report outcomes, selected fixtures and source tuples, emits the exact sorted intersection and complete payload digest, and grants no classification or coverage

#### Scenario: [TEST-AXES-109] Browser Architecture authority and source joins refuse substitution

- **WHEN** authority is absent, unreadable, malformed, unsupported, escaping or wrongly pinned, or upstream capture or source tuples disagree
- **THEN** the production command refuses with a named diagnostic and no observation

#### Scenario: [TEST-AXES-110] Browser Architecture complete committed policy and empty assertions are checked

- **WHEN** any mapped fixture or manifest or policy is missing, nonregular, unreadable or invalid, any immediate Architecture suffix child is unmapped, or reviewed-empty contradicts a fixed policy, its descendants or the declared Architecture target
- **THEN** the production command refuses even for disjoint fixtures and working-tree repairs, preserving the runner's immediate-child discovery boundary

#### Scenario: [TEST-AXES-111] Browser Architecture deterministic identity and installed dispatch

- **WHEN** source or installed command inspects exact committed inputs with canonical collection and source ordering or receives unsupported arguments or selection
- **THEN** output preserves complete deterministic identity and raw authority sensitivity, while symbolic and annotated tag selection and invalid CLI usage refuse before publication inspection

### Requirement: Browser Performance membership observations

Twilight Burokrat SHALL expose `inspect-browser-performance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>`. Its closed version-1 external authority SHALL pin revision, candidate, mode, reportObservationDigest, projectRoot, projectManifest `{path,digest}`, declaration `{path,digest}`, config `{path,digest}` and project. It SHALL capture exact immutable Git selection and the complete real Browser report, require the manifest at `${projectRoot}/project.json`, a nonempty complete Browser collection within the project root, and distinct manifest, declaration and config paths. It SHALL read all selected regular manifest, declaration, config, Browser and declared fixture blobs inside the root before computing intersection, including disjoint fixtures. It SHALL use the shared Performance decoder and semantic digest, require nonempty fixtures and exact declaration config/project agreement with authority. Browser config/project MAY differ from Performance.

The observation SHALL retain the complete Browser report and outcomes, parsed authority and raw digest, complete decoded declaration and semantic digest, sorted unique Browser collection, complete sorted unique fixtures and intersection, and sorted deduplicated source tuples with same-path mode/digest agreement. Manual, Conformance and Architecture SHALL remain unknown, authentication absent, certification false; the complete canonical observation digest SHALL bind every field except itself. Disjoint declarations SHALL produce a valid empty intersection. Refusals SHALL emit named stderr, nonzero exit and no JSON. This diagnostic SHALL grant no classification, runner, isolation, admission, or reviewed-empty shortcut.

#### Scenario: [TEST-AXES-112] Browser Performance preserves complete overlapping disjoint and shared fixture observations

- **WHEN** exact Browser reports and external authority select a complete nonempty Performance declaration
- **THEN** the complete decoded declaration, semantic digest, fixture set, intersection, source union and report outcomes remain bound, including shared fixtures and different Browser config/project

#### Scenario: [TEST-AXES-113] Browser Performance refuses authority report and selected source substitutions

- **WHEN** authority or pins are missing, unreadable, malformed, unsupported, escaping or mismatched, or exact immutable selection and upstream report or source tuples disagree
- **THEN** source and installed commands refuse by name without partial JSON

#### Scenario: [TEST-AXES-114] Browser Performance validates every declared source before intersection

- **WHEN** manifest, declaration, config or any fixture is missing, nonregular, unreadable, malformed, outside root, wrongly pinned or semantically invalid even if disjoint
- **THEN** inspection refuses despite working-tree repairs and cannot bypass shared declaration decoding, config/project agreement or nonempty fixtures

#### Scenario: [TEST-AXES-115] Browser Performance binds canonical identity and installed dispatch

- **WHEN** complete report cases, shared fixtures, authority bytes, selected bytes, outcomes or bounded command arguments change
- **THEN** complete canonical observation identity and sorted unique arrays reflect all relevant changes, and source and installed dispatch preserve named refusals and noncertifying output

### Requirement: Version two scenario ledger joins Browser observations

The unchanged ledger command SHALL accept a closed version-2 external authority retaining all version-1 fields and requiring `browser` with mode, canonical absolute external reviewAuthorityPath, conformanceAuthorityPath, architectureAuthorityPath, performanceAuthorityPath and observationDigest. It SHALL invoke the real Browser scenario inspector with all four authorities even without Browser obligations. Supplied observation bodies SHALL refuse. Version-1 inputs, outputs, digest and refusals SHALL remain unchanged.

Before assigning obligations, version two SHALL verify complete canonical Browser, levels and report digests; exact revision, candidate, capability, mode, policy and nested report identities; absent authentication and false certification; identical full Performance/Browser B3 reports and requested scenario inventories. It SHALL preserve both full observations in a schema-2 envelope. Only automated Browser lowest-level obligations SHALL use complete Browser cases: all passed means passing-in-selection, any failed means failed-in-selection, otherwise any skipped means skipped-in-selection, and absence means unobserved-in-selection. Failed, skipped and unobserved verdicts SHALL remain debt. Other levels SHALL receive no Browser satisfaction. Both citation sources SHALL retain source labels, shared unidentified B3 debt SHALL appear once, valid debt SHALL exit one with JSON, refusal SHALL emit stderr without JSON, and zero debt SHALL remain noncertifying.

#### Scenario: [TEST-AXES-132] Browser ledger retains complete observations and v1 compatibility

- **WHEN** a version-two obligation authority selects real Browser and Performance observations
- **THEN** complete upstream observations and canonical identity remain, and version one retains its exact behavior

#### Scenario: [TEST-AXES-133] Browser ledger refuses closed authority and exact observation join faults

- **WHEN** external authority, nested identities, digests, diagnostic boundaries or complete B3 inventories differ
- **THEN** the production command refuses before obligations without partial JSON even after repinning outer digests

#### Scenario: [TEST-AXES-134] Browser ledger preserves outcomes and source debt without cross-level credit

- **WHEN** Browser cases pass, fail, skip or remain unobserved and either citation source has debt
- **THEN** full cases and outcomes remain, only Browser obligations receive their verdicts, source citation debt remains and shared unidentified debt appears once

#### Scenario: [TEST-AXES-135] Browser ledger validates the full tree and installed dispatch

- **WHEN** an unrelated B3 conflict exists or the installed executable consumes the same version-two authority
- **THEN** the conflict refuses before capability filtering and installed output, digest and exit behavior match source dispatch

### Requirement: Browser-only capability scenario ledger

The system SHALL provide `inspect-browser-scenario-ledger <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>` and typed `inspectBrowserScenarioLedger`. Its closed schema-one authority SHALL contain revision, candidate, capability, Browser mode/four membership authority paths/observation digest, and the existing closed obligation dispositions. It SHALL call the real Browser scenario inspector without requiring separate Performance execution evidence or level authority. All four Browser membership authorities, including Performance membership, SHALL remain mandatory. Existing scenario-ledger v1/v2 output and refusals SHALL remain unchanged.

#### Scenario: [TEST-AXES-136] Browser-only ledger preserves full observations without Performance execution

- **WHEN** real Browser/JUnit/B3 evidence and four Browser membership authorities exist without a Performance execution publication or level authority
- **THEN** every adopted requested row and complete Browser observation is retained, obligations sort canonically, authentication is absent, certification is false and the digest binds the complete diagnostic

#### Scenario: [TEST-AXES-137] Browser-only ledger refuses strict authorities and broken observation joins

- **WHEN** authority schema/path/readability/UTF8, exact SHA/identity/policy/mode/digest or complete B3 joins fail, including with no Browser obligations
- **THEN** the production command refuses without partial JSON and every Browser authority remains mandatory

#### Scenario: [TEST-AXES-138] Browser-only ledger retains outcomes manual observations and labelled debt

- **WHEN** Browser cases pass, fail, skip or are absent, obligations are missing/inapplicable/unsupported, Manual reports are evaluated, or unrelated B3 and citation debt exists
- **THEN** only automated Browser lowest-level obligations receive Browser credit, real Manual joins retain outcomes and debt, citation debt is labelled Browser once, and debt emits complete JSON with exit one

#### Scenario: [TEST-AXES-139] Browser-only ledger validates full tree installed dispatch and legacy compatibility

- **WHEN** unrelated competing overlays exist or source and installed commands inspect passing/debt/refused inputs
- **THEN** full-tree conflicts refuse before capability filtering and installed dispatch agrees with source while old v1/v2 behavior remains exact

### Requirement: Browser T2 diagnostic consumer

The system SHALL provide `inspect-browser-t2 <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>` and typed `inspectBrowserT2`, consuming `inspectBrowserScenarioLedger` directly. It SHALL retain exact revision/candidate/capability/instant/publication scope, complete nested ledger with digest and policy identity, complete original citation findings, absent authentication, false certification and a canonical complete-payload digest. It SHALL enumerate every Browser ReportCase exactly once sorted by caseId, preserving the full record and a citation verdict `cited` with scenarioId, `missing`, `malformed` or `inactive`.

#### Scenario: [TEST-AXES-140] Browser T2 retains the complete citation partition and diagnostic identity

- **WHEN** real committed Browser evidence includes active citations in the requested or another capability, missing/malformed/inactive terminal citations and passed/failed/skipped cases
- **THEN** every report case has exactly one complete sorted row and correct verdict, original findings and nested ledger remain complete, and the full digest identifies only a noncertifying diagnostic

#### Scenario: [TEST-AXES-141] Browser T2 separates citation observations from ledger debt and command status

- **WHEN** real Browser ledger obligations create unassigned/unsupported/unobserved/manual or outcome debt, with or without invalid citations
- **THEN** a valid T2 diagnostic retains all ledger debt and original findings and exits zero without allowed, covered or passed admission claims

#### Scenario: [TEST-AXES-142] Browser T2 refuses invalid joins and incomplete or conflicting partitions

- **WHEN** returned ledger or nested Browser/report identity, policy, scope, authentication, certification or digest differs, or citations/findings omit, duplicate, conflict with or alter a report case
- **THEN** production dispatch exits one with a named refusal and no partial JSON

#### Scenario: [TEST-AXES-143] Browser T2 preserves source installed parity and strict trusted boundaries

- **WHEN** source and built installed dispatch inspect valid debt-bearing evidence, or a required authority is missing/unreadable/malformed or CLI selection/instant/arity is invalid
- **THEN** valid JSON and exit behavior match exactly, and invalid trusted state refuses with no partial JSON through both entry points
