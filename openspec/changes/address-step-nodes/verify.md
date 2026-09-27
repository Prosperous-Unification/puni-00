# verify — address-step-nodes

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.

## Failure-proof table — pending implementation

| Check                      | Fault to inject                    | Test that must fail               | Result  |
| -------------------------- | ---------------------------------- | --------------------------------- | ------- |
| Parent step node           | Accept a parent work item          | mounted parent refusal            | Pending |
| Same-project step node     | Skip the project check             | mounted cross-project refusal     | Pending |
| Unknown step node          | Accept an unknown step ID          | mounted unknown-node refusal      | Pending |
| Reserved step code         | Drop the `s<digits>` check         | mounted step-create refusal       | Pending |
| Swap backfill              | Swap ignores backfill exit status  | swap failure test                 | Pending |
| Stale step reference       | Skip the revision comparison       | stale-reference resolve test      | Pending |
| Single address form        | Accept both address forms          | mounted command refusal           | Pending |
| Workflow edges             | Drop one workflow edge in the seam | Fast golden                       | Pending |
| Node identity through undo | Omit the journaled mapping         | mounted undo identity test        | Pending |
| Assignment hand-down       | Skip the assignment move           | mounted assignment hand-down test | Pending |
| Duplicate code import      | Accept duplicate codes             | import refusal test               | Pending |
| Reserved code import       | Accept a reserved code             | import refusal test               | Pending |
| Uncoded export             | Export with an uncoded step        | export refusal test               | Pending |
| Canonical reference shown  | Render the ordinal alias           | fe-01 step cell component test    | Pending |

## Pending checks

- **Pending:** Migration lint, apply and rollback; old-binary read of a coded step table; uncoded read after an old-writer insert.
- **Pending:** Unchanged Fast and solver goldens and request hashes through the new seam.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the h2puni gate for the implementation.
