# Forge restart state verification — 2026-10-15

Baseline: public main `2248cb41bf297872152f3e2c8cb3cae58481678b`. Isolated clone `/tmp/puni-f9-nx-recovery-sol-20261015`, branch `fix/forge-nx-container-state`.

## Failure proofs

| Check                              | Injected fault                                 | Observed test                               | Evidence                                                                                            |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Independent continuous-task launch | Baseline overlay omits private workspace state | Real installed Nx ownership fixture         | `/tmp/puni-f9-nx-red.log`: exit 1; timed out with `Waiting for fixture:serve in another nx process` |
| Effective Pod state                | Remove private setting from overlay            | Bound overlay assertion and real Nx fixture | `/tmp/puni-f9-nx-mutation.log`: exit 1; 31 pass / 2 expected failures; setting restored             |

## Commands

- `BUN_TMPDIR=/tmp/puni-f9-bun-tmp bun install --frozen-lockfile`: passed, 1573 installs across 1447 packages, no changes. Initial `/tmp` attempt reported EROFS; dedicated temporary directory succeeded.

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-devsync/src/k3s/dev-environment.test.ts`: 33 pass, 0 fail; `/tmp/puni-f9-nx-final.log`. The fixture observes shared ownership blocking, then private task launch; original database bytes and ownership row are unchanged. Three 12-second observation phases and 3-second process-group cleanup fit its 45-second test budget. Subprocess output goes to scratch files because this Bun/Node combination lost buffered console output over pipes during fixture development.
- `bunx @fission-ai/openspec@1.12.0 validate forge-restart-state --json`: passed, 1 change, no issues.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: passed, 189 changes and 18 specs, 0 failed; `/tmp/puni-f9-openspec-all.log`.
- `timeout 120s env NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false bunx nx run-many -p tool-devsync -t lint typecheck build --skip-nx-cache --parallel=2 --outputStyle=stream`: passed, all three targets and six dependency tasks, 14.8s; `/tmp/puni-f9-scoped-compile.log`.
- `timeout 600s env NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false bunx nx run-many -p tool-devsync -t test lint typecheck build --skip-nx-cache --parallel=2 --outputStyle=stream`: **incomplete**, exit 124 at the 600-second deadline; `/tmp/puni-f9-scoped-accepted.log`. The full `tool-devsync:test` target did not complete. Before cutoff, 356 passing cases were observed. At termination, `refuses persistent checkout changes between discovery and execution` failed because its supervisor exited 143 instead of yielding the expected checkout-change diagnostic. No case had failed before the deadline. The existing hung-Playwright and detached-listener timeout cases each passed after about 126 seconds. The full target remains unverified; the focused regression and the separate scoped compile checks passed.
- Scoped Prettier check and `git diff --check`: passed.

### Verification setup corrections

The first scoped run used Nx's native command runner, found fixture lint issues, and stalled without useful test output; interrupted with exit 130. Fixed all eight fixture lint issues and ran its lint check successfully. The next run exposed an unsuitable verification setting: the absolute `NX_WORKSPACE_DATA_DIRECTORY=/tmp/puni-f9-scoped-nx` was inherited by unrelated scratch-workspace tests, which overwrote the shared project graph and caused unrelated module-boundary failures. Interrupted that run (130) and reran scoped checks with normal per-workspace state, daemon/plugin isolation/native runner disabled, and streamed output. The subsequent sandbox run reached the expected socket-using tests and failed with `EPERM: operation not permitted, listen`; its index checker also refused the new, then-untracked OpenSpec paths. Staged the candidate and reran the same scoped checks with approved listener access. Neither verification setting is committed. The production directory belongs to one container and one workspace.

## Limits

This change addresses restart ownership only. The baseline's first cold container OOMKilled at 2Gi remains unresolved; original live evidence is `/tmp/puni-f9-acceptance-20261015/REPORT.md`. No cold OOM fix, full F9 pass or h2puni gate is claimed. Disposable runtime recovery acceptance is scheduled against this exact committed candidate with evidence kept outside the checkout. Broad host gates are not run; the full tool-devsync test target remains unverified after its bounded timeout.

## Bounded diagnostic extension — 2026-10-16

Reviewed aggregate parent `7a13fd0033b9067f0b9cfb980139efb20c4bde56`; isolated development clone
`/tmp/puni-f9-sol-20261016`. Executed lab candidate `9c5828e43879059ec5708df4a381d4fa5cdbb36c`,
tree `859413db67d99a0d04a9826e4d29d37fc1901c18`, fresh served clone
`/tmp/puni-f9-sol-fresh-20261016/puni-00`. No push, PR, shared deployment or canonical host gate.

### Fresh checks

- `BUN_TMPDIR=/tmp/puni-f9-sol-bun-tmp bun install --frozen-lockfile`: passed; 1573 installs
  across 1447 packages, no changes. Initial default temporary-directory attempt failed EROFS;
  the explicitly writable temporary directory succeeded.
- `bun test tools/tool-devsync/src/k3s/forge-recovery-check.test.ts`: 18 pass, 0 fail,
  33 assertions; `/tmp/puni-f9-sol-green-final.log`.
- Separate `timeout 1800s env NX_DAEMON=false NX_ISOLATE_PLUGINS=false
NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false BUN_TMPDIR=/tmp/puni-f9-sol-bun-tmp
bunx nx run tool-devsync:test --skip-nx-cache --outputStyle=stream`: exit 0,
  **637 pass, 0 fail, 38 files, 813.73s**, Nx 13m34s;
  `/tmp/puni-f9-sol-full-test.log`. This command began before the lab diagnostic corrections;
  its later recovery suite explicitly ran and passed the captured API and deliberate SIGKILL
  regressions against corrected production code. The final test-only method binding needed
  by ESLint was applied after those cases loaded; the focused suite was rerun afterwards. The final first-source-memory evidence guard and its two tests were added after this full run; those pass in the focused suite and accept the real captured first-container samples. This full-run receipt is not attributed to an unexecuted final 639-case run.
- Scoped Nx lint/typecheck/build plus six dependencies: passed, 16.1s;
  `/tmp/puni-f9-sol-compile-final.log`. After the captured-fault fixtures were added, a repeat
  exposed one unbound-method lint issue in the new test; fixed with `.bind(driver)`.
  Final scoped Nx lint/typecheck/build passed on the final source (`/tmp/puni-f9-sol-compile-accepted.log`); direct ESLint and TypeScript build also passed; logs
  `/tmp/puni-f9-sol-eslint-final.log`, `/tmp/puni-f9-sol-tsc-final.log`.
- Scoped Prettier and Git whitespace checks passed. All OpenSpec validation passed:
  **197 changes and 18 specs, 0 failed**; `/tmp/puni-f9-sol-openspec-all.log`.
  Focused `forge-restart-state` validation also passed.

### Watched production-path fault receipts

Mutations ran isolated copies of the exact production coordinator/parser plus its consuming
suite in `/tmp/puni-f9-sol-faults`; original and copied production sources were restored after
all injections. The development and served checkouts were never mutated by these runs.

| Check                        | Injected fault                                | Observed failure                                    |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Cold outcome retained        | Force cold pass after OOM/restart             | `preserves first OOM…` / cold restart tests; exit 1 |
| Pod UID                      | Remove foreign UID refusal                    | First PID1 recovery assertion; exit 1               |
| Container identity/count     | Remove replacement identity/count requirement | First PID1 recovery assertions; exit 1              |
| Ingress negative             | Invert required checker exit status           | Missing-denial / MCP assertions; exit 1             |
| Exact policy restoration     | Force restoration pass despite mismatch       | Restoration assertion; exit 1                       |
| First-container OOM snapshot | Ignore current termination                    | Current OOM parser assertion; exit 1                |
| Ingress attribution          | Remove preceding-positive requirement         | Failed positive cannot credit negative; exit 1      |
| API edge denial              | Remove captured API failure from classifier   | Captured API denial assertion; exit 1               |
| SIGKILL classification       | Treat all exit 137 as OOM                     | Deliberate Error/137 assertion; exit 1              |
| First-source memory          | Remove source cgroup evidence refusal         | Platform-only and missing-peak assertions; exit 1   |

Receipts: `/tmp/puni-f9-sol-fault-receipts.log`,
`/tmp/puni-f9-sol-fault-extra-receipts.log`, `/tmp/puni-f9-sol-fault-memory-receipt.log`, per-fault `.stderr` files. The final evidence guard also accepts the actual immutable first-container sample file: `/tmp/puni-f9-sol-memory-real.log`.
Initial mutation auditing found that the foreign-UID test only asserted any recovery failure,
so a later timeout could mask the missing first-recovery guard. Changed it to assert failure
of the first replacement; the removed-UID mutation then failed as required. The initial RED
suite failed all 10 coordinator tests, the current-termination regression failed 1 of 13,
SIGKILL classification failed 1 of 15, and captured API denial failed 1 of 16 before fixes.

### One instrumented fresh-worktree lab

Raw evidence is immutable at `/tmp/puni-f9-sol-live-20261016`: `report.json`, `events.json`,
command stdout/stderr, raw Pod/policy responses, `node-memory-rss.log`, first and ingress-positive
browser JSONL/ZIP files. Derived `identity-summary.json` and `memory-diagnosis.json` aid reading.

Lab `f9diag1016`, app profile, origin `http://alpha.localhost:36719`.
Preflight proved ~22GiB available memory, no existing resources for this lab, and only the
unrelated BuildKit container `52a96e3da92e`. Docker access required approved escalation;
there was no automatic approval denial. The sampler started at 21:29:28Z, before dev up.
Pod UID stayed `56a8a230-9752-41c8-9158-7a9c238a7189` throughout.

| Stage                                   | Observed outcome                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| First cold container                    | **FAIL**: `a7848e…`, restarts 0, started by 21:29:52Z; OOMKilled before 21:29:59Z                                         |
| Automatic replacement                   | Ready 21:30:06Z, `c4d983…`, restarts 1; does not erase cold failure                                                       |
| PID1 kill one                           | 21:30:06Z → ready 21:30:26Z, `783554…`, restarts 2, same Pod UID                                                          |
| PID1 kill two                           | 21:30:26Z → ready 21:31:03Z, `a7a66c8ab4127725bf2484b74277708c4800c6964ddb9d29c17a9b0217a1b35e`, restarts 3, same Pod UID |
| First full checker                      | Exit 0, completed 21:31:28Z; first browser trace retained; HMR document-retention passed                                  |
| Distinct ingress positive               | Exit 0, completed 21:31:46Z                                                                                               |
| Denied full checker                     | Exit 1 at API edge-proxy write, 21:31:48Z, after index passed                                                             |
| Exact saved policy restoration/readback | Passed 21:31:48Z                                                                                                          |
| Restored full positive                  | **FAIL**, exit 1 at index.html, 21:31:48Z; cause unknown                                                                  |
| Owned cleanup                           | Passed 21:32:26Z; namespace/Leases/lab-labelled resources and lab state absent                                            |

The original lab driver's narrow classifier omitted the API edge route and reported its
negative as failed. Preserve that original verdict: the captured denial is valid ingress
failure evidence after the distinct full positive, and the corrected classifier now has a
RED/GREEN regression. The immediate restored checker remains failed. Exact API policy readback
does not certify dataplane convergence. No bounded convergence probe or extra lab was run;
network-policy propagation and tier restart timing are unproven hypotheses.

The executed candidate also labeled Error/137 from deliberate PID1 kills as `oom` in later
observations. Raw Pod terminations and cgroup facts distinguish them. The corrected parser
uses `reason: OOMKilled`; its SIGKILL regression is watched. Initial cold OOM classification
was valid independently: Kubernetes reported OOMKilled and the pod cgroup recorded
`memory.peak=2147483648`, `max=217`, `oom=1`, `oom_kill=8`, `oom_group_kill=1`.
The largest sampled first-container allocation was `memory.current=2026127360` and
`memory.peak=2026405888` shortly before termination; the persistent Pod cgroup retained the
exact 2Gi peak after that container disappeared. A `MainThread` process had 1,042,280KiB RSS;
three Bun processes had 290,912 / 297,224 / 324,160KiB RSS in that sample. RSS includes shared
pages and these reads are sequential, so they must not be summed as an allocation proof.
The first container log starts all four Nx serve tasks and reports Vite ready. Cgroup memory
exhaustion is proven; precise allocation/command attribution remains unknown because this
sampler captured process status, not child command lines or allocator stacks.

Image digest stayed
`sha256:489266ae593e1099a4abc28928f353175727648e53199b97fe142678038f5f4d`;
2Gi limit, 768Mi/250m requests, exact original three mounts and Restricted security remained.
No runtime limit, startup behavior, production checker or worktree Nx ownership was repaired.
The global kubeconfig digest remained
`026ef3ce3b62233d2f908e061e935374543810ca2ed0e0d0185db9702775721a`.
Docker after cleanup again contained only the original BuildKit container. Source trees
remained tracked-clean; no shared Docker prune or cleanup was used.

Overall F9 acceptance remains **failed**, independently for cold startup and restored positive.
No canonical h2puni gate, hosted CI, secrets/migration gate, complete repository gate,
production deployment, VM or full platform/fleet certification is claimed.

## Astra review: automatic ownership split and executable boundaries

Review of `21a3ca20bbf0b453a2e037cb05822243f6a764f5` found three P2 blockers: network/volume-only
pre-existing resources could reach generic teardown after a failed up; Bun's default TERM timeout
could wait indefinitely on an ignoring child; and destructive guards had only coordinator stubs.

Automatic lab up/down has now been **removed** from the executable packet. The remaining CLI
always exits nonzero with `automatic lab up/down disabled: tool-fleet creation receipts required`
before creating or deleting resources. This supersedes the earlier reusable-runner description.
The current tool-fleet owner exposes no per-resource creation receipts. Another preflight or a
cooperating-only host lock cannot prove ownership of a raced registry/network or partially created
cluster, so it is not a safe authorization for generic down. Re-enabling automatic creation,
partial-startup cleanup and teardown is an explicit separate architecture task (tasks 3.2/4.4).
No claim of a safe reusable automatic lab provisioner is made.

The coordinator, read-only inventory/cleanup verification, guarded node PID1 boundary and browser
preload remain library components. `runRecoveryCommand` creates an owned local process group and
uses a hard SIGKILL deadline plus a finite one-second observation ceiling. Direct process exit also
kills remaining local group members. TERM delivery is observed and ignored by the real fixture
before its deadline. A Docker client's death does not terminate a remote command; the old startup
and remote sampler launch paths are removed, and a future remote sampler needs a separately
verified hard deadline. Cleanup verification deletes nothing and runs all independent probes
before throwing combined failures.

### New RED/GREEN and watched receipts

The command fixture is an actual Bun child executable with a persisted world and command log;
it stands in for external Docker/kubectl without contacting a live daemon. Production inventory,
node inspection, PID1 kill construction and cleanup verification execute through that boundary.
Seeded resources and the raced resource remain unchanged. A valid owned PID1 reaches the fixture's
kill command; foreign UID, node PID zero/one and non-PID1 never reach it.

- Initial contract RED: 2 pass / 15 fail, `/tmp/puni-f9-review-boundary-red.log`.
- Focused GREEN: 41 pass / 0 fail, 118 assertions across 2 files,
  `/tmp/puni-f9-review-boundary-green.log`.
- Actual TERM-only deadline negative: finite observation ceiling rejects at about 1.5s;
  restored hard-kill fixture completes about 0.5s. Separate direct-exit descendant regression
  failed before final group cleanup, then passed. Fixture cleanup independently kills its own
  process group after every outcome, including deliberately broken production guards.

| Boundary             | Injected production fault            | Observed failing fixture                                   |
| -------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Inventory            | Remove nonempty inventory refusal    | Labelled container, network-only and volume-only           |
| Disabled provisioner | Remove CLI refusal                   | Post-inventory raced network; CLI exits zero unexpectedly  |
| Node ownership       | Remove UID comparison                | Foreign node UID reaches kill                              |
| Node PID             | Remove PID > 1 guard                 | PID zero and PID one reach kill                            |
| Container PID1       | Remove NSpid refusal                 | Namespace PID two reaches kill                             |
| Namespace absence    | Remove refusal                       | Surviving namespace fails its assertion                    |
| Lease absence        | Remove refusal                       | Surviving Lease fails its assertion                        |
| Docker absence       | Remove generic resource refusal      | Container, network and volume survivor assertions all fail |
| Lab state            | Remove state-file refusal            | Surviving lab.json fails its assertion                     |
| Global kubeconfig    | Remove digest comparison             | Changed kubeconfig fails its assertion                     |
| Hard deadline        | Replace process-group KILL with TERM | Real TERM-ignoring child/descendant exceeds exit ceiling   |
| Command budget       | Remove finite-positive validation    | Zero, negative, infinite and NaN deadline assertions fail  |
| Direct exit          | Remove final local group cleanup     | Descendant remains running after direct command exit       |

Every mutation exited 1 and was restored in `/tmp/puni-f9-review-faults`; development sources and
immutable live evidence were not mutated. Receipts: `/tmp/puni-f9-review-fault-receipts.log`,
`/tmp/puni-f9-review-fault-direct-exit-receipt.log`, and per-fault `.stderr` files. Cleanup survivor
tests also verify subsequent Lease and all three Docker probes still execute after an earlier
failure. Proof comments are adjacent to the corresponding production guards.

No third lab, remote sampler, provisioning, teardown, production checker or resource change was
run during review corrections. The original first-cold OOM and failed restored positive remain
unchanged. Final static/OpenSpec checks and exact committed full-target status are recorded below;
the earlier 637-case receipt does not certify the new boundary fixtures.

### Corrected packet checks

- Focused `bun test tools/tool-devsync/src/k3s/forge-recovery-lab.test.ts
tools/tool-devsync/src/k3s/forge-recovery-check.test.ts`: **41 pass, 0 fail, 118 assertions**;
  `/tmp/puni-f9-review-boundary-green.log`.
- Scoped Nx lint/typecheck/build and six dependencies: **passed, 15.5s**;
  `/tmp/puni-f9-review-compile.log`. Final direct ESLint/TypeScript checks also passed.
- Prettier and `git diff --check`: passed; `/tmp/puni-f9-review-format-check.log`.
- All OpenSpec validation: **197 changes and 18 specs passed, 0 failed**;
  `/tmp/puni-f9-review-openspec-all.log`.
- Exact committed full `tool-devsync:test` after these corrections: **pending** at handoff.
  The bounded command will use the committed checkout with daemon/plugin isolation/native runner
  disabled and no Nx cache, timeout 1800s plus finite kill grace. Its output will be
  `/tmp/puni-f9-review-full-test.log`, with final command exit status in
  `/tmp/puni-f9-review-full-test.exit`. The previous 637-case pass is historical and does not
  substitute for this run. No corrected full-target success is claimed here.

No canonical gate, push, PR, live lab or deployment accompanies this corrected packet.

## Final Astra correction: unreadable lab state

Review of `73896960753ee28331be078e188f0854421e355f` demonstrated that `existsSync` returns
false when `lab.json` cannot be inspected through an unreadable state directory. The correction
is isolated in `/tmp/puni-f9-unreadable-20261016`, cloned from that exact commit; the previous
full target checkout remains unchanged so its result retains its original attribution.

`verifyRecoveryCleanup` now uses `lstat`. Only ENOENT means absent; EACCES and every other
filesystem error are retained in the aggregate cleanup failure. Existing absent-state and
surviving-state fixtures still pass. The new consuming fixture writes `lab.json`, changes its
parent directory to mode 000, directly observes EACCES, and invokes the production cleanup
verifier through the real Docker/kubectl command fixture. It also changes global kubeconfig to
prove the later verification still runs. Directory permissions are restored in finally.

- RED with existsSync: the unreadable-state assertion fails because the aggregate contains only
  the later kubeconfig mutation, `/tmp/puni-f9-unreadable-red.log`.
- GREEN: 42 pass, 0 fail, 123 assertions across both recovery suites,
  `/tmp/puni-f9-unreadable-green.log`.
- Watched fault: change the ENOENT-only recovery condition to accept every filesystem error.
  The consuming unreadable-state regression fails again, exit 1; mutation restored. Receipt:
  `/tmp/puni-f9-unreadable-receipt.log`, `/tmp/puni-f9-unreadable-mutation.stderr`.
  The Proof comment is adjacent to that modeled filesystem recovery.

The CLI remains disabled, and this correction creates/deletes no lab resources. The original
cold OOM and restored-positive failures remain immutable. No lab rerun or push occurred.
The full target started from unchanged `738969` is reported separately; it does not certify this
additional unreadable-state regression.

Final correction checks: scoped Nx lint/typecheck/build plus six dependencies passed in 16.1s
(`/tmp/puni-f9-unreadable-compile.log`); Prettier and Git whitespace passed; all OpenSpec validation
passed 197 changes and 18 specs (`/tmp/puni-f9-unreadable-openspec.log`). The old checkout's
full-target log `/tmp/puni-f9-review-full-test.log` was still running without a final exit-status
file at this handoff. No full-target success is attributed to this new correction.

### Wave7 aggregate descendant oracle repair — 2026-10-16

Integration of the approved F9 head exposed a Linux procfs disappearance race in
`forge-recovery-lab.test.ts`: the production command returned exit 0 without a
timeout, but reading its killed descendant's `/proc/<pid>/stat` raised `ESRCH`.
The original oracle accepted only `ENOENT`. An isolated rerun passed, confirming
the timing dependence; the existing `performance-processes.ts` reader already
models both disappearance codes.

The direct-exit test now shares its extracted local oracle with deterministic
regressions. Only `ENOENT` and `ESRCH` mean disappearance; `EACCES` and `EIO`
propagate unchanged, a live status remains running, and a zombie is stopped.
Production process-group behavior is unchanged. No delta spec is needed for this
test correction restoring the existing descendant-cleanup contract.

Watched proofs:

- Injected `ESRCH` failed before the narrow catch correction: two regressions
  passed and one failed ([RED](evidence/wave7-aggregate/descendant-red.log.txt)).
- The complete restored fixture file passed 27 tests, zero failures, 96 assertions
  ([GREEN](evidence/wave7-aggregate/descendant-green.log.txt)).
- Temporarily removing only `runRecoveryCommand`'s final `killGroup()` made the
  real direct-exit descendant test fail with expected stopped=true, actual=false
  ([negative](evidence/wave7-aggregate/descendant-cleanup-negative.log.txt)).
  The production file was restored byte identically before the final run.

The initial broad fleet run encountered restricted listener/socket fixtures and
a stalled QEMU fixture; it was interrupted, not accepted as evidence of a code
failure or a passing full fleet suite. Its transcript remains at
`/tmp/wave7-aggregate-focused.log`. The first narrower nine-file run returned
226 pass and one failure at the procfs race above; its transcript remains at
`/tmp/wave7-aggregate-focused-scoped.log`.

Aggregate scoped validation on the restored tree:

- Frozen Bun install passed: 1,573 installs across 1,447 packages.
- Nine-file F9/forge, immutable-image smoke and rank controller/store command
  passed: 230 tests, zero failures, 717 assertions
  (`/tmp/wave7-aggregate-focused-restored.log`). The final extracted-oracle file
  also independently passed 27/27 after its lint assertion adjustment.
- Uncached Nx typecheck passed for tool-fleet, tool-devsync, twilight-burokrat,
  wbs-core and wbs-be-01 plus two module tasks. Uncached Nx lint passed for
  tool-fleet, tool-devsync, wbs-core and wbs-be-01; twilight-burokrat lint:source
  passed separately. Direct lint and scoped Prettier passed after the oracle edit.
- Pinned OpenSpec all: 222/222 valid, zero failures. Scenario validation returned
  `{"unidentified":[]}`; solver smoke shellcheck and aggregate whitespace passed.
- Production committed K6 and exact-edge oracle passed on pre-repair aggregate
  `e3b37f95c39d9a8db70ee4e19d2a095359b2fc65`, preserving all four unrelated
  findings. The repair changes only a test oracle and this evidence.

All four approved source heads remain ancestors; the initial merge aggregate
preserved all 126 source-path blobs exactly and had no conflicts. This repair
intentionally diverges in `forge-recovery-lab.test.ts` and this appended verify
document, adding only the three watched-proof transcripts beside the change.
No Step/Navigator stack or K6 import follow-up was included. The base remains
exact PR #504 head `24c5eda8c5b37280048aee9cbf9ef411c87b04f6`.

Full host gate, full workspace checks, hosted aggregate CI, live infrastructure
acceptance, push, release, merge and deployment were not run. The coordinator owns
#504's separate hosted diagnostic and any later base reconciliation.
