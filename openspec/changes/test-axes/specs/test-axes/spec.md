## ADDED Requirements

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
| 7     | Listed in `apps/wbs/fe-01/vitest.node-suites.ts`                                                                                                                                                                                                                   | Unit         |
| 8     | Under `apps/wbs/fe-01/src`, ending `.test.tsx` or `.test.ts` and not in that list                                                                                                                                                                                  | View         |
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

The active selector SHALL parse immutable specification ASTs and apply `ADDED`, `MODIFIED`, and `REMOVED` operations by the exact capability and requirement title. It SHALL retain canonical requirement order and append new requirements in stable key order. A `MODIFIED` requirement SHALL retain every canonical scenario by identifier, or by exact title when unidentified. A removed adopted identifier SHALL have a journal retirement. Duplicate or competing operations, absent predecessors, unsupported operation sections and scenario headings outside a requirement SHALL refuse evaluation. Synced identical `ADDED` requirements SHALL share one lineage. Selector version 2 evidence SHALL bind every active input path and content digest, effective requirements and source aliases, applied operations and removals.

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
- **THEN** the selector version 2 evidence identity changes and records the input and alias

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
