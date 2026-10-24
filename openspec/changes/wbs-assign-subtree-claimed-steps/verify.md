<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on the Linux laptop, on `fix/wbs-assign-subtree-claimed` off `24602e8d6`, every bun test
with `env -u CLAUDECODE`, one heavy target at a time.

| Command                                                                                     | Result                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bun test libs/wbs/adapters/store-sqlite/src/assignee-commands.db.test.ts`                  | 17 pass, 0 fail (1 skipped: the memory store keeps no revisions)    |
| `bun test libs/wbs/domain/contracts/src/http/work-item-shapes.test.ts`                      | 5 pass, 0 fail                                                      |
| plan-command-shapes, definitions, assignee-calendar, command-bindings, claim-command tests  | each 0 fail                                                         |
| be-01 command-organization controller, plan-commands, swarm-end-to-end, swarm-rehearsal     | 29, 27, 7 and 8 pass, 0 fail                                        |
| `bun test apps/wbs/mcp-01/src/openapi-tools.test.ts`                                        | 33 pass, 0 fail                                                     |
| `nx run wbs-{contracts,core,store-sqlite,be-01,mcp-01}:typecheck`                           | each succeeded                                                      |
| `nx run wbs-{contracts,core,store-sqlite}:lint`                                             | each succeeded                                                      |
| `nx run wbs-{contracts,core,store-sqlite,mcp-01}:test`                                      | each succeeded (wbs-core 1326 pass, wbs-store-sqlite 1902 pass)     |
| `bunx openspec validate --all --json`                                                       | 284 passed, 0 failed (this change: the expected archive-order INFO) |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                              |

### Not run, and why

- `nx run wbs-be-01:test` and `wbs-be-01:lint`, `wbs-mcp-01:lint`: no source of either app
  changed and another heavy agent shares the laptop; the be-01 files that exercise
  `assignSubtree` ran directly above. CI runs the full gate on the PR.
- `bin/h2puni-gate.sh`: the brief asks for a PR; CI runs the full gate.

## Proofs (R5)

The listing is a reported outcome, not a safety check; each slice was still watched red
first, and each filter of `findReassignedClaimedSteps` was broken on the production path and
the test watched failing, then reverted. Watched 2026-10-24.

| Check                                         | Injected fault                                | Observed                                                                                                     |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| wire schema declares `reassignedClaimedSteps` | before the field existed in `appliedResults`  | `assignSubtree replies declare each claimed step they reassigned` accepted a malformed entry (4 pass/1 fail) |
| service and binding report the listing        | before `assignSubtree` answered it            | the two new cases and the direct-service case failed on memory and SQLite (11 pass/6 fail)                   |
| the "assignee changed" filter                 | `previousPersonId === personId` check removed | `lists no step assigned to its own holder, nor one whose assignee did not change` failed on both stores      |
| the "held by someone other than the assignee" | holder filter weakened to "any holder"        | the same case failed on both stores (15 pass/2 fail)                                                         |

## Decisions

- Report, never refuse; only step claims count; holders by person id (see the proposal).
- `holderPersonIds` is sorted and distinct, so one person holding a step under two runs is
  named once.
