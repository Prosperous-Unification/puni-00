## 1. Test fixture and service skeletons

- [ ] 1.1 Create `apps/be-01/src/__tests__/build-services.ts` exporting `buildTestServices(overrides?)` that opens a `:memory:` SQLite, runs migrations, instantiates `DrizzleEventLogRepo`, `ReplayBuffer({maxPerSubscription: 1000, maxAgeMs: 5*60_000})`, `EventSequencer`, a fake `PushClient` (collects `push` calls in an array), an `EventBus`, a `ReplayOrchestrator`, and returns the bundle. Allow `overrides` to substitute any service.
- [ ] 1.2 Add a typed `BeServices` interface to `apps/be-01/src/app.ts` (or `src/service/types.ts` if cleaner): `{ eventBus: EventBus; replayOrchestrator: ReplayOrchestrator }`.
- [ ] 1.3 Create skeleton files for the three new services with class signatures only (no bodies): `apps/be-01/src/service/event-bus.ts`, `replay-orchestrator.ts`, `retention-timer.ts`. Re-export from `service/index.ts` if such a barrel exists; otherwise direct imports are fine.

## 2. EventBus

- [ ] 2.1 Write failing tests in `apps/be-01/src/service/event-bus.test.ts`: happy-path (record + buffer + push), push-failure-swallow (counter incremented, log emitted), DB-failure-rethrows, returns `RecordedEvent` to caller.
- [ ] 2.2 Implement `EventBus.broadcast(subscription, message)`:
  1. `await sequencer.recordEvent(subscription, message)` → `RecordedEvent`
  2. `buffer.record(subscription, recorded.seq, message)`
  3. Try `await pushClient.push({subscription, seq: recorded.seq, message})`; on `PushFailed`, increment `broadcast_push_failed_total`, log at `warn` with `{subscription, seq, err}`.
  4. On success, increment `broadcast_delivered_total` by `delivered`.
  5. Return `recorded`.
- [ ] 2.3 Confirm tests pass.

## 3. ReplayOrchestrator

- [ ] 3.1 Write failing tests in `apps/be-01/src/service/replay-orchestrator.test.ts` covering: buffer-only hit, buffer empty → DB fallback, buffer too small → DB fallback, repo also out-of-range → denied, unknown subscription → denied, partial push failure mid-replay (returns smaller count, HTTP 200), multi-subscription mixed (one replaying, one denied), seq-order preservation across replay.
- [ ] 3.2 Implement `ReplayOrchestrator.replay(points, ctx)`:
  ```
  result = {}
  for [sub, since] of Object.entries(points):
    bufferOldest = buffer.oldestSeq(sub)
    if bufferOldest != null && bufferOldest <= since + 1:
      events = buffer.since(sub, since)
    else:
      dbOldest = await repo.oldestSeq(sub)
      if dbOldest == null || dbOldest > since + 1:
        result[sub] = { status: "denied", reason: "out_of_range" }
        metrics.resumeReplays("denied")
        continue
      events = await repo.rangeSince(sub, since)
    pushed = 0
    for ev of events: # already in seq order
      try:
        await pushClient.push({subscription: sub, seq: ev.seq, message: ev.message})
        pushed += 1
      catch PushFailed as err:
        logger.warn({err, sub, seq: ev.seq}, "replay push failed")
    result[sub] = { status: "replaying", count: pushed }
    metrics.resumeReplays("replaying")
  return result
  ```
- [ ] 3.3 Confirm tests pass.

## 4. RetentionTimer

- [ ] 4.1 Write failing tests in `apps/be-01/src/service/retention-timer.test.ts` (use injected `setInterval`/`clearInterval` and an injected clock; do NOT use real `setInterval` in tests). Cases: ticks every interval, error in tick logged but timer keeps running, `stop()` awaits in-flight tick.
- [ ] 4.2 Implement `RetentionTimer`:
  ```ts
  class RetentionTimer {
    constructor(opts: {
      repo: EventLogRepo;
      intervalMs: number;
      maxPerSubscription: number;
      logger: Logger;
      setIntervalImpl?: typeof setInterval;
      clearIntervalImpl?: typeof clearInterval;
    });
    start(): void;
    async stop(): Promise<void>;
  }
  ```
  Internally tracks `inflight: Promise<void> | null`. `start()` calls `tick()` once, then schedules. Each tick wraps `runRetention` in try/catch; errors are logged at `error`. `stop()` clears the interval, awaits `inflight`.
- [ ] 4.3 Confirm tests pass.

## 5. Wire `BeServices` into `buildApp`

- [ ] 5.1 Update `apps/be-01/src/app.ts`'s `AppOptions` to include `services: BeServices`. Keep `internalAuthSecret`, `migrationsApplied`, `version`.
- [ ] 5.2 Replace stub `onForward` with: `(_msg, _ctx) => Promise.resolve({ push_responses: [] as unknown[] })`. Inline the closure inside `buildApp`.
- [ ] 5.3 Replace stub `onResume` with: `(points, ctx) => services.replayOrchestrator.replay(points, ctx)`.
- [ ] 5.4 Update `apps/be-01/src/app.test.ts` (existing) and any health tests to construct `services` via `buildTestServices()` and pass it in.
- [ ] 5.5 Update integration tests `internal.integration.test.ts`: rewrite the resume tests to use real `ReplayOrchestrator` over a `:memory:` DB seeded via `repo.recordEvent`; keep the auth tests intact.
- [ ] 5.6 Add a new integration test `forward-pure-ack.integration.test.ts`: posts a valid forward, asserts response body, asserts `event_log` is empty, asserts no push call recorded by the fake `PushClient`.
- [ ] 5.7 Confirm all tests pass.

## 6. Wire `main.ts` composition

- [ ] 6.1 Replace `apps/be-01/src/main.ts` with the composition from design.md D7: open `Database`, build `drizzle()` wrapper, instantiate `DrizzleEventLogRepo`, `ReplayBuffer`, `EventSequencer`, `PushClient`, `EventBus`, `ReplayOrchestrator`, `RetentionTimer`. Pass `{eventBus, replayOrchestrator}` into `buildApp` as `services`.
- [ ] 6.2 In the `app.listen` callback: run migrations, set `state.migrationsApplied = true`, call `retention.start()`. Log `be-01 ready`.
- [ ] 6.3 Add SIGTERM handler that calls `await retention.stop()`, then `db.close()`, then `process.exit(0)`. Add SIGINT handler with the same body.
- [ ] 6.4 Confirm `bun run dev:be` boots cleanly, `/health` returns 200, `/metrics` exposes new counters, kill signal exits cleanly.

## 7. BE Layer-A metrics

- [ ] 7.1 Add a small `BeMetrics` helper in `apps/be-01/src/service/metrics.ts` that exposes typed counters/gauge: `broadcastDelivered`, `broadcastPushFailed`, `resumeReplays(result: "replaying" | "denied")`, `eventLogRows.set(n)`. Backed by `@wbs/observability` `Counter` / `Gauge`.
- [ ] 7.2 Inject `BeMetrics` into `EventBus`, `ReplayOrchestrator`, and `RetentionTimer` (the timer samples `event_log` row count at the start of each tick — add `repo.totalRows()` if not present, else compute via existing `pruneBeyond` return + bookkeeping).
- [ ] 7.3 Verify `/metrics` exposition includes the four counter/gauge names. Add `metrics.integration.test.ts` that exercises one resume + one broadcast + one retention tick and asserts the metric strings.

## 8. End-to-end validation against gw-01

- [ ] 8.1 Add `apps/be-01/src/__tests__/resume-vs-gw.integration.test.ts`: stand up a fake gw via `Bun.serve` (or `app.handle` against a tiny stub `Elysia` app exposing `POST /internal/push` that records calls), point `PushClient.gwUrl` at it, seed `event_log` with seqs 1..5 for `"doc:x"`, call BE `/internal/resume` with `{"doc:x": 0}`, assert (a) HTTP response is `{"doc:x": {"status": "replaying", "count": 5}}`, (b) gw stub received exactly 5 pushes in seq order, (c) the response is observed only after the 5th push completes.
- [ ] 8.2 Add a follow-up test asserting the partial-failure path: gw stub fails on the 3rd push (returns 503 forever), assert response is `count: 4`, gw recorded 4 successful + 1 failed-after-retries push, BE log has a `warn` for the failed seq.

## 9. Type, lint, format, validate

- [ ] 9.1 Run `bun run typecheck` (or `nx run be-01:typecheck`); fix any errors.
- [ ] 9.2 Run `bun run lint`; fix any new violations. Confirm the existing `no-restricted-imports` rule for `drizzle-orm/*` outside `repository/` still passes.
- [ ] 9.3 Run `bun run format`; commit any formatting deltas.
- [ ] 9.4 Run `nx run be-01:test`; confirm green.
- [ ] 9.5 Run `openspec validate wire-be-01-runtime-layer-a --json`; confirm `valid: true`.
