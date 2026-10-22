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
batch refusal shows its code until slice 6.

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

## Failure proofs

| Check                                                    | Fault injected                                                                                | Observed failing test                                                                                                                                                                    | Result  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `down.sql` guard of `add_organization_limits`            | guard removed                                                                                 | `refuses rollback while an organization holds its own caps…` (`organization-limits-migration.db.test.ts`), 7 pass 1 fail                                                                 | watched |
| cap CHECKs                                               | each CHECK in turn replaced by `CHECK (1)`                                                    | that column's `refuses a null, fractional, text, negative or over-bound …` case, 7 pass 1 fail each                                                                                      | watched |
| required default variables                               | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` made optional                                    | `refuses an absent, fractional, negative or over-bound …CONCURRENT_CLAIMS` (`config.test.ts`), 30 pass 1 fail                                                                            | watched |
| `refuseLimit` comparison                                 | `>` replaced by `>=`                                                                          | `admits the acquisition that reaches the cap exactly` and the boundary property (`organization-limits.test.ts`), 6 pass 2 fail                                                           | watched |
| usage scoped to the organization                         | organization predicate dropped from each usage read in turn                                   | `counts only A’s agents…`, `counts only A’s bound claims`, `sums stated capacity per resource over A’s projects only…` (`organization-limits.db.test.ts`), 11 pass 1 fail each           | watched |
| bound claim is a triple                                  | `selectDistinct` replaced by `select`                                                         | `counts a four-step leaf under one run once…` and `counts two run-less claims of one person on one leaf as one`, 10 pass 2 fail                                                          | watched |
| read's role check                                        | role test answering null                                                                      | `answers a member and a viewer 403 forbidden with no usage in the body` (`organization-limits.controller.db.test.ts`) answered 200, 4 pass 1 fail; the store's read case, 11 pass 1 fail | watched |
| agent count's kind predicate                             | `kind = 'agent'` dropped                                                                      | `counts only A’s agents, never its humans or B’s agents`, 11 pass 1 fail                                                                                                                 | watched |
| `sumStatedCapacity` excludes its project                 | excluded-project predicate dropped                                                            | `sums another project’s units, never the one being written`, 11 pass 1 fail                                                                                                              | watched |
| read refuses a delegation                                | route's delegation guard removed                                                              | `refuses a delegation even of a super-admin` answered 200, 4 pass 1 fail                                                                                                                 | watched |
| read refuses before activation                           | route's legacy refusal removed; store's activation test removed                               | `refuses before activation` answered 500, 4 pass 1 fail; `answers inactive before activation`, 11 pass 1 fail                                                                            | watched |
| boot wires the limits store with its defaults            | `organizationLimits` binding omitted in `bootBe01`                                            | `serves the organization limits with the configured defaults once activated` (`boot.db.test.ts`), 0 pass 1 fail                                                                          | watched |
| swap preflight demands the three keys                    | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` dropped from `APP_ENV_REQUIRED_KEYS`             | `demands only keys the be release refuses to boot without` (`docker.test.ts`), 127 pass 1 fail                                                                                           | watched |
| swap preflight value shape                               | the limit value rule admitting everything                                                     | `refuses only value shapes the be release also refuses`, on `…AGENT_PERSONS=1000001`, 127 pass 1 fail                                                                                    | watched |
| dev deploy refuses a be-01 `.env` lacking a key          | `assertBeEnv` call removed from `sync`                                                        | `refuses a be-01 environment missing a required key before fetch or reset` reached `git fetch` (8 pass, 1 fail)                                                                          | watched |
| devsync's be-01 key list matches `BeConfig`              | `…MAX_CONCURRENT_CLAIMS` removed from `BE_REQUIRED_ENV`                                       | `names the keys be-01 refuses to boot without, less those compose supplies` (8 pass, 1 fail)                                                                                             | watched |
| `sumStatedCapacity` requires the resource's organization | resource organization predicate dropped                                                       | `never sums a resource the organization does not own` (12 pass, 1 fail)                                                                                                                  | watched |
| agent cap inside the transaction                         | gauge answering the count it read first for every later batch (a count read outside the turn) | `lands exactly one, the other refused naming the winner in its count` (`agent-person-limit-race.db.test.ts`): both landed, 9 agents of 8, 0 pass 1 fail                                  | watched |
| agent cap serialized by the turn                         | `source.uow` built over the open gate (coordinator bypassed)                                  | the same race case: the queued batch failed `BEGIN IMMEDIATE`, "cannot start a transaction within a transaction", 0 pass 1 fail                                                          | watched |
| admitted catalog carries the gauge                       | bound source's admitted catalog built without the gauge                                       | every activated case of `agent-person-limit.controller.db.test.ts` threw the composition error, 3 pass 9 fail                                                                            | watched |
| boot gives the source its defaults                       | `organizationDefaultLimits` not passed to `openSource`                                        | `enforces the agent person cap with the configured defaults once activated` (`boot.db.test.ts`) threw, 0 pass 1 fail                                                                     | watched |
| the promotion check                                      | check removed from `patchPersonWithin`                                                        | `refuses the ninth agent…`, `refuses a batch adding two agents where one is free…`, `keeps every agent above a lowered cap…`, 9 pass 3 fail                                              | watched |
| agent cap only on `agent`                                | `held.kind !== 'agent'` dropped                                                               | `renames an agent and re-teams it at the cap, restating its kind`, 11 pass 1 fail                                                                                                        | watched |
| the add's own check                                      | check removed from `addPersonWithin`                                                          | `refuses adding an agent at the cap, creating and mapping nothing` (`directory.resource.test.ts`), 6 pass 3 fail                                                                         | watched |
| legacy access uncapped                                   | legacy answered as a cap of 0                                                                 | `admits a promotion and an import with no organization to own a cap`, 11 pass 1 fail                                                                                                     | watched |
| import counts the total                                  | whole-import check removed (the per-person check of `addPersonWithin` remains)                | `refuses an import of three agents at 6 of 8, writing nothing` answered 500 and wrote nothing, not two, 11 pass 1 fail                                                                   | watched |
| import counts only new agents                            | file agents the organization already holds counted                                            | `imports at the cap when every agent of the file is already held`, 11 pass 1 fail                                                                                                        | watched |
| refusal shapes declared                                  | the 409 `agent_person_limit` arm removed from the batch shape; then from the import shape     | the three directory refusals, then the import refusal, answered 500 "returned an undeclared refusal", 9 pass 3 fail and 11 pass 1 fail                                                   | watched |
| claim cap is last                                        | check moved before `already_claimed`                                                          | (slice 3)                                                                                                                                                                                | pending |
| claim race                                               | unit of work over the open gate                                                               | (slice 3)                                                                                                                                                                                | pending |
| redo re-checks                                           | re-check skipped on redo                                                                      | (slice 3)                                                                                                                                                                                | pending |
| `declared` excludes the own project                      | own units included                                                                            | (slice 4)                                                                                                                                                                                | pending |
| per-resource sum                                         | per-resource predicate dropped                                                                | (slice 4)                                                                                                                                                                                | pending |
| re-import excludes the replaced project                  | replaced project counted                                                                      | (slice 4)                                                                                                                                                                                | pending |
| audit widening rollback guard                            | guard replaced by `CHECK (1)` or trigger dropped                                              | (slice 5)                                                                                                                                                                                | pending |
| audit in the same transaction                            | audit written outside it                                                                      | (slice 5)                                                                                                                                                                                | pending |
| `set` starts from the defaults                           | `set` started from zeros                                                                      | (slice 5)                                                                                                                                                                                | pending |
| panel never shows a stale organization                   | late-reply fence removed                                                                      | (slice 6)                                                                                                                                                                                | pending |

## Gate output

Pending. To be recorded per slice with `bin/h2puni-gate.sh <sha>` (or h4claw) output, and
locally with `env -u CLAUDECODE` on the named test files.
