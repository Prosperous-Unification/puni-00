# verify — estimate-units

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Allocated numbers (filled at packet time)

| What                                  | Value | Checked against | Date |
| ------------------------------------- | ----- | --------------- | ---- |
| Migration stamp                       | —     | —               | —    |
| `PLAN_DOCUMENT_VERSION`               | —     | —               | —    |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | —     | —               | —    |
| `SCHEDULER_CONTRACT_VERSION`          | —     | —               | —    |

## Commands

| Slice | Command | Result |
| ----- | ------- | ------ |
| —     | —       | —      |

## Failure proofs

Each fault is injected into the production function, the named test run, and the file
restored; the adjacent `Proof:` comment names the fault and the observed output.

| Check | Fault injected | Test that observed it | Observed |
| ----- | -------------- | --------------------- | -------- |
| —     | —              | —                     | —        |

## Not run

—

## Slice 1 — domain arithmetic (2026-10-12)

Base `99f588257`; isolated branch `batch-10/020-11-estimate-units`. Locked Bun install exit 0.
Initial focused tests exit 1 for the missing new exports; after implementation, both files
pass: 45 tests, 123 assertions. Existing workday arithmetic tests remain unchanged except
mechanical renames of the unit-free helpers and continue to pass.

| Check                        | Fault injected                                 | Test that observed it                                         | Observed                                            |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Whole-minute charge          | `Math.ceil` → `Math.round`                     | charges a minute step to the whole minute after its allowance | exit 1, expected 52, received 51                    |
| Project rounding independent | charge through `roundDays(..., rule.rounding)` | never consults the project rounding for a minute step         | exit 1, expected 52, received 51                    |
| Whole minute boundary        | remove `Number.isInteger`                      | refuses a fractional minute point                             | exit 1, expected minutes_not_integer, received null |
| Maximum minute boundary      | remove maximum guard                           | refuses a minute point above MAX_ESTIMATE_MINUTES             | exit 1, expected minutes_above_max, received null   |

Every injected file was restored before the green rerun. No stored units or public minute
writes exist at this checkpoint. Remaining slices and final host gate are not run yet.
