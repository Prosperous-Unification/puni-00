## ADDED Requirements

### Requirement: `be-01` runs on Bun + ElysiaJS with no WebSocket surface

`apps/be-01` MUST expose only HTTP endpoints. The application MUST boot under Bun using ElysiaJS as the HTTP framework. It SHALL NOT register any WebSocket upgrade handler; all WebSocket termination lives in `gw-01`.

#### Scenario: Backend rejects WebSocket upgrade requests

- **WHEN** a client sends a WebSocket upgrade request to `be-01`
- **THEN** `be-01` responds with HTTP 426 Upgrade Required or 404 Not Found
- **AND** no WS connection is established

#### Scenario: Backend process is `bun`

- **WHEN** `be-01` starts locally via `nx serve be-01`
- **THEN** the running process is `bun` (not `node`)
- **AND** `GET /health` returns 200 with `{"status":"ok"}` within 2 seconds of boot

### Requirement: Controller → Service → Repository layering with Drizzle hidden behind the repository interface

`be-01` source MUST be organized in three layers: `controller/`, `service/`, and `repository/`. Drizzle ORM types MUST NOT appear in any file outside `repository/`. Services MUST consume repository interfaces, never concrete Drizzle queries.

#### Scenario: Drizzle types do not leak out of the repository layer

- **WHEN** a static scan runs over `apps/be-01/src/` excluding `apps/be-01/src/repository/`
- **THEN** no file imports from `drizzle-orm`, `drizzle-orm/bun-sqlite`, or `drizzle-orm/*`
- **AND** the scan is enforced by ESLint via a `no-restricted-imports` rule

#### Scenario: Swapping the SQLite driver does not touch services or controllers

- **WHEN** the `bun:sqlite` driver in `repository/db.ts` is replaced with a different Drizzle driver (e.g., `better-sqlite3`)
- **THEN** no file under `controller/` or `service/` requires modification to compile
- **AND** the repository interface remains identical

### Requirement: ArkType-validated request/response contracts

Every HTTP route on `be-01` MUST define its request body, query-string, and response schema as ArkType schemas imported from `@wbs/contracts`. Invalid requests MUST return HTTP 400 with a machine-readable error body conforming to `@wbs/contracts`' error envelope.

#### Scenario: Invalid request body is rejected with a 400 error

- **WHEN** a client POSTs a malformed body to any validated `be-01` endpoint
- **THEN** the response is HTTP 400
- **AND** the response body matches the `@wbs/contracts` error-envelope schema with a non-empty `violations` array

#### Scenario: Response conforms to declared schema

- **WHEN** a successful request is made to any `be-01` endpoint
- **THEN** the response body validates against the route's declared ArkType response schema

### Requirement: Event sequencer and bounded replay buffer

`be-01` MUST maintain a per-subscription monotonic sequence counter and a durable `event_log` table in the SQLite database. Every event emitted via `/internal/push` to `gw-01` MUST carry a `seq` value that is strictly greater than any prior `seq` for the same `subscription`. `be-01` MUST keep a per-subscription in-memory ring buffer bounded at the smaller of 1000 events or 5 minutes of history, serving fast-path resume. The `event_log` MUST retain at least the last 10,000 events per subscription for durable-fallback reconnect resume; a retention job MUST enforce this bound.

#### Scenario: Sequence numbers are strictly increasing per subscription

- **WHEN** `be-01` emits N events for the same `subscription` within a single process lifetime
- **THEN** the emitted `seq` values form a strictly increasing sequence starting from the previous persisted `next_seq`
- **AND** concurrent emissions from different fibers never produce duplicate `seq` values

#### Scenario: In-memory ring buffer is bounded

- **WHEN** `be-01` emits 1500 events for a single subscription within 1 minute
- **THEN** the in-memory ring for that subscription holds at most 1000 events
- **AND** the evicted events remain retrievable from the durable `event_log` via `/internal/resume`

#### Scenario: Retention job keeps `event_log` under 10k per subscription

- **WHEN** the retention job runs after `event_log` contains more than 10,000 rows for a subscription
- **THEN** on completion the row count for that subscription is ≤ 10,000
- **AND** the remaining rows are the most recent by `seq`

#### Scenario: Durable replay survives process restart

- **WHEN** `be-01` emits event `seq=42` for subscription `doc:abc`, then the process restarts
- **THEN** a subsequent emission for `doc:abc` produces `seq=43` (not `seq=1`)
- **AND** `/internal/resume` with `resume_points: {"doc:abc": 41}` returns event `42` from the `event_log`

### Requirement: Internal endpoints `/internal/forward` and `/internal/resume`

`be-01` MUST expose `POST /internal/forward` and `POST /internal/resume` endpoints. Both MUST be authenticated via an `X-Internal-Auth` header matching the `INTERNAL_AUTH_SECRET` env variable. Missing or wrong header MUST produce HTTP 401 without revealing whether the header was missing or merely wrong.

#### Scenario: Missing shared secret is rejected with 401

- **WHEN** a request is sent to `/internal/forward` without the `X-Internal-Auth` header
- **THEN** the response is HTTP 401 with body `{"error":"unauthorized"}`

#### Scenario: Valid resume request replays missing events

- **WHEN** `POST /internal/resume` is sent with a valid `X-Internal-Auth` header and body `{"resume_points":{"doc:abc": 10}}` and the current sequence for `doc:abc` is `15`
- **THEN** the response indicates `{"doc:abc": {"status":"replaying", "count": 5}}`
- **AND** `be-01` subsequently calls `gw-01`'s `/internal/push` for seqs 11, 12, 13, 14, 15

#### Scenario: Resume request beyond retention returns denied

- **WHEN** `POST /internal/resume` is sent for a subscription whose requested `resume_from` is below the oldest retained row in `event_log`
- **THEN** the response for that subscription is `{"status":"denied","reason":"out_of_range"}`

### Requirement: `GET /health` endpoint reports readiness

`be-01` MUST expose `GET /health` that returns HTTP 200 with `{"status":"ok","version":"<sha>"}` when the service is ready to accept traffic, or HTTP 503 when it is not (e.g., migrations still running).

#### Scenario: Health is 503 while migrations are in progress

- **WHEN** `be-01` is still applying Drizzle migrations at boot
- **THEN** `GET /health` returns HTTP 503 with body `{"status":"initializing"}`

#### Scenario: Health is 200 once ready

- **WHEN** migrations have completed and the DB is reachable
- **THEN** `GET /health` returns HTTP 200 with a body containing the current `version` (build-time git SHA)
