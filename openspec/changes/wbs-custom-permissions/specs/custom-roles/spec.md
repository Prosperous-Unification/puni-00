## ADDED Requirements

### Requirement: An access role is a permission set

Every access role, built-in or custom, SHALL be a set of permissions drawn from the
permission vocabulary, stored in `access_role_permission`, and the access decision
`may(effective, permission)` SHALL answer whether the permission is in the principal's
effective set at the scope (design.md CP1, CP7). The nine built-in roles SHALL be seeded
with the sets of `wbs-permissions/permission-matrix.md`, and a test SHALL fail when the
seed and the matrix differ. A role's permissions SHALL all be of its object kind or a kind
beneath it; a row naming a permission outside the vocabulary SHALL make the evaluator
throw, never skip.

#### Scenario: Built-in sets equal the matrix

- **WHEN** the seed of `access_role_permission` is compared cell by cell with the matrix
  table of `permission-matrix.md`
- **THEN** every "yes" cell is a row, every blank cell is absent, and a "shell only" cell
  is `organization.navigate` and not `project.read`

#### Scenario: A package role at organization scope satisfies no project permission

- **WHEN** a principal's only grant is `package-manager` at organization scope of A
- **THEN** `project.manage_settings` on any project of A is refused `403 forbidden` naming
  it, while `package.write` on every work package of A holds

#### Scenario: An unknown permission row throws

- **WHEN** a row `('project-manager', 'project.fly')` is inserted behind the store
- **THEN** the next `effectiveRoleAt` on a project of that organization throws
  `UnknownPermissionRow` naming the role and the permission, and no decision is answered

### Requirement: Custom access roles

An organization SHALL define custom access roles through
`POST /api/organization/access-roles { name, objectKind, permissions }` (`201`), edit
them through `PATCH /api/organization/access-roles/:id { name?, permissions? }` (`200`)
and delete them through `DELETE /api/organization/access-roles/:id` (`204`);
`GET /api/organization/access-roles` SHALL list built-ins first by level and custom roles
by name with their sets and grant counts under `organization.read`. The writes SHALL be
refused `409 name_taken` for a duplicate name within the organization,
`409 reserved_name` for a built-in id, `422 permission_kind_mismatch` when a permission's
kind is above the role's object kind, `422 unknown_permission` for an id outside the
vocabulary, `422 empty_set` for no permission, `409 built_in` for any write on a built-in
role and `409 in_use { grants }` for deleting a role any grant names (design.md CP6,
CP7, CP10). Each write SHALL append one audit row (`access_role_created`,
`access_role_updated` with permissions added and removed, `access_role_deleted`).

#### Scenario: A budgets-only role

- **WHEN** an `org-admin` of A creates `{ name: 'Budget owner', objectKind: 'project',
permissions: ['project.read', 'project.manage_budgets'] }` and grants it to U at
  project P
- **THEN** U's `setBudget` on a work item of P succeeds, U's `createWorkItem` on a package
  of P is refused `403 forbidden { permission: 'package.write' }`, and the role lists with
  one grant

#### Scenario: Editing a role changes every grant at once

- **WHEN** `Budget owner` is held by three grants and its set is patched to add
  `package.read`
- **THEN** in the same transaction every holder reads the packages of their granted
  project, and one `access_role_updated` row records `added: ['package.read']`,
  `removed: []`

#### Scenario: A built-in is immutable

- **WHEN** an `org-super-admin` patches or deletes `project-manager`, or creates a role
  named `project-manager`
- **THEN** the patch and the delete are refused `409 built_in` and the create
  `409 reserved_name`, and the catalogue is unchanged

#### Scenario: A role in use cannot be deleted

- **WHEN** `Budget owner` is named by two grants and is deleted
- **THEN** the delete is refused `409 in_use { grants: 2 }`; after both grants are
  revoked the delete answers `204` and `access_role_deleted` is appended

### Requirement: Defining and granting stay beneath the actor

Creating, editing or deleting a role whose resulting set holds any `organization.*`
permission SHALL need `organization.manage_organization_roles`; any other custom role
SHALL need `organization.manage_access`. The actor's effective set at organization scope
SHALL contain every permission of the resulting set, else the write SHALL be refused
`403 forbidden` naming the first missing permission. Granting a custom role SHALL take the
permission `wbs-permissions` P11 names for the role's object kind, and SHALL be refused
`403 forbidden` when the role's set is not a subset of the granter's effective set at the
target scope. A machine principal SHALL be refused every one of these writes (design.md
CP5).

#### Scenario: An admin cannot craft a role above itself

- **WHEN** an `org-admin` of A creates a project-kind role whose set includes
  `project.manage_budgets`, which `org-admin` holds, and then patches it to add
  `organization.manage_security`
- **THEN** the create succeeds and the patch is refused `403 forbidden { permission:
'organization.manage_organization_roles' }`

#### Scenario: A project manager grants only what it holds

- **WHEN** a `project-manager` of P grants `Budget owner` (`project.read`,
  `project.manage_budgets`) at P, and then a custom package role holding
  `package.claim_for_others` and `project.grant` at a package of P
- **THEN** the first grant succeeds and the second is refused `403 forbidden { permission:
'project.grant' }` because `project.grant` is not in the granter's set at that package

#### Scenario: A machine principal defines nothing

- **WHEN** a request authenticated by a machine credential whose bound account is an
  `org-super-admin` posts a custom role
- **THEN** it is refused `403 forbidden { permission: 'organization.manage_access' }`
  before any row is read

### Requirement: The machine cap is the contributor set

For a principal whose `authentication.kind` is `machine` or `consent`, the effective set
SHALL be intersected with the union of the seeded sets of `project-contributor` and
`package-contributor`, computed from the seed data and asserted by a test to exclude every
grant and manage permission (design.md CP8).

#### Scenario: A custom manager role reads as contributor for a credential

- **WHEN** a credential is granted a custom project role holding `project.read`,
  `project.manage_budgets`, `package.read` and `package.write` at P
- **THEN** its `createWorkItem` on a package of P succeeds and its `setBudget` is refused
  `403 forbidden { permission: 'project.manage_budgets' }`
