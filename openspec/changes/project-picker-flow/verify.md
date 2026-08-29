# verify — `project-picker-flow`

Not yet implemented. This file records commands, their output, and the
failure-proof table below; nothing in it is a claim until it quotes a run.

## Commands

| Command                                                              | Result  |
| -------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                 | not run |
| `openspec validate --all --json`                                     | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | not run |

## Failure proofs (R5)

Every row must name the fault injected and the assertion that was watched
failing. A row with no observed failure is a claim, not a gate.

| Check                            | Fault injected                          | Test that saw it fail                                          | Watched |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------- | ------- |
| card placed outside the list     | anchor put back to the option's rect    | `the open card leaves every option visible`                    | pending |
| side flip, not a clamp           | flip replaced by a viewport clamp       | `a narrow window flips the card to the left of the list`       | pending |
| card moves vertically only       | horizontal anchor recomputed per option | `moving down the list does not move the card sideways`         | pending |
| a pick blurs the picker          | `blur()` removed from `choose`          | `choosing a project takes the focus off the picker`            | pending |
| the closed picker takes no caret | `readOnly` removed                      | `e2e` `clicking the closed picker does not put a caret…`       | pending |
| the re-arm waits for the list    | re-arm moved before `await load()`      | `creating a project puts the caret in its name`                | pending |
| the old draft is discarded       | `setRename(null)` deleted from `create` | `a draft armed for another project does not follow the create` | pending |

## Skipped or unavailable checks

None recorded yet.
