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
