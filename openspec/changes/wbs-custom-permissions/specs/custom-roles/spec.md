## ADDED Requirements

### Requirement: An access role is a permission set

Every access role, built-in or custom, SHALL be a set of permissions drawn from the
permission vocabulary, and `may(effective, permission)` SHALL answer whether the
permission is in the principal's effective set at the scope (design.md CP1, CP7). The nine
built-in roles SHALL be seeded with the sets of `wbs-permissions/permission-matrix.md`,
compared by id, never by count (CP4).

#### Scenario: Built-in sets equal the matrix

- **WHEN** the seed of `access_role_permission` is compared cell by cell with the matrix
  table of `permission-matrix.md`, and `PERMISSIONS` with the matrix's permission ids
- **THEN** every "yes" cell is a row, every blank cell is absent, a "shell only" cell is
  `organization.navigate` and not `project.read`, and the two id sets are equal

#### Scenario: A package role at organization scope satisfies no project permission

- **WHEN** a principal's only grant is `package-manager` at organization scope of A
- **THEN** `project.manage_settings` on any project of A is refused `403 forbidden` naming
  it, while `package.write` on every unrestricted work package of A holds

### Requirement: Corrupt role rows throw

The evaluator and the listing SHALL validate every permission row of every reaching grant
before any transformation, kind rule or cap, and SHALL throw `UnknownPermissionRow` for an
id outside the vocabulary, `PermissionKindRow` for a permission above its role's kind, and
`EmptyRoleSet` for a reaching grant whose role has no row; none SHALL be skipped (CP9).

#### Scenario: An unknown permission row throws

- **WHEN** a row `('project-manager', 'project.fly')` is inserted behind the store
- **THEN** the next `effectiveRoleAt` and the next `readablePackageIds` in that
  organization throw `UnknownPermissionRow` naming the role and the permission, and no
  decision or list is answered

#### Scenario: A misplaced kind row throws

- **WHEN** a row `('package-manager', 'project.manage_settings')` is inserted behind the
  store and its holder at organization scope patches a project's settings
- **THEN** `effectiveRoleAt` throws `PermissionKindRow` and the patch is not applied

#### Scenario: A granted role without rows throws

- **WHEN** every row of a granted custom role is deleted behind the store
- **THEN** its holder's next `effectiveRoleAt` throws `EmptyRoleSet`, never answering
  "no grant"

### Requirement: Visibility needs the read permission

A work package SHALL be visible to a principal only when `package.read` is in their
effective set at it, and a project only when `project.read` is; a non-empty set without
the read permission SHALL answer `404 not_found` on detail and write routes and SHALL
leave the object out of every list (CP17). `readablePackageIds` SHALL admit a package only
through a reaching grant whose transformed set contains `package.read`.

#### Scenario: An organization-scope role without package read

- **WHEN** U's only grant is `(organization A, Budget planner)` with the set
  `project.read`, `project.manage_budgets`
- **THEN** U's `GET /api/work-packages` is `[]`, every `GET /api/work-packages/:id` of A
  answers `404 not_found`, and U reads every unrestricted project of A

### Requirement: Restricted packages in set terms

On a restricted work package each organization-scope grant SHALL be transformed before
the union: the built-in `org-admin` and `org-super-admin`, direct or through a group,
intersected with `organization.navigate`, `project.read` and `package.read`; every other
organization-scope grant skipped. Grants naming the package or its project SHALL apply
unchanged (CP18).

#### Scenario: A custom organization role equal to org-admin

- **WHEN** U holds a custom organization role whose set equals `org-admin`'s, and V holds
  the built-in `org-admin`, both at organization scope, and W is restricted
- **THEN** W is absent from U's list and U's detail answers `404 not_found`; V lists and
  reads W and V's `createWorkItem` on W is refused `403 forbidden` naming `package.write`

#### Scenario: A direct grant beside a skipped one

- **WHEN** U holds `(organization A, org-viewer)` and `(work package W, package-contributor)`
  and W is restricted
- **THEN** U reads and writes W with provenance naming only the package grant

### Requirement: Custom access roles

An organization SHALL define custom access roles through
`POST /api/organization/access-roles { name, objectKind, permissions }` (`201`), edit
them through `PATCH /api/organization/access-roles/:id { name?, permissions? }` (`200`)
and delete them through `DELETE /api/organization/access-roles/:id` (`204`), refused in
design.md CP10's precedence. Each write SHALL append one audit row (`access_role_created`,
`access_role_updated` with permissions added and removed, `access_role_deleted`).

#### Scenario: A budgets-only role

- **WHEN** an `org-admin` of A creates `{ name: 'Budget owner', objectKind: 'project',
permissions: ['project.read', 'package.read', 'project.manage_budgets'] }` and grants it
  to U at project P
- **THEN** U's `setBudget` on a work item of P succeeds, U's `createWorkItem` on a package
  of P is refused `403 forbidden { permission: 'package.write' }`, and the role lists with
  one grant

#### Scenario: Editing a role changes every grant at once

- **WHEN** `Budget owner` is held by three grants and its set is patched to add
  `package.write`
- **THEN** every holder's next `createWorkItem` in their granted project is accepted, and
  one `access_role_updated` row records `added: ['package.write']`, `removed: []`

#### Scenario: A built-in is immutable

- **WHEN** an `org-super-admin` patches or deletes `project-manager`, or creates a role
  named `project-manager`
- **THEN** the patch and the delete are refused `409 built_in` and the create
  `409 reserved_name`, and the catalogue is unchanged

#### Scenario: A role in use cannot be deleted

- **WHEN** `Budget owner` is named by two grants and is deleted
- **THEN** the delete is refused `409 in_use { grants: 2 }`, not a foreign-key failure;
  after both grants are revoked the delete answers `204` and `access_role_deleted` is
  appended

#### Scenario: A foreign role is indistinguishable from an absent one

- **WHEN** an `org-super-admin` of A patches and deletes a custom role of organization B,
  and an id no organization holds
- **THEN** all four answer the same `404 not_found` bytes and B's role is unchanged

### Requirement: Defining stays beneath the actor

A role write SHALL be authorized against the union of the role's existing and resulting
sets (DELETE: the existing set): an organization-kind permission in it, read from
permission metadata, SHALL need `organization.manage_organization_roles`, and the actor's
effective set at organization scope SHALL contain every permission of it, else
`403 forbidden` naming the first missing one (CP5, CP15, CP16).

#### Scenario: An admin cannot craft an organization role

- **WHEN** an `org-admin` of A creates an organization-kind role with the set
  `organization.read`, `organization.manage_security`
- **THEN** it is refused `403 forbidden { permission:
'organization.manage_organization_roles' }` and nothing is written

#### Scenario: A role steward cannot hand out what it lacks

- **WHEN** U holds a custom organization role with `organization.read`, `project.read`,
  `organization.manage_access` and `organization.manage_organization_roles`, and creates a
  project-kind role with `project.read` and `project.manage_budgets`
- **THEN** it is refused `403 forbidden { permission: 'project.manage_budgets' }`

#### Scenario: An admin cannot weaken a security role

- **WHEN** an `org-super-admin` creates an organization-kind role holding
  `organization.manage_security`, and an `org-admin` patches its set to `package.read`
  and then deletes it
- **THEN** both are refused `403 forbidden` naming
  `organization.manage_organization_roles`, and the set is unchanged

#### Scenario: Copying a built-in is valid

- **WHEN** an `org-admin` creates a project-kind role with exactly `project-manager`'s set,
  `organization.navigate` included
- **THEN** it is accepted under `organization.manage_access` alone

#### Scenario: A machine principal defines nothing

- **WHEN** a request authenticated by a machine credential whose bound account is an
  `org-super-admin` posts a custom role
- **THEN** it is refused `403 forbidden { permission: 'organization.manage_access' }`
  before any row is read

### Requirement: Granting stays beneath the granter

Granting a custom role SHALL take the permission `wbs-permissions` P11 names for the
role's object kind, and SHALL be refused `403 forbidden` naming the first missing
permission when the role's set is not a subset of the granter's grant-comparison set at
the target scope: the full sets of their grants at that scope and its ancestors, without
P5's transformation (CP5, CP13).

#### Scenario: A project manager grants a custom package role

- **WHEN** a `project-manager` of P grants a package-kind role `Claims lead` with
  `package.read`, `package.write` and `package.claim_for_others` at work package W of P
- **THEN** it is accepted with one `access_granted` row

#### Scenario: A grant clerk cannot grant writes it lacks

- **WHEN** U holds at P a custom project role with `project.read`, `project.grant` and
  `package.read`, and grants `Claims lead` at W of P
- **THEN** it is refused `403 forbidden { permission: 'package.write' }` and nothing is
  written

### Requirement: Membership administration never delegates privilege

Adding a member to or removing one from an access group SHALL need, for every grant
naming the group, the permission P11 names for that grant's role and a role set inside the
actor's grant-comparison set at that grant's scope, checked in the write's transaction;
deleting a group SHALL need the revoke rule for every grant it cascades; a grant to the
organization members subject SHALL need `organization.manage_organization_roles` (CP13).

#### Scenario: An admin cannot add themselves to a privileged group

- **WHEN** group G holds `(organization A, Security officer)`, a custom role with
  `organization.manage_security`, and an `org-admin` adds themselves to G
- **THEN** it is refused `403 forbidden` naming
  `organization.manage_organization_roles` and G's members are unchanged

#### Scenario: An admin cannot grant to every member

- **WHEN** an `org-admin` grants `project-viewer` to the organization members subject
- **THEN** it is refused `403 forbidden` naming `organization.manage_organization_roles`

### Requirement: One human keeps the built-in super-admin role

At least one current member, never a machine credential, SHALL hold the built-in
`org-super-admin` through a direct `user` grant at organization scope; a group-held or
custom-role equivalent SHALL NOT count. Every write that can remove such a grant or its
holder SHALL refuse `409 last_super_admin` in its transaction (CP14).

#### Scenario: A group-held super-admin does not count

- **WHEN** X holds the only direct `org-super-admin` grant of A, group G of current
  members holds `org-super-admin`, and X's grant is revoked
- **THEN** it is refused `409 last_super_admin`; removing every member of G is accepted

#### Scenario: Concurrent removals leave one

- **WHEN** super-admins X and Y, the only two, remove each other in concurrent requests
- **THEN** exactly one removal commits and the other is refused `409 last_super_admin`

### Requirement: Delegated granters read the grantable roles

`GET /api/organization/access-roles?grantable=true&scopeKind=&scopeId=` SHALL answer the
roles the caller may bind at that scope, with id, name, object kind and set and no grant
counts, for any caller holding a grant permission there; the full listing SHALL stay under
`organization.read` (CP19).

#### Scenario: A project manager's picker

- **WHEN** a `project-manager` of P, without `organization.read`, asks for the grantable
  roles at a work package of P
- **THEN** the answer lists the three `package-*` built-ins and `Claims lead`, and
  `GET /api/organization/access-roles` answers `403 forbidden` naming
  `organization.read`

### Requirement: The machine cap is the contributor set

For a principal whose `authentication.kind` is `machine` or `consent`, the effective set
SHALL be intersected with the union of the seeded sets of `project-contributor` and
`package-contributor`, asserted by a test to exclude every grant and manage permission
(design.md CP8).

#### Scenario: A custom manager role reads as contributor for a credential

- **WHEN** a credential is granted a custom project role holding `project.read`,
  `project.manage_budgets`, `package.read` and `package.write` at P
- **THEN** its `createWorkItem` on a package of P succeeds and its `setBudget` is refused
  `403 forbidden { permission: 'project.manage_budgets' }`

### Requirement: Role routes are not MCP tools

The four role routes, the grantable listing included, SHALL be absent from mcp-01's generated
tools.

#### Scenario: The generated tool list

- **WHEN** mcp-01 builds its tools from the OpenAPI document
- **THEN** no tool's operation is `listAccessRoles`, `createAccessRole`,
  `updateAccessRole` or `deleteAccessRole`
