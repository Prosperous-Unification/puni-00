# verify — `dep-reach-whole-item`

Not yet implemented.

## What this change is expected to move

Every existing project's dates, wherever a dependency's predecessor has more
than one estimated step. That is the intent, not a regression, and the evidence
for it is section "Identity, re-derived" below rather than a green suite.

## Identity, re-derived

| Fixture           | Reach          | Dates before | Dates after | Expected to move |
| ----------------- | -------------- | ------------ | ----------- | ---------------- |
| no dependencies   | both           | pending      | pending     | no               |
| single-step chain | both           | pending      | pending     | no               |
| multi-step chain  | `whole-item`   | pending      | pending     | **yes**          |
| multi-step chain  | `anchor-slice` | pending      | pending     | no               |

A fixture in the "no" rows that moved is a bug in the reach's plumbing. A
fixture in the "yes" row that did not move means the column default never
reached it.

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| migration lint                                                                    | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                                     | Fault injected                               | Test that saw it fail                                           | Watched |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- | ------- |
| an unrecognised reach throws              | throw replaced by `?? 'whole-item'`          | `an unrecognised stored reach is refused`                       | pending |
| the whole-item arm reaches the last slice | arm returning the anchor                     | `a project's reach decides what a successor waits for`          | pending |
| the reach touches only the predecessor    | reach applied to the successor's end too     | `a parent predecessor expands to its leaves under either reach` | pending |
| the reach is read per project             | the read hoisted out of the run              | two projects on different reaches                               | pending |
| the arrow follows the schedule            | origin left at the anchor under `whole-item` | `the arrow leaves the finish under the whole-item reach`        | pending |
| the column default reached existing rows  | —                                            | `existing plans move to the whole-item rule`                    | pending |

## Skipped or unavailable checks

None recorded yet.
