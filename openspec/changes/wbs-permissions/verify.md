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
