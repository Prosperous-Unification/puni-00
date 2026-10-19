## Verification record

Slice 1 (tasks 1.1 to 1.6) implemented 2026-10-19 on `feat/wbs-claim-record`; see below. Drafted 2026-10-19; the design interview with Dany was held the same
day and D1 to D8 reflect it. Three items are marked assumed in design.md.

Measured for the design, read-only on the dev store (`/home/puni1/wbs-dev/data/wbs.db`,
`bun:sqlite` readonly over SSH to h2puni, 2026-10-19): project `PUNI platform plan`
(`558ec5c7-f561-4181-9d9b-055b06bc9796`): 211 work items; assignments 0; team labels 0;
external refs 2; readiness `ready` 6, `draft` 1; hold `blocked` 6; step progress `done` 495,
`in_progress` 42; `project_team_capacity` rows 0; steps `plan`, `impl`, `review`.

Read for D5 to D7 on 2026-10-19: mcp-01 registers public clients dynamically without a
client name, keeps no agent identity, and forwards the human's upstream token to be-01
(`apps/wbs/mcp-01/src/oauth.ts`, `caller-auth.ts`); `external_identity` already maps many
`(issuer, subject)` pairs to one account. OpenClaw subagent session keys read
`agent:<agentId>:subagent:<uuid>` (docs.openclaw.ai/tools/subagents); Claire's engine
requires that shape for `minion_run_id` (`bin/engine-fields.mjs`).

Not verified: that an Auth0 machine-to-machine token carries `wbs_groups` (task 0.2); that
plan document v6 carries a person's teams (task 0.3). `openspec validate --all --json` on this
change: run before each push, result in the PR.

## Slice 1: the claim record and its decision (tasks 1.1 to 1.6)

Run on the laptop 2026-10-19, every test under `env -u CLAUDECODE` (13 repo tests fail only
under `CLAUDECODE=1`). Heavy suites were run per project, not the full gate; the gate result
is recorded at the end of this section.

### Commands and results

| Command (cwd)                                                                                             | Result                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/claim.test.ts` (libs/wbs/domain/domain)                                                     | 49 pass, 0 fail                                                                                                                                                                   |
| `bun test --timeout=10000` (libs/wbs/domain/domain)                                                       | 1137 pass, 1 fail: `domain-ring-boundary.test.ts` fails identically with this branch stashed ("No cached ProjectGraph", pre-existing, environmental)                              |
| `bun test src --timeout=10000` (libs/wbs/application/core)                                                | 1070 pass, 0 fail                                                                                                                                                                 |
| `bun test` (libs/wbs/application/conformance)                                                             | 35 pass, 0 fail                                                                                                                                                                   |
| `bun test` (libs/wbs/adapters/store-memory)                                                               | 188 pass, 0 fail                                                                                                                                                                  |
| `bun test src/claim.db.test.ts src/claim-race.db.test.ts` (libs/wbs/adapters/store-sqlite)                | 10 + 6 pass, 0 fail                                                                                                                                                               |
| `bun test src/testing/source-conformance.db.test.ts` (store-sqlite)                                       | 75 pass, 0 fail                                                                                                                                                                   |
| `bun test --timeout=30000` (store-sqlite, whole suite)                                                    | 1658 pass, 1 fail: `working-plan-performance.test.ts` › `keeps cached medians within ten percent…` (timing, run while be-01 tests loaded the laptop); rerun alone: 8 pass, 0 fail |
| `bun test` (libs/wbs/domain/contracts)                                                                    | 475 pass, 0 fail                                                                                                                                                                  |
| `bun test` (apps/wbs/mcp-01)                                                                              | 423 pass, 0 fail                                                                                                                                                                  |
| `bun test src/openapi/` (apps/wbs/be-01)                                                                  | 6 pass, 0 fail                                                                                                                                                                    |
| `bun test` undo, command-organization, work-item controller, elysia work-item, migration-cli (be-01)      | 312 pass, 0 fail                                                                                                                                                                  |
| `bunx tsc --build` core, domain, contracts, store-sqlite, store-memory, conformance, be-01, mcp-01, fe-01 | no diagnostics                                                                                                                                                                    |
| `bunx eslint` on every changed TypeScript file                                                            | no errors                                                                                                                                                                         |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on both SQL files                              | exit 0                                                                                                                                                                            |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-team-claims --json`                                        | 1 passed, 0 failed                                                                                                                                                                |

OpenAPI emit diff: `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts` on the base and on this
branch. No path added or removed. Per operation, only additions: both command routes gain the
`claimWorkItem` and `releaseWorkItem` body arms; 400 gains `runId_must_be_1_to_256_characters`,
`parentClaim_must_be_an_id`, `steps_must_be_a_list_of_ids`, `steps_must_be_at_most_50`; 403
gains `person_not_bound`, `credential_not_for_person`, `parent_claim_foreign`; 404 gains
`parent_claim_unknown`; 409 gains `parent_claim_not_ancestor`, `item_done`, `not_claimed_by`,
`not_startable`, `step_done`, `already_claimed`, `inside_subtree_claim`,
`overlaps_subtree_claim`. The domain-challenge 409 was split into two arms (same codes) because
`already_claimed` now also carries command detail. MCP: the tool list does not move (the
generated-document tool count test passes unchanged); `openapi-tools.test.ts` pins the two new
kinds inside the batch tool.

### R5 proofs (fault injected, test observed, all restored and re-run green)

| Check                                   | Injected fault                                                           | Observed                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `claim_step` unique index               | index statement replaced by `SELECT 1`                                   | `holds one claim per step of a work item` failed                                                                                       |
| `claim_subtree` partial index           | removed                                                                  | `holds one subtree claim per work item…` failed                                                                                        |
| run length CHECK                        | removed                                                                  | `bounds the run to 1 to 256 characters` failed                                                                                         |
| own-parent CHECK                        | removed                                                                  | `refuses a claim that is its own parent` failed                                                                                        |
| insert / update project triggers        | condition replaced by `0` / trigger moved off `claim`                    | `refuses a step of another project…` failed                                                                                            |
| parent and work-item cascades           | `ON DELETE CASCADE` removed, each                                        | the cascade case failed (and the repository remove case for the parent)                                                                |
| `down.sql` guard                        | guard statements removed                                                 | `refuses to reverse add_claim while one claim exists…` (migration-cli.db.test.ts) exited 0, table and row gone                         |
| domain: admin bypass                    | `&& !caller.isAdmin` removed                                             | `lets an admin claim for an unbound person` failed                                                                                     |
| domain: bound account                   | check replaced by `false`                                                | the three `person_not_bound` cases failed; via the command path `refuses a person nobody bound…` failed                                |
| domain: pin                             | check replaced by `false`                                                | `credential_not_for_person…` and the release case failed; via the command path `refuses a pinned credential…` failed                   |
| domain: parent account                  | check removed                                                            | `parent_claim_foreign…` failed (the foreign delegated claim passed)                                                                    |
| domain: order                           | `already_claimed` skipped when an ancestor holds a foreign subtree claim | `orders already_claimed before inside_subtree_claim` failed                                                                            |
| domain: inside check                    | removed                                                                  | both `inside_subtree_claim` cases failed                                                                                               |
| domain: release cascade                 | loop disabled                                                            | `cascades a subtree release…` failed                                                                                                   |
| SQLite store `taken` check              | disabled                                                                 | SQLite certification failed on `claims.add:taken-stated-remove`                                                                        |
| SQLite null writing account             | check removed                                                            | `refuses a stored claim with no writing account` failed                                                                                |
| SQLite `createdBy` from the claim       | override removed                                                         | `writes the claim as its claimant’s account…` failed                                                                                   |
| memory store `taken` check              | disabled                                                                 | memory certification failed                                                                                                            |
| memory `MemoryState` claim copy         | removed                                                                  | 8 of claim-command.test.ts lost their committed claims                                                                                 |
| journal decoder `readClaimReplay`       | call removed                                                             | `refuses a malformed claim replay` failed                                                                                              |
| `touchedBy` for claims                  | returned `[]`                                                            | `refuses a redo of a claim after the leaf moved on` applied the redo                                                                   |
| replay of `add_claims` refusing `taken` | answered ok                                                              | `refuses a redo of a claim once another holder took the step` failed                                                                   |
| working-plan refresh after a claim      | refresh removed                                                          | `shows the batch the progress its claim stated` let `setStatus ready` through                                                          |
| run length normalizer                   | upper bound removed                                                      | the 257-character run normalized                                                                                                       |
| refusal holders                         | replaced by `[]`                                                         | both orders of the race case failed                                                                                                    |
| write coordinator                       | `source.uow` replaced by a unit of work over the open gate               | the queued batch failed `BEGIN IMMEDIATE`: "cannot start a transaction within a transaction" instead of `already_claimed`, both orders |

On the race negative: the brief expected "bypass the coordinator and both win". Both cannot
win here: one connection refuses a nested `BEGIN IMMEDIATE`, and the `claim_step` unique index
and the store's held check stand behind the coordinator. What was observed is recorded above.

### Interim identity reads (slice 2 owes the real ones)

`ClaimStore.boundAccountOf(personId)` and `pinnedPersonOf(actorId)` answer `null` in the SQLite
and memory adapters (`UNBOUND_CLAIM_IDENTITY`) until `person.account_id` and
`external_identity.person_id` land on `feat/wbs-person-account` (task 2.1). Until then only an
organization `admin` or `super_admin` (scoped access) can claim: everyone else is refused
`person_not_bound`. Legacy access has no role and never bypasses. The command tests inject an
identity that binds persons and pins a credential, and prove `credential_not_for_person` fires
when the pin answers another person. The pin is read per account here; slice 2 must read it per
credential.

### Known gaps, not addressed in this slice

- Undo of a work-item deletion does not restore claims on it: the claim rows cascade with the
  work item, and the deletion snapshot does not carry them.
- Deleting a person cascades their claims (blue/green safety, like `assignment`), silently;
  directory usage does not count claims yet.
- Step deletion is restrictive on `claim.step_id` (like `step_blockage`); step usage does not
  count claims, so removing a claimed step fails on the foreign key.
- Memory source: `removePerson` does not cascade claims.
- A leaf whose only worked step is done reads `done` by the table's fold, so a claim on it is
  refused `item_done` even when other steps have no statement; the spec's default-claim
  scenario holds once the remaining steps carry work (an estimate). Tested both ways.
