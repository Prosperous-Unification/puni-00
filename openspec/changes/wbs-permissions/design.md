## Context

What exists, read on 2026-10-24 at `2e0ab3245`:

| Need                           | Exists today                                                                                                                                                                                                                                                                                                                                                     | Missing                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Who may act in an organization | `organization_membership (organization_id, user_id, role)` with `ORGANIZATION_ROLES` (`stored-vocabularies.ts`); `OrganizationAccess.resolve` answers one `OrganizationScope { organizationId, userId, role, delegated? }` per request                                                                                                                           | any authority narrower than the organization                                |
| The role checks                | `organization-access.ts` in `@wbs/domain`: `canWriteInOrganization`, `mayBindAccountInOrganization`, `canEditProjectInOrganization`, `classifyProjectEdit`, `mayAdministerMembership`, `mayInvite`; in `@wbs/core`: `mayEditProjectWithin`, `findProjectWithin`, `isClaimAdmin`, `maySwitchCapacityMode`, `machineCredentialReachOf`, `scopesOfRoles`            | one check that names a permission                                           |
| Where the role is read         | 11 sites in `@wbs/core` read `scope.role` directly; the stores read it again inside the write transaction (`admitEditInOrganization`, `mayInvite` in `invitation.ts`, `mayAdministerMembership` in `organization.ts`, `super_admin` in `domain-claim.ts`, `enterprise-connection.ts`, `shared-people-restore*.ts`, `session-policy.ts`, `provisioning-token.ts`) | a store port that answers an effective level inside the same transaction    |
| What a project is              | `project` with `owner_id` and `restricted`; `project_organization (resource_id, organization_id)` owns it; `canEditProject` is the creator rule                                                                                                                                                                                                                  | the project → work package split (`wbs-work-packages`, E1 to E3)            |
| A grant's subject              | `users.id`; `person.account_id` binds an agent person to an account; a machine principal acts as that account with `authentication.kind` `machine` or `consent` and is capped by `organizationRoleOf` (A23)                                                                                                                                                      | a group of accounts; a members-wide subject                                 |
| Listing                        | `listForInOrganization(userId, organizationId)` and the spaces' omit-never-hint rule (`space-authorization`)                                                                                                                                                                                                                                                     | a list filtered by grants in one statement                                  |
| Audit                          | `organization_audit` with 23 actions and 9 subject kinds, widened by compatible rebuild (`20261012090200`, `20261022110000`)                                                                                                                                                                                                                                     | grant and group acts                                                        |
| The technical basis            | [Authorization model research](../../../docs/wbs/research/2026-10-23-authorization-model.md): typed grant table, seeded role catalogue, strongest-wins down the scope chain, `MIN(MAX(level), cap)`, permissions not roles, one EXISTS listing query, in-transaction check, backfill, deny and custom roles addable without reshaping grants                     | the owner's answers to its open questions Q1 to Q6: E7, and P1 to P14 below |

Three facts shape the design. First, the stores already re-check the role inside the
write's transaction (`admitEditInOrganization` refuses "an actor demoted on another
connection after the request's access resolved"), so "check inside the write turn" is a
port change, not a new mechanism. Second, every organization-owned row is reachable through
a `*_organization` table, so "the scope belongs to the organization" is one indexed join.
Third, `wbs-work-packages` turns today's `project` row into a **work package** inside a
new **project** (PR #698). The Context table above names today's code; everything below,
the matrix and the specs are written in the vocabulary after #698's fixes: routes
`/api/work-packages/:id…` for today's `/api/projects/:id…`, a new `/api/projects` family for
the engagement, tables `work_package` and `work_package_organization`, command kinds
`freezeWorkPackage` and `unfreezeWorkPackage`, audit action `restricted_work_package_recovery`.

**Order against #698.** Slices 1 and 2 land on whichever tables exist (today's `project`
rows are the work package scope, P1) and may land before #698 slice 1. Slices 3 to 7 run
after #698 slice 1, because their routes, tests and matrix use its names; slice 3's
project-scope rules (create, import and move at the named project, project grants,
`project.read`) also wait for #698 slice 2's project entity.

## Goals / Non-Goals

**Goals:** a plain member sees nothing until granted; an organization, a project or one
work package can be granted to an account, an access group or every member; the effective
role is the strongest grant down the chain, capped for machines; code asks `may(scope,
permission)`; unreadable objects are absent and 404; grants are administered, listed and
audited in the organization; dev data keeps today's behaviour through a backfill.

**Non-Goals:** deny rules, custom roles, space-scoped grants, group sync from SSO or SCIM,
nested groups, changes to claim semantics, production activation, the behaviour behind
`project.manage_budgets` (owned by `wbs-measure-budgets`) and `project.manage_dependencies`
(owned by cross-package dependencies).

## Decisions

E7, E8 and E9 are Dany's (2026-10-23/24) and fixed. P1 to P16 are **assumed** by this
draft; each is overrulable by id without moving another decision unless noted. After the
review of 2026-10-24 the coordinator revised P5, P9 and P10, kept P4 and P7 with their
consequences stated in "What breaks", and added P15 and P16; each revision names its
reason, and Dany may overturn any of them by id. The
research note's open questions map: Q1 → E7 (access group), Q2 → P2, Q3 → P1, Q4 → P3,
Q5 → P5, Q6 → P4.

**E7. Roles, scope-prefixed.** Nine roles: `org-super-admin` (ownership and security:
SSO, domains, limits, deleting the organization, granting `org-admin`), `org-admin`
(members, invitations, directory entities, measure definitions, spaces, creating projects,
granting project roles), `org-viewer` (reads every project and the organization);
`project-manager` (settings, budgets, dependencies, work packages, granting package roles,
writes everywhere in the project), `project-contributor` (writes work items, steps, facts,
estimates and claims across the project's packages; no settings or budgets),
`project-viewer`; `package-manager`, `package-contributor`, `package-viewer` (the same
inside one work package). Plain membership can be granted and sees nothing until granted,
except the member's own agent persons and credentials. A grant is (principal, scope,
role). Principals: an account (a human, or a machine credential acting through its agent
person's bound account), an **access group** (new entity, members are accounts, used only
by grants; service teams stay planning labels), or **organization members** (every current
member). The effective role on a work package is the strongest grant on it, its project
or its organization, held directly or through a group. Machine principals are capped at
contributor (supersedes A23's "member"). No deny and no custom roles now; both must be
addable without reshaping grants. One person may be admin of several organizations.

**E8. No compatibility burden.** There are no users; breaking is fine, but dev data
migrates. The backfill (`super_admin` → `org-super-admin`, `admin` → `org-admin`,
`member` → `project-contributor` at organization scope, `viewer` → `project-viewer` at
organization scope) keeps today's project reads and writes until the backfilled rows are
removed deliberately by `revoke-backfill` (P15; P7 states what it does not keep).

**E9. One configuration layering model** across organization → space → project → work
package: defined at a level, inherited downward, overridable only where the definition
allows, every read states its provenance. Grants are the first thing on that chain, with
strongest-wins as their combination rule. A space carries no grants yet but is in the
chain.

**P1. A work package is a whole WBS and does not nest.** `access_grant.scope_id` for a
`work_package` scope is today's `project.id`. The scope chain of a package is exactly
three rows (organization, project, package); no recursive CTE and no closure table.
Nesting would add ancestors to the `scope` CTE and nothing else.

**P2. Grants name accounts.** `subject_id` for a `user` subject is `users.id`, as
memberships do. A machine credential is not a subject: it acts as its agent person's bound
account, which is a human member's account (`wbs-machine-credentials` A12), so the same
rows serve the human and the machine, and the **machine cap** (P12) is what tells them
apart.

**P3. A package-only grant reveals its project's shell.** A principal whose only grant in
a project is on one of its work packages may read that project's id and name, and nothing
else of it: no settings, no budgets, no other packages, no member list. This is a derived
`organization.navigate` reach (below), never `project.read`.

**P4. `org-viewer` reads every project** (level 1 at every project and package, like
GitHub's owner inheritance), besides the organization's own settings and member list
(`GET /api/organization/members` under `organization.read`). Restricted work packages are
the exception (P5). _Kept 2026-10-24 after review:_ the member list is organization
information a reader of the whole organization needs to read assignments; today only
admins list members, so the widening is stated in "What breaks".

**P5. Restricted work package: organization-scope grants do not write it.** _Revised
2026-10-24 after review; it read "organization-wide grants do not reach it", which took
from `org-admin` the read an admin has today and left only the super-admin's recovery to
administer the package._ The flag stays on the work package (`work_package.restricted`,
#698 E25); a project is never restricted. On a restricted target the evaluator treats each
organization-scope grant as follows: `org-admin` and `org-super-admin`, held directly or
through an access group, count as level 1, so they read it and its lists show it; every
other organization-scope grant is skipped: `org-viewer`, any `project-*` or `package-*`
role granted at organization scope (the backfilled members' rows included), and every
grant through the organization-members subject. Grants naming the project or the work
package apply unchanged. Granting onto a restricted package is not narrowed:
`organization.manage_access` is organization-kind, and P11's escalation comparison ignores
the restriction, so an `org-admin` may grant any project or package role on it, themselves
included, as one audited `access_granted` row; restriction stops silent writes, not audited
grants. Recovery is one write: an `org-super-admin` clears the flag
(`PATCH /api/work-packages/:id { restricted: false }`) through
`organization.recover_restricted`, with one `restricted_work_package_recovery` audit row in
the same transaction; any other write by a holder of no grant naming the package or its
project answers `403 forbidden` naming the permission. Today's recovery through command
batches, undo and redo, steps, markers, saved plans and Retry
(`organization-ownership-and-access`) is retired. The creator keeps write through P6, not
through `owner_id`.

**P6. Creating grants the creator.** Creating a project writes a direct `project-manager`
grant for its creator in the same transaction; creating or importing a work package writes
a direct `package-manager` grant for its creator. `project.owner_id` stays as a record and
no longer decides access. The backfill writes a `package-manager` grant for every existing
package's owner, so a restricted package stays editable by its creator after P5.

**P7. What E8's backfill keeps, and what narrows on day one.** The backfill keeps every
member's project reads and writes and every viewer's reads. It does not give members the
acts E7 moves to `org-admin`: directory commands, space writes, creating projects or
packages, binding persons. Those narrow at the swap; an `org-admin` grants them back by
role. Capacity mode stays `org-super-admin`'s. Trusted issuers move from admin to
`org-super-admin` (a credential source is security); compute providers stay with
`org-admin` under `organization.manage_directory` (a provider binds a directory resource).
_Kept 2026-10-24 after review:_ the trusted-issuer move is E7's "security" line for
`org-super-admin`, and it is a narrowing from `org-admin`, stated in "What breaks".

**P8. Wildcard is the hierarchy, never a string glob.** "Access to everything" is one
organization-scope grant. "Every member may view every project" is one grant whose
subject is the organization-members subject. A grant at an ancestor reaches every object
created later beneath it. No pattern column exists.

**P9. Levels, not names, decide; the catalogue is seeded.** `access_role.level` runs
viewer 1, contributor 2, manager 3, admin 4, super-admin 5. A permission is
`(object kind, minimum level)`; `may` answers `effective level at the scope ≥ minimum`
where the effective level considers only roles whose `object_kind` is the target's kind or
an ancestor kind. _Made normative 2026-10-24 after review:_ the effective-level statement
carries `AND r.object_kind IN (<kinds for the target>)` (organization: `organization`;
project: `organization`, `project`; work package: all three), so a `package-*` role granted
at organization scope never satisfies a project or organization permission; without the
filter its level 3 would read as `project.manage_settings`. Custom roles later add rows with `organization_id` and an
`access_role_permission` table, and `may` switches from a threshold to set membership;
grants reference `role_id` unchanged. Deny later adds `access_denial` with the same subject
and scope columns, evaluated as an exclusion; grants are untouched. Neither reshapes
`access_grant`.

**P10. Refusals; one shape for lists.** _Revised 2026-10-24 after review; the draft
refused some list routes `403` naming `organization.navigate` and answered others with an
empty list, two shapes for one situation._ Every organization-wide list route (work
packages, projects, spaces, the directory lists, load, rank) answers `200` with the subset
the principal may see, for any current member; a plain member gets `[]`, except that
`GET /api/people` lists their own agent persons. `organization.navigate` gates no list: it
only decides whether directory rows and spaces belong to the subset. A detail route or a
write on an object whose effective level is null (no grant reaches it, or P5 skips every
reaching grant) answers `404 not_found`, byte-identical to an absent or foreign object, and
the object is absent from every list, count, roll-up and aggregate. A short permission on a
visible object answers `403 forbidden` with the permission named:
`{ error: 'forbidden', permission: 'package.write' }`. The organization itself is always
visible to its members, so organization-kind refusals are always 403, the administration
collections (members, invitations, join requests, limits, domains, SSO connections,
provisioning tokens, trusted issuers, compute providers, grants, access groups) included.
A command batch names the first refused command's permission. Delegations keep today's
`403 insufficient_scope` on administration routes; a machine principal's refusals come
from the cap and read as `forbidden` with the permission.

**P11. Who grants what.** `org-super-admin` grants and revokes organization roles
(`organization.manage_organization_roles`); `org-admin` grants and revokes project and
package roles at any scope and administers access groups (`organization.manage_access`);
`project-manager` grants and revokes package roles inside its project (`project.grant`). A
granter never binds a role whose level exceeds their own effective level at the target
scope for that role's kind, evaluated without P5's restriction rule (the Kubernetes
escalation rule, today's `mayAdministerMembership`). Revoking the last `org-super-admin` grant, or removing that
member, is refused `409 last_super_admin` in the store's transaction. A member's removal
deletes their grants and group memberships in the same transaction, audited once.
Invitations and join-request approvals carry an optional initial grant from the catalogue
(`org-admin`, `org-viewer`, `project-contributor` or `project-viewer` at organization
scope, or none); SCIM-provisioned and onboarding-created members arrive with none, except
the organization's creator, who is `org-super-admin`.

**P12. Machine cap at check and at grant.** The evaluator applies `cap = 2` when the
principal's `authentication.kind` is `machine` or `consent`, `5` otherwise:
`MIN(MAX(level), cap)`. The cap holds through groups and the organization-members subject.
A grant write by a machine principal is refused `403 forbidden` naming the grant permission
before any row is read, because every grant permission needs level 3 or more. There is no
machine-specific subject to refuse (P2). `package.claim_for_others` needs level 3, which
keeps A23's "no claim-admin bypass for a machine".

**P13. One port, one query, one listing.** `@wbs/domain` gains the pure
`permissionsOf(level, kind)` and `may(effective, permission)`, and the `ScopeChain` value
type shared with #698 (`{ organizationId, spaceIds, projectId, workPackageId? }`), which
this change's slice 1 defines because it lands first; #698's `resolveSetting` walks it
nearest-wins and `effectiveRoleAt` combines it strongest-wins. `@wbs/core` gains the port
`AccessDecisions` with `effectiveRoleAt(principal, target)` and
`readablePackageIds(principal, organizationId)`, implemented in `@wbs/store-sqlite` with
the two statements below, and exposed on the admitted turn's stores so a batch checks
inside its own transaction. The `OrganizationScope.role` field is removed from the
type; `resolve` still answers membership and the cap. Every named check above maps to one
permission (the table in "The `may` port"). No cache; a per-organization grant version is
the hook if measurement ever asks for one.

**P14. The space slot on the chain is declared, not filled.** `scope_kind`'s CHECK admits
`organization`, `project`, `work_package` today; widening it to `space` is a CHECK change,
not a reshape. A project may sit in several spaces (`Space membership`) and #698 E24 gives
it no home space: `ScopeChain.spaceIds` is the set, and a space-overridable setting with
different values in two of them resolves `ambiguous_space_value`. Space grants would
combine strongest-wins over that set, which several spaces cannot make ambiguous, so
opening the slot needs the CHECK widening and nothing else. Every effective-role read carries its
provenance (`via: { scopeKind, scopeId, subjectKind, subjectId, roleId }[]`), which is
E9's "every read states provenance" for grants and what the members page shows.

**P15. "A member sees nothing" becomes true by an explicit step.** _Added 2026-10-24 after
review:_ E8's backfill gives every member `project-contributor` at organization scope, so
until those rows go the plain-member rule has no member to apply to. An operator CLI,
`apps/wbs/be-01/src/revoke-backfill-cli.ts --organization=<id>`, prints the
organization-scope `project-contributor` and `project-viewer` grants of `origin =
'backfill'` it would delete (the `member` and `viewer` mappings; the `org-*` rows and the
creators' `package-manager` rows stay) and deletes them only when `--expect-count=<n>`
equals that count, in one transaction with one `access_revoked` audit row each (origin `operator`, actor
`operator:<os login>` as `organization-limits-cli.ts` writes). The dev runbook gains the line; dev keeps member writes until Dany runs it.

**P16. Creation before the project entity exists.** _Added 2026-10-24 after review:_
until #698 slice 2 there is no project for a create or import body to name, so slice 2
gates `createProject` and `importProject` (today's names; `createWorkPackage` and
`importWorkPackage` after #698 slice 1) by the organization-kind permission
`organization.create_project` (level 4). Slice 3, after #698 slice 2, moves them to
`project.manage_packages` at the project the body names, adds `moveWorkPackage` at both
projects and gates the new `/api/projects` family (permission-matrix.md).

## Tables

All additive, one migration `add_access_grants` with `down.sql`; names are SQLite.

```sql
CREATE TABLE access_role (
  id              text PRIMARY KEY,   -- 'org-super-admin' … 'package-viewer'
  object_kind     text NOT NULL CHECK (object_kind IN ('organization','project','work_package')),
  level           integer NOT NULL CHECK (level BETWEEN 1 AND 5),
  organization_id text REFERENCES organization(id),   -- NULL = built-in; custom roles later
  UNIQUE (object_kind, level, organization_id)
);
-- seeded: org-super-admin 5, org-admin 4, org-viewer 1 (organization);
--         project-manager 3, project-contributor 2, project-viewer 1 (project);
--         package-manager 3, package-contributor 2, package-viewer 1 (work_package)

CREATE TABLE access_group (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL, created_at integer NOT NULL, updated_at integer,
  created_by text REFERENCES users(id),
  UNIQUE (organization_id, name), UNIQUE (organization_id, id)
);
CREATE TABLE access_group_member (
  organization_id text NOT NULL, group_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id), created_at integer NOT NULL,
  created_by text REFERENCES users(id),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (organization_id, group_id) REFERENCES access_group(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_membership(organization_id, user_id)
);
CREATE INDEX access_group_member_user ON access_group_member (organization_id, user_id);

CREATE TABLE access_grant (
  id              text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  scope_kind      text NOT NULL CHECK (scope_kind IN ('organization','project','work_package')),
  scope_id        text NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('user','group','organization_members')),
  subject_id      text NOT NULL,
  role_id         text NOT NULL REFERENCES access_role(id),
  origin          text NOT NULL CHECK (origin IN ('backfill','route','invitation','creation')),
  created_at integer NOT NULL, created_by text REFERENCES users(id),
  UNIQUE (organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id)
);
CREATE INDEX access_grant_subject ON access_grant (organization_id, subject_kind, subject_id);
CREATE INDEX access_grant_scope   ON access_grant (organization_id, scope_kind, scope_id);
```

Invariants the store checks in the grant's transaction (each with a negative):

- `access_role.object_kind` is the scope's kind or a kind beneath it: `org-admin` at
  project scope is refused `409 role_scope_mismatch`; `package-viewer` at organization
  scope is allowed.
- `scope_id` belongs to `organization_id`: `work_package_organization` for a package
  (today's `project_organization` while slice 1 precedes #698 slice 1) and
  `project.organization_id` for a project; a foreign or absent scope answers
  `404 not_found`.
- A `user` subject is a current member (`organization_membership` row) of
  `organization_id`, else `409 not_a_member`; a `group` subject is a group of the
  organization, else `404 unknown_group`; an `organization_members` subject has
  `subject_id = organization_id`, enforced by a trigger.
- A duplicate grant answers `409 already_granted` and writes nothing.
- The granter's permission and level (P11); the last-super-admin rule (P11); the machine
  cap (P12).
- `down.sql` refuses while any grant with `origin <> 'backfill'` or any access group
  exists; otherwise it drops the four tables. `organization_membership.role` is not
  touched by this change; dropping it is a later cleanup once no release reads it.

## Permission vocabulary

Twenty-one permissions over four evaluation kinds. The full inventory of every
plan-command kind (54), every directory command (18 of those 54) and every route family
(128 contract endpoints today, 150 after #698 and this change) with its permission is
[permission-matrix.md](permission-matrix.md), which is the heart of this change and the
source the tests enumerate.

| Permission                               | Kind         | Min level | Held by                                     |
| ---------------------------------------- | ------------ | --------- | ------------------------------------------- |
| `organization.navigate`                  | any          | 1         | any grant in the organization               |
| `organization.read`                      | organization | 1         | org-viewer, org-admin, org-super-admin      |
| `organization.manage_members`            | organization | 4         | org-admin, org-super-admin                  |
| `organization.manage_directory`          | organization | 4         | org-admin, org-super-admin                  |
| `organization.manage_spaces`             | organization | 4         | org-admin, org-super-admin                  |
| `organization.create_project`            | organization | 4         | org-admin, org-super-admin                  |
| `organization.manage_access`             | organization | 4         | org-admin, org-super-admin                  |
| `organization.manage_organization_roles` | organization | 5         | org-super-admin                             |
| `organization.manage_security`           | organization | 5         | org-super-admin                             |
| `organization.manage_capacity_mode`      | organization | 5         | org-super-admin                             |
| `organization.recover_restricted`        | organization | 5         | org-super-admin                             |
| `project.read`                           | project      | 1         | project-viewer and up, org-viewer and up    |
| `project.manage_settings`                | project      | 3         | project-manager, org-admin, org-super-admin |
| `project.manage_budgets`                 | project      | 3         | reserved for `wbs-measure-budgets`          |
| `project.manage_dependencies`            | project      | 3         | reserved for cross-package dependencies     |
| `project.manage_packages`                | project      | 3         | project-manager, org-admin, org-super-admin |
| `project.grant`                          | project      | 3         | project-manager, org-admin, org-super-admin |
| `package.read`                           | work_package | 1         | every viewer and up                         |
| `package.write`                          | work_package | 2         | every contributor and up                    |
| `package.manage_settings`                | work_package | 3         | every manager and up                        |
| `package.claim_for_others`               | work_package | 3         | every manager and up; never a machine       |

Kind `any` means the principal's maximum level over every grant in the organization,
whatever its scope: it never refuses (P10) and decides only whether the directory rows the
WBS table needs, the spaces and the project shells that lead to a package (P3) are in a
list's subset.
Organization-kind permissions consider organization roles only; project-kind consider
organization and project roles; package-kind consider all three. `project.manage_budgets`
and `project.manage_dependencies` are seeded names with no route behind them here, so a
later change adds behaviour without renumbering.

## The `may` port

```ts
// @wbs/domain
type Permission = (typeof PERMISSIONS)[number]['id'];
interface EffectiveRole {
  level: 1 | 2 | 3 | 4 | 5;
  via: GrantProvenance[];
}
function may(effective: EffectiveRole | null, permission: Permission): boolean;

interface ScopeChain {
  organizationId: string;
  spaceIds: readonly string[];
  projectId: string;
  workPackageId?: string;
} // shared with #698's resolveSetting

// @wbs/core ports/access-decisions.ts
type AccessTarget =
  | { kind: 'organization'; organizationId: string }
  | { kind: 'project'; chain: ScopeChain }
  | { kind: 'work_package'; chain: ScopeChain & { workPackageId: string }; restricted: boolean };
interface AccessDecisions {
  /** null = invisible; evaluated with the principal's cap, inside the caller's transaction when on the admitted turn's stores. */
  effectiveRoleAt(principal: ScopedPrincipal, target: AccessTarget): Promise<EffectiveRole | null>;
  /** one statement; fast path when any organization-scope grant exists */
  readablePackageIds(
    principal: ScopedPrincipal,
    organizationId: string,
  ): Promise<ReadonlySet<string>>;
}
// @wbs/core: the one call sites make
function authorize(
  decisions,
  principal,
  scope,
  permission,
): Promise<
  | { ok: true; effective: EffectiveRole }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden'; permission }
>;
```

`authorize` answers `not_found` when `effectiveRoleAt` is null and the target is not the
organization, `forbidden` with the permission when the level is short, `ok` otherwise
(P10). Until #698 slice 2 a work package has no project, so slices 1 and 2 build its
target with the organization and package rows only (a store-private
`{ organizationId, workPackageId }` reader; no project grant can exist yet); slice 3
switches every caller to `ScopeChain`. Every existing check becomes one call:

| Today                                                                                              | Becomes                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canWriteInOrganization(role)` in batches, steps, markers, saved plans, import                     | `package.write` at the package; `organization.manage_directory` for directory batches; create and import as P16                                                                                     |
| `mayBindAccountInOrganization(role)`                                                               | `organization.manage_directory`                                                                                                                                                                     |
| `canEditProjectInOrganization`, `mayEditProjectWithin`, `canEditProject`                           | `package.write` (restriction is the evaluator's, P5; `owner_id` no longer read)                                                                                                                     |
| `classifyProjectEdit`                                                                              | `ordinary` when `package.write` or `package.manage_settings` holds; `recovery` when it does not, the edit only clears `restricted` and `organization.recover_restricted` holds (P5); else `refused` |
| `mayAdministerMembership(actor, current, requested)`                                               | grant and revoke rules of P11 (`organization.manage_organization_roles`, `organization.manage_access`, `project.grant`, escalation, last super-admin)                                               |
| `mayInvite(actor, role)`                                                                           | `organization.manage_members` plus the grant rule for the initial grant                                                                                                                             |
| `findProjectWithin`                                                                                | `findReadablePackage`: `effectiveRoleAt` null answers null, so every caller keeps one 404                                                                                                           |
| `isClaimAdmin(access)`                                                                             | `package.claim_for_others` at the package                                                                                                                                                           |
| `maySwitchCapacityMode` and `roleMaySwitchCapacityMode`                                            | `organization.manage_capacity_mode`; delegations still refused                                                                                                                                      |
| `machineCredentialReachOf`                                                                         | `every` when `organization.manage_directory` holds, else `own`; machines and delegations `none`                                                                                                     |
| `scopesOfRoles` (`editor` for admins)                                                              | `editor` when the organization-kind level is 4 or more                                                                                                                                              |
| `organizationRoleOf` (A23 cap)                                                                     | the evaluator's `cap` (P12)                                                                                                                                                                         |
| directory "every agent" visibility (`directory.resource.ts:1739`)                                  | `organization.manage_directory`                                                                                                                                                                     |
| `super_admin` exceptions in `step.resource.ts`, `save-plan.ts`, `project.resource.ts`              | removed; the only recovery is the audited flag clear (P5)                                                                                                                                           |
| store-side `super_admin` reads (domains, SSO, session policy, provisioning, shared-people restore) | `organization.manage_security` evaluated in the same transaction                                                                                                                                    |

### Effective level of one principal on one work package

```sql
WITH subject(kind, id) AS (
  SELECT 'user', :user
  UNION ALL SELECT 'group', group_id FROM access_group_member
            WHERE organization_id = :org AND user_id = :user
  UNION ALL SELECT 'organization_members', :org
),
scope(kind, id, organization_wide) AS (VALUES
  ('organization', :org, 1), ('project', :project, 0), ('work_package', :work_package, 0))
SELECT MIN(MAX(CASE WHEN c.organization_wide = 1 AND :restricted = 1 THEN 1 ELSE r.level END),
           :cap),                                                     -- P5 read-only, P12 cap
       json_group_array(json_object('scopeKind', g.scope_kind, 'scopeId', g.scope_id,
         'subjectKind', g.subject_kind, 'subjectId', g.subject_id, 'roleId', g.role_id))
FROM access_grant g
JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
JOIN scope   c ON c.kind = g.scope_kind   AND c.id = g.scope_id
JOIN access_role r ON r.id = g.role_id
WHERE g.organization_id = :org
  AND r.object_kind IN ('organization', 'project', 'work_package')   -- P9: kinds for the target
  AND NOT (c.organization_wide = 1 AND :restricted = 1                -- P5
           AND (g.subject_kind = 'organization_members'
                OR r.id NOT IN ('org-admin', 'org-super-admin')))
  AND EXISTS (SELECT 1 FROM organization_membership m
              WHERE m.organization_id = :org AND m.user_id = :user);
```

The kind list is a literal per target kind, never a bound list: a work package target keeps
all three, a project target drops the `work_package` scope row and the `work_package` kind,
the organization target keeps the `organization` row and kind only. Project and
organization targets bind `:restricted = 0` (only a work package carries the flag). The
`any` kind drops the `scope` join and the kind filter. `:cap` is 2 for a machine principal,
5 otherwise. SQLite's two-argument `MIN` is NULL when `MAX` is, and NULL is "invisible".
Negatives (task 1.3): drop the kind filter and a `package-manager` grant at organization
scope satisfies `project.manage_settings`; drop the P5 clause and an `org-viewer` reads a
restricted package; drop the `CASE` and an `org-admin` writes one.

### Listing without N queries

```sql
WITH subject(kind, id) AS (…as above…)
SELECT wp.id FROM work_package wp
JOIN work_package_organization wpo ON wpo.resource_id = wp.id
WHERE wpo.organization_id = :org AND EXISTS (
  SELECT 1 FROM access_grant g
  JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
  JOIN access_role r ON r.id = g.role_id
  WHERE g.organization_id = :org
    AND ((g.scope_kind = 'organization' AND g.scope_id = :org
          AND (wp.restricted = 0
               OR (g.subject_kind <> 'organization_members'
                   AND r.id IN ('org-admin', 'org-super-admin'))))   -- P5
      OR (g.scope_kind = 'project' AND g.scope_id = wp.project_id)
      OR (g.scope_kind = 'work_package' AND g.scope_id = wp.id)));
```

`package.read` admits every role kind, so the listing needs no kind filter. The principal's
grants are read once; with any organization-scope grant the list is every unrestricted
package plus the restricted ones a project or package grant reaches, or every restricted
one for an `org-admin` or `org-super-admin` (P5). The statement runs from slice 3, after
#698 slice 1 gives these names and slice 2 `work_package.project_id`. Spaces, roll-ups,
person load, startable reads, work package rank and every other cross-package read filter
through `readablePackageIds`, as `space-authorization` already demands. A project is in
`GET /api/projects` when `project.read` holds at it, or as a shell (id and name) when one of
its packages is listed (P3).

## Grant administration

Routes, all under the organization, excluded from MCP tools like credential routes:

| Route                                                                              | Permission                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/organization/grants?scope=&subject=`                                     | `organization.read`; `subject=me` needs membership only                                |
| `POST /api/organization/grants` (`grantRole`)                                      | by the role's kind: P11; body `{ scopeKind, scopeId, subjectKind, subjectId, roleId }` |
| `DELETE /api/organization/grants/:id` (`revokeRole`)                               | the same permission the grant needed; `409 last_super_admin`                           |
| `GET /api/organization/access-groups`                                              | `organization.read`                                                                    |
| `POST /api/organization/access-groups` (`createAccessGroup`)                       | `organization.manage_access`; `409 name_taken`                                         |
| `PATCH /api/organization/access-groups/:id` (`renameAccessGroup`)                  | `organization.manage_access`                                                           |
| `DELETE /api/organization/access-groups/:id` (`deleteAccessGroup`)                 | `organization.manage_access`; cascades its grants and members, audited                 |
| `POST /api/organization/access-groups/:id/members` (`addGroupMember`)              | `organization.manage_access`; `409 not_a_member` for a non-member                      |
| `DELETE /api/organization/access-groups/:id/members/:userId` (`removeGroupMember`) | `organization.manage_access`                                                           |

`PATCH /api/organization/members/:userId` (`changeMemberRole`) is removed; `listMembers`
answers each member's organization-kind effective role (or none) and grant count instead
of `role`. `GET /api/organization/members` opens to `organization.read` (P4). Grant
writes onto a restricted work package follow P5 and P11 (not narrowed by the flag).

## Backfill migration

In `add_access_grants`, after the seed, inside the same transaction:

- For every `organization_membership` row: `super_admin` → `(organization, org,
user, org-super-admin)`, `admin` → `org-admin`, `member` → `project-contributor` at
  organization scope, `viewer` → `project-viewer` at organization scope; `origin =
'backfill'`, `created_by` null.
- For every work package row with an organization (today's `project` row and
  `project_organization` when slice 1 precedes #698 slice 1, `work_package` and
  `work_package_organization` after it): `(work_package, id, owner_id, package-manager)`
  when the owner is a current member of that organization (P6).
- The legacy organization's pre-activation accounts are members already
  (`organization-legacy-activation.ts`) and are covered by the first rule.
- No project-scope row is written: no project entity exists at slice 1. #698 slice 2's
  migration later creates each organization's **Default project**; it is
  migration-created, so it has no creator and no `project-manager` grant, and members reach
  it and its packages through the organization-scope backfill rows until `revoke-backfill`
  removes them (P15). An `org-admin` reaches it by role throughout.

"The swap" in this document is the deploy of `add_access_grants` with this backfill, the
release whose code reads grants (slice 2). It is neither the legacy organization's
activation (`organization-legacy-activation.ts`) nor production activation, which is a
non-goal.

The migration test counts grants per role against memberships and projects, proves
`down.sql` refuses over one route-origin grant and succeeds over backfill-only rows, and
proves that a store with only backfilled rows answers every controller test of today's
matrix unchanged (slice 2 runs the existing organization controller tests against it
before any check is rewired).

## fe-01

- The members page (`members-panel.tsx`) lists members with their organization-kind
  effective role and a grants drawer per member: scope, role, provenance (direct, group
  name, or "every member"), revoke; a grant form (scope picker over readable projects and
  packages, role by scope kind, subject: member, group, every member); an access groups
  section (create, rename, delete, members). Refusals render the named permission.
- A plain member with no grant sees an empty state naming the organization and "ask an
  administrator for access", with their own agent persons and credentials
  (`person-credentials.tsx`) still shown.
- Project and package lists, spaces, roll-ups and work package rank render only what
  `readablePackageIds` returns; a package URL the server answers 404 for renders the
  existing not-found state, never a "no access" hint.
- `organization-role.ts` and the role select go; the `editor` scope derivation follows
  `scopesOfRoles`' new rule.

## MCP and gw-01

mcp-01's tools are unchanged: the grant and group routes join `EXCLUDED_PATHS` with the
usual exposure test, and every existing tool is enforced in core through `authorize`. A
delegation acts as its human with the human's grants; a consent credential as its agent
with the cap. gw-01's `gatewayProjectAccess` and `gatewayBrowserProjectAccess` use
`findReadablePackage`, so a socket subscription to an unreadable package is 404 as today's
foreign one is.

## Audit vocabulary

Actions `access_granted`, `access_revoked`, `access_group_created`,
`access_group_renamed`, `access_group_deleted`, `access_group_member_added`,
`access_group_member_removed`; subject kinds `access_grant`, `access_group`. Detail: role
id, scope kind and id, subject kind and id, origin (`route`, `invitation`, `creation`,
`cascade`, `operator` for `revoke-backfill`), group name where relevant; never an email. One compatible rebuild
(`widen_organization_audit_access`, precedent `20261012090200`), `down.sql` refusing while
a new-action row exists. The backfill is not audited (it is the migration ledger's row).

## What breaks (E8)

- `organization_membership.role` is no longer read; `OrganizationScope.role` leaves the
  type; `ORGANIZATION_ROLES` survives only for the migration and the invitation's initial
  grant mapping until `wbs-work-packages` and this change land, then is deleted.
- `changeMemberRole` is removed; `listMembers`, `createInvitation`, `listInvitations`,
  `approveJoinRequest` change shape (initial grant instead of `role`).
- Members lose directory, space, creation and binding writes until granted (P7).
- Trusted issuers narrow from `org-admin` to `org-super-admin` (P7).
- `org-viewer` gains the member list, which only admins read today (P4).
- Members lose the read of restricted work packages they did not create; `org-admin` keeps
  the read and, as today, has no write; the super-admin's recovery shrinks to clearing the
  flag (P5).
- Lists answer `200` with the visible subset where a plain member was refused or shown
  everything (P10).
- "A member sees nothing" holds only after `revoke-backfill` runs per organization; dev
  keeps member reads and writes until Dany runs it (P15).
- `owner_id` and `canEditProject` no longer decide access (P6).
- Machine principals of a manager's agent act as contributors (they acted as members).
- Every controller test that sets a membership role sets a grant instead; the fixtures'
  `role:` helper becomes `grants:`.

## Risks / Trade-offs

- **P7 narrows members at the swap.** A dev-only cost: the first `org-admin` of each
  organization grants back what the team needs. The alternative, backfilling members as
  `org-admin`, would make "member sees nothing" a fiction until someone revokes.
- **P5 lets `org-admin` grant itself onto a restricted package.** Restriction stops
  silent organization-wide writes; an admin who needs to write takes a direct grant, which
  is one `access_granted` audit row. The stricter alternative (no organization role may
  grant onto it) would leave a package whose creator left with only the super-admin's flag
  clear as a way in.
- **The `any` kind is a fourth evaluation mode.** It exists so that package-only
  principals can render the table; without it every package grant would need a shadow
  organization grant. It never grants a write.
- **Two queries per request on the hot path.** Both touch three scope rows and a few
  subject rows on two indexes; no measurement has asked for a cache, and the
  per-organization grant version is the design if one does.
- **The dependency on `wbs-work-packages`.** Slices 1 and 2 can land on today's tables
  (`project` scope rows stay empty until a project entity exists); slices 3 to 7 run after
  #698 slice 1, and slice 3's project rules after its slice 2 (Context, "Order against
  #698"). If it slips, the `project` scope kind is a seeded CHECK value with no rows, which
  costs nothing.

## Archive order

The four MODIFIED deltas target requirements that live only in unarchived changes:
`organization-access` ("Organization roles bound actions") in
`organization-ownership-and-access`; `space-authorization` ("Viewers read, members
write") in `add-spaces`; `machine-credentials` ("A machine token acts as its pinned
person's account with capped scopes") in `wbs-machine-credentials`; and
`organization-audit`, which this change only ADDs to, but whose capability is introduced by
`organization-enterprise-sso` and widened by `wbs-machine-credentials` and
`wbs-organization-limits`. Those changes must be synced or archived into `openspec/specs/`
before this one archives, or the MODIFIED blocks have no target and the audit capability no
base.
