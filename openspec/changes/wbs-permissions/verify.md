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
