# verify — `plan-toolbar-controls`

Not yet implemented.

## Measurements

| Figure                               | Before  | After   |
| ------------------------------------ | ------- | ------- |
| folded toolbar `scrollWidth` at 1280 | pending | pending |

## Tests that had to change, and why

`Freeze numbering` and `Unfreeze all` were buttons and are now menu items, so
every case that clicked them must open the menu first. Those cases are listed
here individually — a test that changed shape is a place the "same behaviour"
claim is being asserted rather than observed.

| Test    | Change  | Still asserts |
| ------- | ------- | ------------- |
| pending | pending | pending       |

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                              | Fault injected                            | Test that saw it fail                              | Watched |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------- | ------- |
| an icon has no accessible name     | `aria-hidden` removed from one icon       | `every icon is hidden from the accessibility tree` | pending |
| the accessible names held          | `aria-label` dropped from `Collapse all`  | the existing collapse cases                        | pending |
| the old freeze buttons are gone    | one left on the bar                       | `one control offers both writes`                   | pending |
| **a modified Enter takes nothing** | the item guard's `preventDefault` removed | `e2e/keyboard.spec.ts`, in Chromium                | pending |
| the bar got narrower               | text labels restored on expand/collapse   | `the folded toolbar fits its budget`               | pending |

## Skipped or unavailable checks

None recorded yet.
