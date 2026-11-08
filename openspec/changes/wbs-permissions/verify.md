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
