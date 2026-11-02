## ADDED Requirements

### Requirement: Bind rollout to verified prerequisites

Production apply SHALL be bound to a reviewed revision, target cluster and authorized operation. Preflight SHALL verify dependency readiness, credential presence/permissions without exposing values, runtime pins, resource/storage capacity including coexistence, and rollback inputs. Missing, stale, unreadable or contradictory evidence SHALL block apply. A rendered manifest SHALL NOT establish live readiness.

#### Scenario: Cluster access is unavailable

- **WHEN** the operator cannot read the target cluster or a required dependency is unready
- **THEN** preflight names the unresolved prerequisite and refuses apply rather than assuming the historical inventory is current

#### Scenario: Canary exceeds coexistence capacity

- **WHEN** Elastic, its trace gateway and the retained Victoria workloads exceed the measured budget
- **THEN** rollout refuses before scheduling or stopping existing telemetry

### Requirement: Preserve a supported three-signal path

The rollout SHALL deliver logs and traces to Elastic and metrics to Prometheus through approved OpenTelemetry paths. Elastic trace enrichment and APM aggregate metrics SHALL use a gateway compatible with pinned stack versions. Producer instrumentation SHALL remain OTLP-based. Existing MLflow export SHALL remain intact. Trace support SHALL be proved through queries and Kibana APM views, not inferred from a running collector.

#### Scenario: Correlated sample reaches every required view

- **WHEN** an enrolled producer sends a known log, metric and parent/child trace
- **THEN** the log and spans are queryable with preserved identities, the metric appears in Prometheus, and Kibana displays the trace and its service; MLflow's existing export remains functional

#### Scenario: Unsupported trace pipeline

- **WHEN** the selected collector lacks the required Elastic enrichment components or uses incompatible configuration
- **THEN** conformance fails before production rollout

### Requirement: Provide usable protected operator interfaces

Operators SHALL have documented protected access to Kibana, Prometheus's built-in query UI, Alertmanager and the existing Grafana with a Prometheus datasource. No second Grafana SHALL be introduced. Query access SHALL NOT grant collector administration or cross-tenant application access. Public unauthenticated access and unintended mutating API access SHALL be refused.

#### Scenario: Operator investigates a slow operation

- **WHEN** an authorized operator follows the recorded access instructions
- **THEN** they can inspect a Kibana trace/log and a Grafana metric dashboard, execute an ad-hoc Prometheus query, and inspect the corresponding alert without editing backend credentials

#### Scenario: Public or unauthorized access

- **WHEN** an unauthenticated public client or a query-only identity requests protected or mutating endpoints
- **THEN** the request is refused and no telemetry or administrative action is exposed

### Requirement: Prove signal continuity and alert delivery

Canary acceptance SHALL compare identified input and stored output across each signal, including loss, duplicates, backlog and source freshness. Backend failure SHALL not change application success. Existing alert routes SHALL show both firing and resolved evidence, and an independent dead-man route SHALL detect monitoring loss. Receiver acknowledgement alone SHALL not prove storage or alert delivery.

#### Scenario: Backend stalls after collector acceptance

- **WHEN** Elastic ingest hangs after the collector accepted a canary batch
- **THEN** acceptance exposes missing stored records and the relevant loss/backlog alert; it does not report lossless delivery from an acknowledgement

#### Scenario: Collector or monitoring host disappears

- **WHEN** collector signals stop, or the monitoring stack stops sending its heartbeat
- **THEN** source-absence or independent dead-man detection fires through the configured route and recovery produces resolved evidence

### Requirement: Bound retention and prove recovery

The rollout SHALL declare retention, disk/queue budgets and RPO/RTO targets for logs, traces, metrics and operator configuration. Backups SHALL include retained trace streams and required APM metadata/metrics, not only logs. Consistent metric backup or explicitly accepted metric-history loss SHALL be documented. Acceptance SHALL restore known records into isolated destinations and measure actual recovery; backup job success alone is insufficient.

#### Scenario: Logs restore but traces are absent

- **WHEN** the backup policy omits the canary trace or required APM streams
- **THEN** restore acceptance fails even if a log index restores successfully

#### Scenario: Full retention or failed snapshot

- **WHEN** the trace store reaches its budget or the newest required backup is missing, unreadable, corrupt or stale
- **THEN** the system produces the defined alert and refuses recovery certification without deleting the only retained rollback evidence

### Requirement: Cut over reversibly by signal

Migration SHALL record producer, datasource, alert and storage ownership before changes. A bounded canary and at least one complete backup/alert cycle SHALL pass before broader cutover. Each signal SHALL retain a tested route back to its prior destination during the observation window. Duplicate input during overlap SHALL not silently become doubled canonical metrics or duplicate notifications.

#### Scenario: New trace destination fails during migration

- **WHEN** trace queries or freshness fail during canary while existing Victoria export remains available
- **THEN** the recorded trace rollback is exercised, logs/metrics migration status stays independent, and no Victoria volume is removed

### Requirement: Separate cutover from retirement and HA claims

Victoria retirement SHALL require per-signal acceptance, dashboard/consumer migration, preserved required history and separate authorization. Grafana and MLflow SHALL not be removed as collateral components. A single-node deployment SHALL declare host-loss downtime and recovery limits; production availability SHALL not be inferred from deployment labels.

#### Scenario: Metrics migrated but traces still depend on Victoria

- **WHEN** metric cutover passes while trace acceptance is incomplete
- **THEN** the trace backend remains in service and whole-stack retirement is refused

#### Scenario: One monitoring node is the only storage host

- **WHEN** the rollout uses the existing single monitoring host
- **THEN** its receipt identifies the single failure domain, measured restore time and unproved limits without claiming high availability
