## ADDED Requirements

### Requirement: Cross-project relationships retain endpoint identity and successor ownership

A cross-project dependency SHALL retain stable predecessor and successor project/work-item/step identities and its existing FS, SS or FF type and whole, node or descendant-step scopes. Its successor project SHALL own its edits and history. Creation or editing SHALL require successor edit permission and readable endpoints within the same organization; foreign and absent targets SHALL be indistinguishable.

#### Scenario: Readable restricted predecessor

- **GIVEN** a caller can edit the successor project and read but not edit the predecessor project
- **WHEN** the caller adds an otherwise valid external dependency
- **THEN** the relationship is accepted without modifying the predecessor's authored fields

#### Scenario: Foreign endpoint is concealed

- **WHEN** the caller supplies an endpoint from another organization
- **THEN** the operation refuses indistinguishably from an absent endpoint and stores no relationship, revision, history or event

### Requirement: Cycles are judged in the resolved task and step graph

Validation SHALL include every affected project's authored, legacy and workflow edges in one coherent resolved step-node graph. It SHALL reject actual directed cycles and self-node pairs, including cycles introduced by selector expansion. It SHALL NOT reject a graph merely because traversal returns to a project or work item through different nodes.

#### Scenario: Valid project interleaving

- **GIVEN** project A contains Design then Test and project B contains Build
- **WHEN** A.Design → B.Build and B.Build → A.Test are added
- **THEN** both relationships are accepted and their order is respected

#### Scenario: Genuine external cycle

- **GIVEN** A.Design → B.Build already exists
- **WHEN** B.Build → A.Design is added
- **THEN** the write refuses atomically as a cycle

#### Scenario: Different task names still form a cycle

- **GIVEN** A.Design → B.Build and B.Build → A.Test
- **WHEN** A.Test → A.Design is proposed
- **THEN** the cycle is refused even though it spans different tasks and projects

### Requirement: Dependencies remain hard constraints before priority

The scheduler SHALL honor dependency eligibility and each FS, SS or FF boundary inequality before using project or work-item priority to choose between eligible work. A lower-ranked project or lower-priority work item SHALL remain a valid predecessor. Both schedule engines and every displayed project projection SHALL satisfy the same connected constraints.

#### Scenario: Higher-priority task waits locally

- **GIVEN** a low-priority work item precedes a high-priority work item in one project
- **WHEN** their FS schedule is calculated
- **THEN** the low-priority predecessor finishes before the successor starts

#### Scenario: Higher-ranked project waits remotely

- **GIVEN** a high-ranked project's task has a low-ranked project's task as its FS predecessor
- **WHEN** dates are calculated with shared people enabled or disabled
- **THEN** the predecessor finishes before the successor starts without requiring a project-rank edit

### Requirement: Connected derivation uses one coherent captured state

Graph validation, scheduling and readiness SHALL consume a coherent snapshot of the involved project settings, steps, work items, relationships, capacities and progress. The snapshot SHALL include all incident dependencies and shared-capacity influences needed for the result. Missing or unreadable required endpoint state SHALL produce an explicit failure, never an omitted edge or an apparently ready successor.

#### Scenario: Predecessor changes during capture

- **WHEN** a predecessor edit commits concurrently with a connected-plan read
- **THEN** the read uses one consistent pre-edit or post-edit state, not mixed endpoint facts

#### Scenario: Required endpoint evidence is unavailable

- **WHEN** a connected dependency cannot supply its required endpoint evidence
- **THEN** the read fails explicitly without publishing an unconstrained successor schedule

### Requirement: Calendar placement preserves each project's start

Connected placement SHALL translate each project's workday coordinates through its own start date while preserving its estimate, step-order, floor and deadline semantics. It SHALL preserve existing shared versus isolated people-capacity rules and project-local capacity limits. An undated external prerequisite SHALL still be linkable and affect readiness; calendar placement requiring its unknown anchor SHALL report an explicit unavailable-date state.

#### Scenario: Different start dates

- **GIVEN** a predecessor and successor project begin on different dates
- **WHEN** their FS dependency is scheduled
- **THEN** its bound is compared on the same calendar axis and each displayed date respects its project start

#### Scenario: Undated prerequisite

- **GIVEN** a dated project depends on an undated project's work
- **WHEN** calendar placement requires that external boundary
- **THEN** the UI reports the missing project start date and does not substitute day zero
- **AND** the relationship and its readiness effect remain visible

### Requirement: Structural writes and history preserve external graph integrity

Dependency-affecting edits, tree and step mutations, dynamic anchor changes, undo/redo and batches SHALL validate the complete resulting connected graph in their transaction. Refusal SHALL preserve authored state, revisions, journal and events. First-child hand-down SHALL carry incident endpoint mappings atomically without changing their scope.

#### Scenario: Undo would now create a cycle

- **GIVEN** another project has added a relationship since an edge was removed
- **WHEN** undo would restore that edge and close a connected cycle
- **THEN** undo refuses atomically with the conflict visible

#### Scenario: Hand-down keeps external endpoint identity

- **GIVEN** a leaf step has an external dependency
- **WHEN** its first child inherits that step through hand-down
- **THEN** the relationship follows the same hand-down mapping and affected projects are invalidated together

### Requirement: Deleting an external prerequisite requires explicit relationship removal

Deleting a project, work item or step that would remove an externally referenced predecessor SHALL refuse until affected relationships are removed or explicitly reassigned by authorized editors. Deleting a successor SHALL remove its owned incoming relationships in its existing undoable transaction. Internal-only deletion behavior SHALL remain unchanged.

#### Scenario: External blocker is not silently removed

- **GIVEN** project B's task waits on project A's task
- **WHEN** A's editor deletes the referenced task or project
- **THEN** deletion refuses and B's prerequisite remains intact

### Requirement: External progress drives existing readiness and live reads

External progress, holds, relevant dates and structural edits SHALL invalidate and notify every affected dependent projection. Readiness and startable admission SHALL use the same relationship and node-status semantics as equivalent local edges. Derived external readiness SHALL NOT be separately authored or silently retained after its evidence changes.

#### Scenario: External predecessor completes

- **GIVEN** B is waiting only on an unfinished FS predecessor in A
- **WHEN** that predecessor completes
- **THEN** B's live readiness and startable read reflect the new state without a manual dependency edit

### Requirement: Alphabetic tokens enable bounded project autocomplete

An empty current token or a token beginning with a digit SHALL offer only current-project candidates and SHALL NOT initiate external-project discovery. A token beginning with a letter SHALL enable bounded case-insensitive project autocomplete while retaining local title matches. Choosing a project SHALL establish an explicit search scope rather than create a relationship. Selecting an endpoint SHALL retain existing one-click and Customize semantics.

#### Scenario: Local default has no external projects

- **WHEN** Depends on is opened with an empty query or the token `080`
- **THEN** only local candidates are offered and no external discovery request is sent

#### Scenario: Project abbreviation with punctuation

- **WHEN** the current token is `puni-c`
- **THEN** matching readable projects such as `PUNI-CORE` are offered separately from local title matches
- **AND** selecting that project scopes the next endpoint search without writing a dependency

#### Scenario: Local step token stays local

- **WHEN** the current token is `010.s1-dev`
- **THEN** its letters do not trigger project autocomplete because the token begins with a digit

### Requirement: Autocomplete races and failures remain visible and bounded

Remote discovery SHALL debounce input, bound response size and expose loading, no-match and failure states separately. Superseded query or project responses SHALL be cancelled or ignored. Returning to empty or numeric input SHALL remove external suggestions and invalidate pending external answers.

#### Scenario: Late alphabetic response cannot pollute numeric query

- **GIVEN** a request for `PUNI` is pending
- **WHEN** the user replaces the token with `080` before the response arrives
- **THEN** the late project response does not populate the numeric dropdown

#### Scenario: Failed lookup is not empty results

- **WHEN** authorized remote discovery fails
- **THEN** a retryable error is rendered rather than a successful empty list

### Requirement: Qualified input preserves batches and remote editing

The table SHALL accept mixed local and qualified references separated by commas or whitespace, preserve successful resolutions and report unresolved or ambiguous tokens explicitly. Selection SHALL replace only the current token. Table, card and folded-step editors SHALL use each endpoint's own project steps; no cross-project same-step assumption SHALL silently substitute a different step.

#### Scenario: Mixed references retain the earlier tokens

- **WHEN** the user enters `010, PUNI-CORE.080.39 PUNI_CORE.020.s1-dev`
- **THEN** each token resolves in its proper project and earlier tokens survive autocomplete selection
- **AND** duplicate resolved endpoints are not added twice

#### Scenario: External step has different identity

- **GIVEN** two projects each have a step labeled Dev with different IDs
- **WHEN** the external step endpoint is customized
- **THEN** its own project's step identity is selected explicitly rather than copying the successor's step ID

### Requirement: External relationships have complete readable labels and stable navigation

External dependency chips, accessible labels and details SHALL include their project abbreviation and full qualified address. Navigation SHALL use stable project and endpoint identities. Local chips SHALL remain compact, and external endpoints SHALL not be treated as rows in the local table for highlighting or misleading chart arrows.

#### Scenario: Abbreviation and numbering change

- **GIVEN** an existing external relationship
- **WHEN** its predecessor abbreviation or number changes
- **THEN** the live label updates while navigation and dependency identity still select the same endpoint

### Requirement: Incompatible readers cannot silently ignore external dependencies

Release activation SHALL prevent cross-project relationships from being authored while an incompatible reader or writer can serve the store. Rollback or downgrade with retained external relationships SHALL refuse explicitly unless a verified compatible recovery procedure is used. Each migration SHALL ship a matching down migration and preserve old local relationships.

#### Scenario: Old application is still serving

- **WHEN** external relationship creation is attempted before compatible application activation is established
- **THEN** creation refuses rather than storing an edge an old reader would ignore
