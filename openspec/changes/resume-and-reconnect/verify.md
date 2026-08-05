# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   261 pass  0 fail
      fe-01 (vitest)                          46 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/resume-and-reconnect
Totals: 5 passed, 0 failed (5 items)
```

`bun test` over the whole repo reports failures on every commit for fe-01's
files, which ask `bun:test` for a DOM it has no jsdom to provide —
`project-stream.test.ts` dies at `location.protocol` inside `websocketUrl`. The
counts above are `bun test` over everything _except_ `apps/fe-01`, plus vitest
for fe-01, which is what `nx run-many -t test` runs and what CI runs.
`LLM_README.md` previously claimed the root command collected none of fe-01's
files; it collects all of them, and that claim has been corrected.

## Every check, and the fault that broke it

| Check                                                                                | Fault injected                                                           | What the run reported                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay is bounded (`replay-orchestrator.ts`)                                         | `if (missing > this.maxEvents) return denied;` deleted                   | only `denies a range larger than the cap rather than truncating it` failed                                                                                    |
| A replay is complete or refused (`replay-orchestrator.ts`)                           | `isContiguousFrom` gate deleted, so a short range returned as success    | `denies a range retention has already removed` and `answers each subscription independently` both failed, each reporting a truncated replay as `replaying`    |
| The broadcaster fills the buffer the orchestrator reads (`gateway-broadcaster.ts`)   | `this.opts.buffer.record(...)` deleted from `publish`                    | only `fills the buffer the orchestrator replays from` failed — the log answers identically, so nothing else could observe the loss                            |
| A replay reaches one socket (`ws.controller.ts`)                                     | the send also written to every socket in `subs.socketsFor(subscription)` | only `replays only to the socket that asked` failed                                                                                                           |
| A subscription's reconnect loop dies with it (`project-stream.ts`)                   | `unsubscribed = true` deleted from `unsubscribe`                         | `stops reconnecting once the caller unsubscribes` and `opens nothing when a reconnect fires after the caller unsubscribed` both failed                        |
| Retention is actually scheduled (`retention-timer.ts`)                               | `start()`'s body replaced with `this.handle = 'never-scheduled'`         | three of the four `RetentionTimer` tests failed; the fourth asserts only that a second `start` is a no-op                                                     |
| `latestSeq` survives a prune (`event-log.ts`)                                        | —                                                                        | asserted directly: `pruneBeyond(1)` leaves `oldestSeq` at 1 and `latestSeq` at 1, because the sequence is read from `event_sequencer` and not from `MAX(seq)` |
| A closed socket leaves its subscription (`gw-01/app.ts`)                             | `subs.removeAll(d.socket)` deleted from `close`                          | only `is not counted in the fan-out after it disconnects` failed, reporting `delivered_to_sockets: 2` for one live browser                                    |
| One `ReplayBuffer` reaches both halves of resume (`services.ts`)                     | `buffer: replayBuffer` replaced with a freshly constructed one           | only `gives the broadcaster and the replay orchestrator the same buffer` failed — every class-level proof survived it                                         |
| The process starts retention (`boot.ts`)                                             | `services.retention.start()` deleted                                     | only `starts the retention timer` failed; all five `RetentionTimer` tests still passed, which is the gap that made this test necessary                        |
| A subscription's stream does not advance on an unapplied frame (`project-stream.ts`) | `sinceSeq` advanced in `receive` again                                   | `does not advance its resume point on a frame the caller failed to apply` failed, resuming from 5 for a tree still showing 4                                  |

The fake scheduler in `project-stream.test.ts` models `clearTimeout` by removing
the entry, not by counting the call. A fake that only counted would have passed
with `cancel` never wired up.

## Against the running dev deployment

Two real WebSockets through the real edge at `dev.wbs.bulletpoints.club`,
against dev's SQLite. Run twice: on `79e9cbe`, and again on `3aaf2c2` after the
cross-review fixes, with the same result. `ada` drops and returns; `grace` stays connected
throughout, to prove a replay does not reach a socket that did not ask.

```
[check] tree seq on a fresh project: -1 (expected -1)
[check] first resume frames: [... {"type":"resume_ack","replayed":{"project:533cc3ad…":0}}]
[check] created two work items while the client was away
[check] tree seq after two edits: 1 (expected 1)
[check] rows: 010 Strip the old wiring | 020 Run the new circuit
[check] live frames the watcher received during the outage: 2 (expected 2)
[check] frames on return:
            {"type":"presence","users":["ada","grace"]}
            {"subscription":"project:533cc3ad…","seq":0,"message":{"type":"tree_replaced",…}}
            {"subscription":"project:533cc3ad…","seq":1,"message":{"type":"tree_replaced",…}}
            {"type":"resume_ack","replayed":{"project:533cc3ad…":2}}
[check] replayed events: 2 (expected 2)
[check] project frames the watcher received during the replay: 0 (expected 0)
[check] resume from a bogus sequence: [… {"type":"resume_denied","subscription":"project:533cc3ad…","reason":"out_of_range"}, {"type":"resume_ack","replayed":{}}]
[check] PASS
```

The replayed events arrive in sequence order and before `resume_ack`, in the same
frame shape as a live push. `grace` received the two edits live and **nothing**
during `ada`'s replay — the one presence frame in that window is the returning
socket joining the roster, which is why the assertion counts frames carrying the
project's subscription rather than frames.

## What this does not cover

- **A real browser.** The reconnect loop is proven against a fake socket and an
  injected timer, and the replay is proven against real sockets driven by a
  script. Nobody has watched Safari suspend a tab and come back.
- **The retention timer firing on its own schedule.** The tests advance a fake
  interval; on dev it is wired but ten minutes had not elapsed under observation.
  What was verified is that `main.ts` starts it before `listen` and that a sweep
  prunes.
- **A replay larger than the cap on a real deployment.** 256 events on one
  project was not staged; the refusal is proven in unit tests only.
- **Two colours mid-swap.** The replay buffer is per process, so during a blue/green
  overlap a client resuming against the other colour falls through to the event
  log. Correct by design, never exercised.
