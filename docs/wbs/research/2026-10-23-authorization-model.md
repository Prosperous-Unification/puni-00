# Authorization model: scoped grants for organization, project and work package

Desk research, date 2026-10-23. Answers one question: what shape should WBS give a
multi-scope authorization model with the requirements the owner set today, and how is it
stored and evaluated inside be-01's SQLite with no external authorization service. Every
external claim cites a primary source (paper, official docs, or source code at a named
version); local claims cite repository paths. Claims marked **unverified** were not
confirmed against a source.

## Requirements as given

- Scopes nest Organization → Project → Work package. A Space groups projects and carries no
  authority.
- A plain organization member sees nothing until granted.
- Nine scope-prefixed roles: `org-super-admin`, `org-admin`, `org-viewer`;
  `project-manager`, `project-contributor`, `project-viewer`; `package-manager`,
  `package-contributor`, `package-viewer`.
- A grant is (principal, scope, role). A principal is a person, a team, or a machine
  credential's agent person. Machine principals are capped at contributor.
- The effective role on a work package is the strongest grant on that package, its project
  or its organization, held directly or through a team.
- "Access to everything" and wildcard scoping must be easy. A grant on the organization
  implies every project. "Every member of org X may view every project" must be expressible.
- No deny rules and no custom roles for now. One person may be admin of several
  organizations.

## What WBS does today

- `organization_membership` is keyed by (`organization_id`, `user_id`) and has one `role`
  column limited to `super_admin`, `admin`, `member` and `viewer`
  (`apps/wbs/be-01/drizzle/20260927120000_add_organization_records/migration.sql`). The
  role catalogue is `ORGANIZATION_ROLES` in `libs/wbs/domain/domain/src/stored-vocabularies.ts`.
  The wire type is `role` in `libs/wbs/domain/contracts/src/http/organization-shapes.ts`,
  which `changeMemberRole`, `listMembers` and `removeMember` use.
- A request resolves to one `OrganizationScope` (`organizationId`, `userId`, `role`,
  optional `delegated`), produced only by `OrganizationAccess.resolve`
  (`libs/wbs/application/core/src/ports/organization-access.ts`). The scope carries one
  role for the whole organization. No per-project or per-work-item authority exists.
- Role checks are pure functions over that single role, in
  `libs/wbs/domain/domain/src/organization-access.ts`. `canWriteInOrganization` allows every
  role except viewer. `mayBindAccountInOrganization` allows admin and super-admin.
  `canEditProjectInOrganization` combines a writing role with the restricted-creator rule.
  `classifyProjectEdit` answers `ordinary`, `recovery` or `refused`. `mayAdministerMembership`
  and `mayInvite` encode the role matrix. The application layer adds `mayEditProjectWithin`,
  `findProjectWithin` (organization-scoped lookup, foreign project answers 404) and
  `isClaimAdmin` (`libs/wbs/application/core/src/module/work-item/claims.ts`).
- `CONTEXT.md` defines the terms this model touches:
  - **Membership** is one user's association with one organization and the role that
    governs access there. Several memberships per user are allowed, so several
    organizations per person already works.
  - **Role** is super-admin, admin, member or viewer. **Super-admin** owns ownership and
    security decisions in its organization.
  - **Space** is a lens that owns nothing. **Project** owns its work items.
  - **Work item** is one unit in a project's tree.
  - **Restricted project** is readable by every current member and editable only by its
    creator, with an audited super-admin recovery.
  - **Machine credential** lets one agent person act as its bound account with read and
    write only.
- Gaps against the request:
  - `CONTEXT.md` has no **Work package** term.
  - Its only **Team** is **Service team**, defined as "a label on the work, never a
    constraint on who may be assigned it", whose members are directory persons, not
    accounts. See open questions Q1 and Q2.

## 1. Google Zanzibar

- **Relation tuples.** An ACL is a set of tuples `⟨object⟩#⟨relation⟩@⟨user⟩`. A user is a
  user id or a **userset** `⟨object⟩#⟨relation⟩`. "a userset allows ACLs to refer to groups
  and thus supports representing nested group membership". Groups are "simply ACLs with
  membership semantics". Examples include `doc:readme#viewer@group:eng#member` and the
  object-to-object tuple `doc:readme#parent@folder:A#...`. Source: [Zanzibar §2.1, Table 1][z].
- **Userset rewrite rules.** Each relation has a rewrite tree whose leaves are `_this`
  (stored tuples), `computed_userset` (another relation on the same object, for example
  viewer ⊇ editor ⊇ owner) and `tuple_to_userset`. The last one fetches a tupleset such as
  `parent` and evaluates a relation on each object it points to: "look up the parent folder
  of the document and inherit its viewers". Leaves combine by union, intersection and
  exclusion. The paper's reason for rules over stored tuples: "storing a tuple for each
  object in a namespace would be wasteful and make it hard to make modifications across
  all objects". Source: [§2.3.1, Figure 1][z].
- **"Everyone".** The paper defines no wildcard subject. "Everyone in X" is a group userset
  such as `group:eng#member`. Wildcards are an OpenFGA and SpiceDB addition (§2 and §3
  below). The claim that the paper has no wildcard rests on a text search of the PDF for
  "wildcard", "public", "everyone" and "all users"; none matched.
- **Consistency.** The "new enemy" problem is the risk that "Bob should not be able to see
  the new documents, but may do so if the ACL check neglects the ordering between the two
  ACL changes". A **zookie** is an opaque token that encodes a global timestamp. Checks
  evaluated "at a snapshot no earlier than" the zookie respect causality between an ACL
  change and a content change. Source: [§2.2, §2.4][z].
- **Cost.** Deep or wide group nesting is slow to evaluate by pointer chasing. Zanzibar adds
  **Leopard**, which flattens group-to-group reachability into `GROUP2GROUP` and
  `MEMBER2GROUP` sets. Source: [§3.2.4][z]. The lesson for WBS: keep group nesting out
  until it is needed.

## 2. OpenFGA

- **DSL.** Types declare relations. A direct type restriction such as
  `[user, user:*, team#member]` admits a specific object, a type-wide wildcard, or a
  userset. `X from Y` is tuple-to-userset. Its tupleset (`Y`) may not itself be computed,
  and it may not include wildcards or usersets. `or`, `and` and `but not` map to union,
  intersection and difference. Source: [configuration language][fga-lang].
- **Public access.** The tuple `user:*` / `viewer` / `document:x` makes every user a viewer.
  "Type-bound public access is not a wildcard or a regex expression". `document:*` is
  invalid as an object, and `org:*#member` is invalid as a user. Source: [public access][fga-pub].
  A wildcard therefore matches subjects only, never objects. Object-side "all of them" is
  always expressed as a parent relation.
- **Parent-child inheritance.** Two tuples: `bob editor folder:notes` and
  `folder:notes parent document:meeting_notes.doc`. With them, bob edits the document
  through `editor from parent`. Source: [parent-child][fga-pc].
- **Roles versus permissions.** Assign roles directly. Define permissions only from roles,
  with no direct type restriction, so "can only be assigned through the role". Check the
  permission (`booking_adder`), not the role (`owner`), so that a mapping can change "with
  no code changes". Source: [roles and permissions][fga-roles].
- **The GitHub analogue in OpenFGA's own sample store.** The sample defines
  `define repo_reader: [user, organization#member]` on `organization` and
  `define reader: [user, team#member] or triager or repo_reader from owner` on `repo`. The
  first expresses "every org member reads every repo". The second expresses team grants,
  role concentricity and inheritance. Source: [sample-stores `github/model.fga` @ 6802b4d][fga-gh].
- **Custom roles in the sample stores.** `custom-roles/model.fga` grants through
  `[role#assignee]`. `multitenant-rbac` defines organization-level `document_viewer:
[role#assignee] or admin` and `viewer: document_viewer from organization`, so a document
  inherits through the organization. `role-assignments` has one `role_assignment` object per
  project, whose permission is `assignee and can_edit_project from role`. Adding a
  permission there needs a new relation. Sources: [custom-roles][fga-cr],
  [multitenant-rbac][fga-mt], [role-assignments][fga-ra].
- **Several organizations per user.** OpenFGA advises against storing the "current
  organization" as a tuple because it breaks for a user in two organizations at once. It
  advises passing the organization as a **contextual tuple** on Check or ListObjects.
  Source: [organization context][fga-orgctx]. WBS already resolves the active organization
  per request (`OrganizationAccess.resolve`), which is the same idea.
- **Conditions.** A condition is a named CEL expression with typed parameters, attached as
  `user with non_expired_grant`. Its context comes from the tuple and the request, and
  "persisted context has higher precedence than request context". Source: [conditions][fga-cond].
- **APIs.** Check answers one (user, relation, object). ListObjects returns the objects of
  a type that a user relates to. Its cost "vary drastically depending on the model
  complexity", and `and` and `but not` are "more expensive to evaluate". The streamed
  variant is bounded only by `OPENFGA_LIST_OBJECTS_DEADLINE`. Source: [list objects][fga-lo].
- **Storage.** At v1.22.0 the SQLite datastore keeps every relationship in one generic
  `tuple` table: `store`, `object_type`, `object_id`, `relation`, `user_object_type`,
  `user_object_id`, `user_relation`, `user_type`, `ulid`, `inserted_at`, `condition_name`,
  `condition_context`. Its primary key is the seven identity columns. It has a reverse
  index `(store, object_type, relation, user_object_type, user_object_id, user_relation)`
  and partial indexes split by `user_type IN ('user','userset')`. An append-only
  `changelog` table records each operation. Source: [`assets/migrations/sqlite/005_initialize_schema.sql` @ v1.22.0][fga-sqlite].
  A wildcard is stored as `user_type = 'userset'`: `GetUserTypeFromUser` returns `UserSet`
  for an object-relation user or a wildcard, and `Wildcard = "*"`. Source: [`pkg/tuple/tuple.go` @ v1.22.0][fga-tuple].
  Postgres and MySQL have sibling migration folders. Their contents were not read
  (**unverified** that they match).

## 3. SpiceDB

- **Relations and permissions.** A relation is stored; a permission is computed. "you
  cannot write a relationship that references a _permission_". Operators are `+`, `&` and
  `-`, and "union (`+`) takes precedence over intersection (`&`) and exclusion (`-`)".
  Source: [schema][sdb-schema].
- **Arrows.** `parent_folder->read` evaluates `read` on whatever `parent_folder` points
  to. Wildcards are written `relation viewer: user | user:*`, and the docs say "**Only**
  grant it to read permissions". Caveats attach as `user with ip_allowlist`. Source: [schema][sdb-schema].
- **Organization inheritance.** `relation docorg: organization` combined with
  `permission view = reader + writer + docorg->view_all_documents` lets organization
  administrators view every document. Source: [developing a schema][sdb-dev].
- **Roles.** Fixed roles are relations such as `role_reader: user | team#member` with
  `permission read = role_reader + write`. Custom roles move to a `role_grant` object
  (`role`, `grantee`) with `permission create_issue = role->create_issue & grantee`.
  Source: [access-control management][sdb-acm].
- **Recursion.** A recursive `parent` can form cycles. Check depth defaults to 50, and the
  same error appears for a cycle and for a deep hierarchy. Source: [recursion and max depth][sdb-depth].
- **Consistency.** Modes are `minimize_latency` (the default for most APIs),
  `at_least_as_fresh`, `at_exact_snapshot` and `fully_consistent`. A ZedToken "serves the
  same purpose as Google Zanzibar's Zookie". Source: [consistency][sdb-cons].

## 4. Kubernetes RBAC

- "Permissions are purely additive (there are no "deny" rules)". A Role is namespaced and
  a ClusterRole is not. A RoleBinding may reference a ClusterRole "and bind that
  ClusterRole to the namespace of the RoleBinding". A ClusterRoleBinding grants it in all
  namespaces. Source: [RBAC][k8s]. This is exactly "a project role granted at organization
  scope": one role definition, bound at different scopes.
- On wildcards, the docs say that if "a new resource type is added … the wildcard entry
  automatically grants access, which may be undesirable". `resourceNames` cannot restrict
  `create`, and an empty `resourceNames` "means that everything is allowed". Source: [RBAC][k8s].
- Aggregated ClusterRoles are assembled by label selector. The control plane "overwrites
  any values that you manually specify in the `rules` field". Source: [RBAC][k8s].
- **Escalation guard.** You may create a binding only "if you already have all the
  permissions contained in the referenced role … _or_" you hold `bind`. `roleRef` is
  immutable so that someone may manage subjects "without being able to change the role".
  Source: [RBAC][k8s]. WBS's `mayAdministerMembership` and `mayInvite` already follow this
  rule for organization roles.

## 5. AWS IAM: what to avoid and what to borrow

- Evaluation starts from implicit deny. "An explicit deny overrides an explicit allow",
  checked across SCPs, RCPs, resource policies, identity policies, permission boundaries
  and session policies. Boundaries and SCPs intersect with identity policies. Source:
  [deny/allow logic][iam-eval], [evaluation logic][iam-logic].
- ARN wildcards (`*` and `?`) work within segments. "If the `*` wildcard is the last
  character of a resource ARN segment, it can expand to match beyond the colon
  boundaries", and `*` matches `/`, so `bucket/*/test/*` matches
  `bucket/1/2/3/test/4/object.jpg`. Source: [Resource element][iam-res].
- **Avoid:** string globs over identifiers, because they match more than intended and
  cannot be indexed by a B-tree, and a policy language with several intersecting layers.
- **Borrow:** the default-deny posture, and a permission **cap** that intersects with
  grants. A permissions boundary is a cap of this kind, and the machine-principal ceiling
  is the same idea.

## 6. GitHub organizations

- Base permissions "apply to all members of an organization" across its repositories, and
  "none" is a value. A higher repository grant "overrides the base permission". Source:
  [base permissions][gh-base].
- Repository roles run Read < Triage < Write < Maintain < Admin. "organization owners have
  admin access to every repository owned by the organization". Source: [repository roles][gh-roles].
- "Roles and permissions are additive": a person gets "the sum of all access grants", and
  mixed sources show a "Mixed roles" warning. Custom roles start from "an inherited role"
  plus extra permissions. Source: [custom repository roles][gh-custom].
- "Child teams inherit the parent's access permissions", with one parent per team. Source:
  [about teams][gh-teams].
- **WBS mapping.** Base permission "none" is the owner's "plain member sees nothing". Base
  "Read" is the grant (all members of org X, org X, `project-viewer`). Organization owner is
  `org-super-admin`.

## Recommendation

Use **one typed grant table**, a fixed Zanzibar specialised to WBS's three-level tree.
Model it as Kubernetes-style role bindings, with GitHub-style base permission as a
subject kind. Do not use a generic tuple store or role columns.

- A grant names a **scope** (organization, project or work package) and a **role** from a
  fixed catalogue whose prefix names the object kind the role governs. A role may be
  granted at its own scope kind or at any ancestor scope. A grant at an ancestor means
  "this role on every such object beneath", the way a ClusterRoleBinding works and the way
  OpenFGA's `repo_reader` on `organization` works.
- **Subjects** are a user account, an access group (Q1), or the userset "every current
  member of this organization". That last kind is GitHub's base permission and OpenFGA's
  `organization#member`. Wildcards are therefore subject-side usersets and scope
  ancestry. String globs are never used.
- **Effective level** is the maximum level over grants that apply to the target. The
  query intersects that maximum with the principal's cap: contributor for a machine
  credential's account, and always only while a membership exists.
- **Code checks permissions, not roles** (`may(scope, 'edit_work_item')`), per OpenFGA's
  advice. A later custom-role or deny change then touches the role catalogue and the
  evaluator only, never the stored grants.

### Schema sketch (SQLite, additive)

```sql
-- Fixed catalogue, seeded by migration; custom roles later add rows with organization_id.
CREATE TABLE access_role (
  id           text PRIMARY KEY,               -- 'project-viewer', ...
  object_kind  text NOT NULL CHECK (object_kind IN ('organization','project','work_package')),
  level        integer NOT NULL,               -- viewer 1, contributor 2, manager 3, admin 4, super_admin 5
  organization_id text REFERENCES organization(id) -- NULL = built-in
);
CREATE TABLE access_group (                    -- name pending Q1
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL, UNIQUE (organization_id, name), UNIQUE (organization_id, id)
);
CREATE TABLE access_group_member (
  organization_id text NOT NULL, group_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (organization_id, group_id) REFERENCES access_group(organization_id, id)
);
CREATE INDEX access_group_member_user ON access_group_member (organization_id, user_id);
CREATE TABLE access_grant (
  id              text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  scope_kind      text NOT NULL CHECK (scope_kind IN ('organization','project','work_package')),
  scope_id        text NOT NULL,               -- organization, project or work package id
  subject_kind    text NOT NULL CHECK (subject_kind IN ('user','group','organization_members')),
  subject_id      text NOT NULL,               -- user id, group id, or organization_id itself
  role_id         text NOT NULL REFERENCES access_role(id),
  created_at integer NOT NULL, created_by text REFERENCES users(id),
  UNIQUE (organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id)
);
CREATE INDEX access_grant_subject ON access_grant (organization_id, subject_kind, subject_id);
CREATE INDEX access_grant_scope   ON access_grant (organization_id, scope_kind, scope_id);
```

These rules are invariants, checked at write in the store's transaction:

- A grant's role must govern the scope's own kind or a kind below it. `org-admin` at
  project scope is refused; `package-viewer` at organization scope is allowed.
- `scope_id` must belong to `organization_id`.
- An `organization_members` subject has `subject_id = organization_id`.
- A machine-account subject may not receive a level above contributor. The cap also
  applies at evaluation (below), because a machine account can be reached through a group
  or the members userset.
- Only org-super-admin may write grants of level 4 or above. A granter may never bind a
  role above their own effective level at that scope, which is the Kubernetes escalation
  rule and today's `mayAdministerMembership`.

### Effective level of one principal on one work package

```sql
WITH subject(kind, id) AS (
  SELECT 'user', :user
  UNION ALL SELECT 'group', group_id FROM access_group_member
            WHERE organization_id = :org AND user_id = :user
  UNION ALL SELECT 'organization_members', :org
),
scope(kind, id) AS (VALUES ('organization', :org), ('project', :project), ('work_package', :package))
SELECT MIN(MAX(r.level), :cap)                 -- :cap = 2 for a machine account, 5 otherwise
FROM access_grant g
JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
JOIN scope   c ON c.kind = g.scope_kind   AND c.id = g.scope_id
JOIN access_role r ON r.id = g.role_id
WHERE g.organization_id = :org
  AND EXISTS (SELECT 1 FROM organization_membership m
              WHERE m.organization_id = :org AND m.user_id = :user);
```

- An empty result, which is NULL, means no access. The caller answers 404, as
  `findProjectWithin` does today.
- To evaluate a project target, drop the `work_package` row and keep only roles whose
  `object_kind` is `organization` or `project`.
- To evaluate the organization's own settings, keep only `organization` roles.
- The query reads at most three scope rows and a few subject rows on two indexes.
- If work packages nest (Q3), the `scope` CTE gains the package's ancestors, either from a
  recursive CTE over `work_item.parent_id` or from a closure table. SpiceDB's depth and
  cycle warning applies ([recursion][sdb-depth]).

### How each requirement is expressed

| Requirement                        | Rows                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Org grant covers everything below  | `(org X, organization X, user U, org-admin)`. Level 4 applies to every project and package of X, including those created later. Scope ancestry stands in for a pattern, so no glob is needed.          |
| All members of X view all projects | `(org X, organization X, organization_members X, project-viewer)`, which matches GitHub base Read. Removing that one row returns the organization to "see nothing".                                    |
| Narrower "everything"              | `(org X, project P, organization_members X, package-viewer)`: every member views every package of P.                                                                                                   |
| Team grants                        | `(org X, project P, group G, project-contributor)`, with membership in `access_group_member`.                                                                                                          |
| Machine cap                        | Refused at write. At read, `MIN(…, 2)` holds even through a group or the members userset. `:cap` comes from the resolved principal (`OrganizationScope.delegated`, or the account's agent person: Q2). |
| Admin of several orgs              | One `org-admin` grant per organization. Every row carries `organization_id`, and evaluation always runs inside the active organization, so authority never crosses organizations.                      |
| Plain member sees nothing          | A membership with no matching grant gives NULL. Membership is necessary for access but not sufficient.                                                                                                 |

### Listing without N queries

```sql
-- Projects of :org the principal may view; one statement, same subject CTE.
SELECT p.id FROM project p
WHERE p.organization_id = :org AND EXISTS (
  SELECT 1 FROM access_grant g JOIN subject s ON s.kind = g.subject_kind AND s.id = g.subject_id
  JOIN access_role r ON r.id = g.role_id
  WHERE g.organization_id = :org
    AND ((g.scope_kind = 'organization' AND g.scope_id = :org)
      OR (g.scope_kind = 'project' AND g.scope_id = p.id)));
```

- Load the principal's grants once: a handful of rows on `access_grant_subject`.
- If any grant sits at organization scope, every project is visible, so short-circuit to
  "all projects in the org".
- Otherwise filter by the explicit project ids, plus the projects of any granted work
  packages. Whether a package-only grant should show its project's shell is Q4.
- This is ListObjects specialised to two levels, without a general evaluator
  ([list objects][fga-lo]).

### Adding deny or custom roles later without reshaping grants

- **Custom roles.** Add rows to `access_role` with an `organization_id`, plus an
  `access_role_permission(role_id, permission)` table. Built-in roles get their permission
  rows seeded. `may()` switches from "level ≥ threshold" to "permission in the role's set".
  Grants keep referencing `role_id` unchanged. This is SpiceDB's `role_grant` shape
  ([access-control management][sdb-acm]) and OpenFGA's `role#assignee`
  ([custom-roles][fga-cr]).
- **Deny.** Add a separate `access_denial` table with the same subject and scope columns,
  evaluated as an exclusion, the way Zanzibar and OpenFGA keep `but not blocked` as its
  own relation ([Zanzibar §2.3.1][z], [configuration language][fga-lang]). Grants stay
  untouched. Expect IAM-style reasoning cost ([deny/allow logic][iam-eval]) and OpenFGA's
  warning that exclusion is costlier to list ([list objects][fga-lo]).
- **Not recommended:** an `effect` column on `access_grant`. It is additive, but it mixes
  two evaluation orders in one index.

## Trade-offs

- **Typed grant table versus a generic tuple store** (OpenFGA's `tuple`).
  - The typed table keeps foreign keys, CHECK constraints and the repository's
    validate-at-boundary rule. Queries are plain indexed SQL.
  - Its cost is that a new object kind such as Space-as-scope needs a migration and an
    evaluator change.
  - A generic store needs an interpreter for rewrite rules, gives up referential integrity
    on `object_id`, and is what the OpenFGA server exists to provide. Adopting OpenFGA
    itself is excluded by the brief.
- **Typed grant table versus role columns** (`membership.role` plus a hypothetical
  `project_member.role`).
  - Role columns are simplest for one scope.
  - Teams, the members userset and work packages would each need another table, and the
    effective-role query would become a union of all of them.
  - Today's single `organization_membership.role` is this design at one level.
- **Query cost.** Check is three scope keys by a few subjects. Listing is one statement per
  page with a fast path. Both stay within SQLite's single-node indexes, and no
  denormalisation is needed until groups nest (Leopard, [§3.2.4][z]).
- **Consistency.**
  - be-01 evaluates against the same SQLite that commits the write. Running the check
    inside the write's transaction removes the new-enemy window that zookies and ZedTokens
    exist to close ([Zanzibar §2.2][z], [consistency][sdb-cons]).
  - Blue and green share the database, so the per-request re-read that
    `OrganizationAccess.resolve` already does stays correct.
  - If a cache is ever added, key it by a per-organization grant version that every grant
    write increments, which acts as a local zookie. Do not cache before measurement.
- **Migration.** Today `member` writes everything, and an unrestricted project is editable
  by members (`CONTEXT.md`, Restricted project). "Member sees nothing" is a behaviour change.
  - An additive migration can backfill current members with org-scope grants:
    - `super_admin` becomes `org-super-admin`.
    - `admin` becomes `org-admin`.
    - `member` becomes a per-user `project-contributor` grant at org scope.
    - `viewer` becomes `project-viewer` at org scope.
  - The backfill keeps today's behaviour exactly. The owner then removes grants
    deliberately.
  - `organization_membership.role` stays until both colours read grants.

## Open questions

- **Q1. Team.**
  - `CONTEXT.md`'s Service team is explicitly not an authority, and its members are
    directory persons. A grant subject needs accounts.
  - Recommendation: introduce a distinct term (placeholder "access group") with account
    members, and record it in `CONTEXT.md` before implementation.
  - Reusing service teams would contradict their definition.
- **Q2. Person or account.**
  - Grants name accounts (`users.id`), as memberships do.
  - A machine credential acts as its agent person's bound account (`CONTEXT.md`, Machine
    credential), so the cap needs to know that the account is an agent's.
  - **Unverified**: which column or relation in be-01 marks an account as bound to an
    agent-kind person. Today the request-level marker is `OrganizationScope.delegated`.
- **Q3. Work package.**
  - Is a work package a work item (a subtree root) or a new entity? Can packages nest?
  - If a work package is a work item, `scope_id` is a work item id and ancestry decides
    the cost.
- **Q4. Package-only visibility.**
  - Does `package-viewer` on one package let the principal see its project's name and
    tree outside the package?
  - Recommendation: a derived, read-only "navigate" level for the project shell only,
    never contributing to project permissions.
- **Q5. Restricted projects.**
  - "Readable by all members, editable only by the creator" is an exclusion on top of
    org-scope grants.
  - Under the new model, decide whether the flag stops org-scope `project-*` grants from
    fanning out (keeping `org-admin`), or whether it is retired in favour of explicit grants.
  - Keep `classifyProjectEdit`'s audited recovery either way.
- **Q6. `org-viewer`.** Does it view every project (level 1 everywhere) or only
  organization settings and members? The sketch assumes everywhere, like GitHub owner
  inheritance. It could equally be org-only.

## Sources

Primary sources only; each is cited inline by its label. Versioned code links pin
OpenFGA v1.22.0 and `openfga/sample-stores` at `6802b4d`. Retrieved 2026-10-23.

[z]: https://www.usenix.org/system/files/atc19-pang.pdf
[fga-lang]: https://openfga.dev/docs/configuration-language
[fga-pub]: https://openfga.dev/docs/modeling/public-access
[fga-pc]: https://openfga.dev/docs/modeling/parent-child
[fga-roles]: https://openfga.dev/docs/modeling/roles-and-permissions
[fga-orgctx]: https://openfga.dev/docs/modeling/organization-context-authorization
[fga-cond]: https://openfga.dev/docs/modeling/conditions
[fga-lo]: https://openfga.dev/docs/getting-started/perform-list-objects
[fga-sqlite]: https://github.com/openfga/openfga/blob/v1.22.0/assets/migrations/sqlite/005_initialize_schema.sql
[fga-tuple]: https://github.com/openfga/openfga/blob/v1.22.0/pkg/tuple/tuple.go
[fga-gh]: https://github.com/openfga/sample-stores/blob/6802b4d859d2773eea72c2315b3a9f027a2893a0/stores/github/model.fga
[fga-cr]: https://github.com/openfga/sample-stores/blob/6802b4d859d2773eea72c2315b3a9f027a2893a0/stores/custom-roles/model.fga
[fga-mt]: https://github.com/openfga/sample-stores/blob/6802b4d859d2773eea72c2315b3a9f027a2893a0/stores/multitenant-rbac/store.fga.yaml
[fga-ra]: https://github.com/openfga/sample-stores/blob/6802b4d859d2773eea72c2315b3a9f027a2893a0/stores/role-assignments/store.fga.yaml
[sdb-schema]: https://authzed.com/docs/spicedb/concepts/schema
[sdb-dev]: https://authzed.com/docs/spicedb/modeling/developing-a-schema
[sdb-acm]: https://authzed.com/docs/spicedb/modeling/access-control-management
[sdb-depth]: https://authzed.com/docs/spicedb/modeling/recursion-and-max-depth
[sdb-cons]: https://authzed.com/docs/spicedb/concepts/consistency
[k8s]: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
[iam-eval]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html
[iam-logic]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
[iam-res]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html
[gh-base]: https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/setting-base-permissions-for-an-organization
[gh-roles]: https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization
[gh-custom]: https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/about-custom-repository-roles
[gh-teams]: https://docs.github.com/en/organizations/organizing-members-into-teams/about-teams
