# Deterministic observation deadline tests

Base source: `0a1376b46440700e9835046be76d59c6273df5f2`; integrated after the
reviewed fixture-root checkpoint. This test-only packet corrects preconditions and
cleanup in existing source observation tests. No production observer, owner,
exclusion guard, transport, package, timeout or model budget changes.
Parent11.2 and the full feature remain open.

## Exact scope deadline and real owned CLI

The database observer requires exact equality to its source and solver exclusion
deadlines. A fresh shorter observer deadline is invalid; those guards remain
unchanged. Its fixture formerly started the4000ms budget before admission/setup,
which could consume time before the intended stalled CLI operation. The historical
h2 child exit1 is consistent with this, but its stderr was not retained; this is
not a proven assignment of that failure's cause.

In the isolated test child, a small controlled monotonic clock records the actual
installed deadline callbacks while filesystem work stays asynchronous. The same
original scoped4000ms deadline is retained through setup. The PATH-owned Docker
stub writes its actual launch marker before sleeping; the test verifies that
marker and a timer from `readObserverDocker`, then fires the original deadline.
The original signal must abort and the actual stub CLI must settle. These are
4000ms logical deadline/real process-join proofs, not4s wall-clock measurements.
No Docker daemon or native namespace acceptance is involved.

Review found that a missing timer/abort could otherwise leave the fixture waiting
on its60s stub. A fixture-only fallback AbortController now combines with the
original signal solely for failed marker/timer assertions, advance errors or a
missing original abort. Cleanup always joins the CLI before rethrowing the primary
failure. Only the original signal sets `boundary.aborted`; fallback cannot make
the normal proof pass.

New missing-timer and missing-abort controls each require the exact failed
diagnostic, started=true, settled=true and original aborted=false. Fallback-to-join
latency excludes cold setup and remains below the explicit1s test bound. In a
separate disposable fault copy, removing only fallback cancellation with a bounded
2s stub caused actual join2000ms and failed that bound. Restoring source passed
3 controls/11 assertions. The fault copy alone changed sleep60 to2s to keep the
negative bounded; the original4000ms logical deadline remained unchanged.

## Image and role read joins

The four existing complete/failed image/role cases previously awaited reachedAbort
without observing an earlier refused observation. A deadline refusal before the
target therefore left the harness waiting until its outer timeout. A bounded
ordinary control reproduced an actual pre-target refusal followed by the old1s
harness timeout; the corrected diagnostic failed promptly in333ms. This proves the
harness path, not that it caused the exact historical h2 event.

The cases now enter their existing10s scope, use serial controlled time, retain the
+500ms observation deadline and wait for target entry or early settlement. After
the intended runner holds the real production signal, the installed
`readSourceDocker` timer fires at that deadline. Observer and runner must remain
unsettled until explicit release. Existing refusal and complete-versus-failed owner
intent/readback assertions remain. Native event-loop turns replace arbitrary
settlement sleeps; timers restore and pending work joins in finally.

An independent early-return fault made all four at-return join assertions fail
because the observer settled while the runner remained held. Restoring production
bytes passed4 cases/28 assertions. No already-aborted-event race or production
signal bug is claimed.

## Verification and review

```sh
bun test --preload ./tools/test/scratch/preload.ts \
  tools/tool-remote-scripts/src/lib/source-dev-inputs.test.ts \
  tools/tool-remote-scripts/src/lib/source-database-binding.test.ts \
  --timeout=10000 -t 'aborted .*read joins|controlled shared logical|failed logical deadline'
bunx tsc --noEmit -p tools/tool-remote-scripts/tsconfig.spec.json
```

Final focused author run: **7 tests,39 assertions**,0 failures,6.71s. Types,
graph-backed lint, formatting and diff checks passed. Independent Astra replay:
**7 tests,39 assertions**,0 failures,6.34s; the cleanup finding is resolved.
Final packet: `/tmp/puni-controlled-deadline-cleanup-frozen-packet.json`.
Review: `/tmp/puni-controlled-deadline-source-review.md`; independent log:
`/tmp/puni-controlled-deadline-reviewer-corrected.log`.

The earlier full two-file run passed102 tests/473 assertions before the cleanup
correction and two new controls. That remains a baseline for its unchanged paths,
not a claim of a final104-test replay. Exact source/protected production hashes,
commands and fault logs are retained in the packet. Production scope equality,
the4000/500 logical limits, ordinary timeouts and model1440s budget are unchanged.
No architecture adoption, main merge, activation, deployment, host gate or native
acceptance follows from this bounded test repair.

The root combined this final corrected packet with the five reviewed portability
source/test files and ran all seven ordinary suites under a fresh owned `/var/tmp`
parent: **188 tests,684 assertions**,0 failures,190.59s. This supersedes the earlier
pre-cleanup two-file baseline for the integrated paths. Combined project spec
types, graph-backed lint, formatting and diff checks passed. Exact-SHA CI and
host gate remain pending; this ordinary run includes no original factory/OpenSSL
suite or native host acceptance. Logs:
`/tmp/puni-final-gate-fixtures-{tests,types,lint}.log`.
