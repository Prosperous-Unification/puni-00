## Context

`wbs-permissions` (design.md P9) decides access by level: viewer 1, contributor 2,
manager 3, admin 4, super-admin 5; a permission is `(object kind, minimum level)`. It
foresaw custom roles "later" through `access_role_permission` and a switch of `may` from
threshold to set membership. Dany asked for custom roles now (2026-10-25) and named AWS
IAM as the model: managed policies beside customer-managed ones, attached to principals,
intersected with a permissions boundary, no string globs
(`docs/wbs/research/2026-10-23-authorization-model.md` §5). This change moves the set
model into `wbs-permissions` slice 1 and adds the custom catalogue on top. Grants,
subjects, scopes, provenance and refusal shapes (P10) are unchanged; the restricted rule
(P5), the cap (P12), visibility and the escalation rule are restated in set terms below
(CP13 to CP20, after the Codex review of 2026-10-25).

Depends on PR #723 (merges first) for P13/P14 (`ScopeChain`, the port's names), P6 and
P19 (`organization.manage_settings`) and the matrix rows; this change does not edit them.

## Goals / Non-Goals

Goals: an organization defines roles as permission sets; the evaluator is one model for
built-in and custom roles; AWS's posture (default deny, additive allow, a boundary) with
WBS's hierarchy as the only wildcard. Non-goals: deny, conditions, per-object exceptions,
editing built-ins, space-scope roles, a finer vocabulary (proposal.md).

## Decisions

Dany's (2026-10-25, "ok" to the four questions and the structural change):

- **CP1. `may` is set membership from `wbs-permissions` slice 1.** `EffectiveRole` carries
  `permissions: ReadonlySet<Permission>` (the union over reaching grants of each grant's
  set after CP18's transformation, then the cap) and `via`; `may(effective, permission)`
  is `effective.permissions.has(permission)`. The level threshold never ships. `level`
  stays a column of built-in roles only, for display order; no decision reads it. Grants
  reference `role_id` unchanged.
- **CP2. A custom role starts empty.** No inheritance from a built-in; "copy from
  `project-manager`" in fe-01 fills the editor's checkboxes and nothing else. Rejected:
  GitHub's "inherited role plus extras" (two sources for one set, and a built-in edit would
  silently move every derived role).
- **CP3. No deny.** Access is additive; taking access away is a revoke or a narrower set.
  Rejected: an `access_denial` table (doubles the reasoning and makes listing an
  anti-join; the research's own warning).
- **CP4. Granularity is the permission vocabulary**: the enumerated ids of
  `permission-matrix.md`, which are the 21 permissions of the matrix on this branch and 22
  once #723's P19 adds `organization.manage_settings`. The id list, never a count, is the
  source of truth: `PERMISSIONS`, the matrix and the seed are compared as id sets. No
  condition language, no resource patterns; the grant's scope is the only "wildcard"
  (P8). A new permission is a new vocabulary row, added by the change whose route needs
  it, with a matrix row and a seed for the built-ins that imply it. _Corrected after the
  Codex review (F9): it read "27", which no tree held._
- **CP5. Who defines, who grants.** Creating, editing or deleting a role whose set holds
  any organization-kind permission needs `organization.manage_organization_roles` (today
  `org-super-admin`); any other custom role needs `organization.manage_access`
  (`org-admin`). The editor's own effective set at organization scope must contain every
  permission of the authorized set, else `403 forbidden` naming the first missing one,
  so nobody crafts a role above themselves. Granting a custom role takes P11's permission
  by the role's object kind, and the escalation rule in set terms: the granter may bind a
  role at a scope only when the role's set is a subset of the granter's grant-comparison
  set at that scope (CP13). Machine principals never define, edit or grant (P12).
  _Sharpened after the Codex review:_ "the set" is the union of the existing and the
  resulting set (CP15), and "organization-kind" is read from permission metadata (CP16).
- **CP6. Lifecycle.** Custom roles are organization-owned; `name` is unique within the
  organization and may not equal a built-in id; a built-in is never edited, renamed or
  deleted (`409 built_in`); a role named by any grant cannot be deleted (`409 in_use`
  naming the grant count); editing a set changes access for every grant of it at once and
  writes one audit row with the permissions added and removed.

Planner's (assumed, overrulable by id):

- **CP7. One table for both kinds.** `access_role` gains `name` and keeps
  `organization_id` (NULL = built-in). Built-ins keep `id = name` (`org-admin` …);
  custom roles get a ULID `id` and a free `name`. `access_role_permission` holds every
  role's set (columns `role_id`, `permission`), built-ins seeded from the matrix in
  `add_access_grants`. A role's `object_kind` is declared and every permission in its set
  has metadata kind `any` or the role's kind or a kind beneath it (`organization` ⊇
  `project` ⊇ `work_package`, CP16): a project role may hold `package.*` permissions
  (reaching every package of the project) and never an organization-kind one;
  `422 permission_kind_mismatch` otherwise. This rule replaces P9's evaluator kind
  filter: the store enforces it on write, the seed test on the built-ins, and the
  evaluator throws `PermissionKindRow` on a stored row that breaks it (R5). A `package-*`
  role granted at organization scope therefore holds no project permission to
  contribute. Rejected: a `custom_access_role` table (two catalogues, two joins in the
  evaluator).
- **CP8. The cap is a set.** `CONTRIBUTOR_CAP` = the union of `project-contributor`'s and
  `package-contributor`'s seeded sets (today `organization.navigate`, `project.read`,
  `package.read`, `package.write`), computed once in `@wbs/domain` from the seed data.
  For `authentication.kind` `machine` or `consent` the effective set is intersected with
  it; a custom role holding `project.manage_budgets` granted to a credential reads without
  it. Grant permissions (`project.grant`, `organization.manage_access`,
  `organization.manage_organization_roles`) are outside the cap by construction, which
  keeps P12's "a machine never grants" and A23's "no claim-admin bypass"
  (`package.claim_for_others` is outside the cap). The cap is a permissions boundary, not
  a rung: custom roles have no order.
- **CP9. Permission ids are validated at the boundary and trusted inside.**
  `access_role_permission.permission` has no CHECK list (every new permission would need a
  table rebuild). The store refuses an unknown id on write (`422 unknown_permission`),
  before any kind computation. On read, the evaluator and the listing both validate every
  row of every reaching grant before any transformation, kind rule or cap: a row outside
  `PERMISSIONS` throws `UnknownPermissionRow`, a row breaking CP7 throws
  `PermissionKindRow`, and a reaching grant whose role has no row throws `EmptyRoleSet`
  (a stored role is never empty, so an empty one is corrupt state, never "no grant").
  Never skipped (R5). The `down.sql` of a migration that adds a permission first deletes
  the built-in seed rows it inserted, then refuses while any custom role's row still
  names the id; retiring a permission forward is its own change (forward migrations are
  additive).
- **CP10. Routes**, under the organization, excluded from MCP like grant routes:

  | Route                                                                   | Permission                                                    |
  | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
  | `GET /api/organization/access-roles` (`listAccessRoles`)                | `organization.read`; built-ins first by level, custom by name |
  | `GET /api/organization/access-roles?grantable=true` (`listAccessRoles`) | any grant permission at the scope named (CP19)                |
  | `POST /api/organization/access-roles` (`createAccessRole`)              | CP5; body `{ name, objectKind, permissions }`; `201`          |
  | `PATCH /api/organization/access-roles/:id` (`updateAccessRole`)         | CP5, CP15; `{ name?, permissions? }`; `409 built_in`          |
  | `DELETE /api/organization/access-roles/:id` (`deleteAccessRole`)        | CP5, CP15; `409 built_in`, `409 in_use { grants }`            |

  Refusals, in this precedence (the first that applies answers):
  1. a machine principal: `403 forbidden { permission: 'organization.manage_access' }`;
  2. holding neither `organization.manage_access` nor
     `organization.manage_organization_roles`: the same `403`;
  3. PATCH or DELETE of an absent role or another organization's: `404 not_found`, the
     same bytes for both, nothing read or written of the foreign role;
  4. PATCH or DELETE of a built-in: `409 built_in`;
  5. an id outside the vocabulary: `422 unknown_permission`;
  6. no permission besides kind-`any` ones: `422 empty_set` (CP2's "starts empty" is the
     editor's state, not a stored one; `organization.navigate` alone grants nothing a grant
     does not, CP20);
  7. a permission above the role's kind: `422 permission_kind_mismatch`;
  8. an organization-kind permission in the authorized set without
     `organization.manage_organization_roles`: `403 forbidden` naming it;
  9. the authorized set not inside the actor's: `403 forbidden` naming the first missing;
  10. `409 reserved_name` (a built-in id), `409 name_taken`;
  11. DELETE of a role any grant names: `409 in_use { grants }`.

  `grantRole` answers `404 unknown_role` for a role of another organization.

- **CP11. Audit.** Actions `access_role_created`, `access_role_updated` (detail: name
  before/after, permissions added, removed), `access_role_deleted`; subject kind
  `access_role`. Folded into `wbs-permissions`' `widen_organization_audit_access` rebuild
  when both land in one release, else its own compatible rebuild whose `down.sql` refuses
  through a named guard (precedent
  `20261022140100_widen_organization_audit_compute_providers`, whose comment records that
  without the guard the narrow table's CHECK fails instead).
- **CP12. fe-01.** Settings → Access → Roles: built-ins read-only with their sets; custom
  roles in an editor of checkboxes grouped by kind with "copy from…" (CP2); a role's
  grant count and a link to its grants; delete disabled with the `in_use` reason. The
  members page's grant form fills its role picker from CP19's grantable listing for the
  chosen scope, custom roles beneath the built-ins of the same kind; a member's effective
  permissions render as the set with provenance, never as one role name.

## Decisions after the Codex review

Each assumed by the planner on 2026-10-25, overrulable by id. CP13, CP14 and CP20 answer
the reviewer's three product questions and await Dany.

- **CP13. Membership administration never delegates privilege.** _Settled by Dany 2026-10-25 ("the restriction makes sense now let's impl it")._
  `addGroupMember` and `removeGroupMember` are authority changes: for every grant naming
  the group, at that grant's scope, the actor needs the permission P11 names for granting
  (or revoking) that grant's role, and that role's set must be a subset of the actor's
  grant-comparison set at the scope, checked inside the write's transaction against the
  group's grants as they stand then. `deleteAccessGroup` takes the revoke rule for every
  grant it cascades. A grant whose subject is `organization_members` needs
  `organization.manage_organization_roles` whatever its role, because it reaches every
  future member; so `organization.manage_members`, invitations, join-request approvals
  and SCIM never hand out privilege by admitting someone. The **grant-comparison set** of
  a principal at scope S is the union of the full sets of every grant of theirs whose
  scope is S or an ancestor of S, without P5's transformation (P11) and without the cap
  (machines are refused before it is read); an organization-scope `org-admin` therefore
  holds every `package.*` permission at a package, and a `project-manager` of P holds
  `project.grant` and every `package.*` permission at a package of P. Negative: an
  `org-admin` adds themselves to a group holding a custom organization role with
  `organization.manage_security` and is refused `403 forbidden` naming
  `organization.manage_organization_roles`, the group unchanged.
- **CP14. One human keeps the built-in super-admin role.** _Settled by Dany 2026-10-25 ("yes ok"); per organization, see `wbs-permissions` P20._ The invariant is
  "at least one current member of the organization, not a machine credential, holds the
  built-in `org-super-admin` through a direct `user` grant at organization scope". A
  group-held `org-super-admin`, a custom role with an equal set, and a credential's grant
  never satisfy it. One store function runs inside the transaction of every write that
  can delete or detach such a grant or its holder: `revokeRole`, member removal (route,
  SCIM deprovisioning, leaving), `deleteAccessGroup`, `removeGroupMember` and credential
  revocation; it counts after the write and the write rolls back `409 last_super_admin`
  when the count is zero. The last three cannot lower the count, and their call is what
  their negatives prove. Custom role edits do not participate, because no custom role
  satisfies the invariant. Negatives: two super-admins removing each other in concurrent
  transactions leaves exactly one; revoking the last direct grant while a group of
  current members holds `org-super-admin` is refused; emptying that group is accepted
  and changes no count.
- **CP15. An edit is authorized against what it takes away too.** PATCH is authorized
  (CP5's administration permission and actor-subset rule) against the union of the
  existing and the resulting set, DELETE against the existing set. Removing a permission
  the actor lacks is therefore refused `403 forbidden` naming it, and an `org-admin`
  cannot weaken a role that holds `organization.manage_security` by replacing its set with
  `{ package.read }` (refused naming `organization.manage_organization_roles`).
- **CP16. Permission metadata carries the kind; navigation is kind `any`.** Each
  `PERMISSIONS` entry carries `kind: 'organization' | 'project' | 'work_package' | 'any'`,
  the "Kind" column of `wbs-permissions` "Permission vocabulary". `organization.navigate`
  is `any`: allowed in a role of every kind, never counted as organization-kind by CP5,
  never refused by CP7, and evaluated as P9's `any` mode. CP7's validation and CP5's test
  read the metadata, never the id's prefix. Copying any built-in into a custom role of the
  same kind is therefore valid; a role that omits navigation loses nothing (CP20).
- **CP17. Visibility needs the read permission.** An object is visible when its read
  permission is in the effective set at it: `package.read` for a work package,
  `project.read` for a project; the organization is always visible to its members (P10).
  `effectiveRoleAt` answers null when the target's read permission is absent, so a
  non-empty set without it is still invisible and every caller's single `404` holds.
  `readablePackageIds` admits a package only through a reaching grant whose transformed
  set contains `package.read`, with the membership predicate kept; its fast path is "the
  principal holds an organization-scope grant whose transformed set contains
  `package.read`". The statement is in "Effective set" below. The names `EffectiveRole`
  and `effectiveRoleAt` are #723's (P13); renaming them to match the glossary's
  **Effective permissions** waits for that merge.
- **CP18. P5 in sets.** On a restricted work package target each reaching grant is
  transformed before the union: a grant naming the work package or its project, direct
  or through a group, is unchanged; an organization-scope grant of the built-in
  `org-admin` or `org-super-admin`, held directly or through a group, is intersected with
  `READ_ONLY` = {`organization.navigate`, `project.read`, `package.read`}; every other
  organization-scope grant is skipped, the organization-members subject's and custom
  organization-kind roles' included, even when their set equals `org-admin`'s. On an
  unrestricted target every grant is unchanged. P11's escalation comparison stays
  unrestricted (CP13). The transformation is a pure `@wbs/domain` function applied after
  row validation (CP9). _Flag for Dany:_ whether a custom role may opt into the admin read
  exception; assumed no, because the exception exists so an administrator can find and
  grant onto a restricted package, which the built-ins already cover.
- **CP19. Delegated granters read the grantable roles.**
  `GET /api/organization/access-roles?grantable=true&scopeKind=&scopeId=` answers, for a
  principal holding at that scope any grant permission (`project.grant`,
  `organization.manage_access`, `organization.manage_organization_roles`), the roles they
  may bind there (P11's permission by kind and CP13's subset rule), each with id, name,
  object kind and set only: no grant counts, no links. Without such a permission it answers
  `403 forbidden` naming `organization.manage_access`; an invisible scope answers
  `404 not_found`. The full listing stays under `organization.read`.
- **CP20. Permissions are independently usable.** _Awaits Dany._ No permission implies
  another: a role with `project.manage_budgets` and no `package.read` is legitimate and
  sees no package; visibility always needs the read permission (CP17);
  `organization.navigate` is implied by every grant (P9's `any` mode), so listing it in a
  set is harmless and omitting it costs nothing. The fe-01 editor warns, without refusing,
  when a set holds a write or manage permission of a kind whose read it lacks.

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
the seed's ids equal the table's, cell by cell, and every seeded row satisfies CP7.

Rollback: `add_access_grants`' `down.sql` refuses, through named guards as the precedent
above, while any grant with `origin <> 'backfill'`, any access group, any custom role
(`organization_id IS NOT NULL`) or any permission row of a custom role exists; built-in
roles and their seed rows are removable. Otherwise it drops the five tables in dependency
order: `access_grant`, `access_group_member`, `access_group`, `access_role_permission`,
`access_role`. Its test covers an ungranted custom role: refused, the role and its rows
kept.

## Effective set of one principal on one target

One statement, replacing `wbs-permissions` "Effective level of one principal on one work
package". It returns raw rows; validation (CP9), the P5 transformation (CP18) and the cap
(CP8) run in `@wbs/domain`, in that order, so no filter can hide a corrupt row:

```sql
WITH subject(kind, id) AS (…as in wbs-permissions, :machine guards unchanged…),
scope(kind, id, organization_wide) AS (VALUES
  ('organization', :org, 1), ('project', :project, 0), ('work_package', :work_package, 0))
SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id, g.role_id,
       r.object_kind, r.organization_id IS NULL AS built_in,
       p.permission                                    -- NULL: the role has no row (EmptyRoleSet)
FROM access_grant g
JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
JOIN scope   c ON c.kind = g.scope_kind   AND c.id = g.scope_id
JOIN access_role r ON r.id = g.role_id
LEFT JOIN access_role_permission p ON p.role_id = g.role_id
WHERE g.organization_id = :org
  AND EXISTS (SELECT 1 FROM organization_membership m
              WHERE m.organization_id = :org AND m.user_id = :user);
```

No kind filter: CP7 makes the role's kind rule a property of the stored rows. The project
target drops the `work_package` scope row, the organization target keeps only its own; the
`any` mode drops the `scope` join.

Listing, one statement (`wbs-permissions` "Listing without N queries" is replaced):

```sql
WITH subject(kind, id) AS (…as above…),
reaching AS (
  SELECT g.scope_kind, g.scope_id, g.subject_kind,
         r.organization_id IS NULL AND r.id IN ('org-admin', 'org-super-admin') AS admin_read,
         SUM(p.permission = 'package.read') > 0 AS reads_packages,
         COUNT(p.permission) AS row_count,
         SUM(p.permission NOT IN (SELECT value FROM json_each(:vocabulary))) AS unknown_rows
  FROM access_grant g
  JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
  JOIN access_role r ON r.id = g.role_id
  LEFT JOIN access_role_permission p ON p.role_id = g.role_id
  WHERE g.organization_id = :org
  GROUP BY g.id
)
SELECT 'corrupt' AS kind, NULL AS id FROM reaching
  WHERE row_count = 0 OR unknown_rows > 0         -- the adapter throws (CP9)
UNION ALL
SELECT 'package', wp.id FROM work_package wp
JOIN work_package_organization wpo ON wpo.resource_id = wp.id
WHERE wpo.organization_id = :org
  AND EXISTS (SELECT 1 FROM organization_membership m
              WHERE m.organization_id = :org AND m.user_id = :user)
  AND EXISTS (SELECT 1 FROM reaching g WHERE g.reads_packages AND (
        (g.scope_kind = 'organization' AND (wp.restricted = 0          -- CP18
            OR (g.subject_kind <> 'organization_members' AND g.admin_read)))
     OR (g.scope_kind = 'project' AND g.scope_id = wp.project_id)
     OR (g.scope_kind = 'work_package' AND g.scope_id = wp.id)));
```

`:vocabulary` is the JSON array of `PERMISSIONS` ids. The kind check of CP7 runs on
`effectiveRoleAt`'s rows; the listing reads only `package.read`, which every kind may hold.
A `project.read` listing of projects follows the same shape. Tests: an organization-scope
role without `package.read` lists nothing and every detail answers `404`; list and detail
agree on generated fixtures (every listed id has `package.read` in `effectiveRoleAt`, and
the converse); restricted targets for built-in and custom organization roles; one
statement (statement counter) and `EXPLAIN QUERY PLAN` naming `access_grant_subject`.

## What breaks

Nothing shipped: `wbs-permissions` is unmerged, so its threshold design changes before any
code exists. Its P9, P11, P12, "Tables", "The `may` port", vocabulary note, effective-level
and listing notes, tasks 1.1–1.3, the `permissions` spec and the matrix note are amended in
this PR. Integration with #723's later decisions (one space per project, no owner record,
the migrated project) lands with #723; nothing here reads them.

## Risks / Trade-offs

- Set evaluation joins one more table per decision; the matrix is nine roles over the
  vocabulary and custom roles add tens of rows, not thousands. Measured in
  `access-decisions.db.test.ts` (statement count unchanged, query plan asserted).
- An organization can define a role that is `org-admin` minus one permission; that is the
  point, and CP5 keeps it beneath the definer.
- CP13 makes group membership changes as strict as grants, so an `org-admin` cannot add
  members to a group that holds an organization role. Accepted: the alternative is the
  self-add escalation.
- Deleting a permission from the vocabulary later needs a migration that touches custom
  rows (CP9); accepted, the vocabulary grows far more often than it shrinks.
