## Status and applicability

Design-only review packet, based on release candidate `0aab48a2415d51e461abaf987c95ef576a194736`. No owner has selected a producer authority or trust root. Requirements below constrain a future design; they are not evidence of implemented enforcement. The combined design interview remains incomplete at the owner decisions below.

## Existing boundary

`twilight-dash/cli/src/progress/record-progress.ts` records explicit operator assertions. Schema 2 binds the complete producer reference digest. `twilight-navigator/cli/src/admit-progress.ts` compares that binding with an independently caller-selected accepted reference, invokes shared consistency, and proposes an exclusive command file. Neither reads current WBS authority or authenticates execution evidence. Paths are relative to `apps/twilight-structure/`.

The shared contracts live in `twilight-burokrat/cli/src/contracts/navigator-records.ts`; ordinary digests establish supplied-record integrity. [ADR0052](../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md) explains why signing requires custody, rotation and a pinned trust root. [Names and boundaries](../../../docs/twilight-structure/names.md) assigns effects and secret custody to Dash, static judgment to Burokrat and planning to Navigator. No implementation location or new dependency is selected here.

## Four independent claims

| Claim                         | Required authority                                                                                             | A successful attribution check alone establishes                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Producer attribution          | Independently selected issuer policy and verified binding of the complete assertion to its authorized producer | That authorized producer made the bounded assertion                           |
| Execution truth               | A separately defined trusted execution/evidence chain                                                          | Nothing about whether the claimed work ran or passed                          |
| Accepted-plan freshness       | Independently authorized current planning/publisher state and a defined observation instant                    | Nothing about whether the selected reference is current                       |
| Atomic publication and replay | Authority that checks basis, authorization and replay state at the mutation transaction                        | Nothing about permission to apply, one-time consumption or concurrent changes |

An authenticated operator assertion remains an operator assertion. An issuer label, evidence path, signed timestamp, matching PlanRef or self-consistent digest cannot promote it to execution truth or live freshness. A later successful replay can be legitimate proposal regeneration; whether application may repeat is a separate owner decision.

## Authority boundary

The requesting party may supply receipt and reference artifacts. Those artifacts, their producer labels, adjacent public keys, selected checkout, environment and caller-selected files cannot enroll an issuer or override independently selected trust policy. The eventual design must identify its trusted invoker and how it obtains policy outside those inputs; an absolute pathname or owner-only mode alone is not proof of that independence.

All asserted entries and their planning bindings must be covered by the verified assertion. The eventual encoding and cryptographic mechanism are unresolved. A record presented as already verified is untrusted unless its provenance to the actual verifier and selected policy is itself established. Preserve refusal before command publication, and never create output on failed required policy reads, attribution or inherited consistency checks.

This requirement does not claim containment against a compromised host authority. The owner must define which actors can edit installation/policy, read signing material, invoke the producer or change accepted planning state.

## Owner decisions blocking dispatch

| Decision                      | Required answer before implementation                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issuer scope                  | Who may assert progress, for which repository/plan/change/task/step, and with which assertion meaning? Are operator and execution producers distinct?          |
| Custody and invocation        | Who controls signing material or workload identity, executable release and producer invocation? Which inputs can candidate code influence?                     |
| Protected trust root          | Who enrolls issuers, how does the trusted consumer select policy, and which actors can replace it? How is policy identity bound to a verification?             |
| Rotation/revocation           | Which policy version governs an assertion, how are rotated/revoked identities treated, and who determines verification time when needed?                       |
| Freshness/publisher authority | Which authority declares the accepted plan, which exact state is compared and at what instant? ADR0027 remains proposed; a supplied reference is insufficient. |
| Publication/replay            | Who may apply progress, which transaction checks the accepted basis and access, and what identifies repeat application or concurrent consumption?              |

No recommendation in this packet selects an issuer, private-key scheme, signing service, algorithm, schema version or broker. Owner answers must be reviewed with Astra and incorporated before any implementation tasks become dispatchable.

## Threat cases for the later production path

| Fault                                                            | Required observation                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Change an entry/reference binding and recompute ordinary digests | Actual authenticated admission refuses before output despite valid ordinary consistency                                          |
| Valid signature from an unregistered or out-of-scope issuer      | Refusal follows independent issuer policy, including cross-repository/plan substitution                                          |
| Supply an attacker key/policy beside matching forged artifacts   | Candidate material cannot establish or replace authority                                                                         |
| Forge a verifier success record                                  | No attribution without an authenticated route to the actual verifier and selected policy                                         |
| Remove or deny access to required trusted policy                 | Missing and unreadable states are separately refused, without fallback or output                                                 |
| Rotate/revoke an issuer                                          | Behavior matches the owner-approved policy/time semantics, including formerly valid assertions                                   |
| Replay a valid assertion or race an accepted-plan change         | Attribution is not described as replay/freshness protection; any later mutation boundary must demonstrate its own atomic refusal |
| Sign an assertion for work that never executed                   | Attribution does not become an execution-success verdict                                                                         |

For each newly implemented safety guard, a later worker must remove that guard or break its dependency, observe the named production-path negative fail, restore it and retain an adjacent `Proof:` comment. Re-digest and re-sign malformed cases where appropriate so earlier integrity checks cannot mask the targeted policy guard. These faults have not been run in this design-only change.

## Future integration boundaries

Read existing Navigator `admit-progress.test.ts`, `receipt-to-commands.test.ts` and CLI tests; Dash `progress/record-progress.test.ts`; and Burokrat `contracts/navigator-records.test.ts` and `contracts/progress-receipt.test.ts` before changing them. Preserve schema-1/2 behavior and the shared consistency path. Separate any later authenticated path from legacy proposal semantics explicitly. Do not import Tool Wiki review predicates as progress authority; their enrollment and claims belong to another domain.

Live freshness and application need a separately authorized integration with current planning state. A read followed by a later write does not establish an atomic basis check. The locally held operator-roundtrip candidate is outside this packet and retains its publication hold.
