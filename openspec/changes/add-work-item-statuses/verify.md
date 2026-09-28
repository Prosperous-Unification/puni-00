# verify — add-work-item-statuses

## Slice 0 — spec

Base `batch-9/integration-25` (`ffbe37be`), because main was still `262d006c` on 2026-09-28.

## Slice 1 — vocabulary and folds

Red before implementation: the five new or extended test files ran 0 pass, 5 fail, 5 errors
(`Cannot find module './blocked-by-proxy'`, `'./without-held-subtrees'`, `Export named
'foldStatuses' not found`). Green after: 36 example cases and 2 properties (2,000 runs each)
pass; the whole `libs/wbs/domain/domain` suite reported 817 pass, 0 fail.

## Commands

| Slice | Command                                                                  | Result                                                     |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                 | exit 0; 140 passed, 0 failed; this change valid, no issues |
| 1     | `bun test` in `libs/wbs/domain/domain`, `CLAUDECODE` unset               | 817 pass, 0 fail                                           |
| 1     | `bunx nx affected -t typecheck test lint`, base `batch-9/integration-25` | recorded in the slice 1 pull request                       |

## Failure proofs

Each fault was injected into the production function, the named test run, and the file restored.

| Check                                      | Fault injected                                                | Test that observed it                                                                          | Observed                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| proxy spreads through proxies              | `queue.push(successorId)` commented out in `blockedByProxyOf` | `marks C behind a held A through B`, two more examples, the least-fixed-point property         | 6 pass, 4 fail; counterexample `l0 blocked → l2 draft → l5 ready`                                           |
| a fully held parent leaves the input       | `heldLeafIds.has(id)` in place of the every-leaf test         | `removes a parent whose every leaf is held, with its edges, floor and deadline`                | 6 pass, 1 fail; rows `Received + 1` (`p` kept)                                                              |
| proxy counts as stopped in the parent fold | `blocked_by_proxy` removed from `STOPPED_STATUSES`            | partition property; `is blocked by proxy when every child is stopped but not all the same way` | 19 pass, 2 fail; counterexample `["blocked_by_proxy"]`, `Expected: "blocked_by_proxy"`, `Received: "ready"` |
| a held id must be a leaf of the plan       | the `withoutHeldSubtrees` leaf check disabled                 | `refuses a held id that is not a leaf of this plan`                                            | `Received function did not throw`                                                                           |
| every leaf has a status                    | `continue` in place of the missing-status throw               | `refuses a leaf with no status`                                                                | `Received function did not throw`                                                                           |
| no status is given for a parent            | the non-leaf status check disabled                            | `refuses a status for anything but a leaf`                                                     | 9 pass, 1 fail; `Received function did not throw`                                                           |

## Not run

- The h2puni host gate; the orchestrator runs it on the integration branch.
