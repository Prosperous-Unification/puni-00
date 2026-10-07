## ADDED Requirements

### Requirement: Legacy inventory is complete before activation

Migration SHALL resolve Dany to exactly one existing WBS user from reviewed production data before assigning the legacy organization's first super-admin; zero or multiple candidates MUST block activation. One legacy organization SHALL own every preexisting project, directory record, external system and saved plan with dependent records and relationships preserved. Existing users SHALL receive inventoried membership and effective permissions in that organization. Backfill SHALL be repeatable while old writers run, then reconcile again after they drain. Activation MUST refuse unmapped resources, cross-organization references or unreviewed access changes.

#### Scenario: Ambiguous Dany account

- **GIVEN** inventory has two plausible Dany user records
- **WHEN** migration attempts to assign legacy ownership
- **THEN** activation stops without choosing either user

#### Scenario: Old writer during backfill

- **GIVEN** an old process creates a project after the first backfill pass
- **WHEN** bridge writers drain and reconciliation runs
- **THEN** the new project is mapped to the legacy organization before activation

#### Scenario: Bridge stops at activation

- **GIVEN** a legacy organization exists and the activation marker says activated
- **WHEN** a second organization's root is created with its explicit mapping, or a legacy catalog entry is renamed
- **THEN** the bridge maps nothing to the legacy organization and leaves every organization display name unchanged

#### Scenario: Backfill without a legacy organization

- **GIVEN** no legacy organization exists, or isolation is activated, or the marker is broken
- **WHEN** the legacy backfill runs
- **THEN** it refuses and maps nothing

#### Scenario: Cross-organization dependent blocks activation

- **GIVEN** every root is mapped but a dependency, catalog link, assignment, capacity, plan event or saved plan joins two organizations or two projects
- **WHEN** reconciliation runs
- **THEN** it reports that dependent, and activation refuses despite zero unmapped roots

#### Scenario: Unresolved event stream blocks activation

- **GIVEN** an event stream names no mapped project, including a deleted project's retained stream
- **WHEN** reconciliation runs
- **THEN** it reports the stream instead of assigning it to the legacy organization

### Requirement: Migration and rollback preserve tenant isolation

Each WBS and durable MCP-store schema migration SHALL be additive and ship a paired `migration.sql` and `down.sql`. The MCP credential epoch and pre-activation credential revocation SHALL be included in activation preflight and rollback treatment. Expansion SHALL precede bridge writers; bridge writers SHALL maintain organization mappings while old and new processes share SQLite. Global catalog uniqueness SHALL remain compatible during overlap and become organization-scoped without losing legacy references. A durable activation marker SHALL record that organization isolation was enabled. Deployment and schema rollback MUST refuse any organization-unaware target after activation, even if new tenant content was later deleted; recovery SHALL use an organization-aware release or forward repair. Pre-activation rollback SHALL preflight its complete reversal and preserve legacy records. A failed rollback SHALL report its manual completion command.

#### Scenario: Rollback before activation

- **GIVEN** only the legacy organization exists and no activation marker is set
- **WHEN** a swap aborts and paired down migrations run
- **THEN** legacy records and relationships remain usable by the previous release

#### Scenario: Rollback after activation

- **GIVEN** isolation was activated and a second organization created content
- **WHEN** a swap tries to restore an organization-unaware release or reverse its ownership mappings
- **THEN** the rollback is refused before routing or schema changes expose either organization's content

#### Scenario: Deleted tenant still blocks downgrade

- **GIVEN** isolation was activated and all later tenant content was deleted
- **WHEN** an organization-unaware downgrade is requested
- **THEN** the durable marker still refuses it

#### Scenario: Broken activation marker

- **GIVEN** the activation marker table is missing, cannot be read, or holds anything but one consistent row
- **WHEN** activation or a bridge writer reads it
- **THEN** it refuses with an error naming absent, unreadable or malformed state and never treats it as not activated

#### Scenario: Marker reversal needs a trusted pre-activation marker

- **GIVEN** the activation marker is activated, missing or malformed
- **WHEN** a rollback reaches the migration that added it
- **THEN** that reversal refuses and leaves the marker, its schema and its ledger entry unchanged

#### Scenario: Delegation-use rollback preserves live replay evidence

- **GIVEN** the delegation-use migration is applied
- **WHEN** rollback is requested after activation or while any recorded use has not expired
- **THEN** its paired down script refuses and preserves the table and migration ledger entry
- **AND** before activation with no live uses, rollback may remove the table

### Requirement: External identity mapping is stable

WBS SHALL map each supported verified issuer/subject pair to one stable local user ID under a uniqueness constraint. Backfill SHALL preserve current user IDs and refuse ambiguous identity collisions. Auth0 SHALL continue to prove identity, while WBS tables exclusively own organizations, memberships, roles, invitations and domains. A later provider change SHALL not require changing resource ownership or authorization rules.

#### Scenario: Issuer subject collision

- **GIVEN** an issuer/subject pair already maps to user A
- **WHEN** migration or login attempts to map it to user B
- **THEN** the collision is refused without merging users by email

#### Scenario: Organization selection preview

- **GIVEN** a copy of a WBS database before sessions bind an active organization
- **WHEN** the organization selection preview runs over it
- **THEN** it reports, for every local user, onboarding when they have no membership and an explicit choice among their memberships otherwise, never choosing one; it opens the file read-only and refuses any write; and a missing file, a broken activation marker, a malformed role or a membership naming a missing user or organization fails the preview instead of producing a report
