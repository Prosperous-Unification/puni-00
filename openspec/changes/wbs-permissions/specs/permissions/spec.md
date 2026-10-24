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

#### Scenario: A removed member's grants grant nothing

- **WHEN** an account holds an `org-admin` grant in A and its membership is removed on
  another connection
- **THEN** the next request is refused `403 not_a_member` and no grant row of that account
  remains in A

### Requirement: A grant at an ancestor reaches everything beneath it, including what is created later

A grant SHALL name one grant scope: the organization, a project or a work package. The
effective role of a principal at a work package SHALL be the strongest grant that names
that package, its project or its organization (`MAX(level)`), held directly, through an
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

#### Scenario: The strongest grant wins across scopes

- **WHEN** U holds `(organization A, project-viewer)` through the members subject,
  `(project P, project-contributor)` directly and `(work package W of P,
package-manager)` through group G
- **THEN** U's effective role at W is manager with provenance listing all three grants,
  at another package of P contributor, and at a package of another project viewer; a
  `PATCH /api/work-packages/W` is accepted and the same patch on P's other package is
  refused `403 forbidden` naming `package.manage_settings`

### Requirement: A role counts only for the kinds it governs

The effective level for a permission SHALL consider only grants whose role's object kind is
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

### Requirement: Machine principals are capped at contributor

The evaluator SHALL apply `MIN(MAX(level), 2)` for a principal whose `authentication.kind`
is `machine` or `consent`, through every subject kind, so a machine never holds manager,
admin or super-admin permissions, `package.claim_for_others` included. A grant write or an
access-group write requested by a machine principal SHALL be refused `403 forbidden`
naming the grant permission, before any grant row is read or written.

#### Scenario: A manager's agent is a contributor

- **WHEN** account U holds `(project P, project-manager)` and a machine credential pinned
  to U's agent person sends `freezeWorkPackage` and then `createWorkItem` to a package of P
- **THEN** `freezeWorkPackage` is refused `403 forbidden` naming `package.manage_settings`,
  `createWorkItem` is accepted, and U's own browser request for `freezeWorkPackage` is
  accepted

#### Scenario: A machine cannot grant

- **WHEN** a machine credential pinned to an `org-super-admin`'s agent posts a grant
- **THEN** be-01 answers `403 forbidden` naming `organization.manage_access` and no grant
  row and no audit row is written

#### Scenario: The cap holds through the members subject

- **WHEN** A holds `(organization A, organization members, project-manager)`
- **THEN** a machine principal of any member writes work items but is refused
  `package.manage_settings`, and a claim it makes for a person bound to another account is
  refused `person_not_bound`

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
permission. Organization-kind refusals, the organization's administration collections
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
the same for the grant it removes. A granter SHALL NOT bind a role whose level exceeds
their own effective level at the target scope for that role's kind, evaluated without the
restricted rule. The store SHALL refuse
`409 role_scope_mismatch` for a role above its scope kind, `409 not_a_member` for a
non-member subject, `404 unknown_group` for a foreign group, `409 already_granted` for a
duplicate and `409 last_super_admin` for a revoke or removal that would leave the
organization without an `org-super-admin`, each inside the grant's transaction. Every
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

#### Scenario: The last super-admin

- **WHEN** the only `org-super-admin` grant of A is revoked, or its holder removed
- **THEN** the store refuses `409 last_super_admin` and the grant and membership remain

#### Scenario: Audit cannot be written

- **WHEN** the audit write fails while a grant is written
- **THEN** the grant is rolled back and the caller receives a server error

### Requirement: Today's memberships are backfilled into grants

Migration `add_access_grants` SHALL seed the nine roles and, in the same transaction,
write for every membership an organization-scope grant (`super_admin` → `org-super-admin`,
`admin` → `org-admin`, `member` → `project-contributor`, `viewer` → `project-viewer`) and
for every organization-owned work package a `package-manager` grant for its owner when the
owner is a current member, all with `origin = 'backfill'`, and no project-scope grant. Its
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

### Requirement: The operator revokes the backfill per organization

The operator CLI `revoke-backfill --organization=<id>` SHALL print the organization-scope
`project-contributor` and `project-viewer` grants of origin `backfill` in that
organization, SHALL delete them only when `--expect-count` equals their number, in one
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
