## ADDED Requirements

### Requirement: Projects have organization-unique abbreviations

Every project SHALL have a persisted abbreviation unique within its organization after case normalization. Creation without an explicit abbreviation SHALL allocate 3–5 uppercase ASCII letters using a name-based recommendation and bounded collision resolution; exhaustion SHALL refuse creation. The same abbreviation SHALL be accepted in different organizations when valid and unclaimed within each organization.

#### Scenario: Uniqueness follows organization scope

- **WHEN** an editor requests `puni` while another project in the same organization holds `PUNI`
- **THEN** the edit is refused as an abbreviation conflict
- **AND** another organization's `PUNI` alone does not prevent the edit

#### Scenario: Name-derived candidates are exhausted

- **WHEN** every ordered name recommendation and three-letter-stem suffix AA through ZZ is occupied in the destination organization
- **THEN** creation refuses with `abbreviation_exhausted` (409), allowing a manual abbreviation on a later request
- **AND** no project, ownership, starting steps or allocator advance commits
- **AND** exhaustion of the legacy insert allocator causes the same atomic refusal, while broken allocator state remains an unexpected failure

### Requirement: Project abbreviation APIs expose typed outcomes

Project creation SHALL accept an optional manual abbreviation; a project settings patch SHALL accept a replacement. Invalid string input SHALL return `invalid_abbreviation` (422), and an occupied code SHALL return `abbreviation_taken` (409). Structural non-string input SHALL remain `invalid_body`. Authorization and foreign-project refusal SHALL precede namespace conflict disclosure. Live project responses SHALL require the persisted abbreviation.

#### Scenario: Repeating the existing abbreviation is a no-op

- **WHEN** an authorized editor submits only the project's existing normalized abbreviation
- **THEN** the request succeeds without a revision or audit change
- **AND WHEN** an abbreviation change is combined with other settings
- **THEN** the successful patch increments the revision once

### Requirement: Historical abbreviation metadata remains compatible

Version-10 plan documents SHALL accept absent abbreviation metadata and validate it when present, independently of the required live response shape. Historical reads SHALL NOT fill absent metadata from live project storage. Import SHALL allocate a destination abbreviation instead of implicitly adopting exported source identity, and allocation refusal SHALL roll back the whole import.

#### Scenario: Read and import a pre-abbreviation document

- **WHEN** a valid version-10 document omits abbreviation metadata
- **THEN** document validation still succeeds without consulting a live project
- **AND** import allocates a destination abbreviation or refuses atomically if allocation is exhausted

### Requirement: Manual abbreviation edits preserve project identity

Manual input SHALL normalize ASCII lowercase to uppercase and match `^[A-Z][A-Z0-9_-]{0,19}$`. Invalid input or an explicit same-organization collision SHALL refuse without writing. Abbreviation edits SHALL require project edit access and preserve its stable identity; changing only its name SHALL preserve its abbreviation.

#### Scenario: Allocate and override an abbreviation

- **WHEN** a project is created without an abbreviation
- **THEN** its stored abbreviation contains 3–5 uppercase letters and conflicts with no project in its organization
- **AND WHEN** its authorized editor changes it to `puni-core_main`
- **THEN** `PUNI-CORE_MAIN` is persisted without changing its project ID

#### Scenario: Digits are valid after the initial letter

- **WHEN** an authorized editor submits `puni2`, `puni-01` or `puni_2`
- **THEN** the abbreviation is accepted if unclaimed in the organization and stored in uppercase
- **AND** qualified addresses such as `PUNI2.080.39` retain their project and local-number meaning

#### Scenario: Validate manual boundaries

- **WHEN** manual input has one letter or twenty characters matching the normalized pattern
- **THEN** it is accepted if unclaimed in the organization
- **AND WHEN** it is empty, exceeds twenty characters, starts with a digit, hyphen or underscore, or contains a dot or non-ASCII letter
- **THEN** it is refused without changing the project

### Requirement: Abbreviations survive older project writers

A project created by an older writer that omits abbreviation fields SHALL receive a persisted 3–5-letter abbreviation within its creation transaction, including when organization ownership is inserted afterward. Older name/settings writes SHALL preserve it.

#### Scenario: An older writer creates a project during a swap

- **WHEN** the older writer inserts a project without abbreviation fields and attaches its organization
- **THEN** the committed project has a persisted valid abbreviation unique in that organization
- **AND** subsequent reads return that same value

### Requirement: Abbreviation storage rejects invalid ownership state

Storage SHALL prevent invalid abbreviations and same-organization collisions across abbreviation and ownership writes. New readers SHALL reject missing or malformed trusted abbreviation state rather than invent a display fallback.

#### Scenario: Ownership would create a collision

- **WHEN** an ownership write would place two projects with the same normalized abbreviation in one organization
- **THEN** storage refuses the transaction without committing the conflicting ownership

### Requirement: Abbreviation migration preserves existing projects

The additive migration SHALL assign and persist a valid abbreviation for every existing project. It SHALL ship a rollback that preserves the pre-existing project fields and records.

#### Scenario: Upgrade and roll back an existing project

- **WHEN** the additive migration is applied to existing projects
- **THEN** every project has a persisted valid abbreviation
- **AND WHEN** its rollback is applied
- **THEN** pre-existing project fields and records are preserved

### Requirement: Qualified addresses use dotted project abbreviations

A qualified work-item address SHALL join its project abbreviation, a dot and its current effective work-item number, such as `PUNI-CORE.080.39`. A qualified step reference SHALL prefix the existing local step reference likewise, such as `PUNI-CORE.080.39.s1-dev`. Prefix matching SHALL be case-insensitive, canonical prefixes SHALL be uppercase, and numeric segments SHALL preserve their zeroes.

#### Scenario: Canonicalize a qualified step reference

- **WHEN** a caller resolves `puni-core.080.39.s1-dev`
- **THEN** it selects project `PUNI-CORE` and preserves number `080.39` and the local step-reference meaning
- **AND** canonical output uses `PUNI-CORE.080.39.s1-dev`

### Requirement: Qualified addresses preserve stable endpoint identity

Numeric unqualified addresses and local step references SHALL resolve within the current project. Project abbreviations alone SHALL select projects for lookup and SHALL NOT create whole-project dependency endpoints. Persisted relationships SHALL hold stable project/work-item/step identities rather than display addresses.

#### Scenario: A display address changes after selection

- **WHEN** an existing dependency's predecessor is renumbered or its project abbreviation changes
- **THEN** the dependency still names the same stable endpoint
- **AND** its displayed qualified address reflects the new abbreviation and effective number

#### Scenario: Local numbers retain their meaning

- **WHEN** a caller in project A resolves `080.39` while project B also has that number
- **THEN** only A's address space is considered
- **AND WHEN** it resolves B's qualified address
- **THEN** the abbreviation selects B before resolving the number and optional step

### Requirement: External address discovery is authorized

HTTP discovery and resolution SHALL use the caller's current organization and read authorization and expose the same contract through generated MCP tools. Foreign and absent projects or endpoints SHALL be indistinguishable. Cursors SHALL NOT widen organization or query scope.

#### Scenario: Search another organization

- **WHEN** a caller searches or resolves an abbreviation belonging only to another organization
- **THEN** no foreign project, work-item name, step or endpoint identity is disclosed
- **AND** exact resolution returns the same not-found outcome as an absent abbreviation

### Requirement: External address discovery is bounded

External discovery SHALL search project abbreviations and names before the selected project's work items and steps. It SHALL use bounded page sizes and deterministic pagination, and SHALL NOT materialize every organization's complete work-item trees for a query. Numeric or empty dependency input SHALL retain local lookup; an alphabetic current token SHALL enable project discovery while retaining matching local titles.

#### Scenario: Page within a selected project

- **WHEN** a selected project has more matches than the configured maximum page size
- **THEN** only the bounded page and its continuation are returned in deterministic order
- **AND** a continuation cannot be reused to read another organization or a different query

### Requirement: Address resolution refuses stale selection

Human-address resolution SHALL compare an observed address revision with the selected project's current address space before binding a dependency endpoint. Renumbering, relevant leaf/step changes and abbreviation edits SHALL invalidate affected qualified-address observations. Stale input SHALL refuse without choosing an endpoint or writing a dependency.

#### Scenario: A number is reused before resolution

- **WHEN** a client resolves a qualified address after its observed address revision has changed
- **THEN** resolution refuses as stale and requires a fresh observation
- **AND** no dependency is rebound to the work item now displaying that number

### Requirement: Address resolution refuses ambiguous selection

A number held by multiple work items SHALL cause explicit resolution refusal without choosing an arbitrary endpoint or writing a dependency. Exact stable-ID commands SHALL revalidate current ownership and endpoint existence without depending on a display address revision.

#### Scenario: Two work items display one number

- **WHEN** an observed project's effective numbers contain two holders of the requested number
- **THEN** resolution refuses as ambiguous rather than choosing either holder

### Requirement: Qualified resolution binds an observed project

The new qualified resolver SHALL require the selected stable project ID and its observed qualified address revision. The qualified revision SHALL include the project abbreviation and the complete local address space. Existing local step-reference revision and outcome contracts SHALL remain unchanged. With a current observation, a mismatching qualified prefix or absent endpoint SHALL return generic not-found; a changed observation SHALL refuse as stale before resolving the endpoint.

#### Scenario: Another project reuses an abbreviation

- **WHEN** a selected project's abbreviation changes and another project takes its old abbreviation
- **THEN** resolution with the original selected project ID and old observation refuses as stale
- **AND** it never selects the new abbreviation holder

#### Scenario: Legacy discovery has multiple holders

- **WHEN** deployment-wide legacy read authority encounters the same abbreviation in different organizations
- **THEN** discovery returns separate stable project choices
- **AND** a consumer requires explicit project selection rather than choosing the first match or assuming one page proves uniqueness

### Requirement: Address lookup uses coherent bounded observations

Lookup SHALL capture current authorization and required selected-project address facts in one read snapshot, close it on success/refusal/failure, and perform no writes or optimization admission. Project discovery SHALL read no work-item trees. Candidate response limits SHALL count every whole, node and descendant-step option; missing required trusted metadata SHALL fail visibly. New page limits SHALL default to 25 and never exceed 200.

#### Scenario: Step options exceed the page bound

- **WHEN** a selected project has more whole and step options than the requested page size
- **THEN** the combined candidate count is bounded by that size
- **AND** its address revision includes placements and ordered steps outside the page, including uncoded steps

#### Scenario: Cursor is reused outside its observation

- **WHEN** a cursor is reused for a different query, access namespace, selected project or operation kind
- **THEN** lookup refuses as invalid query without widening read authority
- **AND WHEN** an endpoint page's address meaning changes
- **THEN** continuation refuses as stale rather than silently restarting the page
