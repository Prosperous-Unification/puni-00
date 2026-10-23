<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on the Linux laptop, on `feat/wbs-create-agent-and-exhaustion-detail` off `937da8cb5`,
every one with `env -u CLAUDECODE`, one heavy target at a time.

| Command                                                                                                                                                                                                     | Result                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test libs/wbs/domain/domain/src/claim-occupancy.test.ts`                                                                                                                                               | 18 pass, 0 fail                                                                                                                       |
| `bun test libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts`                                                                                                                                 | 70 pass, 0 fail                                                                                                                       |
| `bun test libs/wbs/adapters/store-sqlite/src/agent-person-limit-race.db.test.ts`                                                                                                                            | 2 pass, 0 fail                                                                                                                        |
| `bun test apps/wbs/be-01/src/controller/agent-person-limit.controller.db.test.ts`                                                                                                                           | 20 pass, 0 fail                                                                                                                       |
| `bun test libs/wbs/domain/contracts/src/http/{plan-command-shapes,work-item-shapes}.test.ts`                                                                                                                | 9 pass, 0 fail                                                                                                                        |
| claim-occupancy-race, resource-organization, swarm-rehearsal, directory and directory-command-organization controllers, directory.resource, plan-commands, command-bindings, definitions, MCP openapi-tools | each 0 fail                                                                                                                           |
| `nx run <lib>:typecheck` for the 13 WBS projects of the brief, one at a time                                                                                                                                | each succeeded                                                                                                                        |
| `nx run wbs-{domain,contracts,core,store-sqlite,be-01}:lint`                                                                                                                                                | each succeeded                                                                                                                        |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                 | exit 0                                                                                                                                |
| `bunx openspec validate --all --json`                                                                                                                                                                       | 271 passed, 0 failed                                                                                                                  |
| `nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                                  | exit 0 on the committed tree (a first run, before `verify.md` was tracked, failed only the index-checker case on that untracked path) |

### Not run, and why

- `bin/h2puni-gate.sh` and the h4claw gate: the brief asks for a PR, not a gate; CI runs
  the full gate on the PR.
- fe-01 tests: fe-01 is unchanged. `plan-refusal.ts` maps `resources_exhausted` by code
  alone and reads no detail field, so the additive `resources` reaches no fe-01 branch.

## Proofs (R5)

Each fault was injected into the production path, the named test watched failing, and the
fault reverted; watched 2026-10-23.

| Check                                        | Injected fault                                         | Observed                                                                                              |
| -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `addPersonWithin` gauge for a new agent      | the `kind === 'agent'` cap check bypassed              | `refuses the fifth agent created directly…` and `refuses a batch creating two agents…` applied (18/2) |
| the count is read inside the batch's turn    | the gauge answers its first count to every later batch | race `creates exactly one…`: the second creation answered ok instead of `agent_person_limit`          |
| `addPersonWithin` `invalid_kind`             | the `holdsKind` check removed                          | `refuses a kind outside the set…` answered 500 (person table CHECK constraint) instead of 400         |
| `refuseOccupancy` lists every short resource | only the first short resource kept                     | `names every resource a claim is short of…` listed RAM alone (17/1)                                   |
| batch binding carries `resources`            | `outcome.resources.slice(0, 1)`                        | `names both resources a claim is short of` failed on memory and sqlite (0/2)                          |
| the 409 contract arm declares `resources`    | `resources` dropped from the `resources_exhausted` arm | `resources_exhausted declares every short resource…` accepted a body without it (3/1)                 |

## Decisions

- `resources_exhausted` stays additive: the top-level fields are the first short resource,
  as before, and `resources` lists every one. No reader had to change.
- `createPerson` naming a held person keeps that person's kind, as the plan import does;
  the answer's `entity.kind` says which kind was kept. Changing a kind stays
  `patchPerson`'s job.
- `personKind` is validated as `patchPerson.patch.kind` is (`string` on the wire,
  `invalid_kind` in the service), so the refusal stays reachable through the API.
- The obsolete sentence in `wbs-organization-limits`' delta is replaced by this change's
  MODIFIED requirement, not edited there: both changes are unarchived, and this one must be
  archived after it.
