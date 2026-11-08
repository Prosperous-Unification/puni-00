# Task 110 combined operator review

Spec verdict: **changes required before actual preparation**.

Quality verdict: **changes required**.

Two findings remain in the frozen operator changes. They concern the cleanup/error behavior required by the new bounded-attempt spec. The original lock and captured-builder findings are addressed; the original cleanup and wall-bound findings are substantially improved but not fully closed. No additional findings were identified in the reviewed scope.

## Frozen scope

Reviewed against `5661ac884ab52911749e76c89b7eb3c7b83f1f6e`, independently of the original operator-draft reviewer. Fresh read-only HEAD output matches that baseline. Read the original public four-finding review, appended “Bounded one-attempt staging operator preparation” requirement, published draft plan, current fix report, frozen review package, actual operator/bootstrap/test changes, and the relevant existing shared contracts. The supplied cached-bootstrap/short-trusted-prefix ruling is treated as binding; no recursive launcher attestation is required.

Fresh read-only byte counts and SHA256 output match:

| File                                                      | Bytes | SHA256                                                             |
| --------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `/tmp/puni-task110-operator-review-package.md`            | 76012 | `a13137f11a8e5fe33951546ced564c544a69def502bd60363518807181236fc2` |
| `evidence/staging-native-prepare-draft.py`                | 31683 | `e06f86890c44761fe14a2323fa077536cefb1599c67be37a4db727a598320f88` |
| `evidence/staging-native-prepare-bootstrap.py`            |  3156 | `8e6780cc69c4b72f4f0db940e13822b596f19861ac3133d1d8a181ceee62341d` |
| `tools/tool-fleet/src/lab-staging-native-prepare.test.ts` | 45611 | `197672b5d22606fdd083792b4abad80e549419c737c0e00c1df7223e15faa410` |
| `tools/tool-fleet/project.json`                           |     — | `c89d1e5ea6c38b521f25d7020e3e7b4920c7a536c8b267e580c6eb0b7ae91c2d` |

The supplied fix report is 14833 bytes. The approval/changes-required verdict binds the above working-tree bytes, not an asserted staged or committed state. Fresh scoped diff output confirms the separately approved shared/native source fixes and their tests are unchanged from this baseline.

## Findings

### O1 — P2: Preserve the original failure alongside cleanup and capture failures

Location: `staging-native-prepare-draft.py:174–200`, especially `193–198`. Relevant tests: `lab-staging-native-prepare.test.ts:446–493`.

`capture_child` stores the original body/setup exception in `failure`, but a cleanup exception replaces it with `RuntimeError('operator-child-cleanup-uncertain')`, whose cause is only the cleanup exception. The handled body exception is no longer active when this happens, so its preservation cannot be assumed from automatic exception context. A later exception from `publish(...)` escapes the finally block and supersedes the stored failure as well. Thus a selector-registration error plus selector-close error loses the registration failure; setup failure plus capture-write failure loses the stored setup failure. If all three occur, neither stored body nor stored cleanup failure is guaranteed to remain attached to the final publication exception.

This directly conflicts with the new scenario requiring preservation of primary and cleanup failures. It also hides why the original CLI failed and whether cleanup was uncertain. The existing `cleanup-close-fault` test actually injects both registration and close failures, and `capture-failure` injects setup plus publication failures, but both assert only generic refusal/resource cleanup. They do not check the surfaced failure graph, so they pass while the required evidence is lost.

Required correction: retain the original, cleanup and publication failures together in an inspectable exception chain/group or equivalent bounded structured failure representation. Keep cleanup uncertainty visible and still attempt all owned closes. Strengthen the existing compound-fault cases to assert all injected failure identities survive, with a watched omission that loses one of them. No expanded native or legacy test campaign is needed.

### O2 — P2: Keep failure publication bounded after the one-shot outer alarm fires

Location: `staging-native-prepare-bootstrap.py:13–14,34–37`; `staging-native-prepare-draft.py:174–198,356–365,551–558`. Relevant test: `lab-staging-native-prepare.test.ts:463–493`.

The bootstrap's `setitimer(ITIMER_REAL, remaining)` is one-shot, and `expire` only raises. When that alarm fires during the child pump, `capture_child` catches it and proceeds through child cleanup to `publish`. Publication calls `write_private`, which performs open/write/fsync with neither a new active timer nor a remaining-deadline check. The original timer has already expired. The `wait(timeout=1)` bounds the child wait, but does not bound the subsequent capture file I/O. A blocked capture fsync after the real wall timeout can therefore leave the operator running indefinitely despite its stated finite wall/cleanup contract. A wall alarm interrupting cleanup can lead to the same unbounded final publication path.

The existing `real-wall` case proves ordinary child cleanup after a real signal, followed by fast successful scratch publication. It does not establish a bound on stalled publication after that signal has consumed the watchdog.

Required correction: reserve finite cleanup/publication time **inside the existing 45-second outer envelope**, using an earlier work cutoff and a live watchdog for the remaining hard budget. Do not extend native/service limits. After a timer fires, start no new capture I/O without both remaining budget and an active watchdog; if none remains, report capture unavailability as part of the preserved refusal. Add an ordinary-process negative with a real expired work alarm followed by a controlled blocking capture operation, and prove bounded return plus original-child reap/pipe closure under the fixture's functioning kernel. Watch removal of the new bound expose the stalled boundary without allowing the test itself to hang indefinitely. Kernel kill/wait failures must remain explicit cleanup uncertainty; this does not demand impossible guaranteed reap from a failing kernel.

## Original findings and composition assessment

**Original operator finding 1, original lock/path join: addressed.** `ADMISSION` records the acquired original FD identity and coordinator PID/start. `under_admission` reuses unchanged `repair.check_lock` before and after ledger, inventory, capacity and retained-write operations. Main's original-FD finally covers the start observation. The real renamed-root/same-ledger fixtures exercise both before and during the protected observation, and omission admits actual competition on the replacement. No replacement lock is adopted.

**Original operator finding 2, immediate owned CLI cleanup: partially addressed.** Cleanup begins immediately after successful spawn, before selector construction; nested finally scopes attempt both pipe closes and selector close even after another cleanup error. Timeout raises through this path instead of calling `os._exit`. O1 still blocks the explicit compound-failure preservation contract, and O2 blocks the complete timeout path.

**Original operator finding 3, executed builder buffer identity: addressed at the reviewed source boundary.** The bootstrap captures one owner-private 0600, single-link, bounded builder buffer through a nonfollowing FD, joins stable metadata and the externally supplied expected SHA, closes the FD, and executes that exact buffer without `__main__.__file__`. The same SHA is carried into preparation, review, approval and capture. The same-buffer replacement test demonstrates that postcapture pathname substitution does not select different executed bytes. The independently reviewed initial prefix/cached bootstrap buffer remains an explicit external trust boundary, as ruled.

**Original operator finding 4, bootstrap and subprocess bounds: partially addressed.** The timer precedes required builder I/O, capture loops check the absolute deadline, and Git/CLI share a finite live joint-output pump. Actual overflowing children are stopped before their later marker, including the watched output-guard omission. O2 remains after the timer actually fires.

The new legacy composition proofs are materially stronger than isolated success assertions: real shared schema/authorization, original FD/path checks, complete scratch inventory, reservation reading and capacity arithmetic remain active. The eight ledger vectors cover missing/foreign provenance, malformed/recomputed wrong G and an additional real pending debt included in the full digest/sum. Thirteen prepare vectors cover padded/final writes, fsync failures, actual descriptor replacement, allocation movement, request-path replacement and unrelated inventory changes. Twenty-three binding vectors cover malformed/foreign prepared/review/approval records, request inode, replay, exclusive marker and marker-fsync refusal. Watched omissions cross the intended otherwise-forbidden boundary. These are sufficient scoped legacy-composition evidence for the inspected guards; they do not validate the external source/runtime/native profiles that the fixtures intentionally control. O1/O2 require the additional specific proofs above.

The two exact new Nx inputs correspond to the new external Python files; the existing two source inputs remain present. The supplied real native-hasher RED/GREEN evidence is consistent with this narrow correction. No cache policy or production role was broadened.

## Bounds and remaining operational work

The reviewed builder/bootstrap/test fit 32768/8192/57344-byte ceilings. The explicit 32768-byte builder, 8192-byte bootstrap and 16384-byte qualification-record additions bring FUTURE to 315392. With 90112 early creation reserve and the supplied historical 503808 metadata figure, arithmetic is 909312/1048576, leaving 139264 bytes. This is arithmetic on supplied figures, **not fresh physical admission**. Full original G remains selected exactly once in the complete ledger; additional debts remain charged. Existing physical floors and native/service caps are unchanged.

The published operator recipe is still labeled unexecuted and contains obsolete direct-builder commands; the fix report explicitly disallows those commands. The concrete prefix, exact cached bootstrap bytes, private filled builder hash, source commit, request and physical admission must receive the separate concrete independent review before use. This report does not waive that step or approve the historical recipe for execution.

No tests, helper entries, native operations, retained-state inventories, operational probes or gates were run in this review. The supplied result is 35 tests / 70 Bun assertions / 9.81 seconds, plus internal composition vectors and named passing statics; those results were inspected, not independently rerun. Root typing was running in the assignment and is not certified here. No scratch evidence is treated as host qualification. Only this `/tmp` report was written; repository/index changes, source finalization, commit/push, actual preparation and native execution remain root-owned.
