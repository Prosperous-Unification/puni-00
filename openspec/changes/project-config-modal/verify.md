# verify — `project-config-modal`

Not yet implemented.

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                               | Fault injected                          | Test that saw it fail                                   | Watched |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------- |
| inactive panels stay mounted        | panels unmounted instead of hidden      | `a half-typed value survives a look at another section` | pending |
| the close refuses over an edit      | a panel reporting `false` while writing | `an in-flight write holds the modal open and is shown`  | pending |
| the remembered section is a claim   | shape check deleted                     | `an unrecognised remembered section is dropped`         | pending |
| the old triggers are gone           | one old trigger left mounted            | `one control opens every project setting`               | pending |
| the toolbar got narrower, not wider | two old triggers restored               | `e2e` `the toolbar keeps its 1280 budget…`              | pending |

## Skipped or unavailable checks

None recorded yet.
