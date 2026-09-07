# Verification — `store-port-and-unit-of-work`

Nothing below is a claim until it carries observed output. A row with an empty **Observed**
cell is a check that has not been watched failing and therefore is not done (R5).

## Wave 0 collision gate

Re-run 2026-09-08 against `main` @ `d2e14214`, over the file set the change declares
(`apps/be-01/src/repository/**`, `db.ts`, `services.ts`, `service/plan-commands.ts`,
`service/write-lock.ts`, `apps/be-01/src/testing/**`, `libs/domain`'s
`canonical-schedule-input.ts`).

| Source                                                      | Finding                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open PRs (#302, #307, #308, #311, #314, #315)               | **No intersection.** None touches `apps/be-01/src/**` or `libs/domain`; #307 is fe-01 tests, #308 and #311 are `docs/state/*`, #302/#315 edit `.github/workflows/ci.yml`.                                                                                                                                                                       |
| Branches (last 20 by commit date)                           | **No intersection.** The `wip/salvage-ws-auth-*` pair is gw-01 + fe-01; `refactor/planned-project` has no content diff against `main` (squash-merged as `cbad68af`).                                                                                                                                                                            |
| `openspec/changes/dual-optimized-scheduler` (20 unchecked)  | **Collides** on `SCHEDULER_CONTRACT_VERSION` in `libs/domain` (1.5) and the `beginOptimizationDrain`/`finishOptimizationDrain` repository seams (3.9b). → the `Scheduler` port and `scheduleInputHash`'s move are **out of this change** (proposal, non-goals). The drain functions are gated here as ordinary mutating methods when they land. |
| `openspec/changes/plan-json-import` (19 unchecked, unbuilt) | **Collides** on the transaction boundary (2.2/2.3 drive `transactions.begin`). It is Dany's and unimplemented; whichever lands second rebases onto `UnitOfWork.run`.                                                                                                                                                                            |
| `openspec/changes/retired-schema-cleanup` (5 unchecked)     | **Coordinate.** Its 4.2 migrates `insertSubtree` (`work-item.ts:860`), a method this change gates. Sequence, do not overlap.                                                                                                                                                                                                                    |
| `openspec/changes/saved-plans`, `gantt-calendar-markers`    | Frozen content this change must preserve: `saved-plan-capture.db.test.ts`, `saved-plan-created-by-id.db.test.ts`, the `plan-commands` exclusion, and the marker store port.                                                                                                                                                                     |
| `docs/refactoring/collisions.md` ownership                  | R2/R6 own the directory repositories and fixtures; `services.ts` is a shared composition needing an explicit handoff. All peer sessions were idle at the time of this gate.                                                                                                                                                                     |

## Failure-proof table

| Check                                                          | Fault injected                                                                    | Test that observed it | Observed |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- | -------- |
| A route write started during a batch is not rolled back (d)    | the gate removed from `StepRepository.add`                                        |                       |          |
| Every public transactional write takes a turn (i)              | `OPEN` in place of the coordinator for one store                                  |                       |          |
| A scope store does not wait for its own batch's turn (h)       | scope stores built over the coordinator instead of `OPEN`                         |                       |          |
| The post-rollback repair reaches surviving state (k)           | the public journal in the callback; the discarded memory scope; a throwing repair |                       |          |
| A committed event still leaves when the next batch refuses (l) | a shared ambient announcement slot                                                |                       |          |
| A saved plan takes no turn and survives both outcomes (j)      | history tables put back inside the swapped clone                                  |                       |          |
| `Scope` cannot enlist a saved plan                             | a `scope.stores.savedPlans` reference                                             | `tsc`                 |          |
| A stub with no allowlist line                                  | a stubbed memory method left off the allowlist                                    |                       |          |
| A runtime port with no adapter                                 | a service constructed without its port                                            | `tsc`                 |          |

## Gate

| Command | When | Result |
| ------- | ---- | ------ |
|         |      |        |
