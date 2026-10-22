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

Not run: the host gate (`bin/h2puni-gate.sh`), any browser level, `tool-deploy:test`, the
workspace-wide format check. Not observable on this branch: a machine principal (L8's
`insufficient_scope` for one) because `wbs-machine-credentials` is unmerged; the delegation
case is the one tested.

## Failure proofs

| Check                                         | Fault injected                                                                    | Observed failing test                                                                                                                                                          | Result  |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `down.sql` guard of `add_organization_limits` | guard removed                                                                     | `refuses rollback while an organization holds its own caps…` (`organization-limits-migration.db.test.ts`), 7 pass 1 fail                                                       | watched |
| cap CHECKs                                    | each CHECK in turn replaced by `CHECK (1)`                                        | that column's `refuses a null, fractional, text, negative or over-bound …` case, 7 pass 1 fail each                                                                            | watched |
| required default variables                    | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` made optional                        | `refuses an absent, fractional, negative or over-bound …CONCURRENT_CLAIMS` (`config.test.ts`), 30 pass 1 fail                                                                  | watched |
| `refuseLimit` comparison                      | `>` replaced by `>=`                                                              | `admits the acquisition that reaches the cap exactly` and the boundary property (`organization-limits.test.ts`), 6 pass 2 fail                                                 | watched |
| usage scoped to the organization              | organization predicate dropped from each usage read in turn                       | `counts only A’s agents…`, `counts only A’s bound claims`, `sums stated capacity per resource over A’s projects only…` (`organization-limits.db.test.ts`), 11 pass 1 fail each | watched |
| bound claim is a triple                       | `selectDistinct` replaced by `select`                                             | `counts a four-step leaf under one run once…` and `counts two run-less claims of one person on one leaf as one`, 10 pass 2 fail                                                | watched |
| read's role check                             | role test answering null                                                          | `refuses a member and a viewer, reading no usage` (`organization-limits.controller.db.test.ts`) answered 200, 4 pass 1 fail; the store's read case, 11 pass 1 fail             | watched |
| agent count's kind predicate                  | `kind = 'agent'` dropped                                                          | `counts only A’s agents, never its humans or B’s agents`, 11 pass 1 fail                                                                                                       | watched |
| `sumStatedCapacity` excludes its project      | excluded-project predicate dropped                                                | `sums another project’s units, never the one being written`, 11 pass 1 fail                                                                                                    | watched |
| read refuses a delegation                     | route's delegation guard removed                                                  | `refuses a delegation even of a super-admin` answered 200, 4 pass 1 fail                                                                                                       | watched |
| read refuses before activation                | route's legacy refusal removed; store's activation test removed                   | `refuses before activation` answered 500, 4 pass 1 fail; `answers inactive before activation`, 11 pass 1 fail                                                                  | watched |
| boot wires the limits store with its defaults | `organizationLimits` binding omitted in `bootBe01`                                | `serves the organization limits with the configured defaults once activated` (`boot.db.test.ts`), 0 pass 1 fail                                                                | watched |
| swap preflight demands the three keys         | `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` dropped from `APP_ENV_REQUIRED_KEYS` | `demands only keys the be release refuses to boot without` (`docker.test.ts`), 127 pass 1 fail                                                                                 | watched |
| swap preflight value shape                    | the limit value rule admitting everything                                         | `refuses only value shapes the be release also refuses`, on `…AGENT_PERSONS=1000001`, 127 pass 1 fail                                                                          | watched |
| agent cap inside the transaction              | count read before the transaction, gate bypassed                                  | (slice 2)                                                                                                                                                                      | pending |
| agent cap only on `agent`                     | kind predicate dropped                                                            | (slice 2)                                                                                                                                                                      | pending |
| import counts the total                       | per-person check instead of the total                                             | (slice 2)                                                                                                                                                                      | pending |
| claim cap is last                             | check moved before `already_claimed`                                              | (slice 3)                                                                                                                                                                      | pending |
| claim race                                    | unit of work over the open gate                                                   | (slice 3)                                                                                                                                                                      | pending |
| redo re-checks                                | re-check skipped on redo                                                          | (slice 3)                                                                                                                                                                      | pending |
| `declared` excludes the own project           | own units included                                                                | (slice 4)                                                                                                                                                                      | pending |
| per-resource sum                              | per-resource predicate dropped                                                    | (slice 4)                                                                                                                                                                      | pending |
| re-import excludes the replaced project       | replaced project counted                                                          | (slice 4)                                                                                                                                                                      | pending |
| audit widening rollback guard                 | guard replaced by `CHECK (1)` or trigger dropped                                  | (slice 5)                                                                                                                                                                      | pending |
| audit in the same transaction                 | audit written outside it                                                          | (slice 5)                                                                                                                                                                      | pending |
| `set` starts from the defaults                | `set` started from zeros                                                          | (slice 5)                                                                                                                                                                      | pending |
| panel never shows a stale organization        | late-reply fence removed                                                          | (slice 6)                                                                                                                                                                      | pending |

## Gate output

Pending. To be recorded per slice with `bin/h2puni-gate.sh <sha>` (or h4claw) output, and
locally with `env -u CLAUDECODE` on the named test files.
