## ADDED Requirements

### Requirement: Structured JSON logging via `pino` with an ArkType-defined log-field schema

Every log line emitted by `be-01`, `gw-01`, and client-side `fe-01` (shipped via batched POST) MUST be a single JSON object conforming to the log-field schema defined in `@wbs/observability/src/log-schema.ts`. The schema MUST include fields `level`, `time`, `msg`, `service`, `version`, and optional `request_id`, `connection_id`, `user_id`, `ws_subscription`, `trace_id`, `span_id`, and `err`.

#### Scenario: Every log line parses as the declared schema

- **WHEN** any non-empty line from `docker logs be-01` or `docker logs gw-01` is read
- **THEN** it parses as JSON
- **AND** it validates against the ArkType log-field schema exported from `@wbs/observability`

#### Scenario: Unauthenticated requests have `user_id` absent (not `"anonymous"`)

- **WHEN** an unauthenticated request generates a log line on `be-01`
- **THEN** the JSON object has no `user_id` field (`undefined`, omitted from JSON)
- **AND** `request_id` is still present

#### Scenario: `version` field is injected from the build-time git SHA

- **WHEN** `be-01` or `gw-01` emits a log line after being built and deployed from git SHA `abc1234`
- **THEN** the emitted `version` field equals `"abc1234"` (not a placeholder or empty string)
- **AND** every log line from that build shares the same `version` value

### Requirement: Request-scoped correlation IDs propagate across services

`be-01` MUST generate a `request_id` per inbound HTTP request and include it in every log line emitted during that request. `gw-01` MUST propagate the caller-supplied `request_id` when forwarding via `/internal/forward` and MUST log with the same `request_id` so a single request's logs can be correlated across both services via Loki queries.

#### Scenario: End-to-end request has one `request_id`

- **WHEN** a client triggers an action that traverses `gw-01` → `be-01` and produces log lines on both services
- **THEN** all log lines emitted by that request in both services share the same `request_id` value

#### Scenario: Connection-scoped logs include `connection_id`

- **WHEN** `gw-01` logs during the lifecycle of a specific WebSocket connection (upgrade, forward, disconnect)
- **THEN** every such log line includes the same `connection_id` value

### Requirement: Prometheus `/metrics` endpoints with gateway-specific custom metrics

Both `be-01` and `gw-01` MUST expose a Prometheus-formatted `/metrics` HTTP endpoint via the Elysia OTel plugin with Prometheus exporter. The `gw-01` metrics MUST include (at minimum) `gw_active_connections` (gauge), `gw_connections_total` (counter, labeled `outcome` ∈ {accepted, rejected_auth, rejected_other}), `gw_reconnects_total` (counter), `gw_message_fanout_total` (counter, labeled `subscription_kind`), `gw_inbound_messages_total` (counter, labeled `kind`), `gw_drain_seconds` (histogram), `gw_backend_unavailable_total` (counter). The `be-01` metrics MUST include at minimum `event_log_rows_total` (gauge) and `resume_replays_total` (counter).

#### Scenario: `/metrics` is Prometheus-parseable

- **WHEN** `curl http://<service>/metrics` runs against each service
- **THEN** the response is a valid Prometheus text-format document
- **AND** includes the metric names listed above with `HELP` and `TYPE` lines

#### Scenario: Custom gateway metric labels have bounded cardinality

- **WHEN** the `gw-01` `/metrics` output is inspected after a week of operation
- **THEN** `gw_message_fanout_total` has at most tens of `subscription_kind` label values (not per-user, not per-document)

### Requirement: Loki label strategy separates low-cardinality labels from high-cardinality fields

The Promtail configuration in `tool-observability-stack` MUST promote only low-cardinality fields (`service`, `level`, `version`) to Loki labels; medium-cardinality fields (`request_id`, `connection_id`, `trace_id`, `span_id`, `ws_subscription`) MUST be promoted to structured metadata; high-cardinality fields (`user_id`, arbitrary extras) MUST remain in the log line's JSON payload and be queryable via `| json` parsing.

#### Scenario: `user_id` is not a Loki label

- **WHEN** Loki's label-cardinality report is inspected
- **THEN** `user_id` does NOT appear as a label
- **AND** `{service="be-01"} | json | user_id="<any>"` returns matches for that user

#### Scenario: `service` IS a Loki label

- **WHEN** the query `{service="be-01"}` runs against Loki
- **THEN** it returns the log stream without requiring a `| json` parse stage

### Requirement: Self-hosted LGTM stack in Docker Compose

The observability stack (Grafana, Loki, Promtail, Prometheus) MUST run as Docker Compose services on the same Hetzner host as `be-01` and `gw-01`, provisioned from `tools/tool-observability-stack/dist/`. Grafana MUST provision datasources (Loki, Prometheus) and dashboards at boot via mounted YAML/JSON files. The stack MUST NOT require any manual UI configuration after a first deploy.

#### Scenario: Fresh deploy shows seed dashboards without manual clicks

- **WHEN** the observability stack starts from clean volumes
- **THEN** opening Grafana reveals the `be-01 overview`, `gw-01 overview`, and `wbs-alerts` dashboards pre-configured
- **AND** both Loki and Prometheus datasources are already connected

### Requirement: Observability UI exposed under a subdomain behind HTTP basic auth

Grafana MUST be reachable via Caddy at `observability.<app-domain>` with TLS and HTTP basic-auth protection. Loki, Prometheus, and Promtail management endpoints SHALL NOT be directly exposed outside the Docker network.

#### Scenario: Grafana is reachable with basic auth

- **WHEN** a user navigates to `https://observability.<host>/`
- **THEN** Caddy prompts for HTTP basic auth
- **AND** with correct credentials the Grafana UI loads

#### Scenario: Loki is NOT reachable from the public network

- **WHEN** `curl https://<host>:3100/` or any other direct Loki port is attempted
- **THEN** the request times out or is refused
- **AND** Loki is only reachable from inside the Docker network

### Requirement: Baseline alerting rules ship with the stack

The shipped Grafana configuration MUST include at minimum three alerting rules: "service down" (triggered when `up{} == 0` for >1 minute for either `be-01` or `gw-01`), "5xx rate spike" (triggered when 5xx rate exceeds a threshold over 5 minutes), and "event_log retention stuck" (triggered when the `event_log` retention job has not run in >1 hour). Alert notifications MUST route to ntfy.sh by default, switchable via `NOTIFY_CHANNEL` env var.

#### Scenario: Service-down alert fires within 2 minutes of outage

- **WHEN** `be-01` is stopped for 2 minutes continuously
- **THEN** a notification arrives on the configured ntfy topic with a title referencing "service down"
- **AND** the Grafana alert history shows the firing event

#### Scenario: Alert channel is configurable at deploy time

- **WHEN** `.env` is set with `NOTIFY_CHANNEL=slack` and `SLACK_WEBHOOK_URL`
- **THEN** Grafana is provisioned with a Slack contact point and the alert rules route to it instead of ntfy
