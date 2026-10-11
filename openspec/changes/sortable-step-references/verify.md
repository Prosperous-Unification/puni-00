# Verification

The developer instruction for this work forbids adding or running tests unless the user asks. Existing test expectations may be updated to keep CI aligned with the changed response contract. No local tests or full Nx gate have been run.

| Check                                    | Result                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| OpenSpec validation                      | `bunx @fission-ai/openspec@1.12.0 validate sortable-step-references --json`: 1 passed, 0 failed                       |
| Existing regression suites and full gate | Pending CI                                                                                                            |
| Production parser prerequisite           | Pending deployment of `accept-padded-step-reference-aliases` and confirmation that older be-01 instances have drained |

No new safety check is introduced. The existing address-revision, positive-ordinal, safe-integer, shared-number and ordinal/code mismatch refusals remain in place. Do not merge this change before its production prerequisite is observed.
