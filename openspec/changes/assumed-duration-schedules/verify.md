# verify — `assumed-duration-schedules`

Not yet implemented. **Ordered after `dep-reach-whole-item`.**

## What this change is expected to move

Every plan holding an unestimated slice. Fully-estimated plans must not move at
all — that is the line between "the assumption reached the engine" and "the
assumption leaked into estimated work".

| Fixture         | Holds an unestimated slice | Dates before | Dates after | Expected to move |
| --------------- | -------------------------- | ------------ | ----------- | ---------------- |
| fully estimated | no                         | pending      | pending     | no               |
| pending         | pending                    | pending      | pending     | pending          |

## The six reporters (design D2)

Each must answer exactly as it did before. A yes here is the change having
silently redefined "estimated".

| Reporter                           | Answer before              | Answer after |
| ---------------------------------- | -------------------------- | ------------ |
| days column                        | blank                      | pending      |
| roll-up                            | blank                      | pending      |
| readiness badge / walk to next gap | counts the gap             | pending      |
| export                             | unestimated                | pending      |
| `estimatedStepIds` facet           | absent                     | pending      |
| `anchor-slice` reach               | skips the unestimated step | pending      |

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                            | Fault injected                                  | Test that saw it fail                                  | Watched |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------ | ------- |
| one constant, two readers        | constant changed to 3                           | a scheduled date **and** a drawn bar width, in one run | pending |
| the assumption reaches leveling  | applied to dependencies only                    | `two unestimated slices for one person do not overlap` | pending |
| assumed is not estimated         | estimated-predicate changed to "has a duration" | all six reporters, red at once                         | pending |
| the bar still says it is a guess | `data-assumed` dropped                          | `the bar still says it is a guess`                     | pending |
| the successor really waits       | assumed duration reverted to zero               | the Chromium chain spec                                | pending |

## Skipped or unavailable checks

None recorded yet.
