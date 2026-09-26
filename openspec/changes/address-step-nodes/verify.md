# verify — address-step-nodes

## Spec-time commands

Recorded after the Astra review; see the PR for observed output. No application behavior is verified by this packet.

## Failure-proof table — pending implementation

| Check                      | Fault to inject                    | Test that must fail            | Result  |
| -------------------------- | ---------------------------------- | ------------------------------ | ------- |
| Parent step node refusal   | Parser accepts a parent work item  | domain codec parent refusal    | Pending |
| Reserved step code         | Drop the `s<digits>` check         | mounted step-create refusal    | Pending |
| Swap backfill              | Swap ignores backfill exit status  | swap failure test              | Pending |
| Stale step reference       | Skip the revision comparison       | stale-reference resolve test   | Pending |
| Single address form        | Accept both address forms          | mounted command refusal        | Pending |
| Workflow edges             | Drop one workflow edge in the seam | Fast golden                    | Pending |
| Node identity through undo | Omit the journaled mapping         | mounted undo identity test     | Pending |
| Duplicate code import      | Accept duplicate codes             | import refusal test            | Pending |
| Canonical reference shown  | Render the ordinal alias           | fe-01 step cell component test | Pending |

## Pending checks

- **Pending:** Migration lint, apply and rollback; old-binary read of a coded step table; uncoded read after an old-writer insert.
- **Pending:** Unchanged Fast and solver goldens and request hashes through the new seam.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the h2puni gate for the implementation.
