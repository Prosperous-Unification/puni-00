# Verify: wbs-permissions

Commands, results and R5 proofs, per task. Tasks 1.1 and 1.2 also carry
`wbs-custom-permissions` 1.1 and 1.2; that change's verify.md points here.

## 1.1 Migration `add_access_grants` (2026-10-25, branch `feat/wbs-permissions-1`)

`apps/wbs/be-01/drizzle/20261025100000_add_access_grants/{migration,down}.sql`, test
`apps/wbs/be-01/src/access-grant-migration.db.test.ts` (17 cases).

| Command                                                                                       | Result                           |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| `env -u CLAUDECODE bun test src/access-grant-migration.db.test.ts` (be-01)                    | 17 pass, 0 fail                  |
| `env -u CLAUDECODE bun test --timeout=30000` (store-sqlite, every migration stack list moved) | 1904 pass, 0 fail, 145 files     |
| `env -u CLAUDECODE bun test .db.test.ts --timeout=30000` (be-01) then the five CLI-list files | 2470 pass; the 5 refixed: 0 fail |
| `bun tools/tool-git-hooks/src/hooks/migration-lint.ts` on both scripts                        | exit 0                           |

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
| owner INSERT's membership EXISTS removed                                      | writes package-manager for owners who are current members only                   |
| credential copy's cap CASE replaced by `g.role_id`                            | copies a bound account’s rows to its live credentials capped at contributor      |
| down guard: non-backfill grant count made `0`                                 | refuses rollback over one route-origin grant, keeping it (the grant was deleted) |
| down guard: access group count made `0`                                       | refuses rollback over one access group (the group was deleted)                   |
| down guard: custom role count made `0`                                        | refuses rollback over an ungranted custom role (refused under the row guard)     |
| down guards: custom role and permission-row counts both `0`                   | refuses rollback over an ungranted custom role (role and rows deleted)           |
| down guard: permission rows of no built-in made `0`                           | refuses rollback over a permission row of no built-in role (orphan deleted)      |

Moved alongside: every store-sqlite and be-01 test that enumerates the migration stack
gained `20261025100000_add_access_grants`; `step.db.test.ts`'s "role nowhere" sweep names
the access role objects and `access_grant.role_id`, `access_role_permission.role_id` as
exemptions by exact name; three table sweeps skip `access_*`.

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
