## Context

`wbs-permissions` (design.md P9) decides access by level: viewer 1, contributor 2,
manager 3, admin 4, super-admin 5; a permission is `(object kind, minimum level)`. It
foresaw custom roles "later" through `access_role_permission` and a switch of `may` from
threshold to set membership. Dany asked for custom roles now (2026-10-25) and named AWS
IAM as the model: managed policies beside customer-managed ones, attached to principals,
intersected with a permissions boundary, no string globs
(`docs/wbs/research/2026-10-23-authorization-model.md` §5). This change moves the set
model into `wbs-permissions` slice 1 and adds the custom catalogue on top. Grants,
subjects, scopes, the restricted rule (P5), the cap (P12), provenance and refusal shapes
(P10) are unchanged.

## Goals / Non-Goals

Goals: an organization defines roles as permission sets; the evaluator is one model for
built-in and custom roles; AWS's posture (default deny, additive allow, a boundary) with
WBS's hierarchy as the only wildcard. Non-goals: deny, conditions, per-object exceptions,
editing built-ins, space-scope roles, a finer vocabulary (proposal.md).

## Decisions

Dany's (2026-10-25, "ok" to the four questions and the structural change):

- **CP1. `may` is set membership from `wbs-permissions` slice 1.** `EffectiveRole` carries
  `permissions: ReadonlySet<Permission>` (the union over reaching grants of each role's
  set, filtered by the kind rule below) and `via`; `may(effective, permission)` is
  `effective.permissions.has(permission)`. The level threshold never ships. `level` stays a
  column of built-in roles only, for display order; no decision reads it. Grants reference
  `role_id` unchanged.
- **CP2. A custom role starts empty.** No inheritance from a built-in; "copy from
  `project-manager`" in fe-01 fills the editor's checkboxes and nothing else. Rejected:
  GitHub's "inherited role plus extras" (two sources for one set, and a built-in edit would
  silently move every derived role).
- **CP3. No deny.** Access is additive; taking access away is a revoke or a narrower set.
  Rejected: an `access_denial` table (doubles the reasoning and makes listing an
  anti-join; the research's own warning).
- **CP4. Granularity is the 27 permissions** of `permission-matrix.md`, grouped by object
  kind. No condition language, no resource patterns; the grant's scope is the only
  "wildcard" (P8). A new permission is a new row of the vocabulary, added by the change
  whose route needs it, with a matrix row and a seed for the built-ins that imply it.
- **CP5. Who defines, who grants.** Creating, editing or deleting a role that holds (or
  would hold) any `organization.*` permission needs `organization.manage_organization_roles`
  (today `org-super-admin`); any other custom role needs `organization.manage_access`
  (`org-admin`). The editor's own effective set at organization scope must contain every
  permission of the resulting set, else `403 forbidden` naming the first missing one, so
  nobody crafts a role above themselves. Granting a custom role takes P11's permission by
  the role's object kind, and the escalation rule in set terms: the granter may bind a role
  at a scope only when the role's set is a subset of the granter's effective set at that
  scope. Machine principals never define, edit or grant (P12).
- **CP6. Lifecycle.** Custom roles are organization-owned; `name` is unique within the
  organization and may not equal a built-in id; a built-in is never edited, renamed or
  deleted (`409 built_in`); a role named by any grant cannot be deleted (`409 in_use`
  naming the grant count); editing a set changes access for every grant of it at once and
  writes one audit row with the permissions added and removed.

Planner's (assumed, overrulable by id):

- **CP7. One table for both kinds.** `access_role` gains `name` and keeps
  `organization_id` (NULL = built-in). Built-ins keep `id = name` (`org-admin` …);
  custom roles get a ULID `id` and a free `name`. `access_role_permission(role_id,
permission)` holds every role's set, built-ins seeded from the matrix in
  `add_access_grants`. A role's `object_kind` is declared and every permission in its set
  is of that kind or a kind beneath it (`organization` ⊇ `project` ⊇ `work_package`):
  a project role may hold `package.*` permissions (reaching every package of the project)
  and never `organization.*`; `422 permission_kind_mismatch` otherwise. This is the kind
  filter of P9 restated for sets: a `package-*` role granted at organization scope
  contributes only `package.*` permissions, so it never satisfies a project permission.
  Rejected: a `custom_access_role` table (two catalogues, two joins in the evaluator).
- **CP8. The cap is a set.** `CONTRIBUTOR_CAP` = the union of `project-contributor`'s and
  `package-contributor`'s seeded sets, computed once in `@wbs/domain` from the seed data.
  For `authentication.kind` `machine` or `consent` the effective set is intersected with
  it; a custom role holding `project.manage_budgets` granted to a credential reads without
  it. Grant permissions (`project.grant`, `organization.manage_access`,
  `organization.manage_organization_roles`) are outside the cap by construction, which
  keeps P12's "a machine never grants" and A23's "no claim-admin bypass"
  (`package.claim_for_others` is manager-level and outside the cap).
- **CP9. Permission ids are validated at the boundary and trusted inside.**
  `access_role_permission.permission` has no CHECK list (every new permission would need a
  table rebuild). The store refuses an unknown id on write (`422 unknown_permission`) and
  the evaluator throws `UnknownPermissionRow` when a row names an id outside `PERMISSIONS`
  (never skipped, R5); `down.sql` of a change that removes a permission refuses while a
  row names it.
- **CP10. Routes**, under the organization, excluded from MCP like grant routes:

  | Route                                                            | Permission                                                    |
  | ---------------------------------------------------------------- | ------------------------------------------------------------- |
  | `GET /api/organization/access-roles` (`listAccessRoles`)         | `organization.read`; built-ins first by level, custom by name |
  | `POST /api/organization/access-roles` (`createAccessRole`)       | CP5; body `{ name, objectKind, permissions }`; `201`          |
  | `PATCH /api/organization/access-roles/:id` (`updateAccessRole`)  | CP5; `{ name?, permissions? }`; `409 built_in`                |
  | `DELETE /api/organization/access-roles/:id` (`deleteAccessRole`) | CP5; `409 built_in`, `409 in_use { grants }`                  |

  Refusals: `409 name_taken`, `409 reserved_name` (a built-in id), `422
permission_kind_mismatch`, `422 unknown_permission`, `422 empty_set` (a role with no
  permission grants nothing and is a mistake; CP2's "starts empty" is the editor's state,
  not a stored one), `403 forbidden { permission }` (P10's shape). `grantRole` answers
  `404 unknown_role` for a role of another organization.

- **CP11. Audit.** Actions `access_role_created`, `access_role_updated` (detail: name
  before/after, permissions added, removed), `access_role_deleted`; subject kind
  `access_role`. Folded into `wbs-permissions`' `widen_organization_audit_access` rebuild
  when both land in one release, else its own compatible rebuild with a guarded
  `down.sql`.
- **CP12. fe-01.** Settings → Access → Roles: built-ins read-only with their sets; custom
  roles in an editor of checkboxes grouped by kind with "copy from…" (CP2); a role's
  grant count and a link to its grants; delete disabled with the `in_use` reason. The
  members page's role picker lists custom roles beneath the built-ins of the same kind.

## Tables

Amendment to `wbs-permissions` "Tables" (the same migration `add_access_grants`):

```sql
CREATE TABLE access_role (
  id              text PRIMARY KEY,                 -- built-in: the name; custom: ULID
  name            text NOT NULL,                    -- built-in: = id
  object_kind     text NOT NULL CHECK (object_kind IN ('organization','project','work_package')),
  level           integer CHECK (level BETWEEN 1 AND 5),   -- built-ins only, display order
  organization_id text REFERENCES organization(id), -- NULL = built-in
  created_at integer NOT NULL, updated_at integer, created_by text REFERENCES users(id),
  CHECK ((organization_id IS NULL) = (level IS NOT NULL)),
  UNIQUE (organization_id, name)
);
CREATE TABLE access_role_permission (
  role_id    text NOT NULL REFERENCES access_role(id) ON DELETE CASCADE,
  permission text NOT NULL,                         -- validated at the boundary (CP9)
  PRIMARY KEY (role_id, permission)
);
-- a trigger refuses a custom name equal to any built-in id (reserved_name)
```

Seeded: the nine built-ins with the sets of `permission-matrix.md` ("Roles and the
permissions they imply", a "yes" cell is a row; "shell only" is `organization.navigate`,
not `project.read`). The matrix file is the seed's source of truth and its test asserts
the seed equals the table.

## Effective set of one principal on one target

The statement of `wbs-permissions` "Effective level of one principal on one work package"
with `MAX(level)` replaced by a join: `… JOIN access_role_permission p ON p.role_id =
g.role_id WHERE <kind rule: p.permission's kind is the target's kind or an ancestor the
role may reach> …` returning the distinct permissions and their provenance; the cap is
applied in `@wbs/domain` as a set intersection, not in SQL, so one statement serves both
principals. `readablePackageIds` selects packages where `package.read` is in the set,
still one statement with the organization-scope fast path.

## What breaks

Nothing shipped: `wbs-permissions` is unmerged, so its threshold design changes before any
code exists. Its tasks 1.1–1.3 and the `permissions` spec are amended in this PR.

## Risks / Trade-offs

- Set evaluation joins one more table per decision; the matrix is 9 × 27 rows and custom
  roles add tens, not thousands. Measured in `access-decisions.db.test.ts` (statement
  count unchanged, one join).
- An organization can define a role that is a strict superset of `org-admin` minus one
  permission; that is the point, and CP5 keeps it beneath the definer.
- Deleting a permission from the vocabulary later needs a migration that touches custom
  rows (CP9); accepted, the vocabulary grows far more often than it shrinks.
