## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only; nothing is implemented. S1 to S12 in
design.md are assumed, awaiting Dany. Amended the same day after two Fable reviews of PR #737
(first pass: eight S2 and eight S3 findings; second pass at `882ca2169`: three S2 and the
S3 list).

Sources read on 2026-10-25 on `main` at `2ca06fcf1`: `wbs-resources` (proposal, design R1 to
R8a, `resource-occupancy`, `startable-work` and `schedule-resources` specs, tasks),
`compute-providers` (proposal, P3 to P7, `compute-provider` spec), `wbs-organization-limits`
(proposal, L1, L2, `organization-limits` spec), `wbs-permissions` (proposal),
`wbs-team-claims` (D5), `wbs-claim-leases` (L7), ADR 0015, `space.resource.ts`
(`RollUpCache.keyOf`), `directory.resource.ts` (`announce`), domain and core
`organization-access.ts` (`canEditProjectInOrganization`, `mayEditProjectWithin`,
`mayRemoveResourceInOrganization`), store-sqlite `organization-access.ts` (delegations keep
their role, `delegated: true`), `saved-plan-capture-values.ts` (`PlanInputReads`),
`organization-limits-shapes.ts`, `organization-route-inventory.ts`,
`libs/wbs/domain/domain/src/occupancy.ts`, `canonical-schedule-input.ts`,
`libs/wbs/adapters/store-sqlite/src/claim.ts` (`occupancyOf`), `schema.ts` (`resource`,
`project_resource_capacity`, `claim_occupancy`, `resource_organization`), `gate.ts`
(`WriteCoordinator`), `command-references.ts` 103 to 123, `working-plan.resource.ts`
(`assertProject`, the lazy claim-store reads), the claim, release and `withClaimsRestored`
paths in `work-item.resource.ts`, `startable-shapes.ts`, `refusal.ts`, and the audit
migrations `20261022140100_widen_organization_audit_compute_providers`. Read only, not on
`main` and not modified: `openspec/changes/wbs-resource-release` in the main checkout
(proposal lines 23 and 32, design lines 39 and 181 to 182, `resource-release` spec lines 126
to 127).

Evidence of the gap: the swarm rehearsal of 2026-10-25, check 4 (`g4-multi.ts`,
`evidence.log` phases 4a to 4c, outside the repo): B read `host ram [16, 0, 16]` while A held
16; a 16 GB claim in B answered 200; `staging` was claimed in A and B at once.

Already proven on `main`, not re-tasked: a plan cannot name another organization's resource
(`refuses a foreign resource exactly as an absent one`, `refuses a claim asking for a foreign
resource exactly as an absent one`, `resource-organization.controller.db.test.ts`).

Known gaps, stated:

- The S5 redaction has no production-path negative until a `wbs-permissions` grant can deny
  a project; task 4.1's negative runs through the access port seam only.
- `openspec validate` reports that archive would refuse the MODIFIED deltas of
  `startable-work`, `schedule-resources`, `organization-limits` and `compute-provider`
  until those capabilities' main specs exist (task 0.3).

## Commands

Run on the worktree with this change staged, 2026-10-25:

- `./node_modules/.bin/openspec validate wbs-shared-occupancy --strict` → `Change
'wbs-shared-occupancy' is valid`, exit 0, plus four `[INFO]` lines that archive would refuse
  the MODIFIED deltas until their capabilities' main specs exist (task 0.3).
- `./node_modules/.bin/openspec validate --all --json` → exit 0, totals
  `{ items: 290, passed: 290, failed: 0 }`.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`
  → exit 0; its one `reviewDebt` entry (`libs/wbs/adapters/store-memory/src/README.md`, 51
  entries over 40) predates this change.
- `bunx prettier --check openspec/changes/wbs-shared-occupancy CONTEXT.md` → "All matched
  files use Prettier code style!", exit 0.

## What must be observed before each slice is called done

Each task's fault line, watched failing with the check removed, with its `Proof:` comment
beside the check and the command output recorded here.

## Implementation record (branch `feat/wbs-shared-occupancy-1`, built on assumed S1 to S12)

All commands run in the worktree with `env -u CLAUDECODE` (the Bun output tests misreport
under `CLAUDECODE=1`). Only targeted files ran; the full suites are CI's.

### Slice 1.0 and 1.1: the two migrations

`20261025140000_widen_organization_audit_directory_capacity` and
`20261025140100_add_resource_directory_capacity`, each with a guarded `down.sql`.

- `bun test apps/wbs/be-01/src/directory-capacity-migration.db.test.ts` → 8 pass, 0 fail.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` over both folders' four files →
  exit 0; `migration-lint.test.ts` gained `accepts the directory capacity audit rebuild`.
- Every test pinning the newest migration or listing the reversal order (45 files: be-01
  migration tests and store-sqlite `*.db.test.ts`) gained the two names; run together →
  750 pass, 3 fail, the three table-list expectations (`calendar-marker-migration`,
  `organization-records`, `optimized-schedule-cache`), which then gained
  `resource_directory_capacity` → 54 pass, 0 fail.

R5 proofs, each fault injected into the file, the test run, the file restored:

| Fault                                                               | Observed                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `compute_provider_removed` dropped from the forward rebuild's CHECK | `keeps one row of every earlier action and subject kind through the rebuild` failed: `runMigrations` threw on the copy |
| audit `down.sql` guard filter replaced by `WHERE 0`                 | `refuses rollback over one directory capacity audit row` failed: the narrow table's `CHECK constraint failed: action`  |
| `typeof` half of the table CHECK removed                            | `refuses a negative or a text directory capacity` failed: `'sixteen'` was stored                                       |
| table `down.sql` guard comparison made `>= 0`                       | `refuses rollback over a stated directory capacity, keeping it` failed: the rollback exited 0                          |
| forward fk guard `CHECK (violations = 0)` made `CHECK (1)`          | `accepts the directory capacity audit rebuild` failed: `contains destructive statement: DROP TABLE`                    |

A text `'16'` is not refused by the database: the column's INTEGER affinity stores it as
16 (as `project_resource_capacity` does). The CHECK's `typeof` refuses text that is not an
integer; the command boundary refuses every non-integer before SQL.

### Slice 2: both scopes in one check

`refuseOccupancy` and `ClaimRequest` take `directoryCapacities` and `organizationOccupancy`
(required, so no caller can forget them); a shortage carries `scope` exactly when its
resource states a directory capacity, so a resource with none refuses byte for byte as
before (the reading of "no change" this slice takes; S3's `scope: 'project'` appears on
the ceiling case under a stated directory capacity). The existing suites changed only by
the two empty inputs added to their request builders; no assertion moved.

- `bun test libs/wbs/domain/domain/src/claim-shared-occupancy.test.ts
libs/wbs/domain/domain/src/claim-occupancy.test.ts libs/wbs/domain/domain/src/claim.test.ts`
  → 83 pass, 0 fail.
- `bunx nx run-many -t typecheck -p wbs-domain wbs-core --skip-nx-cache` → exit 0.

| Fault                                                          | Observed                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| the organization scope skipped in `refuseOccupancy`            | `claim-shared-occupancy.test.ts` 3 pass, 5 fail; the model run's counterexample: directory 0, one claim of 1 in project 0 |
| the model run passing the project's rows as the organization's | counterexample `directory 12`: a claim of 1 in project 1, then 12 in project 0 (13 of 12)                                 |
| an unstated directory capacity read as 0                       | `claim-occupancy.test.ts` 6 pass, 12 fail                                                                                 |

### Slice 3: store and command path (3.1 to 3.4)

`ClaimStore.organizationOccupancyOf(resourceIds)` on SQLite (joined
`claim → work_item → project_organization` and to the resource's own
`resource_organization` row on the same organization) and on the memory twin
(`projectOrganization` and `resourceOrganization` maps beside the claims). The working plan
reads it unfenced and uncached through `scope.stores.claims`; the claim and every re-acquire
(redo of a claim, undo of a release, a cascading release and a delete) read the stated
directory capacities (`DirectoryStore.directoryCapacitiesOf`) and, only when one is stated,
the organization's rows, both on the batch's own stores after its turn. A refused re-acquire's
`stale_undo` detail ends `across the organization.` or `in this project.` only for a resource
with a directory capacity. 3.1's "a working plan sees its own batch's earlier claim" is the
two-leaf batch case of `shared-occupancy.db.test.ts`, run on both stores. The deleteResource
count of a directory capacity and `setDirectoryCapacity` at the store are in place here and
tested with slice 1.2.

- `bun test libs/wbs/adapters/store-sqlite/src/shared-occupancy.db.test.ts` → 22 pass, 0 fail
  (11 cases on each store).
- `bun test libs/wbs/adapters/store-sqlite/src/claim-occupancy-cross-project-race.db.test.ts`
  → 3 pass, 0 fail (one process both orders; two workers on two connections).
- Memory certification (`store-memory/src/testing/source-conformance.test.ts`) and the
  conformance package tests → 101 pass, 0 fail; SQLite certification
  (`store-sqlite/src/testing/source-conformance.db.test.ts`) → 75 pass, 0 fail; both now run
  `claims.occupancy:organization-scope`.
- `bun test` of `store-memory/src/source-conformance.test.ts` and
  `store-sqlite/src/sqlite-unit-of-work.db.test.ts` → 14 pass, 0 fail, case (m) on both.
- The claim, lease, limit, observation, occupancy, resource and startable suites of
  store-sqlite, the claim, resource, binding and working-plan suites of core, and the memory
  directory and source suites (23 files) → 392 pass, 0 fail.
- Contracts and mcp-01 document tests (31 files) → 208 pass, 0 fail; be-01 OpenAPI tests → 6
  pass.
- `bunx nx run-many -t typecheck -p wbs-domain wbs-core wbs-store-memory wbs-store-sqlite
wbs-contracts wbs-conformance` → exit 0.

| Fault                                                                                           | Observed                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the claim path passing `organizationOccupancy: []` to `decideClaim`                             | `shared-occupancy.db.test.ts` 14 pass, 8 fail: B's 16 GB, staging, the two-leaf batch and the lease case on both stores                                                                     |
| the re-acquire path passing no organization rows                                                | 14 pass, 8 fail: undo of a release, redo of a claim, undo of a delete (refused world), cascading release, on both stores                                                                    |
| a cascade's admitted leaves not joining the organization snapshot                               | 20 pass, 2 fail: `refuses an undo of a cascading release leaf by leaf across projects` on both stores                                                                                       |
| the batch's organization read routed to the public store's observation connection (3.1 b)       | SQLite: 21 pass, 1 fail: the two-leaf batch answered `ok: true`, 20 of 16                                                                                                                   |
| every batch's organization read answered by rows read before either took its turn (3.1 a)       | race test: both one-process orders failed, both claims stored                                                                                                                               |
| the organization check skipped (no directory capacity read)                                     | race test: the two-connection case answered `applied`, `applied`; the one-process cases hung on `await queued` (5 s timeout) rather than asserting, corrected after review S3-3 (see below) |
| `scope` left out of the binding's refusal detail                                                | 14 pass, 8 fail on the organization- and project-scope cases                                                                                                                                |
| memory twin's organization comparison dropped                                                   | memory certification: `claims.occupancy:organization-scope` failed (74 pass, 1 fail)                                                                                                        |
| SQLite join to the resource's organization dropped                                              | SQLite certification: `claims.occupancy:organization-scope` failed (74 pass, 1 fail)                                                                                                        |
| the memory coordinator granting every turn at once (a lock covering less than the organization) | unit-of-work (m) failed: the second act started while the first held its turn (6 pass, 1 fail)                                                                                              |

ADR 0015 carries the amendment "a check that reads across projects needs the source's lock to
cover the organization", marked assumed with S4.

### Slice 1.2 to 1.5: the command, its announce, the preview, the inventory

`setDirectoryCapacity { resourceId | resourceRef, units | null, confirm?: true }`, scope
`directory`, accepted on both command routes through `DirectoryService.setDirectoryCapacityWithin`,
whose role check is `mayStateDirectoryCapacityInOrganization` on the role `organizationRoleOf`
answered (no `scope.delegated` check, as R8a's removal). The project resources read carries
`directoryCapacity` on each resource; `deleteResource`'s `in_use` counts carry it and the
cascade drops it. `POST /api/organization/resources/:resourceId/directory-capacity/preview`
answers S12's shape (`hiddenProjects` is `{ count: 0, units: 0 }` until 4.1's port can deny a
project; `refusal` is null until 7.1's cap check exists). `confirm` is accepted and carried,
read by nothing until 7.1. The preview is an MCP tool (92 tools); the README and the pinned
operation list say so. The composed test harness gained `delegationKey` (MCP delegations, with
consent credentials read live as `boot.ts` reads them) and `delegationFor` an optional consent.

- `bun test apps/wbs/be-01/src/controller/directory-capacity.controller.db.test.ts` → 11 pass,
  0 fail (both routes, every role, an admin's agent key, an admin's own MCP session, an MCP
  consent acting as the admin's agent, audit, removal counts, preview, lowering).
- `bun test libs/wbs/application/core/src/module/plan-commands/directory-capacity-command.test.ts` (since moved to `module/directory/directory-capacity.test.ts`)
  → 3 pass, 0 fail (memory twin: commit, `organization_required`, the announce).
- Memory and SQLite certifications with `directory.setDirectoryCapacity:state-clear-remove`
  → 101 pass and 75 pass, 0 fail.
- be-01: `resource-organization`, `compute-provider`, `organization-context`, `app.routes`,
  OpenAPI document tests, and ten claim, limit, lease, schedule and swarm suites → 41 + 98 + 15
  pass, 0 fail (the two resource read expectations gained `directoryCapacity: null`).
- mcp-01 `openapi-tools.test.ts` and `generated-document.test.ts` → 45 pass, 0 fail.
- `bunx nx run-many -t typecheck -p wbs-domain wbs-core wbs-store-memory wbs-store-sqlite
wbs-contracts wbs-conformance wbs-be-01 wbs-mcp-01 wbs-fe-01 --skip-nx-cache` → exit 0 (a
  cached run had earlier answered exit 0 over a shape `defineEndpointShape` refused; the
  uncached run and `tsc -p libs/wbs/application/core/tsconfig.lib.json` found it, and the
  preview's two 403 arms were split as the compute-provider shapes split theirs).
- `bunx nx run-many -t lint -p wbs-domain wbs-core wbs-store-memory wbs-store-sqlite
wbs-contracts wbs-conformance wbs-be-01 wbs-mcp-01 tool-git-hooks` → exit 0.

| Fault                                                                          | Observed                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| the role check skipped in `setDirectoryCapacityWithin`                         | controller test 8 pass, 3 fail: member and viewer, the admin's agent key, the MCP consent as an agent                 |
| the stored role in place of `organizationRoleOf` in `SqliteOrganizationAccess` | 8 pass, 3 fail: the agent key, the MCP consent, the preview's agent case                                              |
| the audit append skipped in SQLite                                             | 10 pass, 1 fail: `writes one audit row per change, never a journal entry`                                             |
| the organization refusal removed in SQLite                                     | SQLite certification `directory.setDirectoryCapacity:state-clear-remove` failed on the audit insert (74 pass, 1 fail) |
| the organization refusal removed in the memory twin                            | memory certification, the same case failed (74 pass, 1 fail)                                                          |
| SQLite's usage answering `directoryCapacity: null`                             | the same SQLite case and `refuses removing a resource with a stated directory capacity` failed                        |
| the memory twin's removal ignoring the directory capacity                      | memory certification, the same case failed                                                                            |
| the memory commit copy of directory capacities removed                         | `states and clears a directory capacity with its batch` failed (2 pass, 1 fail)                                       |
| the announce skipped                                                           | `announces directory_changed to every project that states or demands the resource` failed                             |
| the resources read answering null                                              | `states a directory capacity on either route and reads it from both projects` failed                                  |
| the preview's role check skipped                                               | `refuses a member and an admin's agent the preview` failed                                                            |
| the preview writing before answering                                           | `previews a lowering of 16 to 10 with A at 8 and B at 6, writing nothing` failed                                      |
| the preview's inventory entry removed                                          | `organization-context.controller.db.test.ts` `covers every mounted organization mutation` failed (7 pass, 1 fail)     |

Not proven here: the spec's roll-up scenario for 1.3 (a space roll-up recomputed against the
clamped pool) needs 6.1's clamp; the announce half is proven above.

### Task 3.5: the measurement (recorded, not yet passed)

`bun libs/wbs/adapters/store-sqlite/src/testing/measure-shared-occupancy.ts`: 50 projects of one
organization, 20 standing claims each of `host ram` (two claim rows per leaf, one per step),
200 claim batches with a directory capacity stated and 200 without, alternated, on the
author's laptop with another heavy agent possibly running. Four runs, 2026-10-25 (the fourth after a lint-only edit
of the script):

| Run | stated p50 / p99 (ms) | unstated p50 / p99 (ms) | added at p99      |
| --- | --------------------- | ----------------------- | ----------------- |
| 1   | 19.432 / 28.075       | 15.584 / 23.289         | 4.786 ms, 20.55 % |
| 2   | 21.201 / 42.988       | 17.132 / 36.137         | 6.851 ms, 18.96 % |
| 3   | 19.519 / 28.125       | 15.512 / 23.805         | 4.320 ms, 18.15 % |
| 4   | 23.162 / 43.724       | 18.516 / 42.250         | 1.474 ms, 3.49 %  |

The percentage bound (25 %) held in all four; the 5 ms bound was crossed once (run 2, a
noisy p99), and the median cost is a steady 4 ms: the organization read answers every
standing row (about 2,000) and the check folds them in JavaScript. By the task's own rule
the remedy comes first: a per-resource sum query (units per leaf summed in SQL, holders read
only for a refusal) or the index `claim_occupancy (resource_id, claim_id)`. 3.5 stays open.

### Before the push

- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`
  → exit 0 once `directory-capacity.test.ts` joined the plan-commands module index
  (first run: `unindexed candidate path`, exit 1). Its `reviewDebt` now names two indexes:
  `libs/wbs/adapters/store-memory/src/README.md` (51 over 40, earlier) and
  `libs/wbs/application/core/src/module/plan-commands/README.md` (41 over 40, this change's
  new test).
- `./node_modules/.bin/openspec validate --all --json` → exit 0, totals
  `{ items: 290, passed: 290, failed: 0 }`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` over every `.sql` the branch
  changes → exit 0.
- `bunx prettier --check` over every changed `.ts`, `.tsx`, `.md`, `.json`, `.mjs` and `.yml`
  → "All matched files use Prettier code style!".
- tool-devsync `adr-index`, `module-labels`, `namespace-layout`, `eslint-boundaries`,
  `product-constraints`, `current-documents`, `check-documents-target`,
  `workspace-inventory`, `workspace-projects` and `test-levels` tests, after the index commit
  → 211 pass, 0 fail (before it, `check-documents-target` failed 5 on the unindexed test).

Not run: the full suites, `bin/h2puni-gate.sh` (CI and the gate host own them, and the laptop
cap allows two heavy agents), the mcp-01 boot tests and `swarm-rehearsal.boot.db.test.ts`
(they boot processes), and fe-01 tests (fe-01 is untouched beyond its typecheck, which
passed).

## Review of #745 (Fable, at `7a26feb86`), addressed 2026-10-25

- **S1-1 done.** Merged `origin/main` (#735, `a403db487`). The two migrations are restamped
  `20261025140000_widen_organization_audit_directory_capacity` and
  `20261025140100_add_resource_directory_capacity`, after #735's `20261025120000` and
  `20261025130000`; every constant, comment and pinned list follows (46 test files). New
  case `is stamped after every folder that existed when it was written, colliding with none`
  in `directory-capacity-migration.db.test.ts`; Proof: with the widening folder renamed back
  to `20261025100000`, it failed (0 pass, 1 fail). The migration's rollback tests now target
  `20261025130000_add_resource_runtime`.
- **S2-1 done.** `removeResource` keeps #735's `(usage.outstandingUses ?? 0) > 0` refusal
  under cascade and counts `usage.directoryCapacity !== null` as in use; contracts
  `http/shapes.ts` imports both; mcp-01 README says 101 tools. The six superseded sentences
  of `wbs-resource-release` (proposal 23 and 32, design 34, 42 and 184 to 185, spec 126 to 127) carry pointers to S9 (the spec sentence an explicit exception); S9's inventory and
  the design's "not on `main`" are corrected; task 0.2 stays open.
- **S2-2 done (the fit half of 5.1).** `startableWithin` reads the same directory
  capacities and organization units as the claim, over every demanded resource, and reads
  the resource catalog when only a directory capacity is stated; `exhausted` carries `scope`
  for such a resource; `startable-shapes.ts`'s description now says which fit counts across
  the organization. Test: `agrees with the claim across projects` (both stores). Proofs:
  with empty organization inputs in `findStartableWork`, 24 pass, 2 fail (that case on both
  stores); with the catalog read only on a project capacity, the same two failed.
- **S2-3 done; 3.5 still open.** `ClaimStore.organizationUnitsOf` sums each leaf's largest
  copy per resource in SQL (no rows, no ORDER BY) and the check subtracts the asking leaf's
  own units, which it always reads in the project's rows (equivalent to excluding it in SQL,
  and one query serves every leaf of the startable read). Holders and their names are read
  only when a shortage is found (`refusedWithHolders`); `personNamesWithin` filters through
  a `Set`. Proofs: with the units withheld from `decideClaim`, `shared-occupancy.db.test.ts`
  16 pass, 10 fail; with the organization holders left unread, the naming case failed on
  both stores (24 pass, 2 fail). Re-measured under scoped access, every claim by an agent of
  its own (about 1,400 persons in the organization), three runs:

  | Run | stated p50 / p99 (ms) | unstated p50 / p99 (ms) | added at p99       |
  | --- | --------------------- | ----------------------- | ------------------ |
  | 1   | 32.521 / 48.010       | 29.988 / 47.530         | 0.480 ms, 1.01 %   |
  | 2   | 31.960 / 46.652       | 29.716 / 43.413         | 3.239 ms, 7.46 %   |
  | 3   | 39.873 / 83.689       | 37.016 / 67.227         | 16.462 ms, 24.49 % |

  Three more at load average 4 to 5: 2.597 ms p50 delta with p99 48.253 / 41.560 (6.693 ms,
  16.10 %), 44.794 / 45.020 (−0.226 ms), 48.136 / 45.503 (2.633 ms, 5.79 %). With 200 runs
  each, p99 is the second-largest sample, so one slow batch moves it by several ms.

  The median cost fell from about 4 ms to about 2.5 ms; run 3 crossed 5 ms at p99 with the
  host's load average at 14 to 17 (another agent's suites), and run 4 crossed it at load 5.
  By the task's rule 3.5 stays open: two of six runs crossed 5 ms; the 25 % bound held in
  all six. Next: more runs per side (p99 over 200 is two samples) on a quiet host, then the
  index if it still crosses.

- **S3-1 done.** Legacy access is refused `organization_required` before any read. Test:
  `refuses legacy access organization_required, writing nothing`
  (`module/directory/directory-capacity.test.ts`); Proof: with the refusal replaced by the
  store write, 3 pass, 1 fail. The memory twin's scoped path needed `projectsOutside`
  (modelled now in `memory-stores.ts`; Proof: removed, 2 pass, 2 fail on `no project
ownership`); the test drives the service in one unit of work, since the memory source
  admits no scoped runner batch.
- **S3-2 done by rewording.** Case (m) is `excludes any concurrent batch for the length of
its turn`; it, ADR 0015's amendment and task 3.3 now say it proves the store-wide turn
  every source has, and that the per-project fault needs `UnitOfWork.run` to take a key first.
- **S3-3 done.** The one-process race cases wait on `queued` at most 2 s and assert it.
  Proofs: with every batch answered stale units, both orders failed (20 of 16); with the
  directory capacity withheld from the decision, the same; with the organization read
  skipped altogether, both failed on `reachedInTime` in about 2 s instead of hanging. The
  earlier record above is corrected.
- **S3-4 done by dropping.** The memory twin keeps no `directoryCapacityAudit`; SQLite's
  audit row is proven by the controller test.
- **S3-5 done.** A holder in another project carries `projectId` (domain `OccupancyHolder`,
  contracts `OccupancyRefusalHolder` and the wire `occupancyHolder`); asserted in `refuses B’s
16 GB …`. The 404 trap is gone for organization members; redaction stays 4.1's.
- **S3-6/7 done.** `docs/runbook-prod-deploy.md` _Directory capacity_ and
  `docs/runbook-dev-deploy.md`: state capacities only after the swap or restart completes;
  the table's rollback needs every capacity cleared; once any was written the audit rows stop
  the rollback at the widening, completed with
  `migrate-down-cli.ts --to=20261025140000_widen_organization_audit_directory_capacity`.
  Task 7.4's operator half stays open.
- **S3-8 done by throwing.** Both stores throw when a resource some organization owns is held
  in a project of no organization; a project of another organization stays filtered. Test:
  `throws on a holder in a project of no organization` (both stores). Proofs: with SQLite's
  throw removed, 25 pass, 1 fail (sqlite); with the memory twin's, 25 pass, 1 fail (memory).
- The plan-commands README is back under 40 entries: the memory test moved to the directory
  module. A pin this change missed in the first round: `plan-command-shapes.test.ts`
  counted 61 command branches; now 62.

Commands after the review (targeted only):

- `bunx nx run-many -t typecheck -p wbs-domain wbs-core wbs-store-memory wbs-store-sqlite
wbs-contracts wbs-conformance wbs-be-01 wbs-mcp-01 wbs-fe-01 --skip-nx-cache` → exit 0
  (after one test-literal fix).
- `bunx nx run-many -t lint` on the nine affected projects → exit 0.
- The 46 migration-pinning and capacity test files → 765 pass, 0 fail.
- `store-sqlite/src/testing/source-conformance.db.test.ts` rerun alone at load 5 → 75 pass,
  0 fail; tool-devsync `check-documents-target`, `adr-index`, `current-documents` → 25 pass.
- Core, store, domain and conformance suites (30 files) → 613 pass, 6 fail: all six in
  `store-sqlite/src/testing/source-conformance.db.test.ts`, each `timed out after 5000ms`
  at load average 14 to 17; alone, the file went 73 pass, 2 fail, and of those, `reinjects
the existing add, rename …` passed alone (4,550 ms) while `Task 6.3 observes each
saved-plan capture boundary fault` timed out alone (5,947 ms). Neither touches this
  change's code; not proven green here.
- be-01, mcp-01, contracts and migration-lint suites (41 files) → 376 pass, 1 fail (the
  branch-count pin), then 5 pass after the fix.
- `check-indexes working . HEAD` → exit 0; review debt: only the store-memory README (51
  over 40), which predates this change.
- `openspec validate --all --json` → `{ items: 293, passed: 293, failed: 0 }`.
- Migration lint over every `.sql` the branch changes → exit 0. Prettier → clean.
