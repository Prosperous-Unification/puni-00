# verify — limit-work-item-to-one-type

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR. No migration is part of this change.

## Failure-proof table — pending implementation

| Check                    | Fault to inject                             | Test that must fail                 | Result  |
| ------------------------ | ------------------------------------------- | ----------------------------------- | ------- |
| Command boundary limit   | Restore the limit of ten                    | mounted HTTP/MCP refusal            | Pending |
| Transactional invariant  | Remove the service-level check              | service refusal and batch atomicity | Pending |
| Restoration not authored | Route an authored patch through restoration | authored-path refusal test          | Pending |
| Conflict read            | Truncate reads to the first type            | conflict read test                  | Pending |
| Import rows              | Skip the multi-type row check               | import refusal                      | Pending |
| Single-select cell       | Append instead of replace                   | fe-01 Type cell component test      | Pending |

## Pending checks

- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the h2puni gate for the implementation.
