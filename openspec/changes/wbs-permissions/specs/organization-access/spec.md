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
