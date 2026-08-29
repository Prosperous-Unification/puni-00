# verify — `priority-default-medium`

Not yet implemented.

## The colours, as shipped

| Rank | Before                 | After     | Where the value came from                                              |
| ---- | ---------------------- | --------- | ---------------------------------------------------------------------- |
| 0    | `oklch(0.55 0.21 27)`  | unchanged | —                                                                      |
| 1    | `oklch(0.62 0.17 52)`  | unchanged | —                                                                      |
| 2    | `oklch(0.62 0.13 92)`  | pending   | copied from rank 4's pre-change value, per Dany's "same as Lowest now" |
| 3    | `oklch(0.58 0.11 205)` | pending   | —                                                                      |
| 4    | `oklch(0.58 0.02 265)` | pending   | —                                                                      |

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                                   | Fault injected                          | Test that saw it fail                                                       | Watched |
| --------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- | ------- |
| the default is the ladder's rank 2      | `bands[2].defaultValue` → constant `50` | `a re-cut ladder moves the default`                                         | pending |
| the default is keyed on rank, not label | lookup changed to `label === 'Medium'`  | `a renamed middle band still supplies the default`                          | pending |
| explicit null differs from absent       | `null` collapsed to absent              | `an explicit null creates an unprioritised item`                            | pending |
| the ladder is read per project          | read hoisted out of the batch loop      | `the default priority comes from the project being written to`              | pending |
| nothing existing was backfilled         | a scratch backfill migration added      | `an existing plan is unchanged`                                             | pending |
| ranks 3 and 4 are distinguishable       | both set to one value                   | `the two cool ranks are told apart`, and the Chromium spec in both palettes | pending |

## Skipped or unavailable checks

None recorded yet.
