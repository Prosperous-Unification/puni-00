# Verification Report

**Change**: `f9-read-only-http-diagnostics`
**Verified at**: 2026-10-16
**Verifier**: Codex Sol, isolated offline fixture slice

## 1. Structural Validation

`bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` exited 0: 222 items passed, 0 failed. Full machine-readable output: [evidence/openspec.json](evidence/openspec.json). The installed CLI was located outside PATH; no replacement version was fetched.

## 2. Task Completion

The HTTP observation tasks are complete. The broader assigned cold/recovery diagnostic plan remains incomplete: process/cgroup identity, PID-reuse checks, missing cmdline/start-time evidence, remote sampler hard deadline and its TERM-ignoring descendant proof, and missing/unreadable retained evidence checks require a separate coherent slice. No sampler, resource lifecycle, policy writer or evidence reader was introduced here.

## 3. Delta Spec Sync

| Capability             | Sync status | Note                                              |
| ---------------------- | ----------- | ------------------------------------------------- |
| forge-http-observation | Pending     | New additive delta remains unarchived for review. |

## 4. Failure Proofs

Saved terminal logs normalize CRLF and trailing whitespace only. Each source mutation was restored immediately after its selected production-path negative failed. Logs retain the actual failing assertion. Initial tests first failed because the new module was absent. Loopback fixture binding required sandbox escalation; the initial restricted run reported EPERM and did not count as verification.

| Check                  | Injected fault                               | Observed failing test                                                                                    | Evidence                                          |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Origin authority       | Remove credential refusal                    | rejects credentials before opening the local fixture connection                                          | [origin](evidence/origin.log)                     |
| Finite bounds          | Remove bound guard                           | rejects invalid request deadline without fetching                                                        | [bounds](evidence/bounds.log)                     |
| Body cap               | Remove 64KiB guard                           | refuses oversized and redirected responses                                                               | [body limit](evidence/body-limit.log)             |
| Header/body deadline   | Delay deadline by 2 seconds                  | bounds both missing headers and a response body that never ends exceeds test ceiling                     | [deadline](evidence/deadline.log)                 |
| Response verdict       | Unconditionally accept response              | retains denial status and refuses a missing root marker                                                  | [response](evidence/response.log)                 |
| Status predicate       | Ignore status with root marker present       | retains denial status and refuses a missing root marker                                                  | [status](evidence/status.log)                     |
| Root marker predicate  | Ignore marker with HTTP 200                  | retains denial status and refuses a missing root marker                                                  | [root marker](evidence/root-marker.log)           |
| Immediate verdict      | Replace immediate verdict with later success | convergence preserves immediate failure despite later success                                            | [initial verdict](evidence/initial-verdict.log)   |
| First-failure evidence | Restore opaque failure message               | checker first failure emits evidence before any mutating phase misses path                               | [checker evidence](evidence/checker-evidence.log) |
| CLI boundary           | Accept extra mutation argument               | read-only CLI refuses mutation arguments waits instead of refusing; fixture child killed by test ceiling | [CLI boundary](evidence/cli-boundary.log)         |
| Redirect boundary      | Follow local redirect                        | read-only observer sends GET and refuses even a local redirect                                           | [redirect](evidence/redirect.log)                 |
| GET-only boundary      | Send POST                                    | read-only observer sends GET and refuses even a local redirect                                           | [method](evidence/method.log)                     |

Filesystem absence/unreadability proofs are N/A for this HTTP slice: no trusted evidence files are read. Absent response evidence is explicitly nullable and covered by real closed-loopback-connection refusal. Historical evidence was neither read into an acceptance verdict nor changed.

## 5. Scoped Check Output

Commands ran in `/tmp/f9-diagnostic-sol-oct16`, based exactly on reviewed receipts commit `40658a12740c1e525f571b3deb8beaf62db7373a`. Dependencies were reused from that existing checkout through a local node_modules symlink; no frozen install was claimed.

- Focused tests: `bun test tools/tool-devsync/src/k3s/forge-http-observation.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts` — 31 pass, 0 fail; [actual output](evidence/focused-tests.log).
- Scoped Nx (passed): `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static` — [actual output](evidence/nx-scoped.log).
- Changed-file formatting: `bunx prettier --check` on the three touched TypeScript files, local runbook and new OpenSpec artifacts — passed; [actual output](evidence/format-scoped.log).
- Full-tree format: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` produced no output for several minutes and was cancelled by terminating only this task's exact four local Nx/Prettier processes. Full-tree formatting remains unverified; [captured output](evidence/format.log).
- Final lint after the last test addition: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-devsync:lint --skip-nx-cache --output-style=static` — passed; [actual output](evidence/lint-final.log).

The first scoped lint run failed; direct changed-file lint exposed import ordering, test Promise handling and unnecessary-condition issues, which were corrected before rerunning. Nx daemon/plugin sockets were disabled after the sandbox refused them.

No full test gate or host gate was run: the assignment explicitly prohibits the host gate and live lab activity. No Docker, k3d, policy writes, provisioning, teardown, push, merge or deployment was performed. The existing mutating checker ran only against a 503 fixture and exited at its first web assertion, before database or file edits. The separate CLI was exercised only against fixture servers. No new live cold-start, restored acceptance, memory attribution or historical failure-cause claim is made.

## 6. Implementation Signal

The local commit is a single descendant of `40658a12740c1e525f571b3deb8beaf62db7373a`; final SHA and clean working-tree status are reported with the handoff. No push was authorized. Full integration and the broader diagnostic slice remain outstanding.

## Decision

HTTP diagnostic slice is ready for local review after the recorded scoped checks. This is not complete F9 acceptance or completion of the broader process/remote-sampling plan.

## 7. Review repair child of da15e46a

Astra reproduced two defects in the initial candidate: observation failures inherited the completed-response prefix credited by the recovery coordinator, and root markers were computed only at EOF. The initial review regression failed for connection refusal being credited as ingress denial, split-marker stream timeout losing the marker, and an oversized chunk losing its allowed-prefix marker; the convergence window fixture initially passed. [Observed red output](evidence/review-red.log).

The repair preserves the completed-response prefix for real status/root mismatches and emits a distinct `web observation <failure>` message for transport, deadline and body-limit failures. The regression feeds the real checker subprocess output through `rehearseRecovery`; every observation failure now refuses ingress credit and overall acceptance, while an actual 503 response still exercises the existing completed-response refusal contract. These subprocesses all stop at the first web assertion before the checker's mutating phases.

Root-marker evidence is updated for every received chunk, including only the bytes inside the cap. Markers survive later hang, reset or cap refusal without converting that observation to a pass. Tests include a split marker and a marker in the allowed prefix of an oversized chunk.

| Repair check              | Injected fault                                       | Observed production-path failure                                       | Evidence                                            |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Transport classification  | Route transport back into completed-response prefix  | Real checker output earns ingress credit instead of failing            | [transport](evidence/review-prefix-transport.log)   |
| Deadline classification   | Route deadline back into completed-response prefix   | Real checker output earns ingress credit instead of failing            | [deadline](evidence/review-prefix-deadline.log)     |
| Body-limit classification | Route body-limit back into completed-response prefix | Real checker output earns ingress credit instead of failing            | [body limit](evidence/review-prefix-body-limit.log) |
| Received split marker     | Remove incremental detection                         | Root marker becomes false before timeout/reset                         | [stream](evidence/review-marker-stream.log)         |
| Allowed-prefix marker     | Remove incremental detection                         | Root marker becomes false on body-limit refusal                        | [cap](evidence/review-marker-cap.log)               |
| Initial request window    | Remove initial deadline clamp                        | 80ms window consumes about 1000ms, exceeding the 500ms fixture ceiling | [initial](evidence/review-window-initial.log)       |
| Final request window      | Remove remaining request clamp                       | Final request extends the window beyond the 500ms fixture ceiling      | [final](evidence/review-window-final.log)           |
| Pause window              | Remove remaining pause clamp                         | Oversized pause hits the 1500ms test ceiling                           | [pause](evidence/review-window-pause.log)           |

The watched mutations were restored before final validation. Focused tests: 35 passed, 0 failed; scoped Nx lint/typecheck/build: passed; changed-file formatting: passed; OpenSpec: 222 items passed, 0 failed. Final exact-candidate output is retained separately from the original candidate's receipts: [focused tests](evidence/review-focused-tests.log), [scoped Nx lint/typecheck/build](evidence/review-nx-scoped.log), [changed-file formatting](evidence/review-format-scoped.log), [all OpenSpec validation](evidence/review-openspec.json). The repair uses the same commands and offline fixture boundaries as section 5. No additional full-tree format scan or host gate was run; the original full-tree format limitation remains. All broader process-identity, remote-sampler, retained-evidence and live-acceptance limitations remain.

The repair commit is a direct child of `da15e46afefb12d8aa478a8c5eaaf6fb2b3e3c7d`; its exact SHA and clean working tree are reported in the handoff. Nothing was pushed or deployed.

## 8. Metadata spoofing repair child of 1a8e09ed

Astra reproduced a residual false ingress verdict: an oversized response's content type contained `CHECK FAILED: web serves index.html`, and the unanchored coordinator found that string inside retained observation JSON. The real checker-to-coordinator regression first failed with ingress credit and overall acceptance despite body-limit refusal. [Observed red output](evidence/classifier-red.log).

The authoritative classifier now accepts a failure prefix only at the start of output or immediately after a real LF, with the checker's optional `error: ` runtime prefix. It does not use JavaScript's multiline flag, which would also treat Unicode separators as line starts. Metadata is retained as escaped JSON and cannot provide that authoritative prefix. Existing standalone fixture verdicts, actual completed-response checker failures and captured Bun error lines remain covered by positive controls.

| Classifier check            | Injected fault                         | Observed production-path failure                                               | Evidence                                                     |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Authoritative line boundary | Remove the line boundary               | Actual checker body-limit output with forged content type earns ingress credit | [unanchored](evidence/classifier-unanchored.log)             |
| Literal newline semantics   | Replace LF boundary with multiline `^` | Unicode-separator metadata is credited as a new verdict line                   | [Unicode boundary](evidence/classifier-unicode-boundary.log) |

Both mutations were restored before final validation. Final focused tests: 37 passed, 0 failed; [actual output](evidence/classifier-focused-tests.log). Scoped Nx lint/typecheck/build and changed-file formatting passed; OpenSpec reported 222 passed and 0 failed. Exact outputs are retained as [Nx](evidence/classifier-nx-scoped.log), [format](evidence/classifier-format-scoped.log) and [OpenSpec](evidence/classifier-openspec.json). Same offline commands and fixture boundaries as sections 5 and 7. No full-tree format rerun, live acceptance, host gate, push or deployment was performed. Previously documented broader sampler and full-tree formatting limitations remain.

The classifier repair commit is a direct child of `1a8e09ed564fcdd7c1e1e2fde47b6780de87a855`; its exact SHA and clean tree are reported in the handoff.

## 9. Hosted CI terminal-format repair child of e7201df0

Hosted workspace job `116755664392` failed two HTTP tests because Nx inherited `FORCE_COLOR=1`: Bun inserts VT sequences between `error`, `:` and the checker message. The coordinator could not recognize a real completed-response denial, and the spoofing regression's literal message assertion could not recognize its body-limit refusal. This restores the existing authoritative-line contract; no delta behavior or live acceptance claim is added.

In an isolated checkout based exactly on `e7201df07f7e72f5a791a6f8546fe213ea320aeb`, `FORCE_COLOR=1 bun test tools/tool-devsync/src/k3s/forge-http-observation.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts` reproduced the same two failures: 35 passed, 2 failed ([original red](evidence/ci-color-original-red.log)). The tests now force color in real checker children even when the parent has no color. Normalizing only the text assertion left the coordinator regression failing before production repair: 36 passed, 1 failed ([test-first red](evidence/ci-color-test-first-red.log)).

The coordinator removes terminal formatting at its external checker-output boundary before applying the existing LF-only authoritative prefix matcher. The real forced-color completed-response denial earns ingress credit; transport/deadline/body-limit failures, inline metadata, escaped newlines and Unicode separators still refuse credit. A colored inline metadata fixture extends the existing refusal coverage. The raw checker output reaches the coordinator unchanged in the integration regressions.

R5 watched negative: removing only the authoritative line boundary while retaining normalization made the actual oversized-response checker with forged content type earn ingress credit: the regression expected `fail` and observed `pass` ([boundary negative](evidence/ci-color-boundary-negative.log)). Removing normalization was observed in the test-first red above. Both faults were absent during final checks, and the production checks retain adjacent `Proof:` comments.

Final checks in `/tmp/f9-516-ci-repair`:

- Focused forced-color command above: 37 passed, 0 failed ([output](evidence/ci-color-focused-tests.log)).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static`: passed, including six dependency tasks ([output](evidence/ci-color-nx-scoped.log)).
- `bunx prettier --check` on the three changed TypeScript files and this verify document: passed.
- `bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` (existing OpenSpec 1.12.0): 222 passed, 0 failed ([output](evidence/ci-color-openspec.json)). The initial unqualified `bunx openspec` was unavailable and failed resolving its temporary directory; the pinned existing CLI completed validation.

The first sandboxed test attempt could not listen on loopback (`EPERM`); approved local fixture runs produced the red/green receipts above. Dependencies are reused via the existing checkout's node_modules symlink; no frozen install was claimed. Full tool-devsync tests, full-tree formatting, the host gate, live lab, push, merge and deployment were not run. All previous live acceptance and sampler limitations remain. The commit SHA and clean tree are reported in the handoff.
