<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on the Linux laptop, on `fix/wbs-assign-subtree-claimed` off `24602e8d6`, every bun test
with `env -u CLAUDECODE`, one heavy target at a time, after the Fable review of #715.

| Command                                                                                     | Result                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `bun test libs/wbs/adapters/store-sqlite/src/assignee-commands.db.test.ts`                  | 19 pass, 1 skip (memory keeps no revisions), 0 fail              |
| `bun test libs/wbs/application/core/src/module/work-item/reassigned-claimed-steps.test.ts`  | 1 pass, 0 fail                                                   |
| `bun test apps/wbs/be-01/src/swarm-end-to-end.db.test.ts`                                   | 7 pass, 0 fail (six consecutive runs)                            |
| `bun test libs/wbs/domain/contracts/src/http/work-item-shapes.test.ts`                      | 5 pass, 0 fail                                                   |
| plan-command-shapes, definitions, assignee-calendar, command-bindings, claim-command        | 5, 2, 2, 1 and 24 pass, 0 fail                                   |
| be-01 command-organization controller, plan-commands, swarm-rehearsal                       | 29, 27 and 8 pass, 0 fail                                        |
| `bun test apps/wbs/mcp-01/src/openapi-tools.test.ts`                                        | 33 pass, 0 fail                                                  |
| `nx run wbs-{contracts,core,store-sqlite,be-01,mcp-01}:typecheck`                           | each succeeded                                                   |
| `nx run wbs-{contracts,core,store-sqlite,be-01}:lint`                                       | each succeeded                                                   |
| `nx run wbs-contracts:test`, `wbs-core:test`, `wbs-store-sqlite:test`, `wbs-mcp-01:test`    | 506, 1327, 1904 (1 skip) and 517 pass, 0 fail                    |
| `bunx openspec validate --all --json`                                                       | 284 passed, 0 failed; this change carries the archive-order INFO |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                           |
| `nx run tool-devsync:test`                                                                  | 921 pass, 0 fail                                                 |

### Not run, and why

- `nx run wbs-be-01:test` (full suite) and `wbs-mcp-01:lint`: another heavy agent shares the
  laptop; the be-01 files that exercise `assignSubtree` ran directly above, and no mcp-01
  source changed. CI runs the full gate on the PR.
- `bin/h2puni-gate.sh`: the brief asks for a PR; CI runs the full gate, and done waits on it.

### Archive order

Archive after `wbs-resources`: the delta modifies a requirement that change adds, so until
then `openspec validate` reports "Archive would refuse … target spec does not exist".

## Proofs (R5)

The listing is a reported outcome, not a safety check; each slice was still watched red
first, and each condition of `findReassignedClaimedSteps` was broken on the production path,
the test watched failing, and the fault reverted. Watched 2026-10-24.

| Check                                              | Injected fault                                | Observed                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| wire schema declares `reassignedClaimedSteps`      | before the field existed in `appliedResults`  | `assignSubtree replies declare each claimed step they reassigned` accepted a malformed entry (4 pass, 1 fail)              |
| `holder` is one object with `claimId` and `runId`  | the earlier `holderPersonIds` shape           | the same schema case and 8 db cases (both stores) failed (the two files together: 15 pass, 9 fail)                         |
| service and binding report the listing             | before `assignSubtree` answered it            | the new cases and the direct-service case failed on memory and SQLite (11 pass, 6 fail)                                    |
| HTTP: step 9 of `swarm-end-to-end.db.test.ts`      | before `holder` existed                       | step 9 failed on the response body, and step 10 with it (5 pass, 2 fail)                                                   |
| the "assignee changed" filter                      | `previousPersonId === personId` check removed | `lists no step assigned to its own holder, nor one whose assignee did not change` failed on both stores                    |
| the "held by someone other than the assignee" test | holder filter weakened to "any holder"        | the same case failed on both stores (15 pass, 2 fail)                                                                      |
| only a claim on that very step counts              | `&& each.stepId === stepId` removed           | `lists only a claim on the step it assigns: not a subtree claim, not another step` failed on both stores (17 pass, 2 fail) |
| tree order                                         | the `byTreeOrder` sort removed                | `lists reassigned claimed steps in tree order…` failed (0 pass, 1 fail); swarm step 9 failed in 4 of 8 runs                |

## Decisions

- Report, never refuse; only a claim on the assigned step counts; the holder is named by
  claim id, person id and run (see the proposal).
- The `claim_step` unique index on `(work_item_id, step_id)` allows one step claim per step,
  so each entry has exactly one holder.
- A service built without a claim store throws: every production composition
  (`servicesOver` in `compose.ts`) wires one.
