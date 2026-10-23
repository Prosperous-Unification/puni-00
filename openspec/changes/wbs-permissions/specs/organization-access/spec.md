## MODIFIED Requirements

### Requirement: Organization roles bound actions

WBS SHALL enforce the permission matrix of `wbs-permissions`
(`openspec/changes/wbs-permissions/permission-matrix.md`) against current membership and
access grants; Auth0 groups and OAuth scopes SHALL never create an access grant. Existing
scopes SHALL only narrow otherwise permitted actions. A restricted project SHALL be reached
only by grants naming it or its work package; an `org-super-admin` SHALL have an explicit,
audited recovery override. The last `org-super-admin` grant MUST NOT be revoked, nor its
holder removed, through ordinary administration. The former role column
(`organization_membership.role`) SHALL NOT be read after `wbs-permissions` lands.

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

#### Scenario: Restricted project recovery

- **GIVEN** a restricted work package created by someone else, whether or not that
  creator is still a member
- **WHEN** an `org-super-admin` with no direct grant on it edits it, including clearing
  its restriction
- **THEN** the edit succeeds, the original creator remains recorded, and one audit record
  naming the super-admin, the package and the edited fields is written in the same
  transaction

#### Scenario: Recovery audit cannot be written

- **GIVEN** an `org-super-admin`'s recovery edit of a restricted package
- **WHEN** its audit record cannot be written
- **THEN** the edit is rolled back and nothing is changed

#### Scenario: Recovery through a command batch or an undo or redo

- **GIVEN** a restricted work package created by someone else
- **WHEN** an `org-super-admin` applies a command batch to it, or undoes or redoes one of
  their own commands in it
- **THEN** the batch or walk succeeds with the creator still recorded, and exactly one
  audit record naming the super-admin, the package and the command kinds or the journal
  direction is written in the same transaction
- **AND** a batch or walk that fails at any point, or is refused, leaves no audit record
  and no partial effect
- **AND** no other actor, package or later request can use that recovery authority

#### Scenario: Recovery through dependent writes and optimizer Retry

- **GIVEN** a restricted work package created by someone else, and a current
  `org-super-admin` of its organization
- **WHEN** that super-admin adds, renames or removes a step; creates, renames, recolors or
  removes a calendar marker; saves, renames or deletes a saved plan; or retries a failed
  optimization
- **THEN** each successful operation writes exactly one audit record naming the actor,
  organization, package and operation in the same transaction as the write, and retains
  the package's creator
- **AND** a failed, refused or non-retryable operation writes no recovery record and
  publishes nothing; audit insertion failure rolls the write back and publishes nothing
- **AND** an ordinary creator write writes no recovery record, a contributor without a
  grant naming the package gets `404 not_found`, a foreign package answers 404, and a
  removed super-admin is refused
- **AND** before activation these routes retain their legacy permissions and behavior
