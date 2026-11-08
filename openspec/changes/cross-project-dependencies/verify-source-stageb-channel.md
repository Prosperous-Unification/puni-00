# Private Stage B inherited channel — source checkpoint

Bounded source checkpoint with ordinary pure/inert-IPC evidence. The initial
57-test checkpoint required the lifecycle corrections recorded below; it was not
approved for integration.

Wire choice: each frame has a fixed four-byte unsigned big-endian JSON-body
length, followed by fatal UTF-8 JSON of 1 through 8 MiB inclusive. The four
prefix bytes count separately toward one explicitly shared, hard 128 MiB raw
transport budget. Actual inbound reads are charged and outbound body-plus-prefix bytes are
conservatively reserved before allocation/write, even if no IO follows or a write
fails; there is no refund or per-frame reset. This is channel accounting, not
proof that a complete future evidence archive fits its budget. The existing
96 MiB measurement reply guard remains unchanged.

This checkpoint is limited to the channel and inert owned Bun-child tests on
FD5/6. Packet FD3 and raw-capture FD4 remain separate. It neither provisions a
provider nor runs prepare/measure, source fixtures, Docker, native inspectors,
namespace tools, credentials or hosts. All full-provider builder, capture,
genuine runner, outer cleanup and authenticated archive responsibilities remain
required later deliverables. Architectural main merge, activation and deployment
remain held.

## Implemented boundary and observed checks

The channel implements the existing `SourceProviderChannel` interface. It validates
with the existing request/reply decoders and returns the same locally parsed raw
reply envelope, retaining correlation fields for the unchanged measurement decoder.
The provider session validates before exposing a request and reuses the existing
operation lifecycle. A valid finite refusal consumes the sequence without advancing
its successful phase. Only one exchange/request may be pending. One original finite
absolute deadline bounds reads, writes and join; shorter operation deadlines never
refresh it. Terminal errors destroy owned IO and terminate only the supplied owned
child. Failure to confirm join within the original bound is a private cleanup error,
not proof of settlement. The test fallback reaps only its own inert child.

`SourceTransportBudget` is explicitly shared by the supplied endpoints. Its
cumulative counter includes inbound reads and outbound reservations; it does not
claim every reserved outbound byte was actually written or accepted. Prefix and
body accounting, split/coalesced frames, fatal UTF-8/JSON, closed fields, correlation,
replay, operation lifecycle, invalid/extended deadlines and terminal behavior have
ordinary negative tests. Actual inert Bun children exercise separate FD3/4 sentinel
pipes and framing FD5/6, fragmented replies, truncated prefix, silent/stdout-only
read deadlines, actual pipe backpressure/write deadline, cancellation and close/join.
The sentinels are not real packets, and synthetic stopped replies are grammar
fixtures, not application cleanup observations.

Commands ran in isolated `/tmp/puni-source-stageb-provider-20261025` using Bun1.4.4:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-remote-scripts/rehearsals/source-stageb-channel.test.ts tools/tool-remote-scripts/rehearsals/source-participant-profile.test.ts --timeout=10000
bunx tsc --project tools/tool-remote-scripts/rehearsals/tsconfig.json --pretty false
bunx tsc --project tools/tool-remote-scripts/rehearsals/tsconfig.json --listFilesOnly
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects
bunx eslint tools/tool-remote-scripts/rehearsals/source-stageb-channel.ts tools/tool-remote-scripts/rehearsals/source-stageb-channel.test.ts
```

The combined source/profile suite passed **57 tests, 118 Bun assertions** (Node
assertion negatives are additional and are not included in Bun's count). Explicit
rehearsal types and compiler file-list verification passed; both new files are
present. Fresh actual Nx graph-backed scoped ESLint and Prettier/diff checks passed.
The private frozen packet records final exact logs and source hashes. Ordinary
child IPC required sandbox escalation; no broader execution authority was used.

## Four watched faults

Original fault script `/tmp/puni-stageb-channel-faults.py` and exact patches were
retained before execution in a disposable source copy. Each fault exited1 at its
named behavioral assertion; `finally` restored exact source bytes before the next
case. Restored channel suite passed27 tests. Results and log hashes:
`/tmp/puni-stageb-channel-fault-results.json`.

| Fault                                      | Actual observed boundary                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove client reply decoder                | Wrong-sequence private envelope was accepted; expected rejection failed. No application readiness/admission is involved.                                                                                                                              |
| Remove inbound wire length bound           | A valid request padded beyond8MiB was read/decoded and reached the consumer continuation; expected refusal/zero-body-read case failed. The profile reply guard was untouched.                                                                         |
| Remove logical terminal entry gate         | Second exchange still refused through destroyed IO, but its error lost the required terminal classification. This is **not independent unsafe-success proof**; physical closure masks that outcome. No cleanup defense was weakened to force success. |
| Replace close/join with a resolved promise | Exact owned inert child remained unsettled at the join assertion; only the test fallback terminated/reaped it. Fallback is not channel cleanup proof.                                                                                                 |

Adjacent Proof comments preserve these specific attributions. Other boundary
negatives above are test coverage, not claims that every individual guard has an
independent watched omission. Full-provider acceptance remains unproved.

## Initial failures and limits

The first bootstrap test failed collection because the new module did not exist;
that is not a causal behavior proof. The first child suite encountered sandbox
EPERM, so apparent child-negative passes there were discarded. Inert FD3/4
sentinel wiring replaced an incorrect assumption that `ignore` descriptors were
absent. Actual fragmented IPC then exposed a non-progress read when fewer bytes
than requested were buffered: consuming the available prefix/body bytes fixed it.
A backpressured timeout initially surfaced teardown `Socket is closed` instead of
the original deadline; retaining/rethrowing the first failure fixed that diagnostic.
All final tests run the corrected paths. Raw logs retain those failed attempts.

No source provider, prerequisite builder, source startup/census/observer, genuine
prepare/consume/measure, archive, host, Docker, namespace, model or native test ran.
No profile or production source was changed. Full fixed builder, journal/capture,
genuine same-process runner, authenticated archive binding/sealing and separately
approved physical measurement remain required. CI/deployment are not wired to this
slice. The parent feature, integrated gates, main architectural merge, activation,
controller adoption and deployment remain open; the pending credential rejection
is not bypassed.

## Corrected lifecycle checkpoint (supersedes the initial source freeze)

The initial `b29758b0` source review requested changes. Four new regressions ran
against those frozen bytes before correction: **0 pass,4 fail**, with actual
completed-IO barriers yielding client `escaped`, provider request `escaped`,
provider reply `committed`, and an owned-child error throwing outside the private
boundary (`/tmp/puni-stageb-channel-review-red.log`). These were customer-boundary
assertions, not compiler failures. The barriers hold only the continuation of a
real framed read/write; they do not supply fabricated frames or authority.

Current source rechecks session, transport cancellation/closure and the selected
absolute deadline after awaited IO, before exposing requests/replies or committing
phase. A lifetime child-error listener retains bounded first-primary/first-control
failure, latches before process control, catches synchronous kill errors and
prevents recursive signal attempts. Error is not close evidence. The controlled
kill-error case first failed before its correction; exact logs preserve that RED.

The failed-spawn control initially misinterpreted Bun's null exit/signal codes
after actual `close`. The corrected test records the independent close event and
never waits again for an already closed, never-spawned process. That harness
failure is retained, not counted as a source regression or physical-child proof.

The corrected combined command above passed **80 tests,165 Bun assertions**,750ms;
Node assertion negatives are additional. Explicit rehearsal types/file-list,
fresh actual Nx graph-backed scoped lint, formatting and diff checks passed.
This supersedes the initial57-case result only within this explicit rehearsal
scope; no default gate/provider/native acceptance is inferred.

Twenty additional watched faults were retained before execution and each restored
in `finally`. Nineteen are in `/tmp/puni-stageb-channel-review-faults.py` and
`/tmp/puni-stageb-channel-review-fault-results.json`; the separate first-cause
control is `/tmp/puni-stageb-channel-first-cause-fault.py` and
`/tmp/puni-stageb-channel-first-cause-result.json`. All exact patches and raw logs
are private0600. Restored channel suite passed50 tests. The corrected frozen
packet pins source, tests, scripts, patches and terminal logs.

| Omitted boundary                                                              | Observed actual consumer failure                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each of client-read, provider-read and provider-write continuation checks     | Real completed IO escaped or committed after overlap had terminally poisoned the session.                                                                                                      |
| Provider transport/deadline recheck                                           | Completed request escaped after direct transport poisoning; completed output committed after its shorter deadline.                                                                             |
| Owned-child error listener and kill-error catch, separately                   | Controlled event/kill failure threw past the private boundary rather than retaining primary and cleanup independently.                                                                         |
| First-cause retention                                                         | Later inert child error replaced the private primary.                                                                                                                                          |
| Shared budget rejection                                                       | Almost-exhausted transport reached the actual write consumer; expected rejection failed.                                                                                                       |
| Encoder8MiB rejection                                                         | Oversized JSON reached output.write; expected pre-write refusal failed.                                                                                                                        |
| Fatal UTF-8 and JSON parser, separately                                       | Quoted invalid UTF-8 became replacement-character JSON, or malformed JSON became returned raw text; byte-boundary negatives failed.                                                            |
| Common absolute-deadline validator                                            | Buffered input returned under expired, extended and nonfinite operation bounds instead of zero-read refusal.                                                                                   |
| IO timer and abort dispatch, separately                                       | Owned streams remained open at the bound or immediate abort; only explicitly test-owned cleanup settled the stalled writer. This is cancellation/settlement proof, not late-success inference. |
| Client request, provider request and provider reply decoder calls, separately | Wrong nonce/correlation reached a write or decoded-request continuation instead of zero IO/dispatch.                                                                                           |
| Client/provider overlap entry gates, separately                               | A second transport write/read began while the first remained pending. Other defenses still refused later; this is IO-order proof.                                                              |
| Provider lifecycle advance                                                    | A repeated acknowledge reached the request consumer after successful acknowledgement.                                                                                                          |

The original four fault attributions remain unchanged, including the masked
logical-terminal classification limitation. No profile guard was removed to
manufacture a fault success. The shared byte counter is cumulative **charged or
reserved wire bytes**, not a claim that failed writes were accepted. All
full-provider, archive, native, genuine-context and release obligations above
remain open.

## Original-bound and endpoint-settlement correction

The `002974fd` correction was still not approved: transport and channel could
retain different maxima, and child close alone did not prove closure of supplied
independent endpoints. Four ordinary regressions ran against those frozen bytes:
**0 pass,4 fail**,110ms (`/tmp/puni-stageb-channel-bounds-endpoints-red.log`). They
observed an extended constructor accepted, refreshed caller-record deadline
accepted, false `joined` with held async destroy, and loss of a later destroy
error. Exact owned children and test streams were settled in test cleanup.

Transport now retains a private readonly original deadline number and a shallow
snapshot of the supplied input/output/budget/signal references. Their legitimate
IO state remains mutable; no actual stream, signal or budget is deep-frozen.
A channel may tighten that deadline but cannot extend it. Caller record mutation
cannot redirect IO, cancellation, byte reservation or close into replacement
streams. Close events and bounded first errors from **both** original endpoints
are observed from construction. The channel waits for input close, output close
and actual owned-child close together, using one selected absolute bound and a
post-await bound recheck. Destroy intent/flags and sending KILL remain insufficient.
Endpoint errors remain cleanup failures beside the first private primary.

Eight selected new endpoint/deadline controls passed37 assertions; the additional
serial logical-clock control passed after actual endpoint and child closes. It
advances only the test logical clock at the completed-join continuation, restores
the original descriptor in `finally`, and does not claim a wall-time overrun run.
The missing-close case reports unproved at the original deadline; a later test
fallback releases only its held stream and is not production settlement proof.

Ten further exact watched omissions and their logs were retained before execution
in `/tmp/puni-stageb-channel-join-faults.py` and
`/tmp/puni-stageb-channel-join-fault-results.json`:

- Constructor maximum, endpoint-reference snapshot and aggregate endpoint wait.
- Input/output actual close observation separately, and their first close-error
  retention separately.
- Endpoint-error reporting, original join timer and post-join deadline recheck.

Each exited1 at its named consumer assertion and restored exact source in
`finally`. The restored full channel suite passed **59 tests,126 Bun assertions**.
An initial join-timer fault failed the expected join diagnostic before the timely
oracle; that raw result is retained as
`/tmp/puni-stageb-channel-join-fault-join-timer-initial-classification.log`. The
oracle was reordered to assert late fallback had not run first. The final timer
omission explicitly fails timely refusal despite the remaining post-await guard
still refusing late completion; this is not unsafe-success evidence. Two local
edit/metadata assertions failed during proof preparation; neither is relabeled as
a test result or hidden by a source change. Original source was restored before
continuing the bounded proof packet.

The final combined source/profile command above passed **89 tests,206 Bun
assertions**,1.80s. Explicit rehearsal types/file-list, fresh actual graph-backed
scoped lint, formatting and diff checks passed. Exact static commands and immutable
pins are recorded in the new join-corrected frozen packet. It supersedes both
prior unapproved freezes; historical80-case and57-case receipts retain their
original scope. All full-provider, native, host, archive, architecture-main-merge,
activation and deployment restrictions remain unchanged.
