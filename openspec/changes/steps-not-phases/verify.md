# verify — `steps-not-phases`

Not yet implemented.

## Pre-rename test-case counts (slice 1.2)

| Project       | Cases before | Cases after |
| ------------- | ------------ | ----------- |
| `libs/domain` | pending      | pending     |
| `be-01`       | pending      | pending     |
| `fe-01`       | pending      | pending     |
| `mcp-01`      | pending      | pending     |

Any case whose body changed beyond identifier substitution is listed here with
the reason. An empty list is the claim "no behaviour changed"; a non-empty one
is where that claim is weakest.

## Commands

| Command                                                              | Result  |
| -------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                 | not run |
| `openspec validate --all --json`                                     | not run |
| `bun apps/be-01/src/openapi/emit-openapi-cli.ts`                     | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | not run |

## Failure proofs (R5)

| Check                        | Fault injected                                 | Test that saw it fail                                 | Watched |
| ---------------------------- | ---------------------------------------------- | ----------------------------------------------------- | ------- |
| the old routes are gone      | old `/roles` route left mounted                | `refuses the old roles route as unknown`              | pending |
| no `roleId` on the wire      | one `roleId` left in the estimate shape        | `no payload field is named roleId`                    | pending |
| the README matches the tools | README left at the old tool list               | mcp-01 tool-name comparison                           | pending |
| no `Phase`/`Role` on screen  | one label left as `Phases`                     | `no rendered string says Phase or Role`               | pending |
| **ARIA `role` was excluded** | `role="combobox"` renamed to `step="combobox"` | `project-page.test.tsx` `getByRole('combobox')` cases | pending |

## Skipped or unavailable checks

The physical table and column rename is **not** in this change and is not
verified here. See `steps-schema-rename`.
