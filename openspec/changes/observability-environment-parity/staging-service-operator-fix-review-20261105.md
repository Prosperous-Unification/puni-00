# Task 110 operator O1/O2 scoped rereview

Spec verdict: **approved for the reviewed source corrections**.

Quality verdict: **approved for the reviewed source corrections**.

O1 and O2 from the combined operator review are closed. No newly introduced finding was identified in this scoped fix round. This approves source corrections, not actual preparation, a concrete launch command, fresh admission or native qualification.

## Exact reviewed identities

Fresh read-only SHA256 and byte-count output verified:

| File                                                                   | Bytes | SHA256                                                             |
| ---------------------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `/tmp/puni-task110-operator-O1-O2-final-package.md`                    | 22136 | `e74f4c64043b842a70620da867dbff35a2a3594013057a1e7bc7bec6b8d068cb` |
| `evidence/staging-native-prepare-draft.py`, actual final working bytes | 33242 | `c9c2040f795372cfa99de0707c2fc68df5148e5929b23727a6f4601faac94b34` |
| `evidence/staging-native-prepare-bootstrap.py`                         |  3248 | `7c23633b8e693fb5406f8947c0999fb21ddf286bc6085e75b1cb84089f9d0f03` |
| `tools/tool-fleet/src/lab-staging-native-prepare.test.ts`              | 51441 | `1846e98fc04462425f07ddc13682cdad3ff7f311d1a48470b48bf7173aa2e405` |

The initial package (20629 bytes / `5953b0b27c1734c942d92320785818adfc0010b22dc8a93c3e5f6858786ec12b`) preceded two final builder `check_wall()` callsites and listed 33204 bytes / `b967a8675f70dd2318cea8f78337088314a9a1a1d191541bc696e00fe6c28995`. The authoritative final package and updated 15927-byte implementer report include the actual final identity above. A fresh read-only transformation removing **only** the calls after Git checks and before state acquisition (current lines 279 and 604) reproduces exactly that previous `b967a867…` SHA. Both final callsites and the final package supplement were inspected and are included in this approval. They prevent continuation into helper execution/state acquisition after the work cutoff. This resolves the initial freeze discrepancy; approval binds the actual `c9c2040f…` builder. No repository file was changed to perform that comparison.

Reviewed only the exact O1/O2 fix diff, these two final callsites, focused proof changes, builder-cap ruling, current report and revised recipe. Previously accepted legacy composition and source/host-profile conditions were not reopened.

## Finding closure

**O1 — compound failure preservation: closed.** The pump retains the original body/setup failure, each cleanup failure and publication failure in one inspectable `BaseExceptionGroup`. Cleanup uncertainty and capture unavailability retain distinct subgroups. Each owned cleanup step is attempted independently, so another cleanup error cannot skip the remaining pipe/selector closes. The strengthened tests inspect setup plus publication failure, registration plus close failure, and all three together. The watched primary-loss mutation removes the body failure from the production aggregate; its independent graph assertion confirms the original identity is lost while the other identities remain. This addresses the prior tests' generic-refusal blind spot.

**O2 — timeout publication bound: closed.** Work uses the original hard deadline minus three seconds. The bootstrap installs that work timer before builder I/O. The child pump establishes a terminal watchdog using only the time remaining to the same absolute hard deadline, limits the owned wait to that remaining budget, and again requires positive budget plus an active watchdog immediately before publication. Expired budget prevents new capture I/O and preserves a capture-unavailable reason. There is no hard-deadline reset or extension to native/service limits.

The focused stalled-publication fixture uses an actual expired work signal and then blocks the capture fsync after the owned child is reaped and both pipes are closed. The production remaining-hard-budget timer interrupts that stall, the capture FD closes, and work/hard/capture failures remain visible. Omitting the terminal watchdog exposes the missing protection to the independent short fixture escape timer, so the negative is itself bounded. The no-budget case verifies that no capture file is created. These proofs cover the reported gap under a functioning kernel; kernel signal/reap failures remain explicit uncertainty, not a promise of impossible cleanup.

## Bounds and evidence

The approved revision changes **only** operator-builder capture from 32768 to 49152 bytes. Bootstrap `BUILDER_LIMIT` and the future builder charge both use 49152. The full 16384-byte increase is charged; bootstrap/test ceilings remain 8192/57344. The exact-49152 acceptance test complements the 49153 refusal and watched bound omission. Metadata remains 1048576 bytes, operator hard time remains 45 seconds, and all other physical/native/service limits remain unchanged.

FUTURE is now 331776 bytes. Adding 90112 early creation reserve and the dated supplied 503808 metadata figure gives 925696/1048576, leaving 122880 bytes. This is arithmetic on historical figures, not fresh physical admission.

No tests or executable qualification paths were run by this reviewer. Supplied evidence is the five-test RED, nine-test focused GREEN / 18 assertions / 3.90 seconds, the shared-pump new-file run of **40 tests / 80 assertions / 13.64 seconds**, then **one isolated exact-cap test / 2 assertions / 77 milliseconds**. There was no full final 41-test run, and none is claimed. The two final work-cutoff callsites have the report's fresh static checks and this source inspection; their underlying work guard already has the focused production-path negative. Named statics are reported passing. Root subsequently reported owning typing exited 0 against the final TypeScript bytes; it was not independently rerun here.

## Remaining operational conditions

The revised recipe correctly uses cached exact bootstrap bytes embedded after the short trusted deadline prefix and treats source review as distinct from operational approval. The concrete prefix/cached buffer, private builder with only the three approved substitutions, its final SHA, committed source, exact request and original inode, fresh complete root inventory/debt ledger, runtime/kernel identities, effective limits, current memory/backing/physical metadata and real user-manager transport still require the separate concrete independent review and fresh admission. Actual live/dead native handoff, counters and terminal cleanup remain unexecuted and unverified here. Scratch proof results do not establish host qualification.

Only this `/tmp` review was written. No source/index changes, tests, helpers, probes, retained-state inventory, native action or subagent was performed. Root retains source finalization, commits/publication/push and any later authorized operational work.
