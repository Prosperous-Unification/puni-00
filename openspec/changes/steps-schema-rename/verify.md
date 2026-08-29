# verify — `steps-schema-rename`

Not yet implemented. **Blocked on `steps-not-phases`.**

## The precondition this change rests on

| Fact                        | How it was checked              | Result  |
| --------------------------- | ------------------------------- | ------- |
| no prod release is deployed | `bin/assert-no-prod-release.sh` | not run |

If this ever reads "a colour is deployed", the change as written is wrong and
design D2's expand/contract is the change that must be written instead.

## Commands

| Command                            | Result  |
| ---------------------------------- | ------- |
| `bin/h2puni-gate.sh`               | not run |
| migration lint                     | not run |
| `openspec validate --all --json`   | not run |
| dev deploy + applied-set read-back | not run |

## Failure proofs (R5)

| Check                               | Fault injected                             | Test that saw it fail                                                                   | Watched |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- | ------- |
| an unreadable release state refuses | unreadable arm replaced by a default       | `refuses an unreadable state file`                                                      | pending |
| a recorded colour refuses           | state file naming `blue`                   | `refuses a recorded colour`                                                             | pending |
| the lint requires the gate          | the requirement removed from the allowlist | lint spec                                                                               | pending |
| `down.sql` is a total inverse       | one `RENAME COLUMN` omitted                | `the step rename rolls back to the schema it found` (schema comparison, not row counts) | pending |

## Skipped or unavailable checks

None recorded yet.
