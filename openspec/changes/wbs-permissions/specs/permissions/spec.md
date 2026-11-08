## ADDED Requirements

### Requirement: Access is decided by grants, not by membership

Once the `add_access_grants` migration and its backfill are deployed (the swap; neither
the legacy organization's activation nor production activation), be-01 SHALL decide every
protected read and write of an organization from `access_grant` rows through
`may(scope, permission)` (design.md, "The `may` port"), never from
`organization_membership.role`. Current membership SHALL remain necessary: a
principal who is not a current member SHALL be refused `403 not_a_member` whatever grants
name them. A current member with no grant that reaches an object SHALL see that object as
absent (`404 not_found`) and SHALL be able to read only their own memberships, the
organization's name and capacity mode, the agent persons bound to their own account and
those persons' machine credentials. A member keeps every backfilled grant until the
operator removes it (requirement "Today's memberships are backfilled into grants").

#### Scenario: A plain member sees nothing

- **WHEN** an account is a current member of A with no grant, and A holds two projects,
  three work packages and two spaces
- **THEN** `GET /api/work-packages`, `GET /api/projects`, `GET /api/spaces` and
  `GET /api/teams` each answer `200` with `[]`, `GET /api/work-packages/:id` of any of the
  three and `GET /api/spaces/:id` of either space answer `404 not_found`,
  `GET /api/people` answers `200` listing only the member's own agent persons, and
  `GET /api/organization/machine-credentials` lists the credentials of those agents

#### Scenario: A SCIM-provisioned member arrives with no grant

- **WHEN** A's directory provisions a new account through SCIM
- **THEN** the account is a current member of A with no `access_grant` row,
  `GET /api/work-packages` answers `200` with `[]` and a `createWorkItem` batch on any
  package of A answers `404 not_found`

#### Scenario: A removed member's grants grant nothing

- **WHEN** an account holds an `org-admin` grant in A and its membership is removed on
  another connection
- **THEN** the next request is refused `403 not_a_member` and no grant row of that account
  remains in A

### Requirement: A grant at an ancestor reaches everything beneath it, including what is created later

A grant SHALL name one grant scope: the organization, a project or a work package. The
effective role of a principal at a work package SHALL be the union of the permission sets
of every grant that names that package, its project or its organization (set membership,
`wbs-custom-permissions` CP1), held directly, through an
access group the principal belongs to, or through the organization members subject. A
project-kind permission SHALL consider organization and project grants; an
organization-kind permission SHALL consider organization grants only. A grant SHALL reach
objects created after it without any further write. Wildcards SHALL be expressed only this
way; no pattern or glob column SHALL exist.

#### Scenario: An organization-scope grant covers a project created later

- **WHEN** account U holds `(organization A, project-contributor)` and an `org-admin`
  then creates project P with package W
- **THEN** U's next `POST /api/work-packages/W/commands` with `createWorkItem` is accepted
  and W appears in U's `GET /api/work-packages` and P in U's `GET /api/projects` without
  any new grant row

#### Scenario: Every member views every project through one row

- **WHEN** A holds the single grant `(organization A, organization members,
project-viewer)` and member V holds nothing else
- **THEN** V lists and reads every unrestricted package of A, V's `createWorkItem` is
  refused `403 forbidden` naming `package.write`, and deleting that one grant returns V to
  an empty list and `404 not_found` on every package

#### Scenario: A group grant

- **WHEN** access group G of A holds accounts U and V, and G is granted
  `(project P, project-contributor)`
- **THEN** both write in P's packages; removing V from G refuses V's next write
  `404 not_found` and leaves U's accepted; a non-member account cannot be added to G
  (`409 not_a_member`)

#### Scenario: Grants add up across scopes

- **WHEN** U holds `(organization A, project-viewer)` through the members subject,
  `(project P, project-contributor)` directly and `(work package W of P,
package-manager)` through group G
- **THEN** U's effective set at W is the union of the three roles' sets with provenance
  per permission, at another package of P the union of the first two, and at a package of
  another project `project-viewer`'s set; a
  `PATCH /api/work-packages/W` is accepted and the same patch on P's other package is
  refused `403 forbidden` naming `package.manage_settings`

### Requirement: A role counts only for the kinds it governs

The effective set for a permission SHALL consider only grants whose role's object kind is
the permission's kind or an ancestor of it: organization roles for organization
permissions; organization and project roles for project permissions; all three for
package permissions. A `package-*` role granted at organization scope SHALL therefore never
satisfy a project or organization permission, and a `project-*` role never an organization
permission.

#### Scenario: A package role at organization scope

- **WHEN** U holds only `(organization A, package-manager)`
- **THEN** U reads and writes every unrestricted work package of A and patches its
  settings, `PATCH /api/projects/P/settings` is refused `403 forbidden` naming
  `project.manage_settings`, and `POST /api/projects` is refused `403 forbidden` naming
  `organization.create_project`

### Requirement: Moving a work package needs both projects

`POST /api/work-packages/:id/move` SHALL require `project.manage_packages` at the work
package's current project and at the target project, and SHALL answer `404 not_found` when
the work package or the target project is invisible to the caller. A moved work package
SHALL keep its `restricted` flag and its package-scope grants.

#### Scenario: Manager of one side only

- **WHEN** U holds `(project P, project-manager)` and `(project Q, project-viewer)` and
  moves W of P to Q
- **THEN** be-01 answers `403 forbidden` naming `project.manage_packages` and W stays in P;
  with `(project Q, project-manager)` added the move is accepted

### Requirement: A machine credential holds only its own grants, capped at contributor

A machine credential SHALL be a grant subject (`subject_kind = 'machine_credential'`,
`subject_id` the credential's id). For a principal whose `authentication.kind` is
`machine` or `consent`, the evaluator SHALL consider only the grants naming that
credential, never the bound account's direct grants, its access groups' grants or the
organization members subject's, and SHALL intersect the effective set with the contributor cap set (the seeded
`project-contributor` and `package-contributor` sets, `wbs-custom-permissions` CP8), so a
machine never holds manager, admin or super-admin permissions, `package.claim_for_others`
included.
Current membership SHALL still be read from the bound account. A new credential SHALL hold
no grant. Granting to or revoking from a credential SHALL need the permission the same
grant to a person needs, and SHALL NOT bind a role whose set is not a subset of the granter's own
effective set at that scope. Revoking a credential SHALL delete its grants in the same transaction. A
grant write or an access-group write requested by a machine principal SHALL be refused
`403 forbidden` naming the grant permission, before any grant row is read or written.
Renewing a principal's claim leases SHALL move only the leases in work packages the
principal can read; the others SHALL be left to expire.

#### Scenario: A machine credential confined to one work package

- **WHEN** account U holds `(organization A, org-admin)`, A holds work packages W and X,
  and machine credential K, pinned to U's agent person, is new
- **THEN** K's `GET /api/work-packages` answers `200` with `[]`; after U grants K
  `(work package W, package-contributor)` K's `createWorkItem` on W is accepted, K's
  `GET /api/work-packages` lists W only, K's `GET /api/work-packages/X` and any batch on X
  answer `404 not_found`, and U still reads and writes both

#### Scenario: A manager's agent is a contributor

- **WHEN** account U holds `(project P, project-manager)`, grants its agent's credential K
  `(project P, project-manager)`, and K sends `freezeWorkPackage` and then `createWorkItem`
  to a package of P
- **THEN** the grant is accepted, `freezeWorkPackage` is refused `403 forbidden` naming
  `package.manage_settings`, `createWorkItem` is accepted, and U's own browser request for
  `freezeWorkPackage` is accepted

#### Scenario: Granting to a credential does not escalate

- **WHEN** U holds only `(project P, project-manager)` and grants credential K
  `(organization A, project-contributor)`
- **THEN** be-01 answers `403 forbidden` naming `organization.manage_access` and no grant
  row is written

#### Scenario: A machine cannot grant

- **WHEN** a machine credential pinned to an `org-super-admin`'s agent posts a grant
- **THEN** be-01 answers `403 forbidden` naming `organization.manage_access` and no grant
  row and no audit row is written

#### Scenario: Grants to people do not reach a machine

- **WHEN** A holds `(organization A, organization members, project-manager)` and
  credential K of a member's agent holds no grant
- **THEN** K's read of every package of A answers `404 not_found`; with
  `(work package W, package-manager)` granted to K, K writes work items in W, is refused
  `403 forbidden` naming `package.manage_settings`, and a claim it makes for a person bound
  to another account is refused `person_not_bound`

#### Scenario: Renewal skips an unreadable work package

- **WHEN** credential K holds unexpired leases in W and X, its grant on X is revoked, and K
  sends `POST /api/claims/renew`
- **THEN** the lease in W is renewed, the lease in X keeps its expiry and lapses at it, and
  no `claims_changed` event is published for X

### Requirement: Organization-scope grants do not write a restricted work package

When a work package's `restricted` flag is set, the evaluator SHALL treat an
organization-scope `org-admin` or `org-super-admin` grant, held directly or through an
access group, as viewer, and SHALL skip every other organization-scope grant: `org-viewer`,
any `project-*` or `package-*` role granted at organization scope, and any grant through
the organization members subject. Grants naming the work package or its project SHALL
apply unchanged. Grant administration onto a restricted work package SHALL NOT be narrowed
by the flag. An `org-super-admin` SHALL be able to clear the flag through
`organization.recover_restricted` with one `restricted_work_package_recovery` audit row in
the same transaction; no other write SHALL be admitted by that permission. Creating a work
package SHALL write a direct `package-manager` grant for its creator, so the creator keeps
write when the flag is set.

#### Scenario: Organization-scope grants stop at reading a restricted work package

- **WHEN** work package W is restricted, U holds `(organization A, project-contributor)`,
  M holds `(organization A, org-viewer)`, V holds `(organization A, org-admin)`, and C
  created W
- **THEN** U and M each get `404 not_found` on `GET /api/work-packages/W` and W is absent
  from their lists, roll-ups and load reads; V reads W and lists it, and V's
  `createWorkItem` on W is refused `403 forbidden` naming `package.write`; C reads and
  writes W through the creation grant

#### Scenario: The members subject does not reach a restricted work package

- **WHEN** W is restricted and A holds `(organization A, organization members, org-admin)`
  and member X holds nothing else
- **THEN** X gets `404 not_found` on W

#### Scenario: A direct grant reaches a restricted work package

- **WHEN** W is restricted and group G is granted `(work package W, package-viewer)`
- **THEN** a member of G reads W and is refused `403 forbidden` naming `package.write` on a
  command

#### Scenario: An org-admin grants onto a restricted work package

- **WHEN** W is restricted and V, holding `(organization A, org-admin)`, grants itself
  `(work package W, package-contributor)`
- **THEN** the grant is accepted with one `access_granted` audit row and V's next
  `createWorkItem` on W is accepted

#### Scenario: Recovery clears the flag, audited

- **WHEN** an `org-super-admin` with no grant naming W or its project sends
  `PATCH /api/work-packages/W { restricted: false }`, and then the same super-admin patches
  W's name while W is still restricted
- **THEN** the flag clear succeeds with one `restricted_work_package_recovery` audit row in
  the same transaction, a failed audit write rolls it back, and the name patch on a
  restricted W is refused `403 forbidden` naming `package.manage_settings`

### Requirement: Grants never cross organizations

Every grant SHALL carry `organization_id`, SHALL be evaluated only inside the request's
active organization, and SHALL name a scope that belongs to that organization and a
subject that is a member or group of it. A principal holding grants in several
organizations SHALL hold each only in its own.

#### Scenario: Admin of two organizations

- **WHEN** account U holds `org-admin` in A and in B, and A holds project PA with package
  WA, B holds project PB with package WB
- **THEN** with A active U reads WA and gets `404 not_found` on WB, with B active the
  reverse; a grant request in A naming WB as scope answers `404 not_found`; and
  `organization_membership`'s key `(organization_id, user_id)` admits both rows, as
  `organization-records.db.test.ts` "changes and removes only the membership in the given
  organization" already proves

### Requirement: An unreadable object is absent; a short permission is named

Every organization-wide list route (work packages, projects, spaces, directory lists,
load, rank) SHALL answer `200` with the subset the principal may see to any current member;
no list route SHALL be refused for want of a grant. An object whose effective role for the
principal is null SHALL answer `404 not_found` identical to an absent one on detail reads
and writes alike, and SHALL be absent from every list, count, roll-up, startable read, load
read and space read. A visible object with a short permission SHALL answer
`403 forbidden` with the body `{ error: 'forbidden', permission }` naming the first missing
permission; every 403 shape SHALL type `permission` by one shared refusal over the whole
permission catalogue, never by a per-route subset. Organization-kind refusals, the organization's administration collections
included, SHALL always be 403. Listing SHALL run one statement per page over
`readablePackageIds`, never one query per work package.

#### Scenario: Invisible is 404 on every verb

- **WHEN** U holds no grant that reaches package W
- **THEN** `GET`, `PATCH`, `POST …/commands`, `POST …/move`, `GET …/settings`,
  `GET …/history` and the gateway access routes for W each answer `404 not_found` with the
  same body as for an absent id, and the roll-up of the space holding W's project omits W
  for U

#### Scenario: The missing permission is named

- **WHEN** U holds `(work package W, package-viewer)` and sends a batch of
  `createWorkItem` then `freezeWorkPackage`
- **THEN** the batch is refused `403 forbidden` with `permission: 'package.write'` and
  nothing is written

#### Scenario: A package-only grant reveals the project's shell

- **WHEN** U's only grant in project P is `(work package W, package-viewer)`
- **THEN** U's `GET /api/projects` shows P's id and name and `GET /api/work-packages`
  shows W beneath it, `GET /api/projects/P/settings` answers `403 forbidden` naming
  `project.read`, and P's other work packages are absent

### Requirement: Every check runs inside the write's transaction

A write SHALL evaluate `may` on the admitted turn's stores, inside the same transaction
that commits the write, so a grant revoked or a membership removed before the write's turn
begins refuses it, whatever the request resolved earlier.

#### Scenario: A grant revoked in the same turn refuses the following command

- **WHEN** U's only grant on W is revoked on one connection while U's batch waits for the
  write gate
- **THEN** the batch is refused `404 not_found` and the journal holds no entry for it

#### Scenario: A demotion between resolve and write

- **WHEN** U's `org-super-admin` grant is replaced by `org-viewer` after U's
  `PUT /api/organization/session-policy` resolved its access and before its turn
- **THEN** the write is refused `403 forbidden` naming `organization.manage_security` and
  the policy is unchanged

### Requirement: Grants are administered within the granter's own reach and audited

`POST /api/organization/grants` SHALL require `organization.manage_organization_roles`
for an organization role, `organization.manage_access` for a project or package role, or
`project.grant` at the package's project for a package role; `DELETE …/:id` SHALL require
the same for the grant it removes; a `machine_credential` subject SHALL need the same as a
person. Removing a member SHALL need `organization.manage_members`, and removing one who
holds an organization-role grant directly SHALL also need
`organization.manage_organization_roles`. A granter SHALL NOT bind a role whose permission set is not a
subset of their grant-comparison set at the target scope (`wbs-custom-permissions` CP5,
CP13), evaluated without the restricted rule. Adding or removing an access group member
and deleting a group SHALL take the same rule for every grant naming the group, and a
grant to the organization members subject SHALL need
`organization.manage_organization_roles` (CP13). The store SHALL refuse
`409 role_scope_mismatch` for a role above its scope kind, `409 not_a_member` for a
non-member subject, `404 unknown_group` for a foreign group, `404 unknown_credential` for
a foreign or revoked credential, `409 already_granted` for a
duplicate and `409 last_super_admin` for any write that would leave no current member
holding the built-in `org-super-admin` through a direct user grant (CP14), each inside
the write's transaction. Every
grant, revoke and access-group act SHALL write one `organization_audit` row in the same
transaction (`access_granted`, `access_revoked`, `access_group_created`,
`access_group_renamed`, `access_group_deleted`, `access_group_member_added`,
`access_group_member_removed`; subject kinds `access_grant`, `access_group`). The grant
and group routes SHALL be excluded from the generated MCP tools.

#### Scenario: An org-admin grants project roles and not organization roles

- **WHEN** an `org-admin` grants `(project P, project-manager)` and then
  `(organization A, org-admin)`
- **THEN** the first is accepted with one `access_granted` row and the second is refused
  `403 forbidden` naming `organization.manage_organization_roles` with nothing written

#### Scenario: A project-manager grants inside its project only

- **WHEN** U holds `(project P, project-manager)` and nothing in project Q, and grants
  `(work package W of P, package-contributor)` and then `(work package X of Q,
package-viewer)`
- **THEN** the first is accepted and the second answers `404 not_found`

#### Scenario: No escalation

- **WHEN** U holds `(work package W, package-manager)` through `project.grant` at P and
  tries to grant `(project P, project-manager)`
- **THEN** be-01 answers `403 forbidden` naming `organization.manage_access`

#### Scenario: Removing an organization-role holder

- **WHEN** `org-admin` V removes member X, who holds `(organization A, org-admin)`, and
  then removes member Y, who holds only `(organization A, project-contributor)`
- **THEN** the first is refused `403 forbidden` naming
  `organization.manage_organization_roles` with X's membership and grants unchanged, and
  the second is accepted; an `org-super-admin` removing X is accepted

#### Scenario: The last super-admin

- **WHEN** the only direct `org-super-admin` user grant of A is revoked, or its holder
  removed, while group G of current members also holds `org-super-admin`
- **THEN** the store refuses `409 last_super_admin` and the grant and membership remain

#### Scenario: Audit cannot be written

- **WHEN** the audit write fails while a grant is written
- **THEN** the grant is rolled back and the caller receives a server error

### Requirement: Today's memberships are backfilled into grants

Migration `add_access_grants` SHALL seed the nine roles and, in the same transaction,
write for every membership an organization-scope grant (`super_admin` → `org-super-admin`,
`admin` → `org-admin`, `member` → `project-contributor`, `viewer` → `project-viewer`) and
for every organization-owned work package a `package-manager` grant for its owner when the
owner is a current member, all with `origin = 'backfill'`, and no project-scope grant. For every unrevoked machine credential whose person is bound to a current
member it SHALL write a copy of that account's backfilled grants capped at contributor
(`org-super-admin` and `org-admin` become `project-contributor` at organization scope,
`package-manager` becomes `package-contributor`), naming the credential. Its
`down.sql` SHALL refuse while any grant of another origin or any access group exists.
`organization_membership.role` SHALL stay in place and unread. With only backfilled rows,
every existing organization controller test SHALL pass unchanged except those that
exercise acts E7 moves to `org-admin` or restriction changes (design.md P5, P7).

#### Scenario: A backfilled store behaves as today

- **WHEN** a store with the pre-change fixtures (super-admin, admin, member, viewer, a
  restricted work package of the member) is migrated
- **THEN** the member writes the unrestricted work packages and their own restricted one,
  the viewer reads every unrestricted one, the admin and super-admin keep their reach and
  read the restricted one, the super-admin can clear its flag, and `down.sql` succeeds on
  that store and refuses once one grant is written by route

#### Scenario: Backfilled credentials act as contributors

- **WHEN** a store where an `org-admin` U and a member M each have an agent with a machine
  credential is migrated
- **THEN** each credential holds one organization-scope `project-contributor` grant of
  origin `backfill`, both write every unrestricted work package and neither freezes one,
  and after `revoke-backfill` both list `[]`

### Requirement: The operator revokes the backfill per organization

The operator CLI `revoke-backfill --organization=<id>` SHALL print the organization-scope
`project-contributor` and `project-viewer` grants of origin `backfill` in that
organization, whatever their subject kind, the machine credentials' copies included, SHALL
delete them only when `--expect-count` equals their number, in one
transaction with one `access_revoked` audit row each, and SHALL delete no other grant.

#### Scenario: Revoking the backfill makes members plain

- **WHEN** organization A holds three backfilled member rows and one backfilled
  `org-admin` row, and the operator runs `revoke-backfill --organization=A` first with
  `--expect-count=2` and then with `--expect-count=3`
- **THEN** the first run deletes nothing and exits non-zero naming 3, the second deletes
  the three member rows with three `access_revoked` rows, the `org-admin` and the creators'
  `package-manager` grants remain, and a former member who created nothing now lists `[]`

### Requirement: fe-01 shows grants and never hints at hidden packages

The members page SHALL list each member with their organization-kind effective role and a
grants drawer naming scope, role and provenance (direct, group, every member) with revoke;
it SHALL offer a grant form over the scopes the caller may read and an access groups
section. A member with no grant SHALL see an empty state naming the organization and their
own agents and credentials. Every list SHALL render only readable packages, and a package
URL answered 404 SHALL render the existing not-found state without an access hint.

#### Scenario: The members page after a grant

- **WHEN** an `org-admin` grants `(project P, project-contributor)` to group G
- **THEN** every member of G shows the grant with provenance "via G", and revoking it
  removes the row for each

#### Scenario: A hidden package by URL

- **WHEN** a member with no grant opens the work package page of W by its URL
- **THEN** the page renders the not-found state and no request reveals W's name
