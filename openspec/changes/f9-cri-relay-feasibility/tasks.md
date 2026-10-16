## 1. Single-connection protocol observation

- [x] 1.1 Watch the explicit CRI consuming test fail against the Python-only invocation, then add fixed read-only crictl invocation preserving native transport guards.
- [x] 1.2 Observe Version response, List/Status additional-connection refusals, and direct disposable baselines in `records real CRI single-connection behavior and refusal cleanup`.
- [x] 1.3 Observe unsupported-command and wrong-upstream refusals. Remove the new selection guard and executable digest comparison, watch their consuming negatives fail, then restore.
- [x] 1.4 Run serial generic native regression and CRI controls; record source hashes, RSS, cleanup, exact shutdown blocker and skipped gates in verify.md.

- [x] 1.5 Apply independent review corrections: both baseline endpoints private despite inherited image endpoint; exact List exit 1/child-exit provenance; exactly one valid CHILD receipt for launched commands and none for prelaunch refusals. Watch each corresponding omission/wrong-failure mutant and malformed CHILD receipt fail the consuming CRI observation, then restore.

## 2. Deferred protocol completion design

- [ ] 2.1 Resolve complete-drain semantics for a crictl exit followed by upstream HTTP/2 PING acknowledgment; retain strict refusal until a reviewed contract models completion.
- [ ] 2.2 Implement and prove fixed two-pair transport only after 2.1: exact child/upstream authentication on both connections, global two-accept cap including sequential reconnects, global 128KiB cap, one deadline, independent queues, watched negative mutants and real parsed ListContainers JSON.

Section 2 blocks transport acceptance and archive. The attempted paired loop was removed by parent direction after syscall evidence; no WBS production design task is closed by Section 1.
