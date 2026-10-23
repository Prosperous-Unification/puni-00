# Kubernetes release binary preflight verification

Base: `d4d9974b5`, isolated worktree `/tmp/puni-k8s-binary-preflight`, branch
`feat/k8s-binary-preflight`. This bounded task 10.2 prerequisite consumes the
existing binary observation transport in the production release executor. Parent
10.1/10.2, store admission, semantic compatibility, activation, participant
exclusion, exposure and recovery remain open. No live deployment is claimed.

## Mounted behavior and TDD

The initial mounted suite failed all 13 tests with zero coordinator-dispatched
binary observation Jobs. The implemented suite initially passed 14 tests; the reviewed heartbeat repair extends it to 16. It executes real
`executeRelease`, the fsync/rename `fileJournal`, `kubectlEffects` binary observation
transport and its emitted backend capability command. Other Kubernetes effects
use the existing stateful `FakeCluster`; the subprocess API fixture verifies the
image is in the F6 admission list before allowing Job creation. This tests actual
coordinator dispatch through the adapter, not a direct observation-only call.

Distinct images are attributed independently. Equal image refs still produce two
fresh candidate/previous Jobs, unique observation IDs and exact Job/Pod UID and
command-hash evidence. The real backend CLI returns explicit empty semantics,
which is accepted only as an observation. Missing CLI faults execute the emitted
command from a scratch directory without the executable. Unreadable CLI faults
execute it against a chmod-000 file and require a nonroot UID. Malformed output
and delayed valid output are independent transport faults; both roles refuse,
with stalled calls bounded below three seconds including overhead.

Resume tests cover `smoke-passed` forward completion, interrupted `writes-closed`
that must roll back, and explicit `rollback-started`. Each invalidates the F6 list
before restarting, then proves admission is refreshed and both new Jobs run.
Retained-only failure preserves exact prior journal bytes (including controller
history), serving images/replicas, write/Flux state and the existing Lease UID.
The Lease is claimed/taken over and renewed normally; it is not released or parked.
There are zero protected effects, schema work, tier restoration or controller
cleanup after refusal. A Lease stolen while the actual observation runs also
refuses before protected effects. No dependency store observation is dispatched.

## Watched production mutations

Each fault was applied alone to `tools/tool-deploy/src/k8s/execute.ts`, the named
mounted tests ran and exited 1, and the original source was restored in a `finally`
block. The command prefix from `tools/tool-deploy` was:

```sh
bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/execute-adapter.test.ts -t '<filter>'
```

| Injected production fault                       | Filter after `release binary preflight.*` | Observed failed tests                              |
| ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Omit binary observation dispatch                | `refuses missing previous`                | 1; release resolved instead of refusing            |
| Treat resumed history as already observed       | `resume from`                             | 3; no fresh refusal                                |
| Omit resumed F6 admission refresh               | `resume from`                             | 3; actual Job creation refused an unadmitted image |
| Exempt rollback steps from the barrier          | `resume from rollback-started`            | 1; no fresh retained refusal                       |
| Substitute candidate image for previous         | `observes both exact`                     | 1; retained image association differed             |
| Omit post-observation Lease renewal             | `Lease loss`                              | 1; protected effect preceded refusal               |
| Normalize interrupted journal before preflight  | `resume from writes-closed`               | 1; exact durable bytes changed                     |
| Move barrier into generic step failure handling | `refuses missing previous`                | 1; a second invocation entered rollback            |

The review repair also watched omission of the sticky heartbeat-loss refusal:
`-t 'sticky heartbeat loss'` exited 1 with two failed mounted tests. The fresh
execution suspended Flux and the interrupted resume stopped its writer despite
a prior heartbeat failure. Restoring the guard returned the full mounted suite
to 16 passed, 0 failed. Both tests require the later post-observation renewal to
succeed, then assert the sticky `LeaseLostError`, zero protected effects, exact
journal bytes and unchanged serving state. The guard is before interrupted
journal normalization. Receipt: `/tmp/k8s-preflight-fault-sticky-heartbeat-loss.log`.

All new coordinator safety guards carry adjacent `Proof:` comments. Existing
transport guard proofs remain in
[verify-k8s-dependency-observation.md](verify-k8s-dependency-observation.md).
Raw mutation receipts are `/tmp/k8s-preflight-fault-<name>.log`; the bounded table
above retains the observed meaning rather than treating exit 1 alone as proof.

## Commands and limits

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: outside-sandbox rerun exited 0;
  1801 installs checked across 1648 packages, no dependency or lockfile changes.
  The initial sandbox install failed with EROFS in Bun's temporary directory.
- Focused baseline executor/adapter suites: 135 passed, 0 failed before edits.
- Final mounted command above with filter `release binary preflight`: 14 passed,
  0 failed, including both real missing and unreadable CLI cases.
- Executor/adapter/controller-focused checkpoint: 186 passed, 0 failed. That
  checkpoint preceded the final file-journal/actual-file fixture refinements;
  final configured target results below supersede it.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=lint,typecheck,build --projects=tool-deploy --outputStyle=stream`: exit 0,
  all 3 targets and 8 prerequisites succeeded (8 dependency tasks from cache).
  An earlier run failed lint on test import order, redundant optional chaining,
  string suffix checks and an unnecessary Bun assertion await; those were fixed.
- `bunx openspec validate --all --json`: exit 0, 271/271 items valid.
- `bunx nx format:check --all`: exit 0, no differing files printed.
- Initial configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --outputStyle=stream`: exit 1, 1231 passed and 1 failed
  across 40 files (247.37 seconds). The sole failure was the unrelated
  `first-start-adapter.test.ts` case `fresh actual SQLite observation requires
replay and disabled exact authority: missing-trigger`, which exceeded its fixed
  10-second deadline at 10,143.50ms. Other local checks/proofs and independent
  host suites overlapped that run. The final rerun below runs without other work
  from this lane; it does not claim an exclusive host.

- Sequential configured rerun of the same target: exit 0, 1232 passed, 0 failed
  across 40 files (227.70 seconds). The previously timed-out missing-trigger case
  passed at 4472.62ms. No checks or mutation probes from this lane overlapped the
  rerun. Receipts: `/tmp/k8s-preflight-configured-test.log` (initial failure) and
  `/tmp/k8s-preflight-configured-test-rerun.log` (successful rerun).

Independent review, canonical isolated host gate, CI secrets/migration lint, real Kubernetes
image/runtime execution and deployment acceptance are not established by these
local fixtures. The fixture executes source on the host, does not run the digest
image, and does not enforce live Kubernetes admission, Pod defaulting or mounts.

## Reviewed heartbeat-loss repair

Astra's reproducer exposed a sticky heartbeat failure that an immediately later
successful renewal did not reject. The two mounted regressions first failed on
real protected effects (`suspendFlux` and resumed `stopWriter`). The coordinator
now checks `held.lost` after the prerequisite/renewal and before journal
normalization or any protected dispatch. Amendment checks:

- Mounted suite: 16 passed, 0 failed (`/tmp/k8s-preflight-heartbeat-green.log`).
- Watched sticky-guard omission: 2 failed tests, exit 1; restored before the
  configured run (`/tmp/k8s-preflight-fault-sticky-heartbeat-loss.log`).
- Same scoped Nx lint/typecheck/build command: exit 0, all 11 tasks successful,
  8 dependency tasks from cache (`/tmp/k8s-preflight-heartbeat-checks.log`).
- `bunx openspec validate --all --json`: exit 0, 271/271 valid.
- Sequential configured `tool-deploy:test`: exit 0, 1234 passed, 0 failed across
  40 files (191.49 seconds). No work from this lane overlapped this run.
  Receipt: `/tmp/k8s-preflight-heartbeat-configured-test.log`.
- The full `nx format:check --all` result above predates this review repair.
  Every amended file is formatted and checked directly; the final integrated
  host gate remains outstanding.

The first scoped lint attempt after adding the guard reported a redundant later
condition: TypeScript narrowed the callback-mutated `held.lost` through the
new inline guard. Moving the check into `assertHeartbeat` preserves fresh reads
without carrying that narrowing across awaited effects. The final scoped checks
and the full configured rerun above cover this form.

## Live k3s rehearsal diagnostic follow-up (2026-10-23)

[PR-head-associated infra-check run 39874303244](https://github.com/Prosperous-Unification/puni-00/actions/runs/39874303244)
failed in the real k3s rehearsal after `admit-images`, before `suspend-flux`.
The job printed source `f6b4d6c466d516ade5c5aa45f93a6f7a3eb07672`
(the PR merge checkout), while the pushed branch head was `2ddea72ee`.
MCP key restoration and session survival had already passed. The lab's
`release ended rolled-back` assertion masked the actual caught value because
it printed the failure only after asserting its phase. The binary preflight
is outside generic rollback intentionally; a raw refusal should still refuse
without changing the release into `rolled-back`.

`requireRolledBackRelease` now prints a bounded, key-redacted caught value
before preserving that same phase assertion. Its mounted diagnostic test passed
3/3; deleting only the emission made the new test fail with an empty printed
list while the phase assertion still threw, then restoration passed 3/3.
Changed-file Prettier and `tool-deploy:typecheck --skipNxCache` passed. This
packet does **not** identify the Job/Pod field or binary output that was refused;
the next live rehearsal must supply that diagnostic before a semantic fix.
