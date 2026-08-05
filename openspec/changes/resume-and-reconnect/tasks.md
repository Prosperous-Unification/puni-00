## 1. The sequence a read happened at

- [x] 1.1 Add `latestSeq(subscription)` to `EventLogRepo` and `DrizzleEventLogRepo`, with a repository test against real SQLite covering a subscription with events and one without.
- [x] 1.2 Failing test in `apps/be-01/src/controller/work-item.controller.test.ts`: reading a project's work items returns `seq` equal to the latest recorded event, and `-1` for a project with no events.
- [x] 1.3 Thread the sequence through `WorkItemService.tree` and the controller. No new query when the caller does not need it is not worth the branch; the read is one indexed row.

## 2. ReplayOrchestrator

- [x] 2.1 Failing tests in `apps/be-01/src/service/replay-orchestrator.test.ts`: buffer serves the range, buffer starting too late falls back to the log, log missing the range denies, a range over the cap denies, zero missed events replays nothing, two subscriptions answered independently with one replaying and one denied, and sequence order preserved across the fallback.
- [x] 2.2 **Negative test:** the cap must be observed on the production path, not asserted about a constant. Watch it fail with the cap check removed and record the `Proof:` line.
- [x] 2.3 **Negative test:** a denied subscription must return no events. Watch it fail with the deny branch replaced by a truncating success.
- [x] 2.4 Implement `ReplayOrchestrator.replay(points)` per `design.md` D2 and D3.

## 3. Wiring, and the end of the stub

- [x] 3.1 `InternalResumeResponse` in `libs/contracts` carries `events: {seq, message}[]` on the replaying variant, with contract tests for both variants.
- [x] 3.2 `AppOptions` requires `resume` — the same argument `auth`, `projects` and `workItems` already carry: an optional one would let a misconfigured process answer every resume with a fabricated success.
- [x] 3.3 Delete the stub `onResume` from `app.ts` and pass the orchestrator. Document `onForward` as a deliberate pure ack, with a test that a forward records no event and pushes nothing.
- [x] 3.4 `main.ts` builds one `ReplayBuffer`, shares it between `GatewayBroadcaster` (which must record into it) and the orchestrator, and passes the orchestrator to `buildApp`.
- [x] 3.5 **Negative test:** an event broadcast must be replayable from the buffer without touching the log. Watch it fail with the broadcaster's buffer write removed.
- [x] 3.6 Integration test through the real HTTP route in `internal.integration.test.ts`: seed events, POST `/internal/resume`, assert the replayed events come back in order.

## 4. gw-01 delivers the replay to one socket

- [x] 4.1 Failing tests in `ws.controller.test.ts`: replayed events are sent to the resuming socket in order, before `resume_ack`; a denied subscription still produces `resume_denied` and no events.
- [x] 4.2 **Negative test:** a second socket subscribed to the same project receives nothing during the first's replay. Watch it fail with the replay written to `subs.socketsFor(...)` instead of the asking socket.
- [x] 4.3 Implement, and update `app.ts`'s `resume` closure to carry the events through from be-01.

## 5. fe-01 reconnects

- [x] 5.1 Failing tests in `apps/fe-01/src/lib/project-stream.test.ts` against a fake socket factory and an injected timer: reopen after an unexpected close, resubscribe and resume from the highest sequence seen, no reopen after unsubscribe, `resume_denied` invokes the change handler, backoff grows and is capped.
- [x] 5.2 **Negative test:** unsubscribing must stop the loop. Watch it fail with the closed flag removed.
- [x] 5.3 Implement the loop per `design.md` D5, tracking the highest sequence from every frame the subscription receives.
- [x] 5.4 `project-page.tsx` passes the sequence from the tree read as the baseline, and shows a connection-lost state rather than presenting stale rows as live.

## 6. Retention, which nothing was running

- [x] 6.1 `runRetention` had no production caller: the event log grew by one row per edit, forever, in the file the domain lives in. `RetentionTimer` sweeps on a schedule, reports a failed sweep and keeps running, and `stop()` waits for a sweep in flight.
- [x] 6.2 **Negative test:** watch three of the four tests fail with the schedule replaced by a handle that was never scheduled, and record the `Proof:` line.
- [x] 6.3 `main.ts` starts it before `listen` — a callback skipped by a port that failed to bind would leave retention off in exactly the deployment that had a problem — and stops it on SIGTERM/SIGINT.

## 7. Gate and verification

- [x] 7.1 `verify.md`: the uncached gate output and a failure-proof table for every check added here.
- [x] 7.2 Exercised on dev with two real sockets rather than two browsers: one drops, misses two edits, returns and is replayed both in order; the socket that stayed connected receives nothing during the replay. Recorded in `verify.md`, including what a script cannot prove that a browser would.

## 8. Cross review, 2026-08-05 (codex + agy)

Both reviewers read `801432c..3a00b79` from the same prompt. Eleven findings,
every one reproduced as a failing test before it was fixed. Nothing was rejected.

- [x] 8.1 **The resume point advanced on a frame the caller never applied** (codex, critical). The table swallows a failed refetch on purpose; the stream advanced on receipt, so a client could resume past an edit nobody saw and sit there looking current. `sinceSeq` now moves only through `seen`, which is called by whoever installed the rows.
- [x] 8.2 **An open socket was reported as live** (codex, high). `onConnectionChange(true)` now fires on `resume_ack`/`resume_denied`, not on `open`.
- [x] 8.3 **A resume that threw told the client nothing** (codex, high). be-01 unreachable, a non-2xx, or a body that fails the contract left the socket open and silent. gw-01 now answers `resume_denied` with `reason: 'unavailable'` for every subscription asked about.
- [x] 8.4 **An empty `resume_ack` read as "you missed nothing"** (codex, high). That is exactly what a gateway from before this change sends, since the `count` it reads is now `undefined` and JSON drops the key. The client refetches unless its subscription is named in `replayed`.
- [x] 8.5 **Closed sockets never left the subscription map** (codex, high). `close` removed the connection from presence only, and every inbound message allocated a fresh wrapper, so nothing could be removed by identity. One wrapper per connection now, removed on close. Pre-existing; reconnect made it grow.
- [x] 8.6 **The backoff reset on TCP open** (agy, high). A gateway that accepts the handshake and drops the socket — an expired token, a restart — reconnected every 300ms forever. It resets on a completed resume instead.
- [x] 8.7 **A stale buffer denied a replay the log could serve** (agy, critical). `covers` asked `oldestSeq`, which did not evict; `since` did, and returned nothing. The buffer evicts before answering, and an incomplete buffer answer now falls through to the log rather than refusing.
- [x] 8.8 **Overlapping retention sweeps** (codex, medium). Each tick started another and overwrote `inFlight`, so `stop()` waited for the newest and `process.exit` could land inside an older DELETE. A tick arriving mid-sweep is dropped.
- [x] 8.9 **`pruneBeyond` counted the whole table twice per sweep** (agy, high). `changes()` instead — cheaper, and correct: a concurrent insert from the other colour landed in the before/after difference and reported as a deletion.
- [x] 8.10 **Two proofs did not cover production wiring** (codex, medium; agy, medium). The shared `ReplayBuffer` and the started `RetentionTimer` were provable about the classes and not about the process. Composition moved into `services.ts` and `boot.ts`, both tested; the vacuous fourth `RetentionTimer` assertion now checks a schedule was created.
- [x] 8.11 **SIGTERM exited without draining** (agy, medium). `stop()` stops the server, waits for a sweep, and closes the file through `openConnection`, which keeps drizzle's `$client` inside the repository layer.
- [x] 8.12 **The replay cap was too large for its payloads** (agy, info). `tree_replaced` carries the whole project and gw-01 writes each event in a synchronous loop, so 256 was megabytes queued for one reconnecting laptop. Now 32.
