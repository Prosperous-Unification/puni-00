## Design Summary

`apps/be-01` ships with all the Layer-A services already implemented (`EventSequencer`, `DrizzleEventLogRepo`, `ReplayBuffer`, `PushClient`, `runRetention`) and tested as units, but `apps/be-01/src/app.ts:24–34` wires `internalController` with stub callbacks that always return `{push_responses: []}` and a fake "replaying count: 0". So at runtime, the BE never composes the real Layer-A path: the `event_log` is never read, no events are pushed back through gw, and resume does nothing useful.

This change closes that gap — and _only_ that gap. It threads the existing services into `buildApp()` through a new `services` dependency, replaces the stubs with real implementations, wires a retention loop, and adds an `EventBus` seam so the next change (`dev-diagnostics-and-tick-proof`) only needs to add a `setInterval` that calls `bus.broadcast("tick", {ts: Date.now()})`.

`onForward` stays a pure ack. No producer is added in this change; the BE acquires the _capability_ to record + replay + push, but no path exercises that capability at runtime yet (replay is exercised only when a client triggers a resume; in this change there are no producers, so resume returns count=0 in real runtime — but tests pre-populate `event_log` directly to exercise the full path).

The result: the inconsistency from the prior review (Layer-A services exist but aren't composed at runtime) is closed; the `ping`/`pong` smoke from `scaffold-tech-setup` now coexists with a runtime BE that _would_ push events if any producer asked it to. The actual proof of the producer→push path lands in the next change.

## Alternatives Considered

### Approach A — Pure-wiring + `EventBus` seam (chosen)

- **What it is**: Compose all five services in `main.ts`, expose them to `buildApp` via a `services` dep, replace stubs with real impls, wire a 60s retention loop. `EventBus.broadcast` exists with no callers.
- **Pros**: Smallest change that closes inconsistency A; preserves "no behavior change" promise; downstream changes (tick, domain) just call `bus.broadcast`.
- **Cons**: `ReplayBuffer` is dead at runtime in this change (only populated via `EventBus.broadcast`, which no one calls). Buffer behavior is exercised only in tests.
- **Why chosen**: Matches the user's split decision (option C: keep wiring and diagnostics in separate changes). Honors the scaffold's "no product features yet" promise.

### Approach B — Wiring + echo-on-forward

- **What it is**: Same as A, but `onForward` calls `EventBus.broadcast(msg.subscription, msg.message)` so every forwarded message gets recorded and fanned out — exercising buffer + push at runtime in this change.
- **Pros**: Producer→push path proven at runtime in this change.
- **Cons**: Defining "echo-everything" baked into `forward` is a product decision (which messages echo? subscribe-frames? typing-indicators? which subscriptions are public?). The next change's tick is a dedicated producer that exercises the same path more cleanly. Echo would become legacy after that.
- **Why not**: Conflates wiring with product semantics; tick is one change away.

### Approach C — Wiring + dedicated tick producer

- **What it is**: Include a `TickService` (`setInterval` 1Hz `bus.broadcast("tick", {ts})`) alongside the wiring, in _this_ change.
- **Pros**: Single change with full runtime proof; no dead seams.
- **Cons**: Tick is a _diagnostic_ producer; conceptually it belongs with the diagnostics change (where the FE page consumes it). The user explicitly chose to split runtime wiring from diagnostics.
- **Why not**: Re-merges the split the user just asked to keep.

## Agreed Approach

Approach A. The `EventBus` seam is the deliberate forward-looking piece — the next change wires `setInterval` against it without touching anything else in BE. Replay tests cover the runtime path that has no producer yet.

## Key Decisions

1. **`buildApp` accepts a `services` bundle.** New shape:

   ```ts
   interface AppOptions {
     migrationsApplied: boolean;
     services: BeServices;
     version?: string;
     internalAuthSecret?: string;
   }
   interface BeServices {
     eventBus: EventBus;
     replayOrchestrator: ReplayOrchestrator;
   }
   ```

   `internalController` consumes `services.replayOrchestrator` (for `onResume`) and a static pure-ack closure for `onForward`. The retention timer is owned by `main.ts`, not `buildApp` — it has nothing to do with HTTP handling and shouldn't fight `app.handle(req)` in tests.

2. **`onForward` is a pure ack** — closure inside `buildApp`:

   ```ts
   onForward: (_msg, _ctx) => Promise.resolve({ push_responses: [] });
   ```

   No event is recorded. The `forward` path acquires no semantics in this change.

3. **`onResume` delegates to `services.replayOrchestrator.replay(resumePoints, ctx)`.** The orchestrator returns the contract-shaped `Record<sub, {status, count}>` map. `internalController` returns it as-is.

4. **`ReplayOrchestrator.replay(points, ctx)` algorithm**:

   ```
   for each (subscription, since) in points:
     buffer_oldest = buffer.oldestSeq(subscription)
     if buffer_oldest != null and buffer_oldest <= since + 1:
       events = buffer.since(subscription, since)
       source = "buffer"
     else:
       db_oldest = repo.oldestSeq(subscription)
       if db_oldest == null or db_oldest > since + 1:
         result[subscription] = { status: "denied", reason: "out_of_range" }
         continue
       events = repo.rangeSince(subscription, since)
       source = "db"

     pushed = 0
     for each event in events (in seq order):
       try:
         await pushClient.push({subscription, seq: event.seq, message: event.message})
         pushed += 1
       catch PushFailed:
         logger.warn({err, sub: subscription, seq: event.seq}, "replay push failed")
         continue  // do not abort, do not break — keep trying remaining events

     metrics.replay_replayed_total += pushed
     result[subscription] = { status: "replaying", count: pushed }

   return result
   ```

   Notes:
   - "buffer hit" condition is `buffer_oldest <= since + 1` because the buffer's oldest entry is the smallest seq it holds; we need to be able to deliver `since + 1` from the buffer (or the buffer is missing the gap and we must fall back to DB).
   - `count` reflects events _successfully pushed_, not events _eligible for push_. A client that gets `count: 3` but only sees 2 events arrive will resume again and recover the third. (Idempotent protocol.)
   - The replay is **synchronous w.r.t. the HTTP response**: pushes complete (or error-out) before `resume` returns. This guarantees the gw responds `resume_ack` to the client _after_ every replayed event has been pushed to the gw's `/internal/push` (and from there, ws.send'd). Net: the client sees events first, then ack.
   - Replay events for a single subscription are pushed sequentially. Across subscriptions, processing is sequential within the for-loop too — keeps logs ordered, simplifies reasoning. If multi-subscription replays become a hotspot, batch later.

5. **`EventBus.broadcast(subscription, message)` algorithm**:

   ```
   recorded = await sequencer.recordEvent(subscription, message)
   buffer.record(subscription, recorded.seq, message)
   try:
     { delivered } = await pushClient.push({
       subscription,
       seq: recorded.seq,
       message,
     })
     metrics.broadcast_delivered_total += delivered
   catch PushFailed as err:
     logger.warn({err, sub: subscription, seq: recorded.seq}, "broadcast push failed")
     metrics.broadcast_push_failed_total += 1
     // event is durable in event_log + buffer; resume will recover for currently-disconnected clients
   return recorded
   ```

   Notes:
   - DB write happens first (durability before broadcast). If DB write fails, the entire `broadcast` throws and the producer decides what to do.
   - Buffer write happens after DB write (so `recorded.seq` is known). If buffer write fails (shouldn't — it's an in-memory `Map.push`), it bubbles up.
   - Push is best-effort: caught, logged, swallowed. The event is durable; resume is the safety net.
   - This change has no `bus.broadcast` callers. The next change (tick) is the first caller.

6. **Retention timer**:

   ```ts
   class RetentionTimer {
     constructor(repo, opts: { intervalMs: 60_000; maxPerSubscription: 10_000 });
     start(): void; // setInterval, kick once immediately
     stop(): Promise<void>; // clearInterval, await any in-flight call
   }
   ```

   Started in `main.ts` after migrations succeed; stopped on SIGTERM. Failures inside the interval are caught and logged; the timer keeps running.

7. **`main.ts` composition**:

   ```ts
   import { Database } from "bun:sqlite"
   import { drizzle } from "drizzle-orm/bun-sqlite"
   ...
   const cfg = loadConfig()
   const logger = createLogger({service: "be-01", level: cfg.LOG_LEVEL})
   const db = new Database(process.env.DB_PATH ?? "./local.db")
   const drizzleDb = drizzle(db)
   const repo = new DrizzleEventLogRepo(drizzleDb)
   const buffer = new ReplayBuffer({maxPerSubscription: 1000, maxAgeMs: 5 * 60_000})
   const sequencer = new EventSequencer(repo)
   const pushClient = new PushClient({gwUrl: cfg.GW_URL, secret: cfg.INTERNAL_AUTH_SECRET})
   const eventBus = new EventBus({sequencer, buffer, pushClient, logger})
   const replayOrchestrator = new ReplayOrchestrator({buffer, repo, pushClient, logger})
   const retention = new RetentionTimer(repo, {intervalMs: 60_000, maxPerSubscription: 10_000})

   const state = {migrationsApplied: false}
   const app = buildApp({
     get migrationsApplied() { return state.migrationsApplied },
     services: {eventBus, replayOrchestrator},
     version: process.env.VERSION,
     internalAuthSecret: cfg.INTERNAL_AUTH_SECRET,
   })

   app.listen(cfg.PORT, async () => {
     try {
       runMigrations(process.env.DB_PATH ?? "./local.db", "./drizzle")
       state.migrationsApplied = true
       retention.start()
       logger.info({port: cfg.PORT}, "be-01 ready")
     } catch (err) {
       logger.error({err}, "startup failed")
       process.exit(1)
     }
   })

   process.on("SIGTERM", async () => {
     await retention.stop()
     db.close()
     process.exit(0)
   })
   ```

   Notes:
   - `Database` opens before `buildApp` so the same connection is shared across services + migrations.
   - SIGTERM handler is a clean-shutdown stub; not paranoid (no draining of in-flight HTTP — Elysia handles that).

8. **`buildApp` test fixture**: a new `apps/be-01/src/__tests__/build-services.ts` exposes `buildTestServices(opts?)` returning a `BeServices` bundle backed by `:memory:` SQLite. Tests can override individual services (e.g., a fake `pushClient` that records calls). Lives outside `src/service/` to avoid bloating production code with test helpers.

9. **No changes to gw-01.** The `/internal/push` endpoint, the WS handler, the resume frame handling — all already correct. This change only fixes the BE side of the contract.

10. **No changes to libs.** `@wbs/contracts` already shapes `InternalForwardRequest/Response`, `InternalResumeRequest/Response`, `InternalPushRequest/Response`. `@wbs/observability` already has `createLogger`. `@wbs/config` already exposes `defineConfig`. `BeConfig` already has `GW_URL` (`apps/be-01/src/config.ts:8`).

## Open Questions

Resolved during brainstorm:

1. **Sync push vs durable outbox** → moot in this change. Only push site is replay (synchronous, ordered, sequential). The next change's tick will be sync-push too — durable outbox is YAGNI until real-world drop rates justify it (`event_log` is the universal recovery via resume).
2. **Sequencer concurrency** → already correct: bun:sqlite serializes; the existing `db.transaction` does atomic `INSERT ON CONFLICT` + `UPDATE … RETURNING`.
3. **What `forward` does** → pure ack.
4. **`PushClient` post-retry-exhaustion** → caller decides. Replay catches/logs/continues; broadcast catches/logs/swallows; future product mutations will choose per their durability needs.

Deferred to plan / next change:

- **Age-based retention** (prune by `created_at` in addition to row-count cap). Not strictly needed; count cap of 10k/sub is a sufficient safety bound. Add when SQLite size becomes a real concern.
- **`EventBus.broadcastBatch(events)`** for future fan-out-many cases. YAGNI; add when first multi-event producer needs it.
- **Metrics surface**: gateway-side `gw_*` metrics already exist; backend should add `event_log_rows_total`, `resume_replays_total`, `broadcast_delivered_total`, `broadcast_push_failed_total`. Wire in this change as part of `EventBus` / `ReplayOrchestrator` instrumentation; emit via `@wbs/observability` counters.
- **What happens if BE crashes mid-replay?** Some events are pushed, some not. Client's reconnecting WS sees the ack come back as a connection drop; on reconnect with the new highest-seq it received, resume idempotently picks up where it left off. No special handling needed in this change — the protocol handles it.

## Impact

- **`apps/be-01`**: new files `service/event-bus.ts`, `service/replay-orchestrator.ts`, `service/retention-timer.ts`, `__tests__/build-services.ts`. Changes to `app.ts` (new `services` option, real callback impls), `main.ts` (full runtime composition).
- **No new deps.** Everything composed already exists.
- **No spec changes** outside `backend-foundation`. Adds two new requirements to that capability:
  - "Runtime composition wires real Layer-A services" (replaces the implicit "stubs are acceptable" reading of the existing requirements).
  - "Resume orchestrator replays events through gw and returns counts."
- **Test load**: ~8 new test files (event-bus, replay-orchestrator, retention-timer, integration tests for forward-as-ack, integration tests for resume-with-buffer-hit, integration-with-buffer-miss, integration-with-out-of-range, integration-with-push-failure). All within `apps/be-01`.
- **Performance**: replay is O(events_to_replay) per subscription, sequential push. For the upcoming tick smoke (1Hz, recent events only), ≤ a few dozen events per replay. No concern. If a future product feature has high-frequency events, batching becomes a follow-up.
- **Operational**: BE process gains a 60s retention interval. Negligible. SIGTERM handling is added but not relied on.
- **No FE / gw changes.**
