# verify — share-people-across-projects

## Slice 0 — spec

Written on `batch-9/010-4-16-capacity-spec` from main `4bb71e5f`. The change name, the four
capabilities and the ADR follow the design memo's §8 slice 0. The ADR number is 0034 because
the spaces lane holds 0033. No migration ships in slices 0–1.

| Command                                                  | Result                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json` | exit 0; 143 passed, 0 failed; `share-people-across-projects` valid, no issues |

## Failure proofs

| Check (file:line) | Fault injected | Test that observed the failure | Result |
| ----------------- | -------------- | ------------------------------ | ------ |
| —                 | —              | —                              | —      |
