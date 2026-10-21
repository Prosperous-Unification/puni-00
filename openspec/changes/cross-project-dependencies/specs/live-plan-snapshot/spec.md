## MODIFIED Requirements

### Requirement: Working plans expose committed typed dependency mutations

A working plan SHALL include legacy and typed dependencies distinctly after each successful mutation in its admitted batch. A retained read after a typed edit SHALL see its stable relationship ID, relationship type, endpoint scopes, owning project IDs, work-item IDs and applicable step node IDs or step IDs; a refused mutation SHALL NOT change the working plan. Cross-project endpoint labels SHALL come from authorized endpoint projections rather than requiring the predecessor to exist in the successor project's tree. Mutation validation SHALL reject actual cycles among resolved work items or steps, including cross-project cycles, and SHALL NOT reject an acyclic relationship solely because the projects also connect in the opposite direction.

#### Scenario: A typed edit is visible to a later batch command

- **GIVEN** an admitted batch with a typed dependency edit
- **WHEN** a later command reads the working plan
- **THEN** it sees the committed relationship state and endpoint label

#### Scenario: A refused edit leaves the working plan unchanged

- **GIVEN** a typed edit that would close a resolved step cycle across projects
- **WHEN** validation refuses the command
- **THEN** a retained read sees the preceding dependency set

#### Scenario: Interleaved projects remain valid without a work-item cycle

- **GIVEN** A.design precedes B.build and B.build precedes A.test
- **WHEN** the working plan validates the relationships
- **THEN** it accepts them when their resolved work-item and step graph is acyclic

## ADDED Requirements

### Requirement: Live plans project external endpoint meaning and navigation identity

Live reads SHALL project authorized external endpoints without loading remote trees. Projections SHALL include project, work-item, step and relationship identities, scope, project abbreviation, work-item number and name, and applicable step reference and name. Qualified addresses SHALL use dots, including `PUNI-CORE.080.39` and `PUNI_CORE.010.s1-dev`. Navigation SHALL use stable identities rather than parsing displayed addresses.

#### Scenario: A remote predecessor renders without its project tree

- **GIVEN** a successor depends on a step in another authorized project
- **WHEN** its live plan is read without loading the predecessor project's tree
- **THEN** the dependency displays the projected qualified step reference and work-item and step names
- **AND** its navigation target identifies the predecessor's project and stable step node

#### Scenario: Abbreviation and numbering edits preserve navigation

- **GIVEN** a visible cross-project dependency
- **WHEN** the predecessor's project abbreviation or work-item number changes
- **THEN** a refreshed projection displays the new qualified address
- **AND** navigation and the stored relationship still identify the original endpoint

### Requirement: External endpoint evidence fails closed

A missing or invalid required external projection SHALL fail the live read explicitly. Readers SHALL NOT omit the dependency, substitute a local work item with the same number or invent a label. Authorization failure SHALL NOT expose protected endpoint facts or silently remove its scheduling constraint.

#### Scenario: Required external evidence is missing

- **GIVEN** a live plan contains a cross-project dependency whose required endpoint projection is missing or malformed
- **WHEN** the plan read is assembled or validated at the client boundary
- **THEN** it fails explicitly without presenting a complete-looking plan that omitted the dependency

#### Scenario: External access is refused

- **GIVEN** a live plan depends on an external endpoint the reader cannot access
- **WHEN** its required projection is authorized
- **THEN** the read fails without exposing protected facts or dropping the scheduling constraint

### Requirement: External dependency changes invalidate affected live plans

Committed endpoint changes to labels, scope expansion, access, readiness, scheduling inputs or scheduled boundaries SHALL invalidate affected dependent live plans, including transitive schedules. Invalidation SHALL NOT require browser subscriptions to every predecessor tree. Refresh SHALL reauthorize external facts and obtain coherent endpoint and scheduling evidence.

#### Scenario: A predecessor changes while only its successor is open

- **GIVEN** an open plan depends on work in another project and the predecessor project is not open in that browser
- **WHEN** the predecessor's progress, estimate or scheduled boundary changes
- **THEN** the affected plan is invalidated and refreshed with updated dependency readiness and dates

#### Scenario: An external step selection changes

- **GIVEN** a cross-project dependency selects descendant steps under a parent
- **WHEN** a tree or step edit changes the selector's resolved endpoints
- **THEN** affected dependent plans are invalidated and the new resolved work-item and step graph is validated

### Requirement: Dependent refresh preserves dependency ordering and freshness

Refresh SHALL apply dependencies before priority when recomputing eligibility and dates. A failed refresh SHALL surface a stale or failed state and SHALL NOT present the preceding schedule as current.

#### Scenario: Higher priority cannot conceal an external prerequisite

- **GIVEN** a high-priority successor waits for a lower-priority external predecessor
- **WHEN** the affected live schedule is refreshed
- **THEN** the successor remains constrained by its dependency before priority orders eligible work

#### Scenario: A dependent refresh fails

- **GIVEN** external prerequisite evidence changed after the last successful read
- **WHEN** the dependent plan cannot obtain required authorized endpoint or schedule evidence
- **THEN** it displays a stale or failed state and does not present the preceding schedule as current
