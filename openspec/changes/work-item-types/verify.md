# verify — `work-item-types`

Not yet implemented. **Ordered after `unified-reference-cell-ux`.**

## The width claim

| Figure                                            | Before  | After   |
| ------------------------------------------------- | ------- | ------- |
| `foldedTableMinWidth` over the default column set | pending | pending |

These must be equal. A difference means the column reached the default set.

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| migration lint                                                                    | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                          | Fault injected                          | Test that saw it fail                              | Watched |
| ------------------------------ | --------------------------------------- | -------------------------------------------------- | ------- |
| type names are unique          | the unique index dropped                | `a type name is unique in the directory`           | pending |
| the write replaces wholesale   | replacement made additive               | `types are replaced wholesale`                     | pending |
| undo restores the previous set | undo restoring an empty set             | the `plan-history` undo case                       | pending |
| the column is off by default   | `type` removed from the hidden defaults | `the default table is the table it was`            | pending |
| types do not inherit           | the Teams inheritance rule copied in    | `an unset type shows nothing and inherits nothing` | pending |
| the facet reads the plan       | facet sourced from the directory        | `the facet lists what the plan carries`            | pending |
| a row of types is one line     | `flex-wrap: wrap` on the strip          | the Chromium height measurement                    | pending |

## Skipped or unavailable checks

None recorded yet.
