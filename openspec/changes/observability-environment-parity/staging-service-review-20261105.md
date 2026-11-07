# Task 110 staged source review

Spec verdict: **changes required before native request construction or execution**.

Quality verdict: **changes required**. Three source findings below; the first two affect the qualification's safety claims. This is one combined review of the complete staged four-file slice, not native acceptance.

## Reviewed identity and scope

Worktree: `/home/df/.codex/worktrees/aa39/puni-00`. Base: `bb3b2564185394e752efc18705c686ec8993074f`.

Read AGENTS.md, LLM_README.md and its observability routing, the updated Task 110 brief/report, the frozen review package, all new production code and focused fixture code, the shared changes, and relevant unchanged callers/helpers for runtime capture, admission, channel ownership, counters and cleanup.

Fresh read-only SHA256 output matches the supplied frozen identities:

| File                                               | SHA256                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Review package `task-110-review-package-global.md` | `a1f23eff0f2355264709ea37d0b71014a2d5349f565ea56dc25bc142ed1a6fd9` |
| `evidence/repair-native-control.py`                | `92c5011dac4c803c2f1e241f069f454d94c27ebdb17f9f5b199b5f7e6dd7ab7c` |
| `evidence/staging-native-control.py`               | `91033042bf9865bf045592a9bcc8c0c01b1a9e165d1d4ee7b1db37544ce6e492` |
| `lab-staging-native-control.test.ts`               | `03cbbe619ba3dfa86dfb36f7d23a4775c7051eec09b0d3a2ff48c2a983ae8cb6` |
| `lab-repair-native-control.test.ts`                | `25c1df04d15c4b3759e6760d322687a5f3b15be077c28cb804a583d765982633` |

The staged diff names exactly those four source/test files. Fresh unstaged-diff output names only the root-owned design/spec/tasks documents, so the inspected source bytes also bind the staged slice. The 96 KiB shared-program ruling, five fixture identity fields, internal coordinator PID/start arguments, pidfd startup barrier and restored global lock were treated as binding requirements.

## Findings

### F1 — P1: Complete the cold worker's runtime attestation after helper imports

Location: `openspec/changes/observability-environment-parity/evidence/staging-native-control.py:240–250`; shared dispatch at `repair-native-control.py:1019–1028` and worker entry at `1279–1285`.

The shared worker entry calls `verify_environment` **before** `load_helpers`. That verifier intentionally allows a subset of declared runtime paths and hashes only currently loaded paths (`repair-native-control.py:378–383,427–437`). The old primitive worker then calls `check_loaded_runtime`, which requires the complete set and verifies its bytes. The new purpose dispatch returns into `run_worker` before that check, and the new worker never performs it anywhere.

In a fresh interpreter, helpers introduce additional runtime modules/maps (for example the writer's `mmap` and allocation/repair's `platform`). Their declared pins can remain unverified in the native worker; an unexpected helper-loaded runtime path or different helper-time bytes can pass into the started frame, handoff adoption and successful durable receipt. The coordinator's own closure check cannot attest the service's actual loaded closure. The reported source digest is the digest of declarations, not evidence that the worker checked every declaration.

The component fixture primes helpers at test lines 412–416, then forks and executes the bootstrap in that warmed interpreter at lines 452–478. Consequently the child's initial verification already sees helper imports and does not expose this omission.

Required correction: reuse `check_loaded_runtime` in the new worker after its real helper imports and before started/adoption authority. Add a production-path late-helper-runtime negative, with a watched omission proving this exact check rejects an added/mismatched helper-time runtime dependency. The fixture must preserve the initial-subset/late-import distinction rather than rely on its preloaded fork. Do not use a native attempt to discover this source gap.

### F2 — P1: Rejoin later admission to the original global staging-lock descriptor

Location: `staging-native-control.py:305–317,367–368,403`; fixture-only join at `lab-staging-native-control.test.ts:302–317`.

The new coordinator now acquires the real global lock and retains its FD in an outer finally, which fixes the missing-lock defect. However, it never compares that held descriptor to `request['state']` after acquisition. After the initial/live exact inventory checks, later capacity observations use `exact=False`. `observe_capacity` walks the current pathname and `read_reservations` reopens it, without receiving or validating the held FD.

If the state pathname is replaced after initial admission by another private directory containing the same reservation ledger, those later checks can succeed while the coordinator still locks the old directory. The subsequent dead case and capacity/ledger observations then operate against an unlocked state root; another acquisition on that root succeeds. Ledger equality preserves the declared G amount but does not restore exclusive admission ownership. The old primitive lifecycle explicitly rejoins its original state identity/lock around subsequent authority.

The new test watcher already compares `fstat(original_fd)` with `lstat(state)` and asserts real competition refusal at every observed boundary, but this is test-side instrumentation only. It cannot establish a missing production guard against pathname replacement.

Required correction: preserve and validate the original global FD/path identity at the subsequent capacity/ledger and authority boundaries, using the established original-lock contract rather than acquiring a replacement lock. Add a real directory-replacement negative after the first exact admission, with the unchanged ledger, and watch the production guard's omission admit the otherwise forbidden later boundary. Keep original-FD close and inherited-child cleanup assertions.

### F3 — P2: Establish dead-child cleanup before the first fallible PID observation

Location: `staging-native-control.py:174–177`.

After forking the owned dead sender, `raw.process_start(pid)` runs before the try/except/finally that closes the channel/pipe and signals/reaps the original child. If that required `/proc` observation raises, execution bypasses the entire child cleanup block. `create_dead_channel` never returns a channel, so the caller's per-case cleanup cannot recover those resources or reap that child either. The outer global-lock finally is insufficient. The public process eventually exiting closes its own FDs, but does not fulfill original-owned child cleanup.

Required correction: enter the owned-child cleanup scope immediately after the successful fork, before the fallible start observation. Inject failure at that parent-side observation and prove the original child is reaped and all parent channel/pipe FDs close; preserve original ownership when choosing any kill target. This requires only an ordinary-process source test.

## Other reviewed properties

No additional blocking findings were identified in the fixed purpose/source-role selection, early control/self SHA-buffer capture, verified repository loader, v1 default preservation, narrow source-cap compatibility edit, live original factory/receiver composition, explicit dead socketpair seam, per-message credential joins, pidfd-only startup release, exact dead-sender refusal classification, durable projection-before-final-ACK order, counter validation, trailing-output rejection, or repeated native cleanup joins. The global lock is acquired before the first exact capacity read and is closed by the outer finally; F2 concerns its continued relationship to the pathname being observed.

The source keeps the fixed CPU/process/service/deadline and physical-floor constants. The full additional 32768-byte executable allowance and all fresh artifacts still require the root's future concrete admission accounting within the unchanged metadata envelope. This review does not certify that unconstructed accounting.

## Verification limits

Per the review assignment, no tests, full matrices, native services, host gates or operational probes were executed or repeated. Test results are the implementer's reported evidence: historical 47 new plus 8 compatibility tests before lock restoration; the fresh 15-test covering selection afterward, with 35 intentionally filtered. The reviewer inspected their fixtures and proof paths but does not claim a fresh 50-test run. Final Fleet typing was pending in the supplied handoff and was not independently checked here.

Native `systemd-run --pipe` socket/rights forwarding remains unexecuted and unverified. No actual request, service, raw/ISO operation, debt release, drain, repository/index change, commit, push or subagent was created by this review. Only this `/tmp` report was written. After the three bounded corrections and their focused proofs, review the changed slice and retain the separate fresh source/request/admission/native review stages.
