## Why

The `scaffold-tech-setup` change shipped Layer-A as classes with passing unit tests, but `apps/be-01/src/app.ts:24–34` wires the internal controller with stub callbacks: `onForward` returns `{push_responses: []}` and `onResume` fakes `{status: "replaying", count: 0}` for every subscription. The real services (`EventSequencer`, `DrizzleEventLogRepo`, `ReplayBuffer`, `PushClient`, `runRetention`) are never instantiated at runtime, the `event_log` table is never read after migration, and `PushClient` never actually talks to gw. The protocol claim "`ping`/`pong` proves Layer-A end-to-end" only covers gw's inline pong handler — the BE side of the same protocol is unexercised. Closing this gap is a prerequisite for the next change (`dev-diagnostics-and-tick-proof`), which adds a 1-Hz tick producer that depends on the runtime composition being real.

## What Changes

**`buildApp` shape**

- From: `AppOptions = { migrationsApplied, version?, internalAuthSecret? }` with stub `onForward`/`onResume` inlined inside `buildApp`.
- To: `AppOptions = { migrationsApplied, services: BeServices, version?, internalAuthSecret? }` where `BeServices = { eventBus, replayOrchestrator }`. Stubs are removed.
- Reason: makes the BE composable from `main.ts` and substitutable from tests.
- Impact: non-breaking (no external callers exist); test fixtures need to construct the new `services` bundle.

**`onForward` semantics**

- From: stub returning `{push_responses: []}`.
- To: pure-ack closure — validates the envelope, returns `{ack: true, push_responses: []}`. No event recorded, no push.
- Reason: forward is product-shape (which messages get echoed?); this change is pure wiring; tick lands in the next change.
- Impact: no observable behavior change at the wire — `push_responses` was already `[]`; intent is now explicit and contract-aligned.

**`onResume` semantics**

- From: stub returning `{status: "replaying", count: 0}` for every requested subscription.
- To: delegates to `ReplayOrchestrator.replay(points, ctx)` which (per subscription) reads from `ReplayBuffer` first, falls back to `DrizzleEventLogRepo.rangeSince`, pushes events back to gw via `PushClient` synchronously in seq order, and returns the per-subscription `{status, count}` map. `out_of_range` is returned when neither buffer nor DB can deliver `since + 1`.
- Reason: fulfills the resume protocol the gw side already implements.
- Impact: clients reconnecting with a `last_seq` now actually receive missed events.

**New BE services**

- `EventBus.broadcast(subscription, message)` — records via `EventSequencer`, populates `ReplayBuffer`, attempts `PushClient.push`; push failures are logged and swallowed (event is durable in `event_log`; resume is the recovery path). No callers in this change; the next change wires the tick producer.
- `ReplayOrchestrator.replay(points, ctx)` — owns the resume algorithm above.
- `RetentionTimer` — 60s `setInterval` calling `runRetention(repo, {maxPerSubscription: 10_000})`; started after migrations apply, stopped on SIGTERM.

**Runtime composition (`main.ts`)**

- Opens `Database` from `DB_PATH`, builds the Drizzle wrapper, instantiates all five services, threads them into `buildApp` via the new `services` option, starts the retention timer after migrations succeed, registers a SIGTERM handler that stops the timer and closes the DB.

**Backend instrumentation**

- New counters via `@wbs/observability`: `event_log_rows_total`, `resume_replays_total`, `broadcast_delivered_total`, `broadcast_push_failed_total`. Emitted from `EventBus` and `ReplayOrchestrator`.

**Out of scope**

- No changes to `gw-01`, `apps/fe-01`, any `libs/*`, contracts, deploy pipeline, or any tool project. No new dependencies. No producers (the tick service that actually drives `EventBus.broadcast` ships in `dev-diagnostics-and-tick-proof`).

## Capabilities

### New Capabilities

_None — runtime composition is part of an existing capability._

### Modified Capabilities

- `backend-foundation`: runtime now composes the real Layer-A services (`EventSequencer`, `DrizzleEventLogRepo`, `ReplayBuffer`, `PushClient`, `runRetention`) instead of stubs. New requirements cover (1) the `BeServices` composition contract on `buildApp`, (2) the `ReplayOrchestrator` algorithm including buffer→DB fallback and `out_of_range` denial, (3) the `EventBus.broadcast` producer entrypoint, (4) the `RetentionTimer` lifecycle, (5) the BE-side metric counters, and (6) `onForward` as a pure ack until product semantics arrive.

## Impact

- **`apps/be-01` source**: new files `service/event-bus.ts`, `service/replay-orchestrator.ts`, `service/retention-timer.ts`, `__tests__/build-services.ts`. Modified files `app.ts` (new `services` option, real callback impls), `main.ts` (full runtime composition + SIGTERM handler).
- **Tests**: ~8 new test files covering `EventBus.broadcast` (happy path + push-failure swallow), `ReplayOrchestrator.replay` (buffer-only, DB-only, denied, mixed multi-sub, push-failure-mid-replay), `RetentionTimer` (interval fires, error doesn't kill timer), and integration tests for `/internal/forward` (pure ack, no event recorded) and `/internal/resume` (real replay end-to-end against a fake gw). Estimated +250 LOC of test code.
- **Dependencies**: none added. All composed pieces already exist.
- **Operational**: BE process gains a 60s retention interval and a SIGTERM handler. Negligible footprint.
- **Performance**: replay is `O(events_to_replay)` per subscription with sequential synchronous pushes. For the upcoming tick smoke (1 Hz, recent events only), `≤` a few dozen events per replay. No concern.
- **Forward-looking**: `EventBus.broadcast` is the sole producer entrypoint; the next change's tick service is the first caller. Future product features (WBS edits, etc.) will also call `bus.broadcast` — keeping the producer flow in one place.
- **No behavior change** observable from outside the BE except (1) `/internal/resume` now actually replays missed events instead of returning fake counts, and (2) the BE process holds a long-running interval. No FE / gw / contract changes.
