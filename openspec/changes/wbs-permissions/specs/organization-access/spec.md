## MODIFIED Requirements

### Requirement: Organization roles bound actions

WBS SHALL enforce the permission matrix of `wbs-permissions`
(`openspec/changes/wbs-permissions/permission-matrix.md`) against current membership and
access grants; Auth0 groups and OAuth scopes SHALL never create an access grant. Existing
scopes SHALL only narrow otherwise permitted actions. Organization-scope grants SHALL NOT
write a restricted work package; of them only `org-admin` and `org-super-admin` SHALL read
it, and an `org-super-admin` SHALL have one explicit, audited recovery: clearing the flag.
The last `org-super-admin` grant MUST NOT be revoked, nor its holder removed, through
ordinary administration. The former role column (`organization_membership.role`) SHALL NOT
be read once the `add_access_grants` migration and its backfill are deployed.

#### Scenario: Org-admin tries to grant an organization role

- **GIVEN** an `org-admin` in an organization
- **WHEN** they try to grant `org-admin` or `org-super-admin`
- **THEN** be-01 answers `403 forbidden` naming `organization.manage_organization_roles`
  and no grant is written

#### Scenario: Final owner protection

- **GIVEN** one `org-super-admin` remains
- **WHEN** a revoke or removal would leave no `org-super-admin`
- **THEN** the transaction is refused `409 last_super_admin` and the organization retains
  its super-admin

#### Scenario: Restricted work package recovery

- **GIVEN** a restricted work package created by someone else, whether or not that
  creator is still a member
- **WHEN** an `org-super-admin` with no grant naming it or its project clears its
  restriction
- **THEN** the clear succeeds, the original creator remains recorded, and one
  `restricted_work_package_recovery` audit record naming the super-admin and the work
  package is written in the same transaction

#### Scenario: Recovery audit cannot be written

- **GIVEN** an `org-super-admin`'s recovery clear of a restricted work package
- **WHEN** its audit record cannot be written
- **THEN** the clear is rolled back and nothing is changed

#### Scenario: No other recovery write

- **GIVEN** a restricted work package created by someone else, and a current
  `org-super-admin` with no grant naming it or its project
- **WHEN** that super-admin applies a command batch to it, undoes or redoes in it, changes
  its steps, calendar markers or saved plans, retries its optimization, or patches anything
  but the flag
- **THEN** each is refused `403 forbidden` naming the missing permission, writes nothing
  and writes no recovery record
- **AND** a contributor whose only grant is at organization scope gets `404 not_found`, a
  foreign work package answers 404, and a removed super-admin is refused

## ADDED Requirements

### Requirement: Membership administration uses current grants

Member listing SHALL require the actual caller's organization.read and return effectiveRole as the full validated permission union/provenance of organization-kind grants at organization scope, or null. grantCount SHALL count distinct account-reaching grants at all scopes through user, current groups and organization_members, excluding credential grants and duplicate permission rows. The summary SHALL NOT reveal package identifiers. Membership removal SHALL require current organization.manage_members and additionally organization.manage_organization_roles when the target directly holds any user grant of catalogue object kind organization. Group-derived authority SHALL NOT itself trigger this direct-holder rule. changeMemberRole SHALL be removed.

#### Scenario: Organization-viewer holder needs organization-role administration

- **GIVEN** a member directly holds org-viewer or a custom organization-kind role
- **WHEN** a caller with manage_members but without manage_organization_roles removes them
- **THEN** the owner refuses forbidden naming organization.manage_organization_roles and preserves membership, grants, group memberships and audit bytes

#### Scenario: A selected grant references an absent catalogue role

- **GIVEN** a new membership-summary, initial-access comparison or direct-holder read selects a grant whose role is absent or malformed
- **THEN** it throws before projecting access or changing membership; the row is not silently omitted

### Requirement: Initial access is explicit and current at insertion

Invitations and join approvals SHALL offer none or one of org-admin, org-viewer, project-contributor and project-viewer at organization scope. The actual nondelegated issuer SHALL currently hold manage_members plus manage_organization_roles for organization roles or manage_access for project roles, and the offered full permission set SHALL be a subset of their full ancestor grant-comparison set. Actual principal caps SHALL be enforced before raw comparison. Acceptance SHALL create initial access only for a new membership, rechecking the stored personal issuer's current membership and P11 authority in the same owner as membership, grant and audit. The grant/audit actor and createdBy SHALL be the issuer with origin invitation; the recipient remains acceptance actor. Existing-member acceptance SHALL consume without upgrade. Missing issuer provenance or malformed persisted selection SHALL throw. Creator onboarding SHALL create a direct built-in user org-super-admin grant and audit atomically; all other onboarding/SCIM memberships SHALL receive no grant.

#### Scenario: Existing member accepts a privileged offer

- **GIVEN** an existing member accepts a valid offer carrying initial access
- **THEN** the offer is consumed without a new grant or access_granted event

#### Scenario: An issuer loses authority before a no-access offer is accepted

- **GIVEN** a personal offer selects no initial access and its recipient has no membership
- **WHEN** its issuer loses current membership or manage_members before acceptance
- **THEN** acceptance refuses forbidden naming organization.manage_members, preserving the offer and all membership, grant and audit state

### Requirement: Initial-offer migration preserves legacy intent

The additive migration SHALL backfill all historical offers and old-writer inserts admin→org-admin, member→project-contributor and viewer→project-viewer. Explicit none SHALL remain none; NULL SHALL mean only omitted legacy selection. Runtime SHALL validate and read only the new selection. Down SHALL refuse before any effects for any historical none, org-viewer, malformed/unrecognized selection or legacy inverse mismatch. A named deployment-safety boundary SHALL route or quiesce acceptance/onboarding onto upgraded owners or refuse migration before live cutover; the compatibility trigger alone SHALL NOT establish deployment safety.

Deployment clarification: outgoing binaries still interpret the compatibility viewer column. Before migration, outgoing acceptance/onboarding mutations must be quiesced; before exposing upgraded grant semantics, outgoing authorization readers and existing gateway/WebSocket sessions must be retired or drained, or activation refused. This required task6.4 boundary must preserve actual read availability and rollback contracts.

#### Scenario: Historical and old-writer offers preserve the selected initial access

- **GIVEN** historical or outgoing-writer offers name admin, member or viewer
- **WHEN** the additive migration or compatibility insert trigger runs
- **THEN** their explicit selections are org-admin, project-contributor or project-viewer respectively, while an upgraded explicit-none offer remains none

#### Scenario: A malformed historical envelope cannot be rolled back

- **GIVEN** a consumed offer stores a two-key envelope with roleId org-admin and an extra key but no kind
- **WHEN** rollback is requested
- **THEN** rollback refuses with the named representability error before changing offer history, schema, trigger or migration ledger

### Requirement: Initial-access recovery follows the admitted transition kind

Recovery SHALL use the supported transition kind selected before migration, maintain authenticated read continuity and live-store writer exclusion within the prepared deadline, and validate the bound store, complete baseline ledger and compatible code before reopening writes. Ordinary reversible additions SHALL retain exact capture/down/full-ledger comparison and nonrepresentable-history refusal. Only an explicitly reviewed snapshot-only entity window SHALL use its verified pre-window snapshot and pinned pre-window schema. Snapshot restoration SHALL NOT be selected as fallback after failed additive down. Possible or unknown upgraded-writer exposure, unknown participant ownership/retirement, failed validation or an expired prepared read window SHALL prevent automatic old-role-authorizer restoration and retain recovery-required state with its manual completion command. This contract SHALL NOT itself supply a transition permit.

#### Scenario: Ordinary additive recovery retains exact reversal

- **GIVEN** an admitted ordinary reversible transition with a complete captured baseline and no upgraded-writer exposure
- **WHEN** recovery reverses exactly the additions recorded by that capture
- **THEN** the complete baseline name/hash ledger is compared before compatible owners reopen writes
- **AND** nonrepresentable offer history retains its existing rollback refusal

#### Scenario: A preselected snapshot-only entity window restores its pinned baseline

- **GIVEN** an explicitly reviewed snapshot-only entity window selected before migration, with no upgraded-writer exposure and known participant retirement
- **WHEN** its supported recovery owner stops candidate live-store owners and restores the verified pre-window snapshot to the bound store family
- **THEN** the pinned pre-window schema, complete ledger and exact compatible code validate before writes reopen
- **AND** authenticated reads and live-store exclusion remain within the prepared deadline

#### Scenario: Failed additive reversal cannot switch recovery kinds

- **GIVEN** the selected ordinary additive down fails or refuses
- **WHEN** recovery settles that failure
- **THEN** recovery-required state and its manual completion command remain, and snapshot restoration is not invoked as fallback

#### Scenario: Unknown exposure or retirement forbids automatic legacy restoration

- **GIVEN** upgraded-writer exposure is possible or unknown, or participant ownership/retirement is unknown
- **WHEN** recovery is requested
- **THEN** it does not automatically restore an old-role-authorizing owner, and retains explicit recovery-required state

### Requirement: Initial-access source admission precedes target effects

Source-only admission SHALL inspect immutable current and target revisions, and any recovery revision selected by that entrypoint, in the actual source repository. It SHALL refuse either protected migration identity, changed or malformed protected SQL, and missing, unreadable or ambiguous required evidence before preflight, solver-preparation state reads, preparation or reset. It SHALL accept no positive cutover permit and SHALL NOT certify store provenance or complete live cutover.

#### Scenario: Unsupported target reaches solver preparation

- **GIVEN** a target contains either protected migration and changes solver compatibility inputs
- **WHEN** the actual target operation is invoked directly or through synchronization
- **THEN** it refuses before preparation, state read, preflight or reset

#### Scenario: Protected SQL changes cannot become absence

- **GIVEN** either protected migration folder contains changed, missing or malformed forward SQL
- **WHEN** the immutable source inventory is selected
- **THEN** admission refuses rather than treating the protected migration as absent

### Requirement: Installed poller admission precedes recovery and status effects

The installed poller SHALL establish admission before initializing last-synced, returning an already-proven target or resetting an incomplete sync. It SHALL use a delivered, pinned Bun entrypoint outside the watched checkout; a later target-loaded helper SHALL NOT substitute. Supported pre-transition recovery SHALL continue. Unsupported lanes SHALL refuse until their own pre-effect boundary is implemented.

#### Scenario: Incomplete-sync recovery would restore protected source

- **GIVEN** current HEAD or last-synced contains either protected migration, while the selected target removes both folders
- **WHEN** the installed poller attempts recovery or synchronization
- **THEN** it refuses before reset, preserving HEAD and existing last-synced bytes

#### Scenario: A protected target is already marked proven

- **GIVEN** HEAD and target match a protected revision and the poller records it as proven
- **WHEN** the installed poller runs
- **THEN** it refuses through source admission before its ordinary already-proven return

#### Scenario: Ordinary pre-transition recovery remains supported

- **GIVEN** complete supported current, recovery and target inventories contain neither protected migration and the installed entrypoint is valid
- **WHEN** an incomplete sync is recovered
- **THEN** ordinary recovery may proceed only after source admission succeeds

#### Scenario: Required installed admission is unavailable

- **GIVEN** the required installed Bun entrypoint is missing, unreadable or unsupported
- **WHEN** the poller attempts synchronization with an absent last-synced marker
- **THEN** it refuses without creating that marker or resetting watched source

### Requirement: Direct built-in super-admin survives every authority removal

After each affected write, the same owner SHALL require at least one current member with a direct user built-in org-super-admin grant at organization scope. Custom roles, groups and credentials SHALL NOT count. Zero SHALL cause a modeled rollback refusal, including member removal, self-leave, active SCIM removal, group delete/member removal and credential revocation, preserving their audits and lifecycle effects. Bootstrap SHALL establish the creator grant before this invariant. Fresh actor membership refusal SHALL precede target processing when reciprocal removal has already removed the actor.

#### Scenario: Concurrent self-leaves preserve one direct holder

- **GIVEN** two members are the only direct built-in org-super-admin holders
- **WHEN** they concurrently leave on two connections
- **THEN** one succeeds and the other receives last_super_admin, with one holder and only the successful owner's audit remaining
