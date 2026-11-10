# Verify: wbs-permissions

Commands, results and R5 proofs, per task. Tasks 1.1 and 1.2 also carry
`wbs-custom-permissions` 1.1 and 1.2; that change's verify.md points here.

## 1.1 Migration `add_access_grants` (2026-10-25, branch `feat/wbs-permissions-1`)

`apps/wbs/be-01/drizzle/20261102120000_add_access_grants/{migration,down}.sql`, test
`apps/wbs/be-01/src/access-grant-migration.db.test.ts` (19 cases).

| Command                                                                                           | Result                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `env -u CLAUDECODE bun test src/access-grant-migration.db.test.ts` (be-01)                        | 19 pass, 0 fail                          |
| `env -u CLAUDECODE bun test --timeout=30000` (store-sqlite, every migration stack list moved)     | 1904 pass, 0 fail, 145 files             |
| `env -u CLAUDECODE bun test .db.test.ts --timeout=30000` (be-01, full, after the two constraints) | 2477 pass, 0 fail, 2480 tests, 159 files |
| `bun tools/tool-git-hooks/src/hooks/migration-lint.ts` on both scripts                            | exit 0                                   |

Each fault injected alone into the shipped script, the named case watched failing, the
script restored:

| Fault                                                                         | Case that failed                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| one seed row removed (`package-contributor` × `package.write`)                | seeds every built-in role with exactly its permission-matrix.md column           |
| both reserved-name triggers removed                                           | refuses a custom role named after a built-in                                     |
| `access_role_built_in_or_custom` made `CHECK (1)`                             | refuses a role that is neither built-in nor custom, and an unknown kind          |
| `object_kind` CHECK made `CHECK (1)`                                          | refuses a role that is neither built-in nor custom, and an unknown kind          |
| `scope_kind`, `subject_kind`, `origin` CHECK each `CHECK (1)`; UNIQUE removed | refuses a grant outside the vocabularies and a duplicate (four runs)             |
| both organization-members triggers removed                                    | refuses an organization-members grant naming another organization                |
| composite group key replaced by `group_id REFERENCES access_group(id)`        | refuses a group member from another organization or outside it                   |
| `access_role_built_in_name` made `CHECK (1)` (beyond the design text)         | refuses a built-in role whose name is not its id                                 |
| `access_grant_organization_scope` made `CHECK (1)` (beyond the design text)   | refuses an organization-scope grant naming another organization                  |
| owner INSERT's membership EXISTS removed                                      | writes package-manager for owners who are current members only                   |
| credential copy's cap CASE replaced by `g.role_id`                            | copies a bound account’s rows to its live credentials capped at contributor      |
| down guard: non-backfill grant count made `0`                                 | refuses rollback over one route-origin grant, keeping it (the grant was deleted) |
| down guard: access group count made `0`                                       | refuses rollback over one access group (the group was deleted)                   |
| down guard: custom role count made `0`                                        | refuses rollback over an ungranted custom role (refused under the row guard)     |
| down guards: custom role and permission-row counts both `0`                   | refuses rollback over an ungranted custom role (role and rows deleted)           |
| down guard: permission rows of no built-in made `0`                           | refuses rollback over a permission row of no built-in role (orphan deleted)      |

Moved alongside: every store-sqlite and be-01 test that enumerates the migration stack
gained `20261102120000_add_access_grants`; `step.db.test.ts`'s "role nowhere" sweep names
the access role objects and `access_grant.role_id`, `access_role_permission.role_id` as
exemptions by exact name; three table sweeps skip `access_*`.

Two constraints beyond the design text, added on review: `access_role_built_in_name`
(a built-in's `name` equals its `id`, CP7) and `access_grant_organization_scope` (an
organization-scope grant's `scope_id` equals its `organization_id`).

Amended 2026-11-08 before the first deploy of this migration: the `origin` CHECK and
`GRANT_ORIGINS` admit `operator`, the origin of a grant written by P21's
`access-grant-cli` (task 1.5); the vocabulary case probes `manual` as the refused word and
`operator` as an admitted one. `bun test src/access-grant-migration.db.test.ts`: 19 pass.

## 1.2 Catalogue in `@wbs/domain` (2026-10-25)

`libs/wbs/domain/domain/src/access-role.ts`, `permission-matrix.ts`, test
`access-role.test.ts` (41 cases; the matrix parsed from this change's
`permission-matrix.md`, the kinds from design.md's vocabulary table).

| Command                                                         | Result                       |
| --------------------------------------------------------------- | ---------------------------- |
| `env -u CLAUDECODE bun test src/access-role.test.ts`            | 41 pass, 0 fail              |
| `env -u CLAUDECODE bunx nx run wbs-domain:test --skip-nx-cache` | exit 0, 1354 tests, 98 files |

| Fault                                                                     | Case that failed                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `project.manage_budgets` added to `CONTRIBUTOR_CAP`                       | a machine principal never manages budgets, whatever its grant                  |
| `package.claim_for_others` added to `package-contributor`'s seed          | a machine principal never claims for others, whatever its grant (+ matrix)     |
| `roleMayHold` reads the id prefix                                         | every seeded row satisfies roleMayHold (package-manager)                       |
| built-in admin's set returned unchanged on a restricted target            | an org-admin reads a restricted work package and never writes it               |
| a custom organization role holding `organization.manage_access` admitted  | a custom organization role equal to org-admin reads no restricted work package |
| one matrix cell flipped (`package-contributor` × `package.write` emptied) | seeds every built-in role with exactly its matrix column, cell by cell         |
| the matrix reader skips an unknown permission instead of throwing         | refuses an unknown permission, an unknown role and an unknown cell             |

## Actualized 2026-11-03 (merges with main `d0be12ea1` and `07c47b69c`)

The design chain (#723–#726) is merged, so this change's and `wbs-custom-permissions`'
texts are main's; only the 1.1 and 1.2 ticks and the two verify.md files are this
branch's. The folder moved after main's newest (`20261101120000_add_host_job_projection` after the second merge):
`20261025100000_add_access_grants` is now `20261102120000_add_access_grants`, and every
test listing the stack names it last (first to reverse). Main's text added
`access_role.reaches_restricted` (CP18: default 0, seeded 1 for `org-admin` and
`org-super-admin`, organization-kind CHECK), which this migration now creates;
`permissionsOnTarget` reads `reachesRestricted` instead of the two built-in ids. The P17
credential backfill is unchanged: main's `machine_credential` keeps `person_id`,
`organization_id` and `revoked_at`, and a revoked agent pool revokes its credentials.

| Command                                                                                                       | Result                |
| ------------------------------------------------------------------------------------------------------------- | --------------------- |
| `env -u CLAUDECODE bunx nx run-many -t test --projects=wbs-store-sqlite,wbs-domain,wbs-be-01 --skip-nx-cache` | exit 0, 3 projects    |
| `env -u CLAUDECODE bun test src/access-grant-migration.db.test.ts` (be-01)                                    | 20 pass, 0 fail       |
| `env -u CLAUDECODE bun test src/access-role.test.ts` (domain)                                                 | 43 pass, 0 fail       |
| `bunx nx affected -t typecheck --base=origin/main`                                                            | 54 projects, exit 0   |
| `bunx nx affected -t lint --base=origin/main`                                                                 | 54 projects, exit 0   |
| `bunx nx format:check --all`                                                                                  | exit 0                |
| `bunx openspec validate --all --json`                                                                         | 318 items, 318 passed |
| CI's migration lint over `git ls-files '*.sql'`                                                               | exit 0, 256 files     |

| Fault (2026-11-03)                                                    | Case that failed                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `access_role_reaches_restricted_kind` made `CHECK (1)`                | refuses reaches_restricted outside an organization role, and outside 0 and 1                |
| built-in admin's set returned unchanged on a restricted target        | an org-admin reads a restricted work package and never writes it (+ the opt-in case)        |
| a role holding `organization.manage_access` admitted without the flag | a custom organization role equal to org-admin reads no restricted work package              |
| the two built-in ids read instead of `reachesRestricted`              | a custom organization role that opts in reads a restricted work package and never writes it |

## 1.3 `AccessDecisions` (2026-11-08, branch `feat/wbs-permissions-1-3`)

Also `wbs-custom-permissions` 1.3. Port `libs/wbs/application/core/src/ports/access-decisions.ts`
(`AccessDecisions`, `AccessTarget`, `ScopedPrincipal`, `accessSubjectOf`, `capOf`), row
validation and the visibility rule in `@wbs/domain` `access-role.ts` (`reachingGrantsOf`,
`effectiveRoleOn`, `UnknownPermissionRow`, `PermissionKindRow`, `EmptyRoleSet`), SQLite
`AccessDecisionRepository` in `libs/wbs/adapters/store-sqlite/src/access-decisions.ts`,
installed by `buildStores` on the public catalogs and on every catalog a unit of work
admits (optional `PlanTransactionalStores.accessDecisions`, conformance family
`accessDecisions`: SQLite offered, memory absent, the `projectRanks` precedent). Test
`libs/wbs/adapters/store-sqlite/src/access-decisions.db.test.ts` (28 cases, after the review round below); grants are
inserted with SQL, the grant store being task 1.4's.

| Command                                                                                             | Result                                                                             |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `env -u CLAUDECODE bun test src/access-decisions.db.test.ts --timeout=30000` (store-sqlite)         | 24 pass, 0 fail                                                                    |
| `env -u CLAUDECODE bun test ./src/testing/source-conformance.db.test.ts` (store-sqlite)             | 84 pass, 0 fail; certifies `accessDecisions.effectiveRoleAt:grant-reaches-package` |
| `env -u CLAUDECODE bun test ./src/testing/source-conformance.test.ts` (store-memory)                | 84 pass, 0 fail; `accessDecisions` absent, not offered                             |
| `env -u CLAUDECODE bun test --timeout=30000` (store-sqlite, full)                                   | 2072 pass, 0 fail, 2073 tests, 154 files                                           |
| `bunx nx run-many -t test -p wbs-domain,wbs-conformance,wbs-store-memory --skip-nx-cache`           | exit 0                                                                             |
| `bunx nx run-many -t typecheck,typecheck:module` over the eleven wbs projects of the brief          | exit 0, 11 projects                                                                |
| `bunx nx run-many -t lint -p wbs-domain,wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance` | exit 0, 5 projects                                                                 |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                     | exit 0, 1027 tests, 50 files                                                       |
| `bun …/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                               | exit 0                                                                             |
| `bunx nx format:check --all`                                                                        | exit 0                                                                             |
| `bunx --no-install openspec validate --all --json`                                                  | 328 items, 328 passed                                                              |

Each fault injected alone, the named case watched failing, the source restored:

| Fault                                                                           | Case that failed                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| membership `EXISTS` replaced by a true predicate                                | a removed member keeps no access; a credential whose account left the organization reaches nothing (listed `wp-open`, `wp-two`) |
| `project.manage_settings` seeded into `package-manager` (migration)             | a package role at organization scope satisfies no project permission (threw `PermissionKindRow`), five more                     |
| `roleMayHold` check dropped from `reachingGrantsOf`                             | throws PermissionKindRow on both statements (the read resolved)                                                                 |
| P5 skip answered `unchanged` (domain)                                           | org-viewer, project and package roles at organization scope and the members subject are skipped (org-viewer read `wp-closed`)   |
| listing's P5 clause dropped                                                     | the same case and the custom-role case (listed `wp-closed`), list and detail agree                                              |
| listing's admin read dropped (`wp.restricted = 0` only)                         | org-admin and org-super-admin read a restricted package and never write it (missed `wp-closed`)                                 |
| built-in admin's set returned unchanged instead of intersected with `READ_ONLY` | org-admin and org-super-admin read a restricted package and never write it (every organization permission)                      |
| `package.manage_settings` added to `CONTRIBUTOR_CAP`                            | a person is uncapped; a credential holding org-admin reads as contributor (machine read the manager permission)                 |
| unknown row skipped instead of thrown                                           | throws UnknownPermissionRow on both statements (the read resolved)                                                              |
| the three `:machine = 0` guards dropped                                         | a machine principal holds only its credential grants (agent read `project.read` from its account's reach)                       |
| listing's permission rows filtered by the vocabulary in SQL                     | throws UnknownPermissionRow on both statements (the listing resolved)                                                           |
| permission `LEFT JOIN` made inner, `effectiveRoleAt` and listing separately     | throws EmptyRoleSet on both statements (the read resolved, empty role read as no grant)                                         |
| listing's `package.read` admission (`reads_packages`) dropped                   | an organization role without package.read lists nothing and every detail is invisible (listed both unrestricted packages)       |
| `effectiveRoleOn` answers any reaching set                                      | the same case (detail answered `[project.manage_budgets]`)                                                                      |
| `accessDecisions` left out of `buildStores`                                     | both catalogs carry the decisions…; SQLite certification failed `accessDecisions.effectiveRoleAt:grant-reaches-package`         |

Plans (`EXPLAIN QUERY PLAN`, asserted): a package target reads `access_grant` through its
six-column unique index keyed by scope and subject; the organization target and the listing
through `access_grant_subject`; neither scans `access_grant`. The subject CTE drives the join
(`CROSS JOIN`); the listing materializes the reaching grants once. One statement per call,
counted through Drizzle's logger, for a person and a machine principal.

Assumptions taken: the organization target is never null and evaluates navigation in the
`any` mode (every reaching grant implies `organization.navigate`; a project or package
grant contributes only that there);
`ScopedPrincipal` is `Pick<AuthenticatedUser, 'id' | 'authentication'>`; the interim
package target is read by the store-private `AccessDecisionRepository.packageTargetOf`;
no project grant admits a package until `wbs-work-packages` slice 2 adds
`work_package.project_id`; corrupt-row detection on the listing returns the raw rows to
`@wbs/domain` instead of the design's SQL `'corrupt'` marker, so all three errors throw on
both statements.

### Review round (Fable review of #890, 2026-11-08)

Fixes: the rename tool's collision test (two `new`-sense `PROTECTED_LINES` patterns for this
slice's shapes, locals renamed to `packageId`, the restricted-flag message reworded);
`effectiveRoleOn` adds `organization.navigate` to every organization-scope grant at the
organization target (CP20); `AccessTarget`'s package member narrowed to
`InterimPackageChain` and `scopeRows` adds no project row, so no project grant reaches a
package in detail while the listing has no project branch (narrowing chosen over a throw:
one type member and no new runtime path); negatives for the four new throws; the plan
assertion reads the unique key's autoindex name from `PRAGMA index_list`/`index_info`
(SQLite numbers `sqlite_autoindex_<table>_<n>` by constraint order); the two design.md
amendments and task 2.1's single-reader rule.

| Command                                                                                               | Result                |
| ----------------------------------------------------------------------------------------------------- | --------------------- |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:test --skip-nx-cache`                         | exit 0                |
| `bunx nx run tool-rename-work-package:typecheck`                                                      | exit 0                |
| `env -u CLAUDECODE bun test src/access-decisions.db.test.ts` (store-sqlite)                           | 28 pass, 0 fail       |
| `nx run-many -t test -p wbs-domain,wbs-conformance,wbs-store-memory,wbs-store-sqlite --skip-nx-cache` | exit 0, 4 projects    |
| `nx run-many -t typecheck,typecheck:module` (11 wbs projects)                                         | exit 0, 11 projects   |
| `nx run-many -t lint` (5 touched wbs projects)                                                        | exit 0, 5 projects    |
| Burokrat `check-indexes working . HEAD`                                                               | exit 0                |
| `nx format:check --all`                                                                               | exit 0                |
| `openspec validate --all --json`                                                                      | 328 items, 328 passed |

| Fault                                                                      | Case that failed                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| the two new `PROTECTED_LINES` patterns absent (the head before this round) | tool-rename-work-package collision test: 17 collisions on this slice's lines                            |
| navigation union dropped at the organization target                        | an organization role without package.read lists nothing… (`may(…, 'organization.navigate')` false)      |
| `reaches_restricted` 0/1 guard removed                                     | throws on a reaches_restricted outside 0 and 1, on both statements (the read resolved)                  |
| package `restricted` 0/1 guard removed                                     | throws on a package restricted flag outside 0 and 1 (resolved)                                          |
| `checkedMember` returns the value unchecked                                | throws on a grant scope kind outside its vocabulary, on both statements (resolved)                      |
| "grant read with two roles" check removed                                  | `access-role.test.ts` refuses one grant read with two roles (did not throw)                             |
| a `('project', projectId)` scope row restored for a chain naming one       | a project grant reaches no package, in detail or in the listing, until task 3.2 (detail answered a set) |

Unreachable from a production path: "grant read with two roles" (`access_grant.id` is the
key and `role_id` one column); proven on the pure function only.

## 1.4 Grant store `AccessGrants` (2026-11-08, branch `feat/wbs-permissions-1-4`)

Port `libs/wbs/application/core/src/ports/access-grants.ts`, SQLite implementation
`libs/wbs/adapters/store-sqlite/src/access-grant.ts` (`AccessGrantRepository`,
`deleteGrantsOfCredentials`, `directSuperAdminCount`), `roleFitsScope` in `@wbs/domain`,
test `access-grant-store.db.test.ts` (17 cases). The credential cascade is called at
every place a credential is revoked or removed: `machine-credential-administration.ts`
`revoke`, `consent-credential.ts` `end`, `agent-pool.ts` `revokePoolKeys` (pool revoke
and re-key), `directory.ts` `removeMachineCredentialsOf` (`deletePerson … cascade`) and
`trusted-issuer-administration.ts` `remove` (revoked rows an older release left).
SQLite only: organization-administration ports have no store-memory fixture or
conformance suite (`MachineCredentialAdministration`, `OrganizationLimits` precedent).

No audit row is written: `organization_audit`'s CHECK admits no `access_*` action
before task 4.1 (`widen_organization_audit_access`), so `access_granted`,
`access_revoked` and the group actions, the P17 cascade's `access_revoked` rows
included, are owed by 4.1. CP14's count is called by `revoke`, the one write here that
can lower it; group deletion, group member removal and credential revocation cannot
(group-held and credential grants never count), and their calls with the negatives
CP14 names are `wbs-custom-permissions` 2.3's.

| Command (all `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`)                                                                                                                                                          | Result                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `bun test src/access-grant-store.db.test.ts --timeout=30000` (store-sqlite)                                                                                                                                          | 17 pass, 0 fail                     |
| `bun test` agent-pool, machine-credential-admin, trusted-issuer `.controller.db.test.ts` (be-01)                                                                                                                     | 77 pass, 0 fail, 3 files            |
| `bunx nx run-many -t test -p wbs-domain,wbs-core,wbs-store-sqlite --parallel=1 --skip-nx-cache`                                                                                                                      | exit 0; 1410/1393/2065 pass, 0 fail |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                                         | exit 0, 3929 pass, 3 skip, 0 fail   |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                                      | exit 0, 1027 pass, 0 fail           |
| `bunx nx run-many -t test,typecheck -p tool-rename-work-package --skip-nx-cache`                                                                                                                                     | exit 0, 37 pass                     |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance --parallel=2` | exit 0, 11 projects                 |
| `bunx nx run wbs-be-01:typecheck`                                                                                                                                                                                    | exit 0                              |
| `bunx nx run-many -t lint -p wbs-store-sqlite,wbs-core,wbs-domain,wbs-be-01 --parallel=2`                                                                                                                            | exit 0, 4 projects                  |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                          | exit 0                              |
| `bunx --no-install openspec validate --all --json`                                                                                                                                                                   | 328 items, 328 passed               |
| `bunx nx format:check --all`                                                                                                                                                                                         | exit 0                              |

The rename tool's collision test flagged `scope.workPackageId` beside `projectOrganization`;
the store reads the id into `packageId` first and `allow-list.ts` protects that one line
shape (`const packageId = scope.workPackageId;`, sense `new`).

| Fault (2026-11-08)                                                                | Case that failed                                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CP14 count made `false &&` in `revoke`                                            | refuses revoking the last direct super-admin grant, … (revoked: none left); two connections (both revoked)       |
| `project_organization.organization_id` predicate dropped (ownership join)         | refuses another organization’s work package, … as not_found (B's package granted in A)                           |
| cascade call removed from `MachineCredentialAdministration.revoke`                | are deleted with an administrator’s revocation, and no other credential’s (grant row survived)                   |
| cascade call removed from `ConsentCredentials.end`                                | are deleted when an MCP consent ends (grant row survived)                                                        |
| cascade call removed from `revokePoolKeys`                                        | deletes the grants naming each revoked key (agent-pool.controller.db.test.ts: 2 rows survived)                   |
| cascade call removed from `removeMachineCredentialsOf`                            | deletes every grant naming the removed person’s credentials (machine-credential-admin…: 2 rows survived)         |
| cascade call removed from trusted-issuer `remove`                                 | deletes a grant an older release left on a revoked credential … (trusted-issuer…: 1 row survived)                |
| `roleFitsScope` check removed                                                     | refuses org-admin at a work package and project-manager there, …                                                 |
| membership check removed for a `user` subject                                     | refuses a user who is no member, a member of another organization included                                       |
| group check removed for a `group` subject                                         | refuses an absent group and another organization’s group                                                         |
| `revoked_at IS NULL` dropped from the credential read                             | refuses a revoked, absent or foreign credential                                                                  |
| organization predicate dropped from the role read                                 | refuses an unknown role and another organization’s custom role                                                   |
| duplicate read answers null                                                       | refuses a duplicate as already_granted … (UNIQUE constraint thrown)                                              |
| `name_taken` check removed from `createGroup`                                     | creates, renames and lists groups, refusing a taken name (UNIQUE constraint thrown)                              |
| membership check removed from `addGroupMember`                                    | adds only current members, once, and removes them (FOREIGN KEY constraint thrown)                                |
| `deleteGroup`'s grant delete matching no group                                    | deletes a group with its grants and members, … (`grantsDeleted: 0`)                                              |
| origin/actor pairing check made `if (false)` (after the base admitted `operator`) | refuses an origin its actor does not pair with, writing nothing (Received "resolved")                            |
| `copyGrantsOfCredential` call removed from the pool `rekey` (#891 review F1)      | a re-keyed agent keeps its grants on its new key (agent-pool.controller.db.test.ts: the new key listed no grant) |
| `isInGroup` point read removed from `addGroupMember` (#891 review F6)             | adds only current members, once, and removes them (primary key thrown instead of `already_in_group`)             |

Assumptions (1.4, after the #891 review): a pool re-key is a rotation and carries each old
key's grants to the person's new key (design.md P17, amended 2026-11-08); a pool or
credential revocation deletes them. `revoke`, `deleteGroup` and `removeGroupMember` take an
`AccessAct` now, unread until task 4.1's audit rows. P11's permission and escalation checks
are the routes' (4.2); a `project` scope is `not_found` until the project entity exists.

| Command after the #891 review fixes (2026-11-08, head merged with `aae271f03`)                        | Result                  |
| ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `bun test src/access-grant-store.db.test.ts --timeout=30000` (store-sqlite)                           | 18 pass, 0 fail         |
| `bun test` agent-pool, machine-credential-admin, trusted-issuer `.controller.db.test.ts` (be-01)      | 78 pass, 0 fail         |
| the 11-project `typecheck,typecheck:module` run-many, `--parallel=2`                                  | exit 0                  |
| `bunx nx run wbs-be-01:typecheck`                                                                     | exit 0                  |
| `bunx nx run-many -t lint -p wbs-store-sqlite,wbs-core,wbs-domain,wbs-be-01,tool-rename-work-package` | exit 0                  |
| `bunx nx run tool-rename-work-package:test --skip-nx-cache`                                           | 37 pass, 0 fail         |
| `bunx nx format:check --all`, `openspec validate --all --json`, `check-indexes working . HEAD`        | exit 0; 328/328; exit 0 |

## 1.5 Operator CLI `access-grant-cli.ts` (2026-11-08, branch `feat/wbs-permissions-1-5`)

`apps/wbs/be-01/src/access-grant-cli.ts` (`grant-super-admin`, `revoke-super-admin`), its
pre-write read `operatorSubjectRefusal` in `libs/wbs/adapters/store-sqlite/src/access-grant.ts`
(the store owns the Drizzle reads; be-01 production code never imports `drizzle-orm`), test `access-grant-cli.db.test.ts` (13 cases after the review round, the CLI spawned
with `DB_PATH` as `organization-limits-cli.db.test.ts` does). The grant and the revoke go
through `AccessGrantRepository` with an `operator` actor: origin `operator`, `created_by`
null, CP14 counted in the revoke's transaction. Runbook:
`docs/runbook-organization-activation.md`, _Grant or revoke an organization's super-admin_.

No audit row is written (design.md P21, amended 2026-11-08): `access_granted` and
`access_revoked` are task 4.1's, and the CLI's output names the actor `operator:<os login>`
they will carry. The unreadable-database case needs a non-root login, and asserts it.

Each fault injected alone, the named case watched failing, the source restored:

| Fault (2026-11-08)                                                     | Case that failed (`access-grant-cli.db.test.ts`)                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| store membership check (`subjectRefusalOf`, `user`) made `return null` | refuses a user who is not a current member, writing nothing (the outsider was granted, exit 0) |
| store CP14 count made `false &&` in `revoke`                           | refuses revoking the last direct human super-admin, writing nothing (revoked, none left)       |
| CLI `unreadable_database` return replaced by `process.exit(0)`         | refuse an unreadable database, writing nothing (no refusal line)                               |
| CLI `ENOENT` branch answering null                                     | refuse a missing database without creating it (the open's own error thrown, 17 stderr lines)   |
| `unknown_organization` return removed from `operatorSubjectRefusal`    | refuse an unknown organization, writing nothing (revoke answered `not_granted`)                |
| `machine_credential` return removed from `operatorSubjectRefusal`      | refuses a machine credential's id, writing nothing (`not_a_member`)                            |
| store duplicate read answering null                                    | refuses a user who holds the role directly already (UNIQUE constraint thrown, 42 stderr lines) |

| Command (2026-11-08, all `env -u CLAUDECODE`, `bun test` also `-u CLAUDE_CODE_ENTRYPOINT`)     | Result                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------- |
| `bun test src/access-grant-cli.db.test.ts --timeout=30000` (be-01)                             | 12 pass, 0 fail                   |
| `bun test src/audit.test.ts src/access-grant-store.db.test.ts --timeout=30000` (store-sqlite)  | 24 pass, 0 fail                   |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                   | exit 0, 3942 pass, 3 skip, 0 fail |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                | exit 0, 1027 pass, 0 fail         |
| `bunx nx run-many -t test,typecheck -p tool-rename-work-package --skip-nx-cache`               | exit 0, no new collision          |
| the 11-project `typecheck,typecheck:module` run-many, `--parallel=2`                           | exit 0                            |
| `bunx nx run wbs-be-01:typecheck`                                                              | exit 0                            |
| `bunx nx run-many -t lint -p wbs-be-01,wbs-store-sqlite --parallel=1 --skip-nx-cache`          | exit 0                            |
| `check-indexes working . HEAD`, `openspec validate --all --json`, `bunx nx format:check --all` | exit 0; 328/328; exit 0           |

Review round (#893 Fable review, MERGE AFTER FIXES, 2026-11-08). F1: the fixture gives ada an
organization-scope `org-viewer` grant; `refuses a user who holds no direct grant` asserts it
survives, and the new case `revokes only the super-admin grant of a user who also holds another
organization role` grants ada `org-super-admin`, revokes it and asserts the viewer row remains.
F3: `access-grant-store.db.test.ts` gains `tells the operator CLI an unknown organization and a
credential’s id apart from a member` (unknown organization, own and foreign credential ids, a
member and a non-member), and `operatorSubjectRefusal`'s JSDoc no longer claims a credential id
can never equal a `users.id` (nothing enforces it; such a user is refused, never granted).
F2, F4–F7: wording (this section's Drizzle note, the be-01 README bullet, `unreadable_database`
as "not readable and writable by this login", the `LLM_README.md` index row, a named error for a
root runner).

| Fault (2026-11-08, review round)                                         | Case that failed                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| revoke's role filter replaced by `held[0]` (F1)                          | refuses a user who holds no direct grant (ada's viewer grant revoked); revokes only the super-admin grant of a user who also holds … (11 pass, 2 fail) |
| `unknown_organization` return removed from `operatorSubjectRefusal` (F3) | tells the operator CLI an unknown organization and a credential’s id apart from a member (store, 18 pass, 1 fail)                                      |
| `machine_credential` return removed from `operatorSubjectRefusal` (F3)   | tells the operator CLI an unknown organization and a credential’s id apart from a member (store, 18 pass, 1 fail)                                      |

## 2.1 Core authorization foundation (2026-11-09, partial task)

Branch `feat/puni-entities-cli`, isolated worktree `/home/df/.codex/worktrees/af5e/puni-00`,
implementation base `d49fdad84`, planning checkpoint `5a02e986f`. The core helper and
credential-cap/membership projection are implemented; task 2.1 remains unchecked until
its required production-controller HTTP 404 fault proof exists after route rewiring.
Current routes are not claimed to enforce the new grants yet. Historical human-only
acknowledgment 0.1 is unchanged.

The initial behavioral RED was 1 pass/11 fail against the minimal helper scaffold; GREEN
was 12 pass/0 fail. The later impossible-organization-null case failed before its guard
(6 pass/1 fail), then passed after it. The real resource-use membership reconstruction
failed both credential cases before preservation (0 pass/2 fail), then passed after the
membership-only projection and original-cap/delegation preservation.

| Command or check                                                                                                                                                                                                                                                                                                                         | Observed result                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun test ./libs/wbs/application/core/src/service/authorize.test.ts ./libs/wbs/adapters/store-sqlite/src/organization-authorization.db.test.ts --timeout=30000` after final review fixes                                                                                                                                                 | 17 pass, 0 fail                                                        |
| Nine focused helper/grant/credential/fanout/authentication files after membership correction                                                                                                                                                                                                                                             | 94 pass, 0 fail, 378 assertions                                        |
| Independent parent run: helper, organization-authorization, access-decisions and fanout-capture files                                                                                                                                                                                                                                    | 63 pass, 0 fail, 314 assertions                                        |
| be-01: `bun test ./src/controller/command-current-authority.controller.db.test.ts ./src/controller/import-current-authority.controller.db.test.ts ./src/controller/runtime-authority.db.test.ts ./src/controller/runtime-state.db.test.ts ./src/controller/runtime-write.db.test.ts --timeout=30000` after credential-fixture correction | 285 pass, 0 fail, 1879 assertions                                      |
| be-01: `bun test ./src/controller/resource-use.controller.db.test.ts --timeout=30000`                                                                                                                                                                                                                                                    | 41 pass, 0 fail                                                        |
| store-sqlite: `bun test ./src/scoped-import-dependencies.db.test.ts --timeout=30000` after structural-equality/credential-fixture repair                                                                                                                                                                                                 | 39 pass, 0 fail, 220 assertions                                        |
| store-sqlite: `bun test ./src/working-plan-performance.test.ts --timeout=30000` with source/HEAD held steady                                                                                                                                                                                                                             | 8 pass, 0 fail, 657 assertions; repository unchanged=true, failures=[] |
| `bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json` after review fixes                                                                                                                                                                          | exit 0, no diagnostics                                                 |
| Focused Nx lint for core/store-sqlite/domain/be-01, plus final changed-fixture ESLint after review fixes                                                                                                                                                                                                                                 | exit 0; final commands had no diagnostics                              |
| Prettier on all 60 executor-owned files and `git diff --check`                                                                                                                                                                                                                                                                           | exit 0                                                                 |

The broad `bunx nx run-many -t test -p wbs-core,wbs-domain,wbs-store-sqlite --parallel=1
--skip-nx-cache` run exited 1: core/domain passed; SQLite reported 2655 pass, 1 skip and
2 fail across 177 files. The performance case rejected the concurrent planning HEAD/status
change; its failure list contained only that guard, with no ratio failure. The scoped-import
test compared JSON property order after adding the cap, rather than scope values; it now
uses structural equality, including the Set. Both failed files then passed their focused
reruns above. The complete broad run was not repeated or relabeled as passing.

The unchanged existing skip is `assignSubtree on the memory store, beyond the batch —
refuses a stale undo once another account changed one of its leaves`.

Astra independently reviewed spec compliance and code quality, then re-reviewed its P3
fixture finding: ordinary machine/consent fixtures now use `CONTRIBUTOR_CAP`, while
intentional wider/stale-authority probes remain uncapped. Final scoped verdict: approve;
no production blocker or concrete serialization defect found. The reviewer ran no tests.
Full reports/log pointers are retained in the ignored task workspace; the observed commands,
results and safety proofs are recorded here.

### Failure proofs

Every fault below was injected separately into the production path, its named test was
observed failing, and the original source restored. Adjacent `Proof:` comments name the
same faults and tests. The broken SQL table proves trusted-query failure propagation,
not OS-file unreadability.

| Guard / production location                           | Injected fault                                                  | Observed failing production-path test                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `service/authorize.ts` absent catalog port            | Return ok with the requested permission when the port is absent | `throws when a memory catalog carries no access decisions`: 0 pass, 1 fail                   |
| `service/authorize.ts` invisible target               | Return forbidden instead of not_found                           | Invisible helper, real-member and authenticated-machine-grant cases: 0 pass, 3 fail          |
| `service/authorize.ts` required permission            | Bypass `may`                                                    | Viewer and credential manager-only refusal cases: 0 pass, 4 fail                             |
| `service/authorize.ts` non-null organization contract | Return forbidden on impossible organization null                | `throws when an organization decision violates its non-null contract`: 0 pass, 1 fail        |
| `service/authorize.ts` trusted read                   | Catch the read failure and admit                                | Fault-identity and dropped SQLite permission-table cases: 0 pass, 2 fail                     |
| `organization-access.ts` resolved cap                 | Replace derived cap with null                                   | Machine, consent and authenticated-machine-grant integration: 0 pass, 3 fail                 |
| `fanout-capture.ts` borrowed writer cap               | Replace derived cap with null                                   | `preserves the credential cap when resolving a borrowed project write scope`: 0 pass, 1 fail |
| `resource-use.ts` membership reconstruction           | Drop preserved metadata and use cap:null                        | Both real machine/consent membership-recheck consumers: 0 pass, 2 fail                       |
| `resource-use.ts` membership reconstruction           | Override only cap:null while retaining delegation               | Same two consumers: 0 pass, 2 fail; only cap regressed                                       |

Not run for this partial slice: whole-repository build/browser checks, final full format gate,
h2/h4 canonical gate, or the HTTP grant-visibility mutation proof. Read-only host probes
confirmed both hosts reachable with Bun 1.4.4; existing lock holders were observed and no
new remote gate or deployment was started. No whole-scope completion, merge qualification,
deployment or activation is claimed.

## 2.1 closure and 2.2–2.3 current grant admission (2026-11-09)

Implementation base `f169694805fa03f6f694f9f95d3682cfaae5b7c2`, isolated branch `feat/puni-entities-cli`. The earlier partial task2.1 record is historical; the mounted HTTP404 proof and complete suites below close its outstanding check. Exact command arrays and all84 fault receipts are retained in [verification-2.2-2.3.json](verification-2.2-2.3.json). Root independently ran the complete401-case mounted permission matrix:401pass/0fail,647assertions,214.91s, exit0 (`/tmp/puni-root-permission-review.log`). After the raw-writer visibility correction, root independently ran its two actual database cases:2pass/0fail,10assertions,2.58s, exit0 (`/tmp/puni-root-raw-writer-review.log`). The complete234/195-file suites are pre-delta evidence; the final19-file693/0 run covers all affected writers/callers after that correction. No canonical clean-SHA host gate, merge, deployment or whole-goal completion is claimed.

### Scope and contracts

- All 62 current registry kinds are compared by exact IDs/mappings against the matrix:32 `package.write`,6 `package.manage_settings`,2 `project.manage_budgets`,22 `organization.manage_directory`, including `setDirectoryCapacity`.
- Actual project creation/settings, step/marker writes, saved-plan capture/rename/delete, Retry, imports, directory/binding/definitions, spaces, rank, capacity mode, claims and own/every credential reach use current grants. Old helpers remain for2.4. Membership APIs and later visibility/grant routes remain outside this slice.
- Scoped `ResourceAccess.principal` is an explicit detached id/authentication projection. Complete authenticated caller evidence is separately snapshotted before the first queued await and revalidated inside the owner. Incoming `expectedAccess`, legacy roles and stale caps grant nothing. Actor, scope user and principal IDs must agree before trusted reads/writes/publication. No raw token, cookie, digest or full user object is copied into descriptors or persisted replay metadata.
- Budget writes and replay evaluate the SAME `project.manage_budgets` permission at the addressed package FIRST, then its current owner. This preserves hidden404 and restricted P5 rules without adding `package.write` to the original budget command. Restricted recovery is exactly flag-clear; step/marker/save/Retry/batch/replay cannot recover through role/creator exceptions.
- Saved-plan rename/delete require `package.write` plus author-or-effective-`package.manage_settings`; custom equivalent roles work. Independent saved-plan writers and Retry recheck current grants rather than trusting an earlier route decision.
- Spaces use the actual transaction-bound borrowed store; SQLite installs it, memory explicitly does not. Missing scoped capability/decisions throw. No public gated-repository or nested-owner fallback.
- Standalone directory add/add-person and remove each keep root/ownership/links or removal/capture/events in one admitted owner. Authorization precedes used-resource preflight/capture. Existing-name add is gated. Invocation-local modeled refusals retain the missing permission. Service announcements are buffered until successful settlement; late rollback publishes nothing. Separate compound rename/membership commits remain intentional.
- Typed writes authorize EXACT selected old∪new endpoint packages in command order, including explicit add/update/remove, copied incoming links, removed incoming links and outgoing/incoming first-child incident receipts before detach. Reading an unchanged outgoing link does not require write. Bound capability keeps actual identity private; missing capability throws. Replay uses the same affected package anchors and never turns forbidden into stale discard.
- Version1 immutable replay obligations are recorded only for contributing recordings, before operation spelling collapses. They use stable permission IDs plus package/current-budget-owner anchors. Flip/restamp and undo→redo→undo preserve them. Scoped legacy rows without provenance return409 `replay_provenance_unavailable` BEFORE stale discard, preserving history/cursor/state/audit/publication; malformed present metadata throws. Historical bytes are not rewritten. Storage envelope compatibility does not imply old-binary grant-policy compatibility.
- Every machine/agent-consent credential uses ONLY its own grants and the normative fixed contributor cap. Human upstream delegations remain account subjects, with their established nondelegation restrictions. Explicit account/credential/scope fixture grants replace old role assumptions; harness defaults remain empty. Agent creation/import/settings cap-ineligible positives were replaced with precise cap denials; reachable queued import/account/package and real consent revocation/family proofs remain.
- P10 permission fields survive real encoded direct, batch, undo/redo, queued Retry, runtime, standalone and allowance paths. Invisible/absent addressed targets remain identical404. Frontend renders unavailable legacy history; permission types use the intended leaf alias in real frontend/TypeScript configs.

### Review

Astra/root approved detached identity and queue provenance, admitted actor equality, borrowed spaces, exact implicit dependency mutation sets, immutable replay requirements and explicit legacy refusal, standalone creation/removal atomicity and buffered publication, budget ordering, and ordinary scoped grants under `NO_ADMISSION`. Final authority delta review found no actionable defect. A later narrow restored-source allowance P10 review also found none and read both independent mutation receipts. These reviews were source-only; the reviewer did not rerun the full suites or all fault logs. MCP consumer cleanup since then is test/fixture-only.

### Fresh verification

Exact argv arrays, working directories and logs are in `verification-2.2-2.3.json`; exact changed files are in `task-2.2-2.3-files.json` (305 paths, including the final task checkbox file). All shell commands used `login:false`; writes/cache operations in the authorized native worktree used precise filesystem escalation. Bun/Nx only.

| Check                                                                | Observed                                                                         | Evidence under `/tmp/`                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Complete registry/matrix plus machine credential controller          | 437 pass/0 fail:401 matrix cases +36 credential cases                            | task-2.2-machine-matrix-final-green.log                                               |
| All core source unit files                                           | 1799 pass/0 fail,143 files                                                       | task-2.2-core-coherent-final-errors.log                                               |
| All backend source non-DB unit files                                 | 1014 pass/0 fail,86 files                                                        | task-2.2-backend-unit-coherent-final-errors.log                                       |
| All affected adapter/conformance files (pre raw-writer review delta) | 2765 pass/0 fail/1 existing skip,195 files                                       | task-2.2-adapters-coherent-final-2-errors.log                                         |
| All backend DB files (pre raw-writer review delta)                   | 4300 pass/0 fail/3 existing opt-in skips,234 files,76000 assertions              | task-2.2-backend-db-coherent-final-errors.log                                         |
| Post-review raw writer affected regression                           | 693 pass/0 fail,19 files,2360 assertions                                         | task-2.2-raw-project-post-delta-errors.log                                            |
| All contracts/MCP/gateway unit consumers                             | 1410 pass/0 fail,111 files                                                       | task-2.2-contract-consumer-final-2-errors.log                                         |
| SQLite source conformance                                            | 84 pass/0 fail,7703 assertions;139 certified cases incl borrowed space roundtrip | task-2.2-sqlite-source-conformance-final.log                                          |
| Memory source conformance                                            | 84 pass/0 fail,5999 assertions;129 certified cases; exclusions/absences below    | task-2.2-memory-source-conformance-final.log                                          |
| Five referenced TypeScript solutions                                 | exit0 after final MCP fixtures                                                   | task-2.2-final-solutions-types-3.log                                                  |
| Independent core/backend feature module checks                       | both exit0                                                                       | task-2.2-{core,backend}-modules-coherent-final.log                                    |
| Actual frontend writer / leaf aliases                                | 27 pass/0 fail and18pass/0 fail                                                  | task-2.2-fe-writer-final.log; task-2.2-fe-alias-final.log                             |
| Browser portability                                                  | build +2 browser tests pass, exit0                                               | task-2.2-core-portable-final.log                                                      |
| Actual frontend production build                                     | exit0,13 uncached tasks                                                          | task-2.2-fe-build-final.log                                                           |
| Tracked MCP OpenAPI regeneration                                     | exit0                                                                            | task-2.2-openapi-final.log                                                            |
| OpenSpec all artifacts                                               | 343 valid/0 invalid, exit0                                                       | task-2.2-openspec-final-task-check.json                                               |
| Whole-owned lint after final MCP cleanup                             | 296 TypeScript files,8 project groups, all exit0                                 | task-2.2-owned-lint-final-3.log + task-2.2-backend-lint-coherent-final-2-receipt.json |
| Whole-owned format                                                   | 305 files checked, exit0                                                         | task-2.2-format-final-task-check.log                                                  |

The source conformance window was coordinated with root; no source/status mutation occurred during it. Both certificates explicitly say `f169694805fa03f6f694f9f95d3682cfaae5b7c2-dirty`; this is no clean-SHA/canonical-host certification. Subsequent changes were test/fixture/compiler-proof cleanup only, with no grant production-source change.

### RED/GREEN and R5

All 81 authority/site/identity/lifetime/replay/projection faults plus 3 frontend faults were observed RED exit1, restored byte-for-byte and observed GREEN exit0. `verification-2.2-2.3.json` contains exact commands for all 84; original nine Bun orchestration scripts/receipts, frontend script/receipts and allowance script/receipts are retained here. The separate task2.1 actual HTTP404 mutation also failed its mounted negative and passed restored; `task-2.1-http-mutation.ts`, `/tmp/task-2.1-http-{red,green}.log`. Adjacent `Proof:` comments name the production tests/faults.

Observed behavior RED/GREEN includes:11 direct named-denial routes,2 undo/redo admission fields,3 runtime/queued Retry fields,2 standalone fields,6 borrowed resource/preview fields; restricted/hidden budgets9RED→10 GREEN then ordering2RED→12 GREEN; used tag/team/person removal3RED→5 GREEN including late rollback/no publication and post-commit success; implicit copy/delete/outgoing remap3 unsafe successes→4 GREEN plus current-command-order, no-overrestriction and remote undo/redo controls; legacy undo/redo refusal and malformed provenance; all queued principal alias snapshots and actor mismatch throws before reads. Allowance admission/service projection was2RED→2 GREEN, then two independent killed/restored mutations. Omitting the independent `spaces.create` inventory case failed exact conformance equality, then passed after inclusion.

Rejected proof attempts are not counted: equivalent actor expression, unmatched Retry filter, invalid absent-marker fixture, double-defended rank check, and HTTP-only missing-capability incidental TypeError. Controls were strengthened to exercise the actual producer/diagnostic, then killed/restored. An Nx alias-test invocation selected zero tests and is not counted; the actual configured Vitest18 cases were executed. No live mutant remains.

| Fault                                | Production file                                                                  | Named production-path test                                                                                          | RED/GREEN/restored |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| standalone-current-grant             | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | keeps an existing-name standalone add                                                                               | 1/0/true           |
| standalone-principal-snapshot        | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | retains the original standalone permission principal                                                                | 1/0/true           |
| standalone-creation-owner            | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | rolls back a standalone opaque root                                                                                 | 1/0/true           |
| standalone-principal-coherence       | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | throws on a mismatched standalone principal                                                                         | 1/0/true           |
| detached-principal-projection        | libs/wbs/adapters/store-sqlite/src/organization-access.ts                        | returns only a detached grant principal projection                                                                  | 1/0/true           |
| implicit-duplicate                   | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | remote write for implicit duplicate                                                                                 | 1/0/true           |
| implicit-delete                      | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | remote write for implicit delete                                                                                    | 1/0/true           |
| incident-before-detach               | libs/wbs/application/core/src/service/incident-node-transition.ts                | remote write for implicit first-child-outgoing                                                                      | 1/0/true           |
| command-permission-projection        | libs/wbs/application/core/src/module/plan-commands/command-bindings.ts           | remote write for implicit duplicate                                                                                 | 1/0/true           |
| claim-original-obligation            | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | replay of a claim for another account                                                                               | 1/0/true           |
| set-budget-original-obligation       | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | budget undo after budget authority                                                                                  | 1/0/true           |
| replay-version                       | libs/wbs/application/core/src/service/replay-authorization.ts                    | present unknown replay provenance                                                                                   | 1/0/true           |
| flag-clear-only                      | libs/wbs/application/core/src/service/authorize.ts                               | allows recovery only to clear the restricted flag                                                                   | 1/0/true           |
| grant-port-getter-fence              | libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts      | hand out its grant capability                                                                                       | 1/0/true           |
| grant-role-before-fence              | libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts      | retained effectiveRoleAt call                                                                                       | 1/0/true           |
| grant-role-after-fence               | libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts      | suspended effectiveRoleAt answer                                                                                    | 1/0/true           |
| grant-readable-before-fence          | libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts      | retained readablePackageIds call                                                                                    | 1/0/true           |
| grant-readable-after-fence           | libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts      | suspended readablePackageIds answer                                                                                 | 1/0/true           |
| typed-auth-before-fence              | libs/wbs/application/core/src/service/dependency-context.ts                      | typed write authorization after context closes at before-call                                                       | 1/0/true           |
| typed-auth-ownership-fence           | libs/wbs/application/core/src/service/dependency-context.ts                      | typed write authorization after context closes at ownership-read                                                    | 1/0/true           |
| typed-auth-grant-fence               | libs/wbs/application/core/src/service/dependency-context.ts                      | typed write authorization after context closes at grant-read                                                        | 1/0/true           |
| admitted-principal-snapshot          | libs/wbs/application/core/src/module/plan-commands/admitted-write.ts             | queued project admission                                                                                            | 1/0/true           |
| recovery-principal-snapshot          | libs/wbs/application/core/src/http/recovery-write.ts                             | queued step admission                                                                                               | 1/0/true           |
| import-principal-snapshot            | libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts          | queued import admission                                                                                             | 1/0/true           |
| organization-principal-snapshot      | libs/wbs/adapters/store-sqlite/src/organization-access.ts                        | snapshots verified organization identity before awaiting                                                            | 1/0/true           |
| retained-step-actor                  | libs/wbs/application/core/src/http/recovery-write.ts                             | passes the retained actor into a queued step writer                                                                 | 1/0/true           |
| missing-typed-capability-diagnostic  | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | missing admitted remote dependency authorization                                                                    | 1/0/true           |
| replay-empty-requirements            | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance empty requirement set                                                                   | 1/0/true           |
| replay-budget-anchor                 | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance budget with package anchor                                                              | 1/0/true           |
| replay-package-anchor                | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance package with budget anchor                                                              | 1/0/true           |
| registry-command-grant               | libs/wbs/application/core/src/module/plan-commands/admitted-scope.resource.ts    | names package.write when a viewer runs createWorkItem&#124;budget-owner authority independently.*write              | 1/0/true           |
| budget-package-admission             | libs/wbs/application/core/src/module/plan-commands/admitted-scope.resource.ts    | before missing budget-owner&#124;restricted setBudget                                                               | 1/0/true           |
| budget-owner-replay                  | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | budget-owner authority independently.*replay                                                                        | 1/0/true           |
| budget-package-replay                | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | restricted budget undo                                                                                              | 1/0/true           |
| project-create-grant                 | libs/wbs/application/core/src/module/project/project.resource.ts                 | missing permission on the direct package creation route                                                             | 1/0/true           |
| project-settings-grant               | libs/wbs/application/core/src/module/project/project.resource.ts                 | borrowed project settings before reaching                                                                           | 1/0/true           |
| saved-capture-service-grant          | libs/wbs/application/core/src/module/project/project.resource.ts                 | borrowed saved-capture authorization                                                                                | 1/0/true           |
| retry-service-grant                  | libs/wbs/application/core/src/module/project/project.resource.ts                 | contributor retry without                                                                                           | 1/0/true           |
| step-resource-grant                  | libs/wbs/application/core/src/module/step/step.resource.ts                       | named write refusal in the actual borrowed step resource                                                            | 1/0/true           |
| marker-resource-grant                | libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.ts | invisible package in the actual borrowed marker resource                                                            | 1/0/true           |
| directory-shared-grant               | libs/wbs/application/core/src/module/directory/directory.resource.ts             | borrowed directory resource removal&#124;borrowed directory directory capacity&#124;shows only own directory agents | 1/0/true           |
| binding-grant                        | libs/wbs/application/core/src/module/directory/directory.resource.ts             | actual borrowed account binding                                                                                     | 1/0/true           |
| measure-grant                        | libs/wbs/application/core/src/module/directory/measure-definitions.ts            | borrowed directory measure                                                                                          | 1/0/true           |
| space-grant                          | libs/wbs/application/core/src/service/space.resource.ts                          | missing permission on the direct space creation route                                                               | 1/0/true           |
| rank-grant                           | libs/wbs/application/core/src/service/standalone-rank.ts                         | rechecks queued rank grants                                                                                         | 1/0/true           |
| mode-grant                           | libs/wbs/application/core/src/service/standalone-capacity-mode.ts                | rechecks queued capacity mode grants                                                                                | 1/0/true           |
| claim-extra-grant                    | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | claiming for another account without                                                                                | 1/0/true           |
| credential-reach-grant               | libs/wbs/adapters/store-sqlite/src/machine-credential-administration.ts          | narrows credential administration by manage_directory                                                               | 1/0/true           |
| import-create-grant                  | libs/wbs/adapters/store-sqlite/src/fanout-capture.ts                             | encodes organization.create_project on a refused import                                                             | 1/0/true           |
| import-directory-grant               | libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts          | import defining directory rows                                                                                      | 1/0/true           |
| import-measure-grant                 | libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts          | import defining measure rows                                                                                        | 1/0/true           |
| clear-budget-original-obligation     | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | clear-budget undo after its original budget permission                                                              | 1/0/true           |
| release-original-obligation          | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | replay of a release for another account                                                                             | 1/0/true           |
| legacy-replay-modeled-refusal        | libs/wbs/application/core/src/module/work-item/work-item.resource.ts             | refuses legacy undo&#124;refuses legacy redo&#124;absent replay provenance before stale                             | 1/0/true           |
| replay-null-diagnostic               | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance null presence                                                                           | 1/0/true           |
| replay-known-permission              | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance unknown permission                                                                      | 1/0/true           |
| replay-nonempty-anchor               | libs/wbs/application/core/src/service/replay-authorization.ts                    | malformed replay provenance empty package anchor                                                                    | 1/0/true           |
| walk-permission-projection           | libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts      | visible viewer is denied.*admission                                                                                 | 1/0/true           |
| runtime-permission-projection        | libs/wbs/application/core/src/http/runtime-command.routes.ts                     | package.write on current runtime scope refusal                                                                      | 1/0/true           |
| runtime-claim-grant-projection       | libs/wbs/application/core/src/module/plan-commands/composition.ts                | claim_for_others on current runtime person refusal                                                                  | 1/0/true           |
| runtime-second-permission-projection | libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts      | second current grant denial at runtime command admission                                                            | 1/0/true           |
| removal-usage-owner                  | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | authorizes used standalone                                                                                          | 1/0/true           |
| removal-buffer                       | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | removal announcements buffered                                                                                      | 1/0/true           |
| removal-invalid-refusal              | libs/wbs/application/core/src/module/directory/directory.resource.ts             | impossible standalone removal link refusal                                                                          | 1/0/true           |
| direct-standalone-actor              | libs/wbs/application/core/src/module/directory/standalone-directory.ts           | mismatched standalone.*actor                                                                                        | 1/0/true           |
| direct-project-owner                 | libs/wbs/application/core/src/module/project/project.resource.ts                 | direct project creation names another owner                                                                         | 1/0/true           |
| rank-public-grant                    | libs/wbs/application/core/src/service/project-rank.resource.ts                   | refuses public rank authority before a broken                                                                       | 1/0/true           |
| mode-public-grant                    | libs/wbs/application/core/src/service/capacity-mode.resource.ts                  | refuses public capacity-mode authority before a broken                                                              | 1/0/true           |
| package-actor-coherence              | libs/wbs/application/core/src/service/authorize.ts                               | scoped step service preserves exact grant scope                                                                     | 1/0/true           |
| space-no-public-fallback             | libs/wbs/application/core/src/http/space.routes.ts                               | real space route closed when the admitted spaces                                                                    | 1/0/true           |
| space-no-default-grants              | libs/wbs/application/core/src/http/space.routes.ts                               | real space route closed when the admitted accessDecisions                                                           | 1/0/true           |
| space-actor-coherence                | libs/wbs/application/core/src/http/space.routes.ts                               | mismatched space.*before grant reads                                                                                | 1/0/true           |
| retry-writer-permission              | apps/wbs/be-01/src/repository/optimization.ts                                    | writer grant revocation                                                                                             | 1/0/true           |
| retry-route-permission               | libs/wbs/application/core/src/http/project.routes.ts                             | writer grant revocation                                                                                             | 1/0/true           |
| saved-capture-writer-grant           | libs/wbs/adapters/store-sqlite/src/saved-plan.ts                                 | independent saved-plan capture writer                                                                               | 1/0/true           |
| saved-touch-writer-grant             | libs/wbs/adapters/store-sqlite/src/saved-plan.ts                                 | independent saved-plan (rename&#124;delete) writer                                                                  | 1/0/true           |
| saved-manager-effective-grant        | libs/wbs/adapters/store-sqlite/src/saved-plan.ts                                 | manager permission when another author saved-plan                                                                   | 1/0/true           |
| step-allowance-admission-projection  | libs/wbs/application/core/src/http/step.routes.ts                                | encodes step allowance admission permission                                                                         | 1/0/true           |
| step-allowance-command-projection    | libs/wbs/application/core/src/http/step.routes.ts                                | encodes step allowance command permission                                                                           | 1/0/true           |
| frontend-replay-case                 | apps/wbs/fe-01/src/components/wbs/plan-refusal.ts                                | reports unavailable older history                                                                                   | 1/0/true           |
| frontend-replay-wording              | apps/wbs/fe-01/src/components/wbs/plan-refusal.ts                                | reports unavailable older history                                                                                   | 1/0/true           |
| frontend-permission-leaf             | apps/wbs/fe-01/vite.config.ts                                                    | maps every alias to the namespaced source file                                                                      | 1/0/true           |

### Failed attempts retained

- Initial full backend DB discovery:2515 pass/1779 fail/3 existing skips,234 files, explicitly FAILED (`task-2.2-backend-db-regression-errors-1.log`). Six additional nested child failure lines are not added to Bun's1779 summary. Follow-up67-family sweep1254/54 and45-family sweep689/102+1error were also failed. Causes were migrated by named subject/scope: absent setup grants, stale role-only demotions leaving grants live, missing own credential grants, old creator/recovery/read-only-remote assumptions, hidden agent404 and named P10 response fields. No authorization fallback was added.
- Initial adapter discovery2690pass/75 fail/1 skip (`task-2.2-adapter-final-regression-errors.log`). After explicit fixture migration, a process launched before the independent space inventory correction finished2764/1 fail/1 skip because it had cached the old module. Fresh frozen-source195-file repeat above passes2765/0/1.
- Contract/MCP/gateway discovery1314pass/96 fail,111 files (`task-2.2-contract-consumer-final-errors.log`):68 parity child-setup cascades,23 delegation fixture/cap cases,2 headless-machine,2 swarm,1 standalone compiler invocation lacking repository alias config. Focused fixes passed parity9, headless7, pool2 including its deliberate skip-revoke failure proof, delegation36 including six queued consent/family cases, and closed-type compiler1. The fresh complete111-file repeat passes1410/0.
- Whole-owned ESLint initially exhausted a4GB heap. Partitioned8GB runs exposed precise import, unused-binding and frontend fallthrough-comment diagnostics, corrected without relaxing rules. Final refreshed lint is listed separately; no OOM run is counted green.
- A fixture native registration attempt against the intentionally OIDC-only delegation backend returned `invalid_client`; discarded. Final queued agent setup signs a real first-party upstream JWT, selects via the actual route, and creates through the actual authorized route. An accidentally duplicated rekey grant correctly failed unique authority state; removed so the existing production grant transfer is exercised. No idempotent/default grant fallback.

### Explicit skips, unavailability and remaining work

- Existing adapter skip: memory `assignSubtree ... refuses a stale undo once another account changed one of its leaves`; memory has no work-item revision tracking. SQLite's corresponding test executes.
- Three existing backend opt-in cases are unavailable in this local run: two real-container host restore proofs (`WBS_HOST_RESTORE_REAL_DOCKER=1` plus `WBS_HOST_RESTORE_PROOF_IMAGE`) and solver orphan-container proof (`WBS_SOLVER_ORPHAN_IMAGE`). No new skip was introduced.
- Memory conformance explicitly excludes absent-reference validation cases for actuals, capacity, estimates, measures, priority bands and progress. Its declared absent families are `accessDecisions`, `livePlans`, `projectRanks`, `spaces`. SQLite has no exclusions/absent families.
- Actual engagement-parent move and restricted explicit owning-project budget positive cannot exist before #698 slice2. Current interim owner resolution is proven; both future tests are visibly owed in `openspec/changes/wbs-work-packages/tasks.md`. No immutable-organization trigger bypass or imaginary parent fixture was used.
- Canonical clean-SHA h2/h4 gate, full browser stack, image/deploy/remote checks and performance benchmarks were not run here. Canonical gate/integration belongs to root after review/commit; no raw full Nx host gate was attempted.
- All required local regression/type/lint/build/conformance checks now pass. Only2.1/2.2/2.3 checkboxes were updated; historical0.1 and later tasks remain untouched. Root owns tracked verify.md integration, concrete diff/receipt review, commit authorization and the later canonical gate. The parent’s separate CLI branch/tree remains isolated and is recorded in the recovery ledger. No commit or CLI integration was performed.

### Task 2.1 closure

The previously unavailable literal HTTP404 proof is now supplied through a real rewired mounted route: changing null/invisible authorization to forbidden fails the named HTTP negative, restored passes. The committed foundation’s authorize/authentication and SQLite organization grant tests are included in the fresh1799-core and2765-adapter runs, and all13 required controller families are included in the fresh4300-backend run. Together with the existing missing/unreadable-port fault evidence, this completes2.1’s previously outstanding requirement; no historical0.1 checkbox was changed.

### Root-review raw project writer delta

The independent ProjectRepository.editInOrganization path collapsed an invisible authorizePackageSettings decision into its legacy forbidden value. The new direct production test observed RED (hidden forbidden versus expected null), with its readable-viewer denial control GREEN. The approved fix returns null for not_found and retains EditRefused for readable forbidden. Port/public-writer JSDoc now states current principal grants, invisible null and exact flag-clear recovery. Only obsolete raw no-grant expectations changed: a removed raw actor is null, a visible viewer has an explicit package-viewer grant, and a restricted admin control has an explicit org-admin grant. Actual removed-member route403/not_a_member remains unchanged and is included in the post-delta run.

Focused project/organization-audit tests passed53/0. Independent concealment-arm and whole-denial removals each failed their exact named real repository assertion with exit1; restored source passed exit0. Both receipts and Bun orchestration are retained as task-2.2-2.3-raw-project-mutation-receipts.json / -raw-project-mutations.ts. Cumulative current-slice proofs are84 faults plus the separate actual HTTP404 fault.

Five referenced solution typechecks, four-file lint and format checks pass after the delta. The complete prior234-file backend run (4300/0/3) and195-file adapter run (2765/0/1) are explicitly PRE-DELTA evidence. Root requested no full234 repeat unless broader issues emerged. The post-delta regression passes 693 tests / 0 failures across 19 files (2,360 assertions), covering all project-named adapter/controller tests plus organization audit, the full401 permission matrix, fanout and organization context; /tmp/task-2.2-raw-project-post-delta-errors.log. The unchanged actual removed-member route403/not_a_member case passes in this same run. Root-owned tracked verify.md and verification-2.2-2.3.json are excluded from owned file/format manifests and were not edited.

| Additional fault            | Production file                               | Named production-path test                                                               | RED/GREEN/restored |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| raw-project-hidden-decision | libs/wbs/adapters/store-sqlite/src/project.ts | conceals an owned hidden project exactly like an absent target in the independent writer | 1/0/true           |
| raw-project-current-denial  | libs/wbs/adapters/store-sqlite/src/project.ts | refuses a readable project without settings permission in the independent writer         | 1/0/true           |

## Task 2.4a — current security grants and transaction ownership

Local checkpoint on base08e1ff2b1, recorded before commit. Parent2.4 remains unchecked:
2.4b follows auditfoundation4.1 and membership2.5. Exact commands, outcomes, source hashes,
138 fault receipts and excluded attempts are in [verification-2.4a.json](verification-2.4a.json).
This checkpoint does not close the entity rename or the PUNI CLI goal.

Security policy, domains/DNS, enterprise SSO/proof, provisioning, trusted issuers and restore
approval/execution now use the actual detached authenticated principal and current
organization.manage_security through AccessDecisionRepository. Reads/effects share the same
Gate and BEGIN IMMEDIATE connection. No legacy role fallback or credential-cap widening.
DNS/discovery release the preflight owner for network work and recheck authority in the effects
owner. Identity linking may proceed without security proof; collision rolls its proof/audit
back. Borrowed identity/rank/event operations do not acquire nested owners. Restore's cold
host awaits settlement before closing the connection/lock and checks the recorded personal
approver's current grant before new effects; completed receipts retain their idempotent path.

### Fresh local verification

| Check                                                                           | Observed output                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Coherent affected32-file suite                                                  | 800pass,2existing opt-in Docker skips,0fail;3895assertions;236.21s;exit0        |
| Real SQLite source conformance and core/backend module boundaries               | 100pass,0fail;7727assertions;3files;108.11s;exit0                               |
| Core, SQLite, backend and contracts complete TypeScript lib/spec solution roots | exit0, empty diagnostics after final fault restoration                          |
| Owned62-path formatting and scoped TypeScript lint                              | exit0                                                                           |
| OpenSpec validate all                                                           | 343valid,0invalid;exit0                                                         |
| Parent independent controller/contract check                                    | 36pass,0fail;136assertions;2files;5.05s; before additive63 route/provider cases |
| Git whitespace check                                                            | exit0                                                                           |

The first coherent attempt failed731pass/6fail/2skip. Four OIDC trust fixtures lacked the
explicit second-organization registrar grant; two DNS negatives demoted a legacy role while
leaving the current grant effective. Precise subject/scope fixture repairs passed42/0 and
the complete repeat above. No default grants or production authorization fallback were added.
Earlier294-test discovery287/7 and its seven fixture repairs remain historical failed/partial
attempts; they are not substitutes for the final32-file repeat. Failed launcher/lint attempts
are also retained in the machine-readable record.

### R5 proofs and review

138 successful experiments comprise34 permission/schema,46 detached snapshots,44 owner/HTTP/
lifetime/boundary checks and14 additive pre-resolver HTTP/pre-provider OIDC captures. Every
counted experiment has a named RED1, restored GREEN0, equal before/after hashes and distinct
mutant hash, with an adjacent production Proof comment. Repeating the final14 after test-helper
cleanup does not add14 to the count. Astra independently checked logs, diagnostics, restoration,
adjacency and the actual mounted request/provider mutation oracles. Parent separately reviewed
owner/permission wiring and validated all retained receipts; reviewer source inspection is not
claimed as independent execution of the full suite.

The original domain.verifyClaim stamp experiment genuinely survived: actor/by mutation missed
the timestamp-only update. Its original logs were overwritten by the successful strengthened
rerun and were never archived. The failed metadata explicitly has null log references and
originalLogRetained:false. The successful resumed proof mutates at=999 and observes persisted
updated_at. Historical18 exploratory experiments are excluded. The valid policy-clone proof
uses admissible7200/3600 and observes persisted7200 instead of28800; the older600/3600 CHECK
failure is retained separately and is not represented as a persistence proof.

The original124 restoration hashes precede adjacent comment edits; that history is preserved.
The additional14 final receipts match current source including comments on all7 affected paths.
The record also captures all62 current owned-file hashes, so neither hash set is relabeled as
a clean committed gate result. No active mutation remains.

### Explicit limits and next dependencies

The two existing real-Docker host/container fencing cases require WBS_HOST_RESTORE_REAL_DOCKER=1
and an explicit WBS_HOST_RESTORE_PROOF_IMAGE; neither was supplied. Canonical h2/h4 clean-SHA
gate, build, browser E2E, live external DNS and deployment were not run for this local slice.
No real activation/deployment certification is claimed.

Fixture-only DomainClaimRepository.openClaim/promoteClaim remain for the existing
organization-records tests and must move/remove in2.4b; no production DomainChallenges caller
uses them. OrganizationScope.role and other live legacy helpers remain until the approved
4.1→2.5→2.4b order permits deletion. Engagement-parent/restricted-budget positive proofs still
belong to the later entity slice. Whole-scope implementation continues.

## Current-vocabulary atomic audit foundation (4.1), 2026-11-10

The additive audit rebuild admits37 actions/14 subject kinds while retaining every outgoing29/11 value, rows, three indexes and two append-only triggers. Down refuses new actions or new subject kinds before destructive work and cleanly restores the outgoing schema. Real corrupted foreign keys still fail atomically. This slice deliberately retains project/restricted_project_recovery vocabulary until the entity migration.

Seven grant/group mutations append audits in their existing immediate owner. Group deletion records N grant revocations + M group-member removals + one group-deleted row; accepted same-name rename records one event, while refusals record none. AccessAct requires a singular auditId; variable cascades use fresh owner-local IDs. Borrowed grant/membership mutations return actual-row evidence and own no gate, transaction or audit. Their method-only parameters accept an already-owned plain Drizzle connection; real explicit-owner rollback tests and a forced TypeScript RED prove this composition.

Existing machine/consent/issuer/person/pool cascade owners append audits from actual deleted/copied rows in the same transaction. Re-key preserves stored grant origin/creator, audits only actual inserted copies and precedes successor credential insertion. Direct membership removal records exactly one account aggregate including zero counts. SCIM enriches its existing lifecycle event and adds no duplicate aggregate/per-grant events. Captured human route/owner provenance survives awaits; SCIM token actors and mcp-01 service provenance retain their distinct stamp semantics. Current membership role/last-super-admin policy is preserved for2.5.

The actual host operator grant/revoke CLI now records audit atomically and prints audit: recorded; audit failure rolls back, returns nonzero and prints no success. Later operator/read APIs remain open. [The self-contained4.1 record](verification-4.1.json) retains exact commands,83 source hashes,94 unique restored fault proofs, six excluded attempts, two honestly metadata-only superseded successes and failed regression history. Astra cleared the source and all94 receipts. Root read the actual final output, verified all83 changed paths/hashes and reviewed the three later inventory omissions as exact migration expectation updates.

Clean affected regression:1292 passed/0 failed,5544 assertions,64 files,403.72s (/tmp/task-4.1-affected-regression3.log; exact argv in the JSON). Fresh core/SQLite/backend/contracts TypeScript roots passed with --force; scoped ESLint and Prettier passed; OpenSpec passed343/343, including after the4.1 checkbox; module/source conformance passed100/0,7727 assertions in135.53s (/tmp/task-4.1-conformance-final2.log). Migration-lint cases run through the affected regression. git diff --check passed. A previous incremental TypeScript zero was superseded by forced compilation that found/fixed a required auditId fixture and a readonly test mutation; no incremental zero is credited as the final contract check.

The first1149/143 diagnostic run overlapped two finally-restored faults and remains UNVERIFIED. The clean1281/11 run failed real exact-ledger/historical-fixture expectations; targeted repairs advanced through two11/1 attempts to12/0 before the clean full repeat. Historical directory-capacity vocabulary is pinned to its actual28/10 epoch, and the orphan-role negative constructs its older grant epoch before injecting corruption, preserving the newer audit rebuild's FK guard. No production admission or rollback guard was weakened. The final inventory is83 paths; an earlier80-path comparison omitted three authorized fixture repairs and was corrected rather than credited as a full hash comparison.

Only4.1 closes. Parent2.4, membership2.5, remaining role cleanup2.4b, later grant/group/operator/read routes and #698 remain open. Canonical host gate, full Nx build, browser/e2e, live DNS/provider actions and deployment were not run for this component checkpoint; no activation or deployment is claimed.

## Current-grant membership and initial access (2.5), 2026-11-10

Membership list/removal now authorizes the actual authenticated principal on the current owner connection: organization.read for listing, manage_members for removal, and additionally manage_organization_roles for a target's direct user organization-kind grant, including org-viewer/custom organization roles. Group-derived authority is not direct-holder evidence. Member DTOs report the validated organization-kind permission union/provenance or null and distinct applicable all-scope account grant counts without package IDs. The changeMemberRole route/shape/client operation is retired; compatibility storage/raw fixture helpers remain for2.4b.

Invitations/approvals offer only org-admin, org-viewer, project-contributor, project-viewer or no initial access. Delegation refusal keeps first precedence, the credential cap remains fixed, and current manage_members plus kind-specific grant permission/full-set subset checks govern initial grants. A membership clerk may cancel any pending offer without removing an actual grant. New-member acceptance rechecks the durable personal issuer even for none; issuer owns grant/audit, recipient owns membership/consumption, and existing members consume without upgrade. Acceptance resamples its completion clock after awaited checks without rewriting issuance provenance. Creator bootstrap inserts organization, membership, a direct built-in org-super-admin grant and its creation audit atomically; non-creators receive no automatic grant.

CP14 post-write checks count only current members with direct user built-in org-super-admin grants on the same owner connection. Member/self-leave/SCIM, grant/group and credential/pool/issuer/directory removal families roll back to typed409 when none remains. Rollback aggregates stay unexpected; directory checks every affected credential organization, including zero-grant/revoked rows. Deliberately separate pool cleanup owners preserve the committed revocation and expose the later conflict cause. Backend consent409 becomes MCP blocked state with durable pending end unacknowledged; local revoked/expired families remain denied until operator repair permits exactly one backend revoke/audit/ACK.

ADR0081's additive explicit-selection migration preserves historical/old-writer intent and guards rollback over all history. A real two-key missing-kind envelope exposed SQL NULL behavior: exact RED0/1 observed destructive rollback, NULL-safe kind checks passed all16 migration cases, and refreshed14 fault proofs include that boundary. Task6.4 explicitly requires quiescing outgoing mutations before migration and retiring/draining outgoing authorization readers and existing WebSocket sessions before upgraded grant semantics are exposed. The compatibility trigger alone does not establish rollout safety.

[The self-contained2.5 record](verification-2.5.json) captures151 implementation source hashes, runtime/documentation epochs,22 exact fresh check commands/log hashes and139 unique successful fault experiments:32 offer snapshot/current-authority,23 P11/cap/issuer/creator,12 CP14 chain,9 trusted-catalogue/count dependencies,17 refreshed member foundation,23 owner/rollback/provenance,14 migration and9 frontend. Every current success has a named RED failure/restored GREEN, diagnostic and equal restoration hashes. The old19 checkpoint is superseded rather than double-counted. Two diagnostic-checker false rejections, a zero-test selector, an isolated runner parse failure and a genuine polymorphic-ID survivor remain excluded with genuine logs. Two automatically rejected persistent weakening proposals changed no source: scope predicates and the retained creator clone remain. Column/binding dependency evidence is accurately distinguished from removed-predicate or healthy-row isolation proof.

Astra independently reviewed the source,139 proofs, final151 hashes and actual log metadata; root independently verified exact151 changed paths/hashes with no staged/unknown/drift.31 proof-era source snapshots were reconstructed to exact original hashes rather than presented as archived originals;29 proof-bearing TypeScript runtime bodies remained unchanged through the documented comment/import/type cleanup, with the later SQL NULL correction separately proven. No reviewer execution of the complete suite is claimed.

Fresh coherent affected regression:2172passed/0failed,33102assertions,126files879.95s (/tmp/task-2.5-affected-regression-final3-errors.log). All changed non-frontend testfiles are included. Frontend7files passed76/0; module/SQLite source conformance passed100/0,7727assertions119.14s. All six affected TypeScript solution roots passed freshly with --force;143 code files passed scoped ESLint in10 Bun-direct batches. Formatting, migration lint, OpenSpec343/343 and git diff --check passed. Only the task2.5 checkbox changed after the coherent runtime freeze, followed by fresh task formatting/OpenSpec/diff checks; parent2.4 remains unchecked.

The original80-file run failed1293/52. The first126 final attempt was intentionally interrupted exit143 before the SQL fix; no coherent passing credit. A complete126 repeat failed2153/19,32969assertions932.69s: historical epoch/order/count expectations, one missing direct-holder positive and stale ignored MCP preparation. Precise per-test grants and epoch-pinned fixture repairs preserved all denials; the normal Nx preparation target refreshed the document. Cleanup targeted11 advanced through369/2 to final two-file61/0 before the full clean repeat. Initial bunx lint exhausted Node's4GB heap and received no lint credit; Bun-direct lint then found85 real style/type diagnostics, all corrected. Earlier forced compile/scenario/UI/consent-cleanup failures are explicit in the JSON; filenames containing green do not substitute for actual results.

Only2.5 closes. Parent2.4/2.4b still owns the full legacy-reader/helper cleanup and the historical AccessDecisionRepository.effectiveRoleAt/list INNER JOIN orphan-catalogue omission; this slice fixes only its new readers. Later grant/group/operator/read routes, full permission-driven UI, #698 and rollout6.4 remain open. Canonical h2/h4 gate, whole CI/build, browser E2E and live deployment were not run. Local component verification and branch publication do not close the whole goal.
