# verify — `steps-not-phases`

Branched from `fix/reference-cell-popover` (`7ac1285`), which carries
`E2E_PORT_SHIFT` — without it the browser gate silently measures whatever holds
3100/3200/4200 (`LLM_README.md`'s landmine).

## Pre-rename test-case counts (slice 1.2)

Measured on `7ac1285`, before a single identifier moved,
`bunx nx run-many -t test --projects=domain,be-01,fe-01,mcp-01 --skip-nx-cache`.

| Project       | Cases before    | Cases after |
| ------------- | --------------- | ----------- |
| `libs/domain` | 118 (0 failed)  | pending     |
| `be-01`       | 1172 (2 failed) | pending     |
| `fe-01`       | 1872 (3 failed) | pending     |
| `mcp-01`      | 103 (0 failed)  | pending     |

The five failures are **pre-rename** and are this checkout's baseline, not this
change's:

- `be-01` `login-throttle.test.ts` `never evicts a live lock when the bounded
map fills with attacker keys` — `this test timed out after 5000ms`, having
  taken 7187ms on a loaded laptop.
- `be-01` `priority-band.controller.test.ts` — `SyntaxError: Failed to parse
JSON` in its `registered` helper, downstream of the throttle above.
- `fe-01` `wbs-table.test.tsx` `gives every cell the chrome its declared width
is measured with` — `expected 'clip' to be 'hidden'`.
- `fe-01` `wbs-table.test.tsx` `anything the item holds vetoes the backspace
removal` and `names every dependency the server refused, and keeps the rest` —
  both `Test timed out in 5000ms` in a 458-second run.

Any case whose body changed beyond identifier substitution is listed here with
the reason. An empty list is the claim "no behaviour changed"; a non-empty one
is where that claim is weakest.

## Commands

| Command                                          | Result  |
| ------------------------------------------------ | ------- |
| `bin/h2puni-gate.sh`                             | not run |
| `openspec validate --all --json`                 | not run |
| `bun apps/be-01/src/openapi/emit-openapi-cli.ts` | not run |
| `CI=1 E2E_PORT_SHIFT=600 bunx nx run fe-01:e2e`  | not run |

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
