# verify — add-work-item-statuses

## Slice 0 — spec

### Constraints

- The REMOVED requirements in `specs/wbs-domain/spec.md` name headings that exist only in the
  unarchived changes `work-item-status-and-facts` and `status-from-the-menu`. Archive those two
  before this change, or its archive cannot find the requirements it removes.

Written on `batch-9/integration-25` (`ffbe37be`) while main was `262d006c`; retargeted to main at `f0feb5dd` (round 25, the same tree).

## Commands

| Slice | Command                                                  | Result                                                     |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------- |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate --all --json` | exit 0; 140 passed, 0 failed; this change valid, no issues |

## Failure proofs

| Check                    | Fault injected | Test that observed it | Observed |
| ------------------------ | -------------- | --------------------- | -------- |
| slice 1 proxy spread     | pending        | pending               | pending  |
| slice 1 ancestor removal | pending        | pending               | pending  |
| slice 1 parent fold      | pending        | pending               | pending  |

## Not run

- The h2puni host gate; the orchestrator runs it on the integration branch.
