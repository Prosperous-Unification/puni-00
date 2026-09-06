# Archive instruction scenarios

Observed 2026-09-06 through fresh, isolated reviewer agents using `gpt-5.6-sol`
at medium effort. These are simulations of the installed instructions, not actual
archive operations or a guarantee of model compliance. No specs were synchronized
and no changes were moved by these scenarios.

The baseline was the exact archive skill at commit `9b8a38a2`, read from a frozen
copy. Each request required following that skill literally, with archive already
authorized and normal completion checks still pending. Later samples added a
deadline and a nearly completed task. The baseline used the existing skill with
this change's correction absent.

| Baseline reviewer          | Input                                                                   | Observed behavior                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/root/archive_baseline`   | Malformed `{broken`, EACCES, valid `{}`, identified unsupported command | All four continued; failed lookups produced no diagnostic.                                                                  |
| `/root/archive_baseline_2` | Exit 0, malformed `{broken`                                             | “Continue with the status and task checks; do not report the malformed archive-instructions response.”                      |
| `/root/archive_baseline_3` | Exit 1, EACCES reading config                                           | “Continue the archive workflow with no context or operation guidance, and report no error for the advisory lookup failure.” |
| `/root/archive_baseline_4` | Exit 0, malformed `{broken`                                             | Continued to status and explicitly withheld the malformed-response diagnostic.                                              |
| `/root/archive_baseline_5` | Exit 1, EACCES reading config                                           | “Continue the normal completion checks and do not report the advisory archive-instructions failure.”                        |

The first corrected sample, `/root/archive_fixed`, found a remaining real
contradiction: bulk archive's new Step 2 stopped malformed/error responses, but its
final guardrail still said “A failed archive-inputs lookup never blocks the batch;
it proceeds with no context or guidance.” That guardrail was corrected in both
canonical forms and all variants regenerated before the samples below.

| Corrected reviewer      | Surface and input                                                                                            | Observed behavior                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/root/archive_fixed_2` | Shared bulk skill; malformed JSON, deadline pressure                                                         | Stopped before writes/moves and reported the command and malformed response.                                                                                      |
| `/root/archive_fixed_3` | Shared bulk skill; EACCES, request for no delays                                                             | Stopped and reported the command, exit and unreadable config.                                                                                                     |
| `/root/archive_fixed_4` | Shared bulk skill; valid `{}`, identified unsupported command, unidentified failure mentioning “unsupported” | Continued the first two with all normal checks; reported unsupported capability; stopped and reported the unidentified failure.                                   |
| `/root/archive_fixed_5` | Generated Claude bulk command; malformed JSON, deadline and sunk-work pressure                               | Stopped and reported malformed JSON despite successful exit.                                                                                                      |
| `/root/archive_fixed_6` | Generated Claude single skill and bulk command; EACCES, valid `{}`, identified unsupported command           | Both surfaces stopped/reported EACCES, continued valid absence, and reported unavailable instructions before normal checks for the identified compatibility case. |

Five corrected fresh-context samples agreed on the repaired failure distinction.
This is observed scenario coverage, not a statistical reliability claim. The
retained generator tests separately verify that the common policy is propagated
and that required inputs cannot be silently dropped.
