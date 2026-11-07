# Task 110 fix round 1 rereview

Spec verdict: **approved for this scoped source fix round**.

Quality verdict: **approved for this scoped source fix round**.

F1, F2 and F3 from `staging-service-review-20261105.md` are addressed. No remaining or newly introduced findings were identified in the reviewed changes. This closes those three source findings only; it does not approve the separate operator draft, construct an operational request, or establish native acceptance.

## Frozen scope and identity

Worktree: `/home/df/.codex/worktrees/aa39/puni-00`. Fresh `git rev-parse HEAD` output is the supplied baseline `77a2c8ae4d6e5d86a016380d790c428498cf2fc8`.

Fresh read-only size/hash output matches every supplied fix-round identity:

| File                                                      | Bytes | SHA256                                                             |
| --------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `/tmp/puni-task110-fix1-review-package.md`                | 33039 | `e6f31dc3a98acc9ef8f222cff05b13c0a80cb0e66f19e8fc9c9bc97fb35dc837` |
| `evidence/staging-native-control.py`                      | 30699 | `e30a28472334fe23c5d39ae7f694a289b24eb9836463f28ae5078034d0e735f9` |
| `tools/tool-fleet/src/lab-staging-native-control.test.ts` | 52843 | `a7fffba9c5ae797a34dfb1c7250615ece2a78a9a1e85879774477c2a4440c37c` |
| `tools/tool-fleet/src/lab-staging-native-cold-fixture.py` |  4651 | `6a88a014ec89cc91fcb0295e584d48214fb291bb23a4551f4a736998d35a1e9c` |
| `tools/tool-fleet/project.json`                           |  5784 | `283e893b7adff8284199ca1ea60e614af774c98ee77a39bec651a5cf94878568` |
| `tools/tool-devsync/src/workspace-targets.test.ts`        | 63794 | `c5c4916cab18620716c5d05346e3ab5e88c1223654830d840ed4147b9dc08eee` |

The approval binds these working-tree bytes against that baseline; the new cold fixture was untracked during review. It does not assert that the fixes have already been staged or committed. Fresh scoped diff output confirms the shared control, existing compatibility test and six production Python helpers are unchanged from the baseline.

Read the published original review, updated private handoff, frozen fix package, actual source/test changes, complete new cold fixture and the existing Nx input oracle/context. The thin source, main test and extracted fixture remain within their respective approved bounds. The fixture is test-only and adds no production source role, caller selector or resource allowance.

## Finding closure

**F1 — complete cold-worker runtime verification: closed.** `run_worker` now calls the existing `check_loaded_runtime` after the shared entry has loaded helpers and before native started/adoption authority. This requires the complete actual runtime set and hashes its declared files. The new driver launches a fresh interpreter through real `Popen`, executes the captured fixed fixture bytes with `-c`, and runs the actual SHA bootstrap and staging entry. It explicitly observes `platform.py` absent from the initial subset and present after real helper imports. Its unexpected-dependency case removes that late pin; its changed-bytes case keeps the original pin while mapping the runtime file observer to an owned same-size/mode file with changed bytes. Both require the exact production guard category and refusal before started. With the complete check omitted, both must reach the real started packet with the owned child’s SCM credentials. The separate capture/baseline steps and lack of a fixture `__main__.__file__` avoid the prior warmed-fork masking.

**F2 — original global-lock identity at later authority: closed.** The coordinator captures the actual original FD identity plus its own PID/start and reuses unchanged `repair.check_lock`. That helper joins the current pathname, original descriptor, process start and real flock evidence. Calls precede initial and subsequent capacity/ledger observations, launch, startup release, ACKs and durable/terminal publication, while the original FD remains in the outer cleanup scope. The regression replaces the actual state directory after live-terminal publication, preserves the same ledger, and suppresses only the fixture watcher for that deliberate replacement. Production refuses before later capacity. Omitting the production lock join reaches actual later capacity with ledger equality and a successful competing acquisition. It never adopts a replacement lock. The earlier broken-flock fixture now correctly expects the new production join to refuse earlier.

**F3 — cleanup before first parent PID observation: closed.** The successful fork’s parent enters the existing owned-child cleanup scope before writer close and `process_start`. The failure test injects the first parent `/proc` observation failure, verifies no child remains waitable, and requires EBADF for all recorded parent socket/pipe descriptors. Moving the observation outside the scope in an AST mutant exposes missing cleanup; the test then cleans only its own original child/descriptors. No PID discovery or foreign ownership is introduced.

## CI input correction

The two added `tool-fleet:test` inputs name exactly the shared and thin control files read from outside the project. The existing default project glob already covers the new cold fixture. The workspace oracle logic remains unchanged; only its adjacent proof history is extended. The supplied evidence reports the actual oracle failing on both missing paths and then passing with the two declarations, plus actual affected selection including Fleet. The source/config changes are consistent with that evidence and do not broaden the test target or alter its cache policy.

## Evidence limits and remaining stages

No tests, helpers, native services, probes, full matrices, gates or executable qualification paths were run during this rereview. The implementer reports 13 covering tests / 39 assertions / 10.38 seconds, then the final four grouped regressions / 12 assertions / 3.51 seconds; the parent reports the CI oracle at 1 test / 2 assertions / 1.98 seconds. These are reviewed supplied results, not fresh reviewer executions. Final root-owned typing was still running in the assignment and is not certified here.

The four separately published operator-draft findings remain open and outside this rereview. Native `systemd-run --pipe` qualification, fresh request/admission accounting and execution-plan review remain separate, unexecuted work. Commit/publication/push remain root-owned. No repository/index change or subagent was created; only this `/tmp` report was written.
