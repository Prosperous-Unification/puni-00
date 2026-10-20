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

Task 0.2, verified 2026-10-19 on h2puni against the dev tenant with the dev web client's
credentials from `oidc-dev.env` (values never printed): `POST /oauth/token` with
`grant_type=client_credentials` and the WBS API audience answered
`403 unauthorized_client: Grant type 'client_credentials' not allowed for the client`. No
machine-to-machine application exists in the dev tenant. The deployed groups Action
(`docs/auth-integration.md` §post-login) maps `event.authorization.roles` in the post-login
flow, which Auth0 does not run for client-credentials tokens, so an M2M token would carry no
`wbs_groups` even once an M2M application is authorized for the API. Decision owed to Dany
before slice 2.5: either (a) an M2M application per fleet plus a credentials-exchange
(Machine to Machine flow) Action that sets `wbs_groups` from the application's metadata, or
(b) be-01 scopes a request from a linked credential by the linked account's memberships
when the token carries no groups claim, keeping the contract independent of the identity
provider. Recommended: (b), with (a)'s application still needed for the audience.

Task 0.3, read 2026-10-19 in `plan-document-shapes.ts`: plan document v9 (the laptop's main
checkout was stale at v6 when first read; the branch carries 9) carries `people`
with `teamIds`, `teams` with `serviceIds`, and per-item `assignees` keyed by step reference.
A Burokrat branch rule can therefore read a person's teams and a step's assignee from v6
without a new version. Claims are not in v9; showing them in the export needs a v10 field,
which is not in this change (the export SHALL NOT carry account ids either way).

Dev store activation, read 2026-10-20 (read-only): `organization`, `organization_membership`
and `external_identity` hold 0 rows on dev. Organizations are not activated there, so slice
2.4's CLI refuses to link (it refuses before activation, because pre-activation logins never
read `external_identity`) and task 2.5's dev proof is blocked until dev is activated. That is
an operator decision for Dany: activating organizations on dev changes sign-in for every dev
user.

`openspec validate --all --json` on this change: run before each push, result in the PR.

## Slice 1: the claim record and its decision (tasks 1.1 to 1.6)

Run on the laptop 2026-10-19, every test under `env -u CLAUDECODE` (13 repo tests fail only
under `CLAUDECODE=1`). Heavy suites were run per project, not the full gate. The h2puni gate
on `f4bdfee82` was queued behind the host lock and cancelled before it ran when the review
below arrived; the gate on the review fixes is recorded under "Review fixes".

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

## Review fixes (PR #579 review, 2026-10-19)

| Finding                                                               | Fix                                                                                                                                                                                                                                                                                                                               | Test (fault injected → observed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 undo of a subtree claim cascaded delegated claims it never wrote | the `remove_claims` replay refuses when a stored claim not in the entry names a listed claim as parent ("a claim has been delegated under it since.")                                                                                                                                                                             | `refuses an undo of a subtree claim that would take a delegated claim it never wrote` in store-sqlite `claim-race.db.test.ts`, the exact sequence: F subtree-claims root, F claims the child under it, G renames the child, undo (stale), undo again → refused `stale_undo`, both claims kept. Refusal removed → the second undo answered ok and the cascade took the delegated claim. It lives in the SQLite harness rather than core's `claim-command.test.ts` because core does not depend on `@wbs/store-sqlite`, and the memory source keeps no revisions so the first undo is never stale there |
| S2-2 `steps: []` answered alreadyHeld                                 | normalizer refuses `steps_must_name_a_step` (new parser code); `decideClaim` throws on an empty list                                                                                                                                                                                                                              | `refuses an empty step list on a claim and a release` (command-normalizers.test.ts): refusal removed → normalized. Property widened to `minLength: 0`; an empty list must throw, never answer alreadyHeld: throw removed → the property and `throws on an empty step list…` failed                                                                                                                                                                                                                                                                                                                    |
| S3-1 steps named on a non-leaf ignored                                | `steps_on_subtree` (409) in `decideClaim` and `decideRelease`                                                                                                                                                                                                                                                                     | `refuses steps named on a non-leaf` / `…non-leaf release`: each check removed → its case failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3-2 a different `parentClaim` read as alreadyHeld                    | same holder now also means same parent; otherwise `already_claimed` naming itself                                                                                                                                                                                                                                                 | `refuses the holder repeating its claim under another parent, naming itself`: parent left out → alreadyHeld                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S3-4 docs                                                             | gate state stated above; tasks.md 1.5 matches the observed negative                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| S3-5 person delete with claims                                        | `DirectoryUsageRows.claims`; SQLite `removePerson` refuses `in_use` without `cascade` and deletes the claims with it; the memory source does the same through its own claim table (before, memory dropped the person and kept stale claims); usage effect `claim_released` (step or subtree), on the wire and in fe-01's sentence | conformance `directory.removePerson:claims-in-use` on both sources: SQLite check removed → SQLite certification failed; memory refusal removed → memory certification failed. `names each claim the removal releases…` (directory-usage.test.ts): filter emptied → failed                                                                                                                                                                                                                                                                                                                             |
| S3-5 step delete with a claim                                         | step usage counts `claims` (`stepIsInUse`, `StepInUse.claims?` on the wire, optional for an older be-01); a confirmed cascade deletes them                                                                                                                                                                                        | `counts the claims, refusing an unconfirmed removal of a claimed step…` (step.db.test.ts): claims term removed → the step and its claim were deleted unconfirmed                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| S4                                                                    | `claiming()` returns `identity: ClaimIdentity`; a leaf in a project with no steps answers `no_steps`                                                                                                                                                                                                                              | `answers no_steps on a leaf of a project with no steps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Still a known gap: deleting a work item and undoing the delete does not restore its claims
(they cascade with the row and the deletion snapshot does not carry them). The S2-1 fix does
not cover it: it guards a claim's own undo, not a structural delete's. The memory step fixture
does not model step usage at all, so it does not count claims either.

Commands after the fixes, laptop, `env -u CLAUDECODE`:

| Command (cwd)                                                                                        | Result                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `bun test src/claim.test.ts` (domain)                                                                | 54 pass, 0 fail                                           |
| `bun test src --timeout=10000` (core)                                                                | 1072 pass, 0 fail                                         |
| `bun test` (conformance)                                                                             | 35 pass, 0 fail                                           |
| `bun test` (store-memory)                                                                            | 188 pass, 0 fail                                          |
| `bun test` (contracts)                                                                               | 475 pass, 0 fail                                          |
| `bun test` (mcp-01)                                                                                  | 423 pass, 0 fail                                          |
| `bun test` claim, claim-race, step, directory, source-conformance (store-sqlite)                     | 144 pass, 0 fail                                          |
| `bun test --timeout=30000` (store-sqlite, whole suite)                                               | 1661 pass, 0 fail                                         |
| `bun test` step service/controller, typed-dependency ×3, directory controllers (be-01)               | 192 pass, 0 fail after one expectation gained `claims: 0` |
| `bunx vitest run` wbs-api and directory tests (fe-01, `TZ=UTC`)                                      | 113 pass, 0 fail                                          |
| `bunx tsc --build --force` domain, contracts, core, conformance, both adapters, be-01, mcp-01, fe-01 | no diagnostics                                            |

Index fix after review: the gate on `4bad2c3ac` would fail R1's module index check
(`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`: "unindexed candidate path …
claim-fixture.ts"); it was cancelled. `claim-fixture.ts`, `claims.ts` and
`claim-command.test.ts` were added to their folders' `module-index` memberships; the other new
files sit in folders with no module index. `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`:
15 pass, 0 fail; the whole tool-devsync suite: 859 pass, 0 fail (one earlier run showed ten
eslint-boundary failures that did not repeat, the "No cached ProjectGraph" condition).

### Gate for slice 1

`bin/h2puni-gate.sh cc968e684c2f371a2306c115f1d2fb02fdffaf2b` on h2puni (tree
`/home/puni1/puni-00-gate-tbf`, log `~/gate-claim-record-cc968e68-r2.log`): printed
`h2puni gate: running on cc968e684c2f371a2306c115f1d2fb02fdffaf2b`, 47 projects passed, Burokrat
and Dash suites passed, `exit=0` (2026-10-20). The earlier run on the same SHA was refused with
exit 75 after its 30-minute queue budget behind another gate; the rerun used
`HEAVY_LOCK_WAIT_SECONDS=10800`.

## Slice 3: the startable read (tasks 3.1 and 3.2)

Run on the laptop 2026-10-19/20 on `feat/wbs-startable-read` (branched from
`feat/wbs-claim-record`), every test under `env -u CLAUDECODE`, targeted suites only.

What was built: `findStartableWork` (`libs/wbs/application/core/src/module/work-item/startable.ts`),
`WorkItemService.startableWithin`, the descriptor `readStartableWork`
(`GET /api/projects/:id/startable?team=`, `getApiProjectsByIdStartable`), and its route. It
reuses `isStartableStatus` (now exported from `claim.ts` and used by `decideClaim`), the
`statusesOf` fold the claim command uses, and a new `predecessorLeavesOf` beside
`blockedByProxyOf`. The claim write instant comes from a new port read
`ClaimStore.listStampedByProject` (SQLite `created_at`; the memory source stores the write's
stamp), certified by the new case `claims.listStampedByProject:write-instant`.

Choices the spec left open, recorded here:

- `team` is a team id. A team the caller's directory does not hold (under scoped access, one the
  organization does not own) answers 404 `unknown_team`; `unknown_team` became a shared refusal
  code (bare here, with command context in a batch).
- `number` is the frozen number when one is frozen, else the derived one; `numberIsFrozen` says
  which.
- `claimed` lists every claimed step of every leaf the team filter keeps, whatever the leaf's
  status, so a claim on work that has since stopped still shows. `leaves` holds only leaves with
  at least one startable step.
- The subtree claim named is the nearest one above the leaf; with nested delegated subtree claims,
  `parentClaimId` leads up the chain.
- Unfinished predecessors are predecessor leaves (legacy and typed dependencies taken down to
  leaves, as `blockedByProxyOf` reads them) whose derived status is not `done`.
- Names are the organization's own under scoped access, as the tree read names assignees.
- The organization harness's `WorkItemService` now carries a claim store; production already
  did through `servicesOver`.

### Commands and results

| Command (cwd)                                                                                                                                               | Result                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `bun test src/module/work-item/startable.test.ts` (libs/wbs/application/core)                                                                               | 9 pass, 0 fail                                          |
| `bun test src --timeout=10000` (libs/wbs/application/core)                                                                                                  | 1081 pass, 0 fail                                       |
| `bun test src/blocked-by-proxy.test.ts src/blocked-by-proxy.property.test.ts src/claim.test.ts` (libs/wbs/domain/domain)                                    | 66 pass, 0 fail                                         |
| `bun test` (libs/wbs/application/conformance)                                                                                                               | 35 pass, 0 fail                                         |
| `bun test` (libs/wbs/adapters/store-memory)                                                                                                                 | 188 pass, 0 fail                                        |
| `bun test src/claim.db.test.ts src/claim-race.db.test.ts src/testing/source-conformance.db.test.ts` (libs/wbs/adapters/store-sqlite)                        | 94 pass, 0 fail                                         |
| `bun test` (libs/wbs/domain/contracts)                                                                                                                      | 475 pass, 0 fail                                        |
| `bun test` (apps/wbs/mcp-01)                                                                                                                                | 423 pass, 0 fail                                        |
| `bun test src/app.routes.test.ts src/openapi/ organization-context, startable-organization, schedule-organization, work-item-rows controller tests` (be-01) | 106 pass, 0 fail                                        |
| `bun test` command-organization, membership-organization, directory-command-organization controller tests (be-01)                                           | 74 pass, 0 fail                                         |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (root)                                                                                   | 15 pass, 0 fail (with the new files staged and indexed) |
| `bunx tsc --build --force` domain, contracts, core, conformance, store-sqlite, store-memory, be-01, mcp-01, fe-01                                           | no diagnostics                                          |
| `bunx eslint` on every changed TypeScript file                                                                                                              | no errors                                               |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-team-claims --json`                                                                                          | 1 passed, 0 failed                                      |

MCP: the generated tool list moves by exactly one, 81 to 82 (`getApiProjectsByIdStartable`);
the pinned list in `apps/wbs/mcp-01/src/generated-document.test.ts` and the README count were
updated.

OpenAPI emit diff (`bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts` on
`origin/feat/wbs-claim-record` and on this branch): one path added,
`/api/projects/{id}/startable` (GET, responses 200, 400, 401, 403, 404, 409); no path removed or
changed; every non-path key (components included) identical.

### R5 proofs (fault injected, test observed, all restored and re-run green)

| Check                                            | Injected fault                                               | Observed                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| startable status (the brief's negative)          | `statusFor(leafId)` replaced by `row.readiness ?? 'unknown'` | `leaves a ready leaf behind an unfinished held predecessor out` failed (the blocked-by-proxy leaf was listed)                                |
| team filter                                      | condition replaced by `false`                                | the allotment, no-team and subtree cases failed                                                                                              |
| claimed step not startable                       | a held step also counted free                                | the same three cases failed                                                                                                                  |
| scoped names and teams                           | root catalogs read under scoped access                       | `answers a member and a viewer alike, with the organization's own names` and `refuses a team the caller's organization does not hold` failed |
| repeated query key                               | `hasRepeatedKey` check removed                               | `refuses a repeated team and an undeclared key` failed                                                                                       |
| SQLite stamped read                              | null-instant check made unreachable                          | `refuses a stamped read of a claim with no write instant` failed                                                                             |
| memory write instant                             | stored `claimedAt: 0`                                        | memory certification failed on `claims.listStampedByProject:write-instant`                                                                   |
| `unknown_team` as a bare refusal (type boundary) | registry change reverted                                     | `readStartableWork` failed TS2345 (`not assignable to parameter of type 'never'`)                                                            |

### Not run, and known gaps

- The be-01 and store-sqlite suites were run per affected file, not whole; the h2puni gate
  carries them (below).
- The read does not go through the shared live-plan capture the tree read uses when shared
  people mode is on; it reads the stores through `admits`, as `updateInstantsWithin` does beside
  the tree. A stranger is refused alike (404, and 403 before any lookup for an unbound session),
  but a live-plan `access_refused` the tree read can answer is not reproduced here.
- No pagination: the read answers the whole project. The dev store's 211 work items make that
  small; a large project would want a page.

### Review fixes (PR #581 review, 2026-10-20)

| Finding                                       | Fix                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 a claimed step lacked its assignee (D1)  | `ClaimedStep.assignee: NamedPerson \| null` (and on the wire); test `shows a claimed step beside its assignee`                                                                                                                                                      |
| S3-2 silent subtree claims were invisible     | `subtreeClaims`: every subtree claim of the project, team filter or not, with address, holder, run, parent and write instant; test `lists a silent subtree claim whose every leaf has stopped`                                                                      |
| S3-3 directory-wide scans under legacy access | new `DirectoryStore.namesOf(catalog, ids)` (one primary-key read per id; SQLite, memory, the batch wrapper); assignee names come with `assignmentsInProject`, holders and teams through `namesOf`; test `startable-scope.db.test.ts` (40 unrelated assigned people) |
| S3-4 two reddening checks without `Proof:`    | both watched and commented (rows below)                                                                                                                                                                                                                             |
| S4 orphaned `ClaimWriteOutcome` JSDoc         | moved back beside its type                                                                                                                                                                                                                                          |
| S4 claim person outside the organization      | `claim_person` arm in `findCrossReferences` (and in `PROJECT_CROSS_REFERENCE_KINDS`, mapped to `unknown_person` in command references); crossing case added to `schedule-organization.controller.db.test.ts`                                                        |
| S4 duplicated progress and dependency reads   | `statusReadsOf` returns the statuses with the progress statements and edges it read; `statusesOf` and `startableWithin` share it                                                                                                                                    |
| S4 unreachable cycle guard                    | dropped: `deriveNumbers` has already thrown for a cycle or an orphan; the walk now throws on a parent that is not a row                                                                                                                                             |

`organization-ownership.ts` (activation reconciliation) has no `claim` arm; activation of an
organization over claims whose person it does not own is not covered by this fix.

R5 proofs added (fault injected, test observed, restored):

| Check                                   | Injected fault                                       | Observed                                                                                                   |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| done step left out (`startable.ts`)     | `!done.has(key)` replaced by `true`                  | `leaves a done step out and keeps the other` failed                                                        |
| finished predecessors dropped           | `!== 'done'` filter made always true                 | `names the unfinished predecessors of a startable leaf, and drops finished ones` failed                    |
| claimed step's assignee                 | `assignee: null`                                     | `shows a claimed step beside its assignee` failed                                                          |
| subtree claims listed                   | `subtreeClaims: []`                                  | `lists a silent subtree claim whose every leaf has stopped` and the subtree-holder case failed             |
| legacy names bounded (service)          | `directory.listPeople()` in place of `namesOf`       | `materializes only the assignee and the claim holder during a tiny startable read` failed on `SCAN person` |
| legacy names bounded (SQLite `namesOf`) | `listPeople()` filtered in place of the per-id reads | the same case failed on `SCAN person`                                                                      |
| `claim_person` cross reference          | arm removed                                          | `fails the schedule read closed over a crossing claim_person` answered 200, 500 owed                       |

Commands after the fixes, laptop, `env -u CLAUDECODE`:

| Command (cwd)                                                                                                                                       | Result            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `bun test src --timeout=10000` (core; `startable.test.ts` alone: 11 pass)                                                                           | 1083 pass, 0 fail |
| `bun test` blocked-by-proxy, its property test, claim (domain)                                                                                      | 66 pass, 0 fail   |
| `bun test` (conformance)                                                                                                                            | 35 pass, 0 fail   |
| `bun test` (store-memory)                                                                                                                           | 188 pass, 0 fail  |
| `bun test` (contracts)                                                                                                                              | 475 pass, 0 fail  |
| `bun test` claim, claim-race, source-conformance, startable-scope, assignment-scope, project, organization-reconciliation, directory (store-sqlite) | 168 pass, 0 fail  |
| `bun test` (mcp-01)                                                                                                                                 | 423 pass, 0 fail  |
| `bun test` app.routes, openapi, organization-context, startable-organization, schedule-organization, work-item-rows, command-organization (be-01)   | 136 pass, 0 fail  |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                                  | 15 pass, 0 fail   |
| `bunx tsc --build --force` domain, contracts, core, conformance, both adapters, be-01, mcp-01, fe-01                                                | no diagnostics    |

OpenAPI emit diff against `origin/feat/wbs-claim-record` re-run: still one path added, nothing
else changed. MCP tool count unchanged by the fixes (82).

### Gate for slice 3

`bin/h2puni-gate.sh 49f4bc4ff7c942824112ddb6f48f837498b14765` on h2puni (tree
`/home/puni1/puni-00-gate-tbf`, `HEAVY_LOCK_WAIT_SECONDS=10800`, log
`~/gate-startable-49f4bc4f.log`): printed `h2puni gate: running on
49f4bc4ff7c942824112ddb6f48f837498b14765`, `exit=0` (2026-10-20). That SHA is the review fixes
rebased onto `plan/wbs-team-claims`; the commit recording this paragraph changes this file only.
Earlier queued runs on `e767ac91d` and `d77c5336f` were cancelled before they started (exit 143).
