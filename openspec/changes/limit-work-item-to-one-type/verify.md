# verify — limit-work-item-to-one-type

## Spec-time commands

Recorded after the Astra review; see the PR for observed output. No application behavior is verified by this packet. No migration is part of this change.

## Failure-proof table — pending implementation

| Check                   | Fault to inject                  | Test that must fail                 | Result  |
| ----------------------- | -------------------------------- | ----------------------------------- | ------- |
| Command boundary limit  | Restore the limit of ten         | mounted HTTP/MCP refusal            | Pending |
| Transactional invariant | Remove the service-level check   | service refusal and batch atomicity | Pending |
| Conflict read           | Truncate reads to the first type | conflict read test                  | Pending |
| Import rows             | Skip the multi-type row check    | import refusal                      | Pending |
| Single-select cell      | Append instead of replace        | fe-01 Type cell component test      | Pending |

## Pending checks

- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the h2puni gate for the implementation.
