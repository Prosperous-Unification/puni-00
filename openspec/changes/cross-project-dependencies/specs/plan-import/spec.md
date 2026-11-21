## ADDED Requirements

### Requirement: Copying successors preserves their authorized external prerequisites

Whole-project copy and subtree duplication that support external references SHALL copy an incoming external prerequisite only when its successor is copied. They SHALL substitute only the copied successor endpoint, retain the original stable predecessor and assign a new relationship identity.

Copying a predecessor alone SHALL leave its outgoing relationship attached to the original predecessor and SHALL NOT create or change a relationship in the original successor-owning project. Relationships touching neither copied endpoint SHALL remain untouched. The entire operation SHALL validate every resulting external relationship against current same-organization ownership, endpoint existence, authorization and the resolved dependency graph before committing. Unresolved, unauthorized or cyclic references SHALL refuse the copy atomically; they SHALL NOT be discarded or converted to local references.

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

### Requirement: External import mappings are explicit

An import SHALL accept explicit mappings from recorded external stable identities to destination stable endpoints when the original identities are unavailable in the destination store. Each mapping SHALL be validated for scope, endpoint shape, current same-organization ownership and authorization inside the import transaction. The importer SHALL NOT search by an exported abbreviation or number and silently substitute a matching endpoint.

A versioned transfer contract SHALL distinguish external from internal references and older local-only documents. Each external reference SHALL carry stable source project, work-item and applicable step identities, endpoint scope and relationship type. Abbreviations, names and human addresses are descriptive metadata and SHALL NOT authorize rebinding.

An unresolved, unauthorized or cyclic external reference SHALL refuse import atomically. The importer SHALL NOT discard it or convert it into a local reference. An older reader that cannot preserve external references SHALL refuse such a document without partial writes.

#### Scenario: Resolve stable external identities after a rename

- **GIVEN** an export records an external predecessor's stable identities and its old abbreviation
- **WHEN** that predecessor is renamed or renumbered before an authorized same-organization import
- **THEN** the imported relationship retains that predecessor's stable identity and uses its current display address

#### Scenario: An external reference cannot be preserved

- **WHEN** import cannot resolve a recorded external identity in the destination organization, lacks required access, or would close a resolved task/step cycle
- **THEN** the entire import is refused with the offending reference identified
- **AND** no project, work item or relationship is partially created

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

A connected JSON export SHALL write version 12 with required read-only `connected` evidence. It SHALL retain every captured member's stable identity, name, abbreviation, rank, calendar, revision and sequence, and every component relationship's original scoped selectors and successor ownership. Authored `typedDependencies` SHALL contain exactly relationships owned by the exported successor project, using file-local internal endpoints and original stable external predecessor identities. External display addresses SHALL identify the qualified row; step scope and name SHALL remain separate, including uncoded remote steps. Outgoing and unrelated component links SHALL remain historical evidence only.

Scheduled evidence SHALL preserve complete baseline and selected component positions with explicit ownership and finite real workday offsets, idle members, and each retained optimization stage. A stage SHALL preserve the versioned exact canonical boundary, captured questions and candidate starts, variant states, stage-scoped comparisons and actual chosen outcome. Boundary infeasibility SHALL remain distinct from plan infeasibility. Calendar and engine absence and known placement failures SHALL remain explicit unavailable evidence with null row dates.

Export authorization, capture, document facts and cache selection SHALL share one observation. Serialization SHALL perform no live lookup, scheduling or optimization admission after closure. Version 11 local/shared output and uncoded/sparse export refusals SHALL retain existing behavior. Import SHALL discard connected history and revalidate writable identities through current import admission; an archival success or certificate SHALL confer no authority.

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
- **AND** import of an authored v12 archival document may omit history or contain arbitrary read-only history because its writable projection discards it

#### Scenario: Facts change after capture

- **GIVEN** remote labels, owner settings, markers or sparse policy change during or after the export observation
- **WHEN** the captured export is serialized
- **THEN** it contains one coherent old observation and the next export contains the new facts
- **AND** no export allocates optimizer work or writes durable state

### Requirement: Whole-project archival transfer separates authorship from history

The downloaded version-12 JSON SHALL preserve exactly successor-owned authored typed relationships and legacy links through generated-client validation, Blob download, archival projection and classification. The archival request SHALL discard connected history and derived scheduling evidence, whether history is absent, valid or arbitrary. Historical evidence SHALL confer no current endpoint, graph or write authority.

#### Scenario: Downloaded successor content is imported into fresh identities

- **GIVEN** a mounted v12 export contains internal typed and legacy links, incoming same-organization prerequisites, outgoing links and other component links
- **WHEN** its JSON is projected, classified and imported through an admitted same-source transactional importer
- **THEN** new project, row, step and relationship identities are allocated and internal endpoints are remapped
- **AND** external predecessor UUID tuples and authored scopes/types/multiplicity are preserved
- **AND** outgoing and unrelated relationships retain their original owners and identities and no undo or saved-plan history is imported

#### Scenario: An outgoing-only v12 artifact uses the ordinary production importer

- **GIVEN** a v12 export contains outgoing component history and internal authored typed and legacy links, with no external authored prerequisite
- **WHEN** the mounted production importer imports that downloaded artifact
- **THEN** it creates the internal authored content without cloning outgoing relationships
- **AND** an incoming external authored artifact still receives the inactive-authoring conflict without effects, even when a separate synthetic test importer exists

#### Scenario: An inactive import keeps the selected frontend project

- **WHEN** the page submits the downloaded v12 archival projection and receives `external_dependencies_inactive`
- **THEN** it renders the refusal and retains the selected project without navigating to a fabricated imported project or reporting success

#### Scenario: An explicit mapping wins over a still-existing source endpoint

- **GIVEN** both the recorded predecessor UUID and an explicit destination mapping exist
- **WHEN** the downloaded artifact is imported
- **THEN** the chosen destination UUID tuple is used
- **AND** an invalid chosen destination refuses without fallback to the original UUID or matching display address

#### Scenario: Current endpoint or graph facts change after download

- **GIVEN** an artifact was exported before its external endpoint disappeared or its referenced graph became invalid
- **WHEN** its import enters the admitted writer
- **THEN** current endpoint and complete resulting graph validation identify the original declaration and refuse the import
- **AND** project, directory, allocation, relationship, history and durable event effects are rolled back together
