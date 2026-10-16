## 1. Single-connection protocol observation

- [x] 1.1 Watch the explicit CRI consuming test fail against the Python-only invocation, then add fixed read-only crictl invocation preserving native transport guards.
- [x] 1.2 Observe Version response, List/Status additional-connection refusals, and direct disposable baselines in `records real CRI single-connection behavior and refusal cleanup`.
- [x] 1.3 Observe unsupported-command and wrong-upstream refusals. Remove the new selection guard and executable digest comparison, watch their consuming negatives fail, then restore.
- [x] 1.4 Run serial generic native regression and CRI controls; record source hashes, RSS, cleanup, exact shutdown blocker and skipped gates in verify.md.

- [x] 1.5 Apply independent review corrections: both baseline endpoints private despite inherited image endpoint; exact List exit 1/child-exit provenance; exactly one valid CHILD receipt for launched commands and none for prelaunch refusals. Watch each corresponding omission/wrong-failure mutant and malformed CHILD receipt fail the consuming CRI observation, then restore.

## 2. Deferred protocol completion design

- [ ] 2.1 Resolve complete-drain semantics for a crictl exit followed by upstream HTTP/2 PING acknowledgment; retain strict refusal until a reviewed contract models completion.
- [ ] 2.2 Select a maintained gRPC CRI client and supported toolchain with the protected authority owner; prove an authenticated already-connected socket with no pathname fallback or public listener. The two-pair byte relay is not the selected continuation.
- [ ] 2.3 After 2.2, prove exact peer PID/UID/pidfd binding, no second dial, an aggregate 128KiB bound, one deadline, peer death including a surviving descriptor holder, complete/truncated gRPC messages and terminal status, endpoint substitution and owned cleanup. Observe fixed Version, empty ListContainers and absent ContainerStatus against a private disposable daemon.

Section 2 blocks transport acceptance and archive. The attempted paired loop was removed by parent direction after syscall evidence; no WBS production design task is closed by Section 1.

## 3. Bounded synthetic descriptor amendment

- [x] 3.1 Record the installed toolchain limitations and observe the consuming test fail against a zero-scenario stub.
- [x] 3.2 Run explicit synthetic Python descriptor controls for PID/UID identity, pre-use/active peer death refusal, repeated claim, receive bytes, deadline, complete/truncated response, required terminal status, late control, endpoint replacement and owned cleanup. Reproduce Bun's inherited-socket incompatibility separately.
- [x] 3.3 Watch identity, UID, claim, liveness, deadline, receive-cap, status and socket-cleanup mutants fail the consuming observation; retain raw receipts and run the unchanged native regression serially.
- [ ] 3.4 Obtain independent review and OpenSpec validation of this amendment; synthetic controls confer no CRI acceptance.
