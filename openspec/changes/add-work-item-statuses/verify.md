# verify — add-work-item-statuses

## Slice 0 — spec

### Constraints

- The REMOVED requirements in `specs/wbs-domain/spec.md` name headings that exist only in the
  unarchived changes `work-item-status-and-facts` and `status-from-the-menu`. Archive those two
  before this change, or its archive cannot find the requirements it removes.

Written on `batch-9/integration-25` (`ffbe37be`) while main was `262d006c`; retargeted to main at `f0feb5dd` (round 25, the same tree).

## Slice 1 — vocabulary and folds

Red before implementation: the five new or extended test files ran 0 pass, 5 fail, 5 errors
(`Cannot find module './blocked-by-proxy'`, `'./without-held-subtrees'`, `Export named
'foldStatuses' not found`). Green after: 36 example cases and 2 properties (2,000 runs each)
pass; the whole `libs/wbs/domain/domain` suite reported 819 pass, 0 fail.

## Slice 2 — swap guard

Red: `swap.test.ts`, `lib/docker.test.ts` and `lib/reconcile.test.ts` ran 15 pass, 2 fail
(`Export named 'holdKindsCommand' not found`). Green after: 165 pass, 0 fail.

## Commands

| Slice | Command                                                                     | Result                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                    | exit 0; 140 passed, 0 failed; this change valid, no issues                                                                                                                                                                                                                             |
| 1     | `bun test` in `libs/wbs/domain/domain`, `CLAUDECODE` unset                  | 819 pass, 0 fail                                                                                                                                                                                                                                                                       |
| 1     | `bunx nx affected -t typecheck test lint`, base `batch-9/integration-25`    | exit 1: 19 projects; failed `wbs-domain:lint` (4 `restrict-template-expressions` in a property test), `tool-devsync:test` (ADR numbers must be contiguous: 0033 renumbered 0032), `wbs-store-sqlite:test` (wall-clock `working-plan-performance` median, 141 s under the parallel run) |
| 1     | `bunx nx run-many -t lint test -p wbs-domain tool-devsync` after both fixes | exit 0; `Successfully ran targets lint, test for 2 projects`                                                                                                                                                                                                                           |

## Failure proofs

Each fault was injected into the production function, the named test run, and the file restored.

| Check                                      | Fault injected                                                | Test that observed it                                                                          | Observed                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| proxy spreads through proxies              | `queue.push(successorId)` commented out in `blockedByProxyOf` | `marks C behind a held A through B`, two more examples, the least-fixed-point property         | 6 pass, 4 fail; counterexample `l0 blocked → l2 draft → l5 ready`                                           |
| a fully held parent leaves the input       | `heldLeafIds.has(id)` in place of the every-leaf test         | `removes a parent whose every leaf is held, with its edges, floor and deadline`                | 6 pass, 1 fail; rows `Received + 1` (`p` kept)                                                              |
| proxy counts as stopped in the parent fold | `blocked_by_proxy` removed from `STOPPED_STATUSES`            | partition property; `is blocked by proxy when every child is stopped but not all the same way` | 19 pass, 2 fail; counterexample `["blocked_by_proxy"]`, `Expected: "blocked_by_proxy"`, `Received: "ready"` |
| a held id must be a leaf of the plan       | the `withoutHeldSubtrees` leaf check disabled                 | `refuses a held id that is not a leaf of this plan`                                            | `Received function did not throw`                                                                           |
| every leaf has a status                    | `continue` in place of the missing-status throw               | `refuses a leaf with no status`                                                                | `Received function did not throw`                                                                           |
| readiness guard                            | `isReadiness` reduced to `typeof value === 'string'`          | `admit exactly their own closed sets`                                                          | 19 pass, 1 fail; `Expected: false, Received: true`                                                          |
| hold guard                                 | `isHold` reduced to `typeof value === 'string'`               | `admit exactly their own closed sets`                                                          | 19 pass, 1 fail; `Expected: false, Received: true`                                                          |
| no status is given for a parent            | the non-leaf status check disabled                            | `refuses a status for anything but a leaf`                                                     | 9 pass, 1 fail; `Received function did not throw`                                                           |

### Slice 2 proofs

| Check                                                         | Fault injected                                            | Test that observed it                                                                      | Observed                    |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| the swap compares stored holds                                | `HOLD_KINDS_VOCABULARY` left out of `STORED_VOCABULARIES` | `refuses an image that reads no holds while holds are stored, and stops green`, three more | 62 pass, 4 fail             |
| only an absent hold CLI under a readable `src` means no holds | the directory check replaced by an unconditional `[]`     | `does not treat a missing source directory as an older release` (hold kind commands)       | `Expected: 74, Received: 0` |

## Astra review (2026-09-28)

No Critical. Important 1 (spec must require the least fixed point; the unknown scenario must
exclude every stopping predecessor): fixed in the spec with a typed-cycle scenario. Important 2
(which holds `in_progress` on a parent clears): left open for slice 3 in `design.md`; it is a
future contract, easily reversed, and raised for the Fable review. Minor 3 (typed cycle,
descendant-step endpoint, inherited floor and deadline, all-held plan): tests added. Minor 4
(vocabulary guard proofs): recorded above.

## Not run

- The h2puni host gate; the orchestrator runs it on the integration branch.
