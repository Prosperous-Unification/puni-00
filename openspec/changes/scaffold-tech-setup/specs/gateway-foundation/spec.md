## ADDED Requirements

### Requirement: `gw-01` terminates WebSocket connections with JWT upgrade-time authentication

`apps/gw-01` MUST accept WebSocket upgrade requests on a configured path (default `/ws`). Every upgrade MUST be authenticated by validating a JWT presented via a query string or `Sec-WebSocket-Protocol` subprotocol. Unauthenticated upgrades MUST be rejected with HTTP 401 before the WebSocket handshake completes.

#### Scenario: Missing JWT rejects the upgrade

- **WHEN** a WebSocket upgrade request arrives without a JWT
- **THEN** `gw-01` responds with HTTP 401
- **AND** no WebSocket connection is established

#### Scenario: JWT signed with an unknown key is rejected

- **WHEN** an upgrade request presents a JWT signed with a key that matches neither `JWT_SIGNING_KEY_CURRENT` nor `JWT_SIGNING_KEY_PREVIOUS`
- **THEN** `gw-01` responds with HTTP 401

### Requirement: Dual-key JWT validation for seamless rotation

`gw-01` MUST validate incoming JWTs against `JWT_SIGNING_KEY_CURRENT` first and, only if the signature does not match, against `JWT_SIGNING_KEY_PREVIOUS` (when set). Non-signature validation failures (expired, malformed) MUST NOT trigger the fallback.

#### Scenario: A JWT signed with the previous key still authenticates

- **WHEN** a valid, non-expired JWT signed with `JWT_SIGNING_KEY_PREVIOUS` arrives during the rotation window
- **THEN** the upgrade succeeds
- **AND** a per-socket log event records `{ signing_key: "previous" }` for observability

#### Scenario: An expired JWT with valid signature is not retried against the previous key

- **WHEN** an expired JWT signed with `JWT_SIGNING_KEY_CURRENT` arrives
- **THEN** the upgrade is rejected without attempting `JWT_SIGNING_KEY_PREVIOUS`

### Requirement: In-memory ephemeral subscription map

`gw-01` MUST maintain its `subscription → Set<socket>` map only in process memory. It SHALL NOT write this map to any persistent store. Process restart MUST clear all subscription state.

#### Scenario: Restart clears subscription state

- **WHEN** `gw-01` restarts
- **THEN** its in-memory subscription map is empty
- **AND** no SQLite, file-system, or Redis write is performed to persist the map

#### Scenario: Subscription membership is accurate while the process runs

- **WHEN** three sockets subscribe to `doc:abc` and one unsubscribes
- **THEN** the next `/internal/push` for `doc:abc` fans out to exactly the two remaining sockets

### Requirement: `POST /internal/push` endpoint for backend-driven fan-out

`gw-01` MUST expose `POST /internal/push` authenticated via `X-Internal-Auth: <INTERNAL_AUTH_SECRET>`. The body MUST conform to `@wbs/contracts`' push schema `{ subscription, seq, message, trace_id? }`. Valid requests MUST deliver the message to every socket subscribed to the given `subscription` and MUST respond with HTTP 202 and a count of delivered sockets.

#### Scenario: Push with invalid shared secret is rejected

- **WHEN** `/internal/push` is called without a valid `X-Internal-Auth` header
- **THEN** `gw-01` responds with HTTP 401

#### Scenario: Push fans out to subscribed sockets

- **WHEN** two sockets subscribed to `room:x` are connected, and a valid `/internal/push` request arrives with `{"subscription":"room:x", "seq":5, "message":…}`
- **THEN** both sockets receive a frame carrying `{"subscription":"room:x", "seq":5, "message":…}`
- **AND** the response body is `{"delivered_to_sockets": 2}`

### Requirement: Inbound client messages are forwarded to `be-01` via `/internal/forward`

For every inbound message from a connected client (other than control frames like `ping`, `resume`), `gw-01` MUST `POST /internal/forward` on `be-01` with headers `X-Internal-Auth`, `X-Client-Id` (user id from the validated JWT), and `X-Connection-Id` (gateway-assigned). The body MUST conform to `@wbs/contracts`' forward schema.

#### Scenario: Client-originated message is forwarded with identification headers

- **WHEN** a client sends a non-control frame `{"message":…}` over an authenticated socket
- **THEN** `gw-01` issues `POST /internal/forward` to `be-01` with all three identification headers set correctly
- **AND** the request body's `message` field equals the client-sent `message`

#### Scenario: Backend unavailable returns a client-visible error frame

- **WHEN** `/internal/forward` fails because `be-01` is unreachable
- **THEN** `gw-01` sends the client a frame `{"type":"error","code":"backend_unavailable","retry_after":5}`
- **AND** the socket is NOT closed

### Requirement: Reconnect handshake forwards to `/internal/resume`

On receipt of a `{"type":"resume","resume_points":…}` frame as the first frame after upgrade, `gw-01` MUST `POST /internal/resume` to `be-01` with the client's resume points. The gateway MUST then relay replayed events (delivered via `/internal/push` from `be-01`) to the reconnecting client. Once replay completes, `gw-01` MUST send the client a `{"type":"resume_ack","replayed":…}` frame. Subscriptions marked `denied` MUST propagate to the client as `{"type":"resume_denied","subscription":…,"reason":…}`.

#### Scenario: Successful reconnect replays missed events

- **WHEN** a client connects and sends `{"type":"resume","resume_points":{"doc:abc":10}}` while `be-01`'s current seq for `doc:abc` is 15
- **THEN** the client receives frames for seqs 11, 12, 13, 14, 15 in order
- **AND** the client then receives `{"type":"resume_ack","replayed":{"doc:abc":5}}`

#### Scenario: Out-of-range resume is surfaced to the client

- **WHEN** a client sends `resume_points` where at least one subscription's `seq` is older than the retained range
- **THEN** the client receives `{"type":"resume_denied","subscription":"<sub>","reason":"out_of_range"}` for that subscription

### Requirement: `ping` / `pong` heartbeat and `GET /health`

`gw-01` MUST respond to client `{"type":"ping"}` frames with `{"type":"pong","time":<unix-ms>}` within 1 second. It MUST also expose `GET /health` returning HTTP 200 when the service is ready and HTTP 503 when it cannot reach `be-01`.

#### Scenario: Ping gets a prompt pong

- **WHEN** an authenticated socket sends `{"type":"ping"}`
- **THEN** the socket receives `{"type":"pong","time":<unix-ms>}` within 1 second

#### Scenario: Health is 503 when backend is unreachable

- **WHEN** `be-01` is unreachable (e.g., during a redeploy window)
- **THEN** `GET /health` on `gw-01` returns HTTP 503
- **AND** in-flight client sockets remain open (do not get disconnected because of the health failure)

### Requirement: `gw-01` holds no durable state

`gw-01` SHALL NOT read or write any SQLite database, file-system state file, or external datastore. All state MUST be either ephemeral process memory or retrieved on demand from `be-01`.

#### Scenario: No persistence calls originate from `gw-01`

- **WHEN** the `gw-01` source tree is statically scanned
- **THEN** no file imports `bun:sqlite`, `drizzle-orm`, or any database driver
- **AND** no code performs file writes under `/srv/wbs/` or similar durable paths
