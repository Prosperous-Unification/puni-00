## Verification record

Drafted 2026-10-22 as an OpenSpec proposal only; nothing is implemented. A1 and the owner's
gap-2 decision (caps on agent persons, concurrent claims and declared capacity; typed
refusals; billing later) are fixed; L1 to L16 in design.md are assumed until Dany reads
them. Sources read on 2026-10-22 on `main` at `d504c9eae`: `wbs-team-claims` (D1 to D8, the
`plan-command-registry` delta, `claim-race.db.test.ts`), `wbs-resources` (R1 to R8, the
`resource-occupancy` and `resource-directory` deltas, `occupancy.ts`),
`wbs-machine-credentials` on `plan/wbs-machine-credentials` (A23, slice 2 as built, the
`20261022110000` audit rebuild), `organization-enterprise-sso` (session policy design,
`organization-session-policy` and `organization-audit` specs), `schema.ts` (`person`,
`claim`, `project_resource_capacity`, `organization_membership`, `organization_audit`,
`organization_session_policy`, the `<root>_organization` side tables), `gate.ts`,
`sqlite-unit-of-work.ts`, `claims.ts`, `claim.ts`, `capacity.resource.ts`,
`directory.resource.ts` (`addPersonWithin`), `command-bindings.ts`, `definitions.ts`
(`createPerson`, `patchPerson`), `session-policy.routes.ts`, `session-policies.ts`,
`session-policy.ts`, `config.ts`, `organization-page.tsx`, `session-policy-panel.tsx`,
`refusal.ts` (`Quota`), issue #632.

Term collisions checked in `CONTEXT.md`: **Resource capacity** lists _quota_ and _limit_
under its avoided names, so the cap is **Organization limits**, never a quota or a
capacity; `Quota` in `refusal.ts` stays the per-request body and plan-size refusal and is
named a non-goal; **Allowance** is an estimate term and is avoided; **Claim** is unchanged
and the counted unit is a **Bound claim**.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before any slice is called done

- Slice 1: a deployment missing one default variable does not boot and names it; a row with
  a null cap is refused by the CHECK; the rollback refuses over one row; B's agents never
  count for A; a four-step leaf under one run counts one bound claim; a member's read is
  `403 forbidden` and reads no usage.
- Slice 2: two concurrent promotions at 7 of 8 land one; renaming an agent at the cap is
  not refused; an import of three agents at 6 of 8 writes nothing; the legacy store admits
  without a read.
- Slice 3: `claim_limit` is answered only after every plan reason clears; two racing claims
  at 39 of 40 land one and the loser names 40; a redo at the cap is `stale_undo` with the
  `claim_limit:` detail; the second step of a held leaf under the same run adds nothing;
  the count's time on 1,000 claims is recorded.
- Slice 4: re-stating a project's own 48 of 64 is applied; `worktrees` are not refused for
  `h2puni ram`'s units; a re-import at 64 of 64 is applied; lowering under a lowered cap is
  applied.
- Slice 5: the failing audit write leaves no row; the widened table refuses an unknown
  action and its rollback refuses over one row; the lint names the destructive statement
  with the guard removed; a one-cap `set` on an organization without a row starts from the
  defaults; a cap set below usage warns and exits 0.
- Slice 6: the member's page renders no panel after one refused read; a switch of
  organization never shows the previous organization's numbers; every refusal message
  carries the body's numbers and no other.

## Slice 1 record (2026-10-22, branch `feat/wbs-organization-limits-1`)

Built: migration `20261022120000_add_organization_limits` with its guarded `down.sql`;
the three required `ORGANIZATION_DEFAULT_*` variables in `BeConfig`, `BootOptions` and every
environment file in the repository; `@wbs/domain` `organization-limits.ts` (bounds, shapes,
`isOrganizationLimit`, `refuseLimit`); `GET /api/organization/limits` (contracts shape, core
route and port `OrganizationLimits.read`, SQLite repository, boot and harness bindings, one
more MCP tool, 85 in all). Not built in slice 1: `set`/`reset` (slice 5) and the memory
twin with its conformance suite (slice 3); see task 1.4.

Fresh local results, all with `env -u CLAUDECODE`, on the laptop:

| Command                                                                                                                             | Result                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                        | 3085 pass, 3 skip, 0 fail, 212 files |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                 | 1812 pass, 0 fail                    |
| `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-core,wbs-store-memory --skip-nx-cache`                                    | all four succeeded                   |
| `bun test` in `apps/wbs/mcp-01`                                                                                                     | 460 pass, 0 fail                     |
| `bun test` on `docker.test.ts`, `swap.test.ts`, `swap-writer-barrier.test.ts`, `safety.test.ts` (tool-remote-scripts)               | 414 pass, 0 fail                     |
| `bunx nx run tool-bootstrap:test`                                                                                                   | 61 pass, 0 fail                      |
| `bunx vitest run --config vitest.node.config.ts playwright-config.test.ts` (fe-01)                                                  | 18 pass                              |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain`             | succeeded                            |
| `bunx nx run-many -t typecheck,lint -p wbs-be-01,wbs-mcp-01,wbs-domain,wbs-contracts,wbs-core,wbs-store-sqlite,tool-remote-scripts` | succeeded                            |
| `bunx nx run-many -t typecheck,lint -p wbs-fe-01,tool-deploy,tool-bootstrap,tool-secrets`                                           | succeeded                            |
| devsync `service-kinds`, `eslint-boundaries`, `workspace-targets`, `retired-roots`, `toolchain-pins` tests                          | 95 pass, 0 fail                      |
| `bun tools/tool-git-hooks/src/hooks/migration-lint.ts` on the new `migration.sql` and `down.sql`                                    | exit 0                               |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                         | exit 0                               |
| `bunx openspec validate --all --json`                                                                                               | 267 items, 267 passed                |

Review fixes (2026-10-22, after the Fable review of PR #638): `assertBeEnv` in
`tools/tool-devsync/src/sync.ts` refuses a dev deploy before reset when the be-01 `.env` lacks a
required key, its list held to `BeConfig` by a derivation test; the prod runbook states the
bundle-then-keys order; the dev runbook names the three lines; `sumStatedCapacity` now requires
the resource's organization as `readCapacityUsage` does; the member/viewer controller case is
renamed to what it asserts.

Gate fix (2026-10-22): the workspace gate of run 39724668881 failed two cases of
`swap-maintenance.db.test.ts`. Its spawned `bootBe01` script lacked `organizationDefaultLimits`,
and be-01 died as "undefined is not an object". The fixture now passes the defaults, and the
repository names absent defaults. `env -u CLAUDECODE bunx nx run tool-remote-scripts:test
--skip-nx-cache` (whole project): 789 pass, 2 skip, 0 fail, 43 files.

For Dany:

- The staging and prod overlays (and `configure.sh`) carry 50 / 200 / 10,000, which pins a plan
  in the repository; L7 meant the defaults to be an operator decision. Owner decision pending:
  keep them, or move the prod and staging values out to the deployment inputs.
- L8's machine principal `403 insufficient_scope`: no machine principal exists until
  `wbs-machine-credentials` merges. Under its A23 one is a `member` and would be answered
  `forbidden` by the role check. The route guard that answers `insufficient_scope` is added when
  machine credentials merge.
- Task 1.2's tick covers the repository only; the dev host's `.env` was seeded outside it.

Not run: the host gate (`bin/h2puni-gate.sh`), any browser level, `tool-deploy:test`, the
workspace-wide format check. Not observable on this branch: a machine principal (L8's
`insufficient_scope` for one) because `wbs-machine-credentials` is unmerged; the delegation
case is the one tested.

## Slice 2 record (2026-10-22, branch `feat/wbs-organization-limits-2`)

Built: `agent_person_limit { cap, current, added }` on `patchPerson` making an agent, on
`addPersonWithin` with kind `agent`, and on the plan import counting every new agent once,
all through `refuseLimit` in `DirectoryService.refuseAgentPersons`. The count is read through
a new store port `OrganizationLimitGauge` (`OrganizationLimitGaugeRepository` in
store-sqlite) that only the catalogs a unit of work admits carry, so it is read in the
batch's `BEGIN IMMEDIATE` under its write turn; the public catalogs carry none, and a
scoped acquisition through a graph without it throws. `openSqliteSource` takes the
deployment defaults (`organizationDefaultLimits`); boot and the organization harness pass
them. Legacy access reads nothing and refuses nothing. The memory source carries no gauge
(its twin is slice 3); the conformance manifest lists `organizationLimits` with no case and
both source declarations mark it absent. fe-01 words the import refusal with its numbers; the
batch refusal shows its code until slice 6. Deleting an agent frees a place in the same
batch when the delete comes first (commands apply in order). `createPerson` carries no kind,
so the directory-add arm of L9 is reachable only through the import until `createPerson`
gains `kind`. A cap of 0 refuses the first agent.

Fresh local results, all with `env -u CLAUDECODE`, on the laptop:

| Command                                                                                                                                                                                               | Result                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                          | 3098 pass, 3 skip, 0 fail, 213 files (after merging slice 1 at `9afa055b1`) |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                                                                                   | 1814 pass, 0 fail, 134 files (after the merge)                              |
| `bunx nx run-many -t test -p wbs-core,wbs-contracts,wbs-store-memory,wbs-domain,wbs-conformance --skip-nx-cache`                                                                                      | 1153, 495, 193, 1194, 35 pass; 0 fail                                       |
| `bun test` in `apps/wbs/mcp-01`                                                                                                                                                                       | 460 pass, 0 fail                                                            |
| `bunx vitest run src/components/wbs/plan-import-words.test.ts` (fe-01)                                                                                                                                | 14 pass                                                                     |
| `bunx nx run-many -t typecheck,typecheck:module` over wbs-core, -store-sqlite, -contracts, -store-memory, -domain, -auth, -gw-01, -mcp-01, -realtime, -runtime-portable, -conformance, -be-01, -fe-01 | succeeded                                                                   |
| `bunx nx run-many -t lint` over wbs-core, -store-sqlite, -contracts, -store-memory, -conformance, -be-01, -fe-01, -mcp-01                                                                             | succeeded                                                                   |
| devsync `service-kinds`, `eslint-boundaries`, `workspace-targets`, `retired-roots`, `toolchain-pins` tests                                                                                            | 95 pass, 0 fail                                                             |
| `bunx nx run tool-devsync:test --skip-nx-cache` (after the merge)                                                                                                                                     | 897 pass, 0 fail, 47 files                                                  |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                           | exit 0                                                                      |
| `bunx openspec validate --all --json`                                                                                                                                                                 | 267 items, 267 passed                                                       |

Not run: the host gate, any browser level, the rest of fe-01's suite, the workspace-wide
format check. Not observable: two concurrent promotions both landing with the coordinator
bypassed, because SQLite refuses the second `BEGIN IMMEDIATE` on the one connection; the
overshoot was observed through a stale count instead (table below).

## Slice 3 record (2026-10-22, branch `feat/wbs-organization-limits-3`)

Built: `claim_limit { cap, current }` on `claimWorkItem`, decided in
`WorkItemService.claim` after `decideClaim` has cleared every plan and occupancy reason,
only when the claim adds a `(work item, person, run)` triple the item does not hold, read
through the gauge's new `readConcurrentClaimCap` in the batch's `BEGIN IMMEDIATE`. The
batch's working plan now passes the gauge through (it rebuilt the catalog field by field
and dropped it, so every activated claim threw until it did). The `add_claims` replay (redo
of a claim, undo of a release, undo of a delete) re-checks and answers `stale_undo` with
detail `claim_limit: cap n, current n.`; `move_claims` (split, promotion) is never checked.
Legacy access reads nothing. The memory source gained the gauge's twin
(`organization-limits-fixture.ts`, admitted scopes only, given `organizationDefaultLimits`)
and two conformance cases, `organizationLimits.readAgentPersonCap:organization-scope` and
`organizationLimits.readConcurrentClaimCap:bound-triples`, certified by both sources.
fe-01 words `claim_limit` in `PLAN_REFUSALS`; the numbers stay on the wire until slice 6.
The MCP batch tool's `claimWorkItem` description names `claim_limit` last.

Task 3.5, measured on the laptop (x86_64, 24 threads) by the committed script
`apps/wbs/be-01/src/testing/measure-bound-claims.ts <claims> <leaves> <organizations>` over a
migrated scratch database, `ANALYZE` run, 500 timed calls of `countBoundClaims` after 50
warm-up calls, through `openConnection` (WAL, foreign keys on). Rerun 2026-10-22 after the
review; the first, uncommitted scratch run read 0.29, 2.85 and 0.37 ms:

| Claim rows of the counted organization | Leaves | Organizations (equal volume each) | Mean per count |
| -------------------------------------- | ------ | --------------------------------- | -------------- |
| 1,000 (200 bound claims)               | 200    | 2                                 | 0.31 ms        |
| 10,000 (2,000 bound claims)            | 2,000  | 2                                 | 2.60 ms        |
| 1,000 (200 bound claims)               | 200    | 200 (200,000 claim rows in all)   | 0.35 ms        |

`EXPLAIN QUERY PLAN` with 200 organizations: `SEARCH project_organization USING INDEX
project_organization_organization (organization_id=?)`, `SEARCH work_item USING COVERING
INDEX work_item_project_id_id (project_id=?)`, `SEARCH claim USING INDEX claim_step
(work_item_id=?)`, `USE TEMP B-TREE FOR DISTINCT`. With two organizations the planner scans
the two-row `project_organization` instead. No scan of `claim` or `work_item`, so no index
was added; every figure is under the 5 ms threshold, so no counter-column follow-up is filed.

**Deployment order (review S2-1).** Slice 2's batch working plan (`working-plan.resource.ts`)
rebuilt the store catalog without the limits gauge, so on #640's head alone a directory
command inside a project batch (`POST /api/projects/:id/commands` with `patchPerson { kind:
'agent' }`) under an activated admin answers 500 "an agent person was added under scoped
access without organization limits". This slice's getter fixes it, proven by `promotes inside
a project batch under the cap and refuses it at the cap` (agent-person-limit.controller.db.test.ts).
#640 must never be gated or deployed ahead of #642.

Recorded limits of the concurrency tests (review S3-3): the fast-check model has no undo or
redo acts and runs only one-command batches; two-batch interleaving is covered by its `race`
act and by the two-account race cases, and the replays by the controller cases. The memory
twin (review S3-7) is reachable only through `openMemorySourceFixture({
organizationDefaultLimits })`; `openMemorySource()` takes no options and never carries the
gauge, so a scoped acquisition over it throws.

Fresh local results, all with `env -u CLAUDECODE`, on the laptop, at `cca914d49` plus this
slice:

| Command                                                                                                                                                                                               | Result                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                          | 3111 pass, 3 skip, 0 fail, 214 files          |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                                                                                   | 1818 pass, 0 fail, 135 files                  |
| `bunx nx run <p>:test --skip-nx-cache` for wbs-store-memory, -conformance, -core, -contracts, -domain                                                                                                 | 193, 35, 1153, 495, 1194 pass; 0 fail         |
| `bun test` in `apps/wbs/mcp-01`                                                                                                                                                                       | 460 pass, 0 fail                              |
| `bunx vitest run` on `claim-limit-words`, `attempt-actions`, `plan-import-words`, `plan-read-and-write` (fe-01)                                                                                       | 112 pass                                      |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                       | 897 pass, 0 fail, 47 files                    |
| `bunx nx run-many -t typecheck,typecheck:module` over wbs-core, -store-sqlite, -contracts, -store-memory, -domain, -conformance, -auth, -gw-01, -mcp-01, -realtime, -runtime-portable, -be-01, -fe-01 | succeeded                                     |
| `bunx nx run-many -t lint` over wbs-core, -store-sqlite, -contracts, -store-memory, -conformance, -be-01, -fe-01, -mcp-01                                                                             | succeeded                                     |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                           | exit 0 (store-memory index review debt 48/40) |
| `bunx openspec validate --all --json`                                                                                                                                                                 | 267 items, 267 passed                         |

Not run: the host gate, any browser level, the rest of fe-01's suite, the workspace-wide
format check. Not observable: the claim cap through the memory batch runner, which has no
scoped claim path; the memory twin is held to SQLite at the gauge port by the conformance
cases instead.

## Slice 4 record (2026-10-22, branch `feat/wbs-organization-limits-4`)

Built: `capacity_limit { resourceId, cap, declared, asked }` on `setResourceCapacity` when a
non-null statement raises the project's own units of a resource and the units the
organization's other projects state plus the asked exceed `maxCapacityUnitsPerResource`.
The decision is `refuseCapacityStatement` in `@wbs/domain`; the sum is the gauge's new
`readCapacityCap(organizationId, resourceId, exceptProjectId)` (SQLite over
`sumStatedCapacity`, memory twin over the staged tables), read in the batch's
`BEGIN IMMEDIATE` through the working plan's catalog, which already passes the gauge
through. `CapacityService.setForResource` takes the caller's access; legacy access reads
nothing. The plan import checks every capacity it states before writing any, against all
the organization's existing projects (its own project is new and states nothing), and
refuses whole with the import arm. Contracts gain both 409 arms with type tests; the MCP
`setResourceCapacity` description names the refusal; fe-01 words it in `PLAN_REFUSALS`
(numbers in slice 6) and in the import sentence with the body's numbers. The memory source
gains `ownResourceInOrganization`; both sources certify
`organizationLimits.readCapacityCap:per-resource-except-project`.

Review fixes (2026-10-22, after the Fable review of PR #644): the "Lowering is never
refused" scenario now runs 48 again, 40, then 41 refused, the order the code and
`applies lowering and restating under a cap lowered below them` support (that case refuses
49 after 40, the same raise); design.md L9 and the spec say the import counts every existing
project, its own being new. Every be-01 fault in the proof table below was re-watched
against the 12-case `capacity-limit.controller.db.test.ts` and its counts updated, in the
table and in the adjacent `Proof:` comments.

Not applicable: undo and redo of a capacity statement. `setResourceCapacity` is not
journalled (its description says so), so nothing replays it; `journals no statement, so no
undo or redo can put one back past the cap` watches that. Deviation from 4.2 as written: no
import replaces a project, so "a re-import of the same project at 64 of 64 is applied" holds
only once the exported source stops stating its 64; with the source still stating, the
re-import is refused `declared: 64, asked: 64`.

Fresh local results, all with `env -u CLAUDECODE`, on the laptop, after merging slice 3's
review fixes at `4c88f9ea2`:

| Command                                                                                                                                                                                               | Result                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                          | 3125 pass, 3 skip, 0 fail, 215 files           |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                                                                                   | 1821 pass, 1 skip, 0 fail, 136 files           |
| `bunx nx run <p>:test --skip-nx-cache` for wbs-domain, -contracts, -core, -store-memory, -conformance                                                                                                 | 1199 (1 skip), 495, 1153, 193, 35 pass; 0 fail |
| `bun test` in `apps/wbs/mcp-01`                                                                                                                                                                       | 460 pass, 0 fail                               |
| `bunx vitest run` on `capacity-limit-words`, `claim-limit-words`, `plan-import-words`, `plan-read-and-write`, `attempt-actions` (fe-01)                                                               | 114 pass                                       |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                       | 897 pass, 0 fail, 47 files                     |
| `bunx nx run-many -t typecheck,typecheck:module` over wbs-core, -store-sqlite, -contracts, -store-memory, -domain, -conformance, -auth, -gw-01, -mcp-01, -realtime, -runtime-portable, -be-01, -fe-01 | succeeded                                      |
| `bunx nx run-many -t lint` over wbs-core, -store-sqlite, -contracts, -store-memory, -domain, -conformance, -be-01, -fe-01, -mcp-01                                                                    | succeeded                                      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                           | exit 0 (store-memory index review debt 48/40)  |
| `bunx openspec validate --all --json`                                                                                                                                                                 | 267 items, 267 passed                          |

Not run: the host gate, any browser level, the rest of fe-01's suite, the workspace-wide
format check, the coordinator-bypass sabotage of the capacity race (the stale-sum sabotage
is the one watched). Not observable: the capacity cap through the memory batch runner, which
has no scoped path; the memory twin is held to SQLite at the gauge port instead.

## Failure proofs

| Check                                                    | Fault injected                                                                                | Observed failing test                                                                                                                                                                                                                                                         | Result  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `down.sql` guard of `add_organization_limits`            | guard removed                                                                                 | `refuses rollback while an organization holds its own caps…` (`organization-limits-migration.db.test.ts`), 7 pass 1 fail                                                                                                                                                      | watched |
| cap CHECKs                                               | each CHECK in turn replaced by `CHECK (1)`                                                    | that column's `refuses a null, fractional, text, negative or over-bound …` case, 7 pass 1 fail each                                                                                                                                                                           | watched |
| required default variables                               | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` made optional                                    | `refuses an absent, fractional, negative or over-bound …CONCURRENT_CLAIMS` (`config.test.ts`), 30 pass 1 fail                                                                                                                                                                 | watched |
| `refuseLimit` comparison                                 | `>` replaced by `>=`                                                                          | `admits the acquisition that reaches the cap exactly` and the boundary property (`organization-limits.test.ts`), 6 pass 2 fail                                                                                                                                                | watched |
| usage scoped to the organization                         | organization predicate dropped from each usage read in turn                                   | `counts only A’s agents…`, `counts only A’s bound claims`, `sums stated capacity per resource over A’s projects only…` (`organization-limits.db.test.ts`), 11 pass 1 fail each                                                                                                | watched |
| bound claim is a triple                                  | `selectDistinct` replaced by `select`                                                         | `counts a four-step leaf under one run once…` and `counts two run-less claims of one person on one leaf as one`, 10 pass 2 fail                                                                                                                                               | watched |
| read's role check                                        | role test answering null                                                                      | `answers a member and a viewer 403 forbidden with no usage in the body` (`organization-limits.controller.db.test.ts`) answered 200, 4 pass 1 fail; the store's read case, 11 pass 1 fail                                                                                      | watched |
| agent count's kind predicate                             | `kind = 'agent'` dropped                                                                      | `counts only A’s agents, never its humans or B’s agents`, 11 pass 1 fail                                                                                                                                                                                                      | watched |
| `sumStatedCapacity` excludes its project                 | excluded-project predicate dropped                                                            | `sums another project’s units, never the one being written`, 11 pass 1 fail                                                                                                                                                                                                   | watched |
| read refuses a delegation                                | route's delegation guard removed                                                              | `refuses a delegation even of a super-admin` answered 200, 4 pass 1 fail                                                                                                                                                                                                      | watched |
| read refuses before activation                           | route's legacy refusal removed; store's activation test removed                               | `refuses before activation` answered 500, 4 pass 1 fail; `answers inactive before activation`, 11 pass 1 fail                                                                                                                                                                 | watched |
| boot wires the limits store with its defaults            | `organizationLimits` binding omitted in `bootBe01`                                            | `serves the organization limits with the configured defaults once activated` (`boot.db.test.ts`), 0 pass 1 fail                                                                                                                                                               | watched |
| swap preflight demands the three keys                    | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` dropped from `APP_ENV_REQUIRED_KEYS`             | `demands only keys the be release refuses to boot without` (`docker.test.ts`), 127 pass 1 fail                                                                                                                                                                                | watched |
| swap preflight value shape                               | the limit value rule admitting everything                                                     | `refuses only value shapes the be release also refuses`, on `…AGENT_PERSONS=1000001`, 127 pass 1 fail                                                                                                                                                                         | watched |
| dev deploy refuses a be-01 `.env` lacking a key          | `assertBeEnv` call removed from `sync`                                                        | `refuses a be-01 environment missing a required key before fetch or reset` reached `git fetch` (8 pass, 1 fail)                                                                                                                                                               | watched |
| devsync's be-01 key list matches `BeConfig`              | `…MAX_CONCURRENT_CLAIMS` removed from `BE_REQUIRED_ENV`                                       | `names the keys be-01 refuses to boot without, less those compose supplies` (8 pass, 1 fail)                                                                                                                                                                                  | watched |
| `sumStatedCapacity` requires the resource's organization | resource organization predicate dropped                                                       | `never sums a resource the organization does not own` (12 pass, 1 fail)                                                                                                                                                                                                       | watched |
| absent deployment defaults are named                     | the `limits === undefined` check removed                                                      | `refuses absent deployment defaults, naming them` failed on the TypeError text (13 pass, 1 fail)                                                                                                                                                                              | watched |
| agent cap inside the transaction                         | gauge answering the count it read first for every later batch (a count read outside the turn) | `lands exactly one, the other refused naming the winner in its count` (`agent-person-limit-race.db.test.ts`): both landed, 9 agents of 8, 0 pass 1 fail                                                                                                                       | watched |
| agent cap serialized by the turn                         | `source.uow` built over the open gate (coordinator bypassed)                                  | the same race case: the queued batch failed `BEGIN IMMEDIATE`, "cannot start a transaction within a transaction", 0 pass 1 fail                                                                                                                                               | watched |
| admitted catalog carries the gauge                       | bound source's admitted catalog built without the gauge                                       | every activated case of `agent-person-limit.controller.db.test.ts` threw the composition error, 3 pass 9 fail                                                                                                                                                                 | watched |
| boot gives the source its defaults                       | `organizationDefaultLimits` not passed to `openSource`                                        | `enforces the agent person cap with the configured defaults once activated` (`boot.db.test.ts`) threw, 0 pass 1 fail                                                                                                                                                          | watched |
| the promotion check                                      | check removed from `patchPersonWithin`                                                        | `refuses the ninth agent…`, `refuses a batch adding two agents where one is free…`, `keeps every agent above a lowered cap…`, 9 pass 3 fail                                                                                                                                   | watched |
| cap of 0 refuses the first agent                         | a cap of 0 read as no cap in `refuseAgentPersons`                                             | `refuses the first agent under a cap of 0` answered 200, 12 pass 1 fail                                                                                                                                                                                                       | watched |
| agent cap only on `agent`                                | `held.kind !== 'agent'` dropped                                                               | `renames an agent and re-teams it at the cap, restating its kind`, 11 pass 1 fail                                                                                                                                                                                             | watched |
| the add's own check                                      | check removed from `addPersonWithin`                                                          | `refuses adding an agent at the cap, creating and mapping nothing` (`directory.resource.test.ts`), 6 pass 3 fail                                                                                                                                                              | watched |
| legacy access uncapped                                   | legacy answered as a cap of 0                                                                 | `admits a promotion and an import with no organization to own a cap`, 11 pass 1 fail                                                                                                                                                                                          | watched |
| import counts the total                                  | whole-import check removed (the per-person check of `addPersonWithin` remains)                | `refuses an import of three agents at 6 of 8, writing nothing` answered 500 and wrote nothing, not two, 11 pass 1 fail                                                                                                                                                        | watched |
| import counts only new agents                            | file agents the organization already holds counted                                            | `imports at the cap when every agent of the file is already held`, 11 pass 1 fail                                                                                                                                                                                             | watched |
| refusal shapes declared                                  | the 409 `agent_person_limit` arm removed from the batch shape; then from the import shape     | the three directory refusals, then the import refusal, answered 500 "returned an undeclared refusal", 9 pass 3 fail and 11 pass 1 fail                                                                                                                                        | watched |
| claim cap is last                                        | check moved above `decideClaim`                                                               | `answers the plan’s reasons before the cap`, `refuses inside another’s subtree first…` (`claim-limit.controller.db.test.ts`) answered claim_limit, 10 pass 3 fail                                                                                                             | watched |
| claim cap counts only a new triple                       | every claim counted as adding one                                                             | `claims a second step of a held leaf at the cap, and repeats a held claim` refused, 12 pass 1 fail                                                                                                                                                                            | watched |
| the claim check                                          | check skipped                                                                                 | `refuses the forty-first bound claim…` and five more applied, 7 pass 6 fail                                                                                                                                                                                                   | watched |
| claim cap: legacy uncapped                               | legacy answered as a cap of 0                                                                 | `claims past any cap with no organization to own one` refused, 12 pass 1 fail                                                                                                                                                                                                 | watched |
| claim refusal names its numbers                          | `cap`, `current` replaced by 0 in `claimValue`                                                | the six refusal cases named cap 0, current 0, 7 pass 6 fail                                                                                                                                                                                                                   | watched |
| claim refusal shape declared                             | `claim_limit` arm removed from the batch shape                                                | the six refusal cases answered 500 "returned an undeclared refusal", 7 pass 6 fail                                                                                                                                                                                            | watched |
| batch working plan carries the gauge                     | `organizationLimits` getter left out of the working plan's catalog                            | every activated claim case threw "a bound claim was added under scoped access without organization limits", 1 pass 11 fail; `promotes inside a project batch under the cap and refuses it at the cap` (agent-person-limit.controller.db.test.ts) answered 500, 13 pass 1 fail | watched |
| claim race: count read in the turn                       | gauge answering the count read before the batches queued                                      | both orders of `lands exactly one of two claims racing for the last place` (`claim-limit-race.db.test.ts`) landed both, 41 of 40; the fast-check model found 4 bound claims of 3; 0 pass 3 fail                                                                               | watched |
| claim race: serialized by the turn                       | runner's unit of work over the open gate                                                      | both orders failed `BEGIN IMMEDIATE`, "cannot start a transaction within a transaction"; the model failed too; 0 pass 3 fail                                                                                                                                                  | watched |
| SQLite gauge reads the claims cap                        | `maxAgentPersons` answered as the claims cap                                                  | SQLite certification `organizationLimits.readConcurrentClaimCap:bound-triples` and both race orders, 74 pass 4 fail                                                                                                                                                           | watched |
| memory gauge counts triples                              | claim rows counted                                                                            | memory certification, A read 4, 74 pass 1 fail                                                                                                                                                                                                                                | watched |
| memory gauge scoped to the organization                  | project's organization test dropped                                                           | memory certification, A read 3 (B's claim), 74 pass 1 fail                                                                                                                                                                                                                    | watched |
| memory gauge counts agents only                          | kind test dropped                                                                             | memory certification, A read 3 agents, 74 pass 1 fail                                                                                                                                                                                                                         | watched |
| redo and undo re-check the claim cap                     | re-check skipped in the `add_claims` replay                                                   | `refuses a redo of a claim once another took the last place`, `refuses an undo of a release…`, `refuses an undo of a delete once another took the freed place` put the claim back, 10 pass 3 fail                                                                             | watched |
| fe-01 words the claim cap                                | `claim_limit` sentence struck from `PLAN_REFUSALS`                                            | `words the claim cap rather than naming its code` (`claim-limit-words.test.ts`) read the fallback, 0 pass 1 fail                                                                                                                                                              | watched |
| `declared` excludes the own project                      | another project excepted in the own project's place                                           | `raises a project’s own statement within the cap, its own units not counted` and three more (`capacity-limit.controller.db.test.ts`) refused, 8 pass 4 fail                                                                                                                   | watched |
| per-resource sum                                         | resource predicate dropped from `sumStatedCapacity`                                           | `sums each resource on its own`: 64 of `h2puni ram` refused one `worktrees`, 11 pass 1 fail                                                                                                                                                                                   | watched |
| import counts the other projects (amended)               | the other projects' sum read as 0 in the import                                               | `refuses an import that would state past the cap beside another project, the export’s source among them` admitted, 11 pass 1 fail                                                                                                                                             | watched |
| the capacity check                                       | check removed from `setForResource`                                                           | `refuses a statement past the cap…` and five more applied, 6 pass 6 fail                                                                                                                                                                                                      | watched |
| restating and lowering never refuse                      | raise test dropped from `refuseCapacityStatement`                                             | domain `never refuses restating or lowering…` and the property, 11 pass 2 fail; `applies lowering and restating under a cap lowered below them` and one more, 10 pass 2 fail                                                                                                  | watched |
| own units replaced, not counted twice                    | `held` added to `declared` in `refuseCapacityStatement`                                       | `replaces the project’s own units rather than counting them twice` and the property, 11 pass 2 fail                                                                                                                                                                           | watched |
| capacity cap: legacy uncapped                            | legacy answered as a refusal                                                                  | `states past any cap with no organization to own one` refused, 11 pass 1 fail                                                                                                                                                                                                 | watched |
| capacity refusal names its numbers                       | `declared` replaced by 0 in the binding                                                       | four refusal cases named declared 0, 8 pass 4 fail                                                                                                                                                                                                                            | watched |
| capacity refusal shapes declared                         | batch arm removed; then the import arm's code replaced                                        | 500 "returned an undeclared refusal": 6 pass 6 fail; 10 pass 2 fail                                                                                                                                                                                                           | watched |
| import capacity check                                    | check removed from the import                                                                 | both import refusals admitted, 10 pass 2 fail                                                                                                                                                                                                                                 | watched |
| capacity service carries the gauge                       | spread removed in `servicesOver`; in the capacity module; the working-plan getter left out    | every activated statement case answered 500 "a resource capacity was stated under scoped access without organization limits", 2 pass 10 fail each                                                                                                                             | watched |
| capacity race: sum read in the turn                      | gauge answering the sums read before the batches queued                                       | both orders of `lands exactly one of two statements of 40 under 64` landed both, 80 of 64; the model failed `toBeLessThanOrEqual(64)` after 23 runs; 0 pass 3 fail                                                                                                            | watched |
| SQLite gauge reads the capacity cap                      | `maxConcurrentClaims` answered as the cap                                                     | SQLite certification `organizationLimits.readCapacityCap:per-resource-except-project`, both race orders and the model, 74 pass 4 fail                                                                                                                                         | watched |
| memory gauge sums per organization and except project    | resource organization test, excepted-project test, project organization test, each dropped    | memory certification of `organizationLimits.readCapacityCap:per-resource-except-project`, 74 pass 1 fail each                                                                                                                                                                 | watched |
| fe-01 words the capacity cap                             | `capacity_limit` sentence struck from `PLAN_REFUSALS`                                         | `words the capacity cap rather than naming its code` (`capacity-limit-words.test.ts`), 0 pass 1 fail                                                                                                                                                                          | watched |
| audit widening rollback guard                            | guard replaced by `CHECK (1)` or trigger dropped                                              | (slice 5)                                                                                                                                                                                                                                                                     | pending |
| audit in the same transaction                            | audit written outside it                                                                      | (slice 5)                                                                                                                                                                                                                                                                     | pending |
| `set` starts from the defaults                           | `set` started from zeros                                                                      | (slice 5)                                                                                                                                                                                                                                                                     | pending |
| panel never shows a stale organization                   | late-reply fence removed                                                                      | (slice 6)                                                                                                                                                                                                                                                                     | pending |

## Gate output

Pending. To be recorded per slice with `bin/h2puni-gate.sh <sha>` (or h4claw) output, and
locally with `env -u CLAUDECODE` on the named test files.
