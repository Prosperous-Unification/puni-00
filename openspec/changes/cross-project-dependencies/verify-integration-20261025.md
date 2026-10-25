# Integration reconciliation and bounded acceptance — 2026-10-25

Parent tasks 6.3, 8.4, 10.x and 11.x remain open. Architectural main merge,
activation, native adoption and deployment remain held. These are bounded source
and test results; the final candidate still needs its own CI and canonical host gate.

## Supervisor fixture participation

Full-feature CI `40200448047`, remote-rest job `121190392596`, failed only the
`setsid` fixture participation assertion: the PID roster was empty after a
complete-descendant-cleanup refusal. Source ordering permits genuine early TERM
before the post-escape PID append. The exact CI interleaving was not reproduced.

Test-only repair `85af3b4fe` preserves production collector, supervisor and join
code, SIGKILL, the 0.1-second escalation, the 2,000-ms operation deadline and the
5,000-ms test budget. Only setup inherits a SIGTERM mask. The worker restores its
prior mask immediately; real leader/grandchild PID, PGID and SID records plus an
owned bounded acknowledgement precede descendant mask restoration. All recorded
participants must be extinct. Extreme KILL-before-publication starvation still fails.

| Targeted native case     | Observed outcome                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Unchanged original       | 1 pass, 3 assertions; CI failure did not reproduce                                                                     |
| Repaired normal fixture  | 1 pass, 39 assertions; both real roles recorded and extinct                                                            |
| Controlled mask omission | 1 expected failure, 7 assertions; preserved nonempty oracle got zero after complete cleanup and control-PID extinction |
| Controlled restored mask | 1 pass, 50 assertions; actual supervisor TERM pending before publication, then both real roles recorded and extinct    |

An earlier scratch-root ENOENT invocation failed before native spawn. One
replacement was explicitly authorized: five invocations, four native cases, no
fifth native replay. The temporary control observed only its own pending TERM
from the unchanged supervisor. It injected no signal and did not pause discovery.
The normal candidate has no control wait. Final comments preserve the executed
Python AST. Independent Astra source, log and hash review approved the patch.

## Existing main reconciliation

Commit `7b4f820ff` reconciles existing main `2ca06fcf1`. Twenty-one imported paths
equal main; only plan-cards source/test combine main's header changes with the
feature. Twenty-one protected dependency UI/lookup files equal the feature parent.

The **397 tests across 9 frontend suites** ran on the pending tree at HEAD
`85af3b4fe` plus MERGE_HEAD `2ca06fcf1`, later committed as `7b4f820ff`.
They were not replayed on the later combined candidate. Configured UTC Vitest used
one worker, no file parallelism and 30,000-ms test/hook limits. Frontend typecheck
including ten module checks and build-tsc, fresh Nx graph-backed lint, formatting
and canonical OpenSpec validation **293/293** passed. No Auckland, browser or
full-host acceptance is claimed.

Optional `--strict` OpenSpec validation returned 148 passes and 145 failures:
685 WARNING, 10 INFO, zero ERROR. This is disclosed extra warning debt; required
`--all --json` passed. No unrelated warning cleanup was attempted.

Two inherited main UI findings remain: adoption Undo stays actionable after a
viewer reread, and an open rename form retains enabled Save after capability loss.
These are UI permission-state findings, not demonstrated backend authorization
bypasses. Open external PR #735 owns the exact resource component/test paths;
this packet makes no competing edit or claim that those findings are fixed.

Commit `225a06604` then reconciles main `a116092e5` (PR #739). The conditional
refusal type retains both required mixed-rate-card bases and the feature's
prerequisite/blocker details. Existing feature fields and main's type-proof
fixtures remain. Focused refusal/work-item-shape tests passed **7 tests and
21 assertions**, including the compiler fixture. Contracts/core/backend spec
typechecks, fresh graph-backed lint and formatting passed. Astra approved the
mechanical source union. Commit `b784c728` adds the reviewed arrangement test
byte-identically.

## Same-batch external relationship and arrangement

The Task 8.4 test-only packet originated as `0901a545b`. The actual mounted app
and SQLite provide stable endpoint IDs. It deletes the seeded edge and proves an
unlinked baseline, then adds an external FS edge and arranges in **one command
batch**. The following GET must expose linked ordering while held and foreign
positions remain unchanged. A missing remote calendar refuses at command index 1
and restores all discovered non-`sqlite_%` application-table contents. This proves
logical rollback, not SQLite schema/WAL byte identity or in-memory notifications.

The two focused tests passed **11 assertions**; the three-file regression passed
**33 tests and 162 assertions**. A disposable actual `arrangeInSlots` caller fault
flattened only copied `earliestStart` values. POST still returned 200, but actual
GET order failed; restoration passed 2 tests and 11 assertions. GET's dates stayed
correct, so POST status or recomputed dates alone could not satisfy the witness.
This proves sensitivity to final starts, not every lifetime/staging guard separately.

The retained fault patch is explicitly reconstructed after execution from the
exact injection command; it is not the original frozen fault artifact. Repeated
replay and a stale automation check expecting line 145 rather than 147 are
recorded in private receipts. The stale metadata check failed after the intended
GET-order failure. Final runtime bytes match the feature parent. Astra reviewed
source, raw logs and provenance without another execution.

## One diagnostic CI attempt

Diagnostic PR #740 targeted the feature. Its head was
`69fc6a1e20f662450c42742fca6ede9b705df3f4`, base
`684a1d2a92810dbb8fe0388290f9f1f6076015fe`, and actual synthetic merge
`25112688b564c4a37c5e55fe96ac3ea38a9ae3f0`, with both parents verified.
[CI 40205624482](https://github.com/Prosperous-Unification/puni-00/actions/runs/40205624482)
and [infra 40205624527](https://github.com/Prosperous-Unification/puni-00/actions/runs/40205624527)
succeeded. The diagnostic is not integrated into this candidate; its single
attempt is consumed and no rerun is authorized by this evidence.

The following hashes identify the **extracted raw `nx-gate.log` files**, not ZIPs:

| Artifact                  | Raw log SHA-256                                                    | Complete observed outcome                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model `12604851461`       | `f5039882cdba8509279101be6015d2946434e8e6971d9aa38aa2741a3c16699f` | All 16 exact full-model cases passed, 2,103 assertions, 982.30 s; all 11 existing filtered scenarios passed their exact 1-pass/0-fail/26-filtered guards; parent 21 passes, 0 failures, 141 assertions, 1,666.48 s |
| Remote rest `12604733591` | `9d1f5f5480e161f1e463b382b1b9594f17d202f926d9b31e87c9facb59954e98` | 3,348 passes, 2 optional Docker skips, 0 failures, 141 files, 88,699 assertions                                                                                                                                    |

There were **zero observer refusal records**. Classification: instrumented
non-reproduction. The original cause remains unresolved, and timing effects
cannot be excluded. No timeout, production guard or redaction change follows.

The factory, both temporary-root controls, logical-deadline and missing-timer/
missing-abort controls, and original `setsid` case passed in remote rest. The
observer inert suite was absent from that partition; its 15 local inert checks
are separate preparation evidence and are not claimed as CI replay.

## Focused commands and final combined tree

From the repo root, set TMPDIR and BUN_TMPDIR to an existing, owned temporary
directory. These mounted checks use ordinary app/SQLite fixtures, not native
acceptance:

```sh
bun test apps/wbs/be-01/src/controller/connected-arrange.controller.db.test.ts --timeout=10000 -t 'same-batch staged'
bun test apps/wbs/be-01/src/controller/connected-arrange.controller.db.test.ts libs/wbs/application/core/src/service/connected-arrange.test.ts libs/wbs/application/core/src/service/arrange-by-schedule.test.ts --timeout=10000
bun test libs/wbs/domain/contracts/src/http/refusal.test.ts libs/wbs/domain/contracts/src/http/work-item-shapes.test.ts --timeout=10000
bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache
bunx openspec validate --all --json
```

At HEAD `b784c728789aa21116d19cbfb640967ce72ba7c4` with the three pending
OpenSpec evidence files, all five mounted/contract files above passed **40 tests
and 183 assertions in 11.12 seconds**. Configured frontend module/build types,
backend spec types, fresh graph-backed lint of the three changed source/test
files, formatting of those files and the three evidence files, and canonical
OpenSpec **293/293** passed. No model, native supervisor, browser or host run was
added.

Before/after source, index and HEAD pins were unchanged during these checks.
Subsequent evidence wording clarifies historical attribution and summarizes these
results; runtime source remains frozen. Exact committed-head policy/index checks,
the new candidate's CI and its isolated canonical host gate remain separate
requirements. No parent checkbox is closed by this document.
