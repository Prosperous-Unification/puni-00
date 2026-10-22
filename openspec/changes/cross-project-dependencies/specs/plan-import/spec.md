## MODIFIED Requirements

### Requirement: Plan transfer preserves typed and legacy dependencies

New-version export SHALL distinguish typed endpoint/type relationships from legacy `depReach` links and preserve both on import. Legacy-format import SHALL retain project-reach semantics; malformed new-format endpoint, scope, step, type or duplicate relationship SHALL be refused, including a node endpoint on a parent or a descendant-step endpoint on a leaf. Internal endpoint references SHALL remain file-local and SHALL be remapped to newly created work-item and step identities on import or copy. External references SHALL be explicitly distinguished from internal references and SHALL carry stable source project/work-item/step identities, scope and relationship type; abbreviation and human-address metadata SHALL be descriptive, never authority for rebinding. Whole-project copy and subtree duplication SHALL remap internal relationships and preserve external prerequisites of copied successors, substituting only the copied successor endpoint and retaining the original predecessor. They SHALL create new relationship identities. An outgoing relationship whose predecessor is copied but whose successor is not copied SHALL remain attached to the original predecessor and SHALL NOT be cloned or changed in the successor-owning project. Relationships that touch no copied endpoint SHALL NOT be duplicated. Every resulting external relationship SHALL be validated against current same-organization ownership, endpoint existence, authorization and the resolved dependency graph before committing. Unresolved, unauthorized or cyclic external references SHALL refuse the operation atomically rather than being discarded or converted to local references. A versioned transfer contract SHALL distinguish external references from older documents; an older reader that cannot preserve them SHALL refuse that document without partial writes.

#### Scenario: Round-trip multiple step links

- **GIVEN** two distinct FS step relationships between the same work-item pair plus one legacy link
- **WHEN** a plan is exported and imported
- **THEN** all three retain their distinct endpoint and reach meanings

#### Scenario: A step reference is absent

- **GIVEN** a new-format import references an internal step not in its project step list
- **WHEN** the import is validated
- **THEN** it is refused without a partial plan write

#### Scenario: Duplicate an internal relationship

- **GIVEN** a subtree contains both endpoints of a typed dependency
- **WHEN** the subtree is duplicated
- **THEN** the copied relationship addresses copied work items with a new ID and unchanged scopes/type

#### Scenario: Copy an external prerequisite

- **GIVEN** a copied successor depends on an authorized predecessor outside the copied subtree
- **WHEN** the subtree is duplicated
- **THEN** the new relationship names the copied successor and retains the original predecessor
- **AND** the original relationship remains unchanged

#### Scenario: Do not clone an outgoing relationship

- **GIVEN** a copied predecessor supplies work to a successor outside the copied subtree
- **WHEN** the subtree is duplicated
- **THEN** the external successor retains its relationship to the original predecessor
- **AND** no relationship from the copied predecessor to that successor is created and no write is made to its project

#### Scenario: Resolve stable external identities after a rename

- **GIVEN** an export records an external predecessor's stable identities and its old abbreviation
- **WHEN** that predecessor is renamed or renumbered before an authorized same-organization import
- **THEN** the imported relationship retains that predecessor's stable identity and uses its current display address

#### Scenario: An external reference cannot be preserved

- **WHEN** import cannot resolve a recorded external identity in the destination organization, lacks required access, or would close a resolved task/step cycle
- **THEN** the entire import is refused with the offending reference identified
- **AND** no project, work item or relationship is partially created

## ADDED Requirements

### Requirement: External import mappings are explicit

An import SHALL accept explicit mappings from recorded external stable identities to destination stable endpoints when the original identities are unavailable in the destination store. Each mapping SHALL be validated for scope, endpoint shape, current same-organization ownership and authorization inside the import transaction. The importer SHALL NOT search by an exported abbreviation or number and silently substitute a matching endpoint.

#### Scenario: A matching display address belongs to a different work item

- **WHEN** a source external UUID is absent but an unrelated destination work item displays the exported qualified address
- **THEN** import refuses the unresolved reference unless an explicit valid mapping is supplied
- **AND** a supplied mapping binds the declared destination identity rather than the address text

### Requirement: Imported abbreviations follow destination allocation

An imported project's abbreviation SHALL use the destination organization's allocation/conflict rules rather than overwrite another project's abbreviation.

#### Scenario: An imported abbreviation is already claimed

- **WHEN** another destination project holds the abbreviation carried by an imported plan
- **THEN** import uses destination allocation/conflict rules
- **AND** it does not rename or overwrite the existing project

#### Scenario: Import revalidates its retained principal in the writer

- **GIVEN** HTTP or a direct importer retains an authenticated principal and expected organization context while waiting for the process writer
- **WHEN** browser binding is revoked or expires, membership is removed, write role is lost, enforced SSO or session policy changes, or persisted machine/consent credential binding changes
- **THEN** import resolves current authority in its admitted writer transaction before observation, directory reads, endpoint admission or writes
- **AND** authority refusals preserve the organization resolver's complete modeled status and body, without import effects
- **AND** expected access pins context and identity while current access supplies every import resource and callback's authority

#### Scenario: Direct import cannot lend write scope or legacy authority

- **GIVEN** a direct caller lacks write scope or explicitly requests legacy admission after durable organization activation
- **WHEN** it imports a valid local document
- **THEN** read scope refuses before entering the writer and legacy admission refuses from the current durable activation marker
- **AND** malformed or unreadable trusted authority state throws and rolls back rather than reopening legacy access

#### Scenario: Persisted principal admission does not activate external production imports

- **GIVEN** production composition supplies inactive external dependency authoring, including when synthetic dependency storage authority exists
- **WHEN** an authorized caller imports external declarations
- **THEN** it receives the existing inactive-authoring conflict without writes
- **AND** current principal admission remains required before the external-authoring decision

### Requirement: Connected exports preserve one detached read observation

A connected JSON export SHALL write version 11 with required read-only `connected` evidence. It SHALL retain every captured member's stable identity, name, abbreviation, rank, calendar, revision and sequence, and every component relationship's original scoped selectors and successor ownership. Authored `typedDependencies` SHALL contain exactly relationships owned by the exported successor project, using file-local internal endpoints and original stable external predecessor identities. External display addresses SHALL identify the qualified row; step scope and name SHALL remain separate, including uncoded remote steps. Outgoing and unrelated component links SHALL remain historical evidence only.

Scheduled evidence SHALL preserve complete baseline and selected component positions with explicit ownership and finite real workday offsets, idle members, and each retained optimization stage. A stage SHALL preserve the versioned exact canonical boundary, captured questions and candidate starts, variant states, stage-scoped comparisons and actual chosen outcome. Boundary infeasibility SHALL remain distinct from plan infeasibility. Calendar and engine absence and known placement failures SHALL remain explicit unavailable evidence with null row dates.

Export authorization, capture, document facts and cache selection SHALL share one observation. Serialization SHALL perform no live lookup, scheduling or optimization admission after closure. Version 10 local/shared output and uncoded/sparse export refusals SHALL retain existing behavior. Import SHALL discard connected history and revalidate writable identities through current import admission; an archival success or certificate SHALL confer no authority.

#### Scenario: Export an incoming prerequisite and inspect outgoing history

- **GIVEN** a connected component has incoming, outgoing and unrelated relationships
- **WHEN** one project is exported
- **THEN** only its successor-owned links become authored transfer instructions
- **AND** all component relationships remain inspectable with original stable identities

#### Scenario: Preserve exact stage scope and selected placement

- **GIVEN** an earlier optimized stage moves a member and a later stage retains baseline
- **WHEN** the connected document is serialized
- **THEN** baseline and selected component offsets differ exactly as captured
- **AND** the earlier canonical boundary and candidate question remain unchanged
- **AND** the later non-null comparison states that baseline was chosen

#### Scenario: Required response history and tolerant archival import differ

- **WHEN** a backend response omits or corrupts required connected history
- **THEN** response validation refuses it
- **AND** import of an authored v11 archival document may omit history or contain arbitrary read-only history because its writable projection discards it

#### Scenario: Facts change after capture

- **GIVEN** remote labels, owner settings, markers or sparse policy change during or after the export observation
- **WHEN** the captured export is serialized
- **THEN** it contains one coherent old observation and the next export contains the new facts
- **AND** no export allocates optimizer work or writes durable state
