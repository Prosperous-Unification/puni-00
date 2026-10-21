## ADDED Requirements

### Requirement: Projects have organization-unique abbreviations

Every project SHALL have a persisted abbreviation unique within its organization after case normalization. Creation without an explicit abbreviation SHALL allocate 3–5 uppercase ASCII letters using a name-based recommendation and bounded collision resolution; exhaustion SHALL refuse creation. The same abbreviation SHALL be accepted in different organizations when valid and unclaimed within each organization.

#### Scenario: Uniqueness follows organization scope

- **WHEN** an editor requests `puni` while another project in the same organization holds `PUNI`
- **THEN** the edit is refused as an abbreviation conflict
- **AND** another organization's `PUNI` alone does not prevent the edit

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
