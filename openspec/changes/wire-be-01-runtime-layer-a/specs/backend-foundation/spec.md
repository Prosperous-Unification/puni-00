## ADDED Requirements

### Requirement: Runtime composition of Layer-A services in `buildApp`

`apps/be-01/src/app.ts`'s `buildApp(opts)` MUST accept a `services: BeServices` dependency bundle, where `BeServices` includes at minimum `eventBus: EventBus` and `replayOrchestrator: ReplayOrchestrator`. The internal controller MUST consume these services for `onForward` and `onResume` instead of inline stubs. Stub callbacks that fabricate empty `push_responses` or zero-count `replaying` results MUST NOT exist in `buildApp` after this change. The production composition in `apps/be-01/src/main.ts` MUST construct each service against real backing collaborators (`EventSequencer` over `DrizzleEventLogRepo`, an in-memory `ReplayBuffer`, and a `PushClient` pointed at `cfg.GW_URL`) and pass them via `services` into `buildApp`.

#### Scenario: Tests substitute services with mocks

- **WHEN** a unit test instantiates `buildApp` with a `BeServices` bundle whose `replayOrchestrator.replay` is a vi spy
- **THEN** a `POST /internal/resume` against `app.handle(req)` invokes the spy with the request's `resume_points`
- **AND** the spy's return value is propagated to the HTTP response unchanged

#### Scenario: Production composition wires real implementations

- **WHEN** `apps/be-01/src/main.ts` boots and migrations succeed
- **THEN** the `services` bundle passed to `buildApp` contains a real `EventBus` backed by `EventSequencer` + `DrizzleEventLogRepo` + `ReplayBuffer` + `PushClient`
- **AND** a real `ReplayOrchestrator` backed by the same `ReplayBuffer`, repo, and `PushClient`

#### Scenario: Stub callbacks are removed

- **WHEN** a static scan runs over `apps/be-01/src/app.ts`
- **THEN** the file contains no occurrence of the literal string `push_responses: []` inside a stub `onForward` or `onResume`
- **AND** the controller wires `onForward` and `onResume` to real implementations sourced from `services`

---

### Requirement: ReplayOrchestrator buffer-first-then-DB algorithm

For each `(subscription, since)` pair in a `POST /internal/resume` request, the `ReplayOrchestrator` MUST first consult the in-memory `ReplayBuffer`. If `buffer.oldestSeq(subscription)` is non-null AND `≤ since + 1`, the orchestrator MUST source events from `buffer.since(subscription, since)` (fast path). Otherwise it MUST query `repo.rangeSince(subscription, since)` (durable fallback). If `repo.oldestSeq(subscription)` is `null` or strictly greater than `since + 1`, the orchestrator MUST return `{status: "denied", reason: "out_of_range"}` for that subscription. Replay MUST process events in strictly ascending `seq` order.

#### Scenario: Buffer hit avoids DB

- **WHEN** the buffer holds events 5..10 for `"doc:x"` (oldest seq = 5) and resume requests `since=4`
- **THEN** events 5..10 are sourced from the buffer
- **AND** `repo.rangeSince` is not called for `"doc:x"`

#### Scenario: Buffer miss falls through to DB

- **WHEN** the buffer's oldest seq for `"doc:x"` is 8 and resume requests `since=4`
- **THEN** the orchestrator queries `repo.rangeSince("doc:x", 4)` for events 5..N

#### Scenario: Buffer empty falls through to DB

- **WHEN** the buffer has no entries for `"doc:x"` and resume requests `since=4`
- **THEN** the orchestrator queries `repo.rangeSince("doc:x", 4)`

#### Scenario: Out-of-range when DB also misses the gap

- **WHEN** `repo.oldestSeq("doc:x")` returns 6 and resume requests `since=2`
- **THEN** the response for `"doc:x"` is `{"status": "denied", "reason": "out_of_range"}`
- **AND** no `PushClient.push` is invoked for `"doc:x"`

#### Scenario: Out-of-range when subscription is entirely unknown

- **WHEN** `repo.oldestSeq("doc:never")` returns `null` and resume requests `since=10`
- **THEN** the response for `"doc:never"` is `{"status": "denied", "reason": "out_of_range"}`

---

### Requirement: Resume responds after replay pushes complete

The `POST /internal/resume` HTTP response MUST NOT return until every replay `PushClient.push` invocation for the request has completed (resolved or rejected). The `count` field per subscription MUST equal the number of events for which the push resolved successfully. Per-event push exceptions MUST be caught, logged at `warn` level with the subscription and seq, and MUST NOT abort the orchestrator nor cause the HTTP response to fail. The HTTP status MUST remain 200 even when some replay pushes fail.

#### Scenario: Ack arrives after pushes

- **WHEN** `/internal/resume` returns `{"doc:x": {"status": "replaying", "count": 3}}`
- **THEN** the gw `/internal/push` endpoint has already received exactly 3 calls for `"doc:x"` before the resume HTTP response is observed

#### Scenario: Partial push failure does not abort

- **WHEN** replay attempts to push 5 events for `"doc:x"` and the push for seq=12 throws `PushFailed` after exhausting retries
- **THEN** pushes for the remaining seqs (13, 14, 15) are still attempted in order
- **AND** the returned `count` for `"doc:x"` is 4
- **AND** the HTTP response is 200
- **AND** a `warn`-level log entry exists with `sub: "doc:x", seq: 12`

#### Scenario: Push order is preserved

- **WHEN** replay sources events 5..10 from the buffer for `"doc:x"`
- **THEN** the gw `/internal/push` calls for `"doc:x"` arrive at gw in strictly ascending seq order (5, 6, 7, 8, 9, 10)

---

### Requirement: `EventBus.broadcast` is the sole sanctioned producer entrypoint

The BE process MUST expose an `EventBus.broadcast(subscription, message)` method that orchestrates, in order: (1) `EventSequencer.recordEvent(subscription, message)` for atomic DB seq assignment + `event_log` row insertion, (2) `ReplayBuffer.record(subscription, recorded.seq, message)` to populate the in-memory ring, (3) `PushClient.push({subscription, seq: recorded.seq, message})` to fan out via gw. DB write failures MUST propagate to the caller as an exception. Push failures MUST be caught, logged at `warn`, and swallowed — the event remains durable in `event_log` and the buffer, and a future resume will recover it. `EventBus.broadcast` MUST return the `RecordedEvent` to the caller. No other code path in `apps/be-01/src/` outside `repository/` and `service/` is permitted to call `EventSequencer.recordEvent` or `PushClient.push` directly.

#### Scenario: Happy-path broadcast records, buffers, and pushes

- **WHEN** `bus.broadcast("doc:x", {op: "edit"})` is called and gw is reachable
- **THEN** `event_log` gains exactly one row for `"doc:x"` with the next monotonic `seq`
- **AND** the in-memory buffer for `"doc:x"` gains an entry at that `seq` with the same message
- **AND** gw `/internal/push` receives exactly one POST with that `seq` and message
- **AND** the returned `RecordedEvent` carries that `seq`

#### Scenario: Push failure is swallowed

- **WHEN** `bus.broadcast("doc:x", msg)` is called and gw responds with 503 for every retry
- **THEN** `bus.broadcast` resolves successfully (does not throw)
- **AND** `event_log` still gained the row for `"doc:x"`
- **AND** the buffer still gained the entry
- **AND** `broadcast_push_failed_total` is incremented by 1
- **AND** a `warn`-level log entry exists with the subscription and seq

#### Scenario: DB write failure throws

- **WHEN** `bus.broadcast` is called and the underlying DB transaction fails (e.g., disk-full)
- **THEN** the call throws
- **AND** the buffer was not modified
- **AND** no push was attempted

---

### Requirement: RetentionTimer runs every 60 seconds and shuts down cleanly

A `RetentionTimer` instance MUST run inside the `be-01` process. It MUST start after Drizzle migrations apply, fire once immediately, and then fire every 60 seconds. Each tick MUST call `runRetention(repo, {maxPerSubscription: 10_000})`. Errors thrown inside any tick MUST be caught and logged at `error` level without halting the timer. On `SIGTERM`, the timer MUST stop accepting new ticks; any in-flight tick MUST be awaited; only after the awaited tick (if any) settles MAY the SIGTERM handler proceed to `db.close()` and process exit.

#### Scenario: Timer ticks every 60 seconds

- **WHEN** the BE process has been running for `> 120` seconds and `event_log` contains `> 10,000` rows for `"doc:x"`
- **THEN** at least 2 retention ticks have run for the period
- **AND** the row count for `"doc:x"` is `≤ 10,000`

#### Scenario: Tick error does not kill the timer

- **WHEN** one retention tick throws (e.g., the DB returns an error)
- **THEN** the error is logged at `error` level with the cause
- **AND** the next tick still fires after the configured interval

#### Scenario: SIGTERM awaits in-flight tick

- **WHEN** the BE receives SIGTERM mid-tick
- **THEN** the SIGTERM handler awaits the tick's promise before invoking `db.close()`
- **AND** `db.close()` is the last DB-level operation before process exit

---

### Requirement: BE Layer-A counters are emitted at `/metrics`

`be-01` MUST emit the following counters via `@wbs/observability` and expose them at `GET /metrics` in Prometheus exposition format: `event_log_rows_total` (gauge; sampled at the start of each retention tick across all subscriptions), `resume_replays_total` (counter; labeled by `result=replaying|denied`; incremented per subscription per resume call), `broadcast_delivered_total` (counter; incremented by the `delivered_to_sockets` value returned by gw on a successful push), and `broadcast_push_failed_total` (counter; incremented per `EventBus.broadcast` push that exhausts retries).

#### Scenario: Resume increments per-subscription counters

- **WHEN** a resume call returns `{"a": {"status": "replaying"}, "b": {"status": "denied"}, "c": {"status": "replaying"}}`
- **THEN** `resume_replays_total{result="replaying"}` increments by 2
- **AND** `resume_replays_total{result="denied"}` increments by 1

#### Scenario: Broadcast push failure increments counter

- **WHEN** `bus.broadcast` is called once and the push exhausts retries
- **THEN** `broadcast_push_failed_total` increments by exactly 1

#### Scenario: Counters are exposed at `/metrics`

- **WHEN** `GET /metrics` is called against a running `be-01`
- **THEN** the response body contains lines for `event_log_rows_total`, `resume_replays_total`, `broadcast_delivered_total`, and `broadcast_push_failed_total` in Prometheus text format

---

### Requirement: `onForward` is a pure ack until product semantics arrive

The internal controller's `POST /internal/forward` handler MUST validate the `InternalForwardRequest` envelope and return HTTP 200 with body `{"ack": true, "push_responses": []}`. It MUST NOT invoke `EventBus.broadcast`, `EventSequencer.recordEvent`, `ReplayBuffer.record`, or `PushClient.push`. No row is added to `event_log`. The handler is a no-op aside from auth + envelope validation. This requirement holds until a subsequent change introduces product semantics for forwarded messages.

#### Scenario: Valid forward records nothing

- **WHEN** `POST /internal/forward` is called with a valid `X-Internal-Auth` header and a well-formed body `{"message": {"op": "edit"}, "trace_id": "abc"}`
- **THEN** the response is HTTP 200 with body `{"ack": true, "push_responses": []}`
- **AND** the `event_log` row count is unchanged
- **AND** no `POST /internal/push` is sent to gw

#### Scenario: Invalid envelope still rejected with 400

- **WHEN** `POST /internal/forward` is called with a valid `X-Internal-Auth` header but a body missing `trace_id`
- **THEN** the response is HTTP 400
- **AND** no row is added to `event_log`
