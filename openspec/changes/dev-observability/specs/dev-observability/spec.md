## ADDED Requirements

### Requirement: Reproducible private dev stack

The system SHALL provide a version-pinned dev deployment of OpenTelemetry, Elastic/Kibana, Prometheus and Alertmanager, reusing existing platform configuration and Grafana. Preflight MUST verify target identity, available capacity, required inputs and rollback state before applying. Operator interfaces SHALL be private; tenant application APIs SHALL NOT expose the operator dataset.

#### Scenario: Bounded dev rollout

- **WHEN** an operator applies the validated revision to the declared dev target
- **THEN** each service uses declared CPU, memory, storage retention and log bounds, health checks and persistent state, and all published ports bind loopback or an explicitly authenticated private route

#### Scenario: Unsafe target or incomplete preflight

- **WHEN** the target is production, identity differs, capacity is insufficient, a required input is absent/unreadable, or an API would be publicly unauthenticated
- **THEN** preflight refuses before any runtime mutation and reports the specific missing condition

### Requirement: Queryable three-signal evidence

The system SHALL autonomously collect dev logs and metrics and produce traces from actual dev activity. Every accepted observation MUST preserve environment, service, revision and timestamps; traces MUST preserve trace, span and parent identities. Provider-specific mappings SHALL be isolated from shared observation concepts. Acceptance MUST query stored signals and distinguish application instrumentation from external probe traces.

#### Scenario: Actual dev request

- **WHEN** the bounded dev probe observes a real request against a healthy revision and collection succeeds
- **THEN** its log, measured metric and parent/child trace are queryable with matching service, dev environment, revision and observation identity, and Kibana can display the trace

#### Scenario: Receiver acknowledgement without stored output

- **WHEN** ingestion acknowledges a batch but a required backend query returns no matching signal, a mismatched revision, wrong environment, or incomplete trace structure
- **THEN** acceptance fails and does not report the stack healthy

#### Scenario: Application log collection

- **WHEN** the dev service emits a supported structured log
- **THEN** the collector stores its redacted log in the dev stream without ingesting unrelated production logs or weakening the existing redaction policy

### Requirement: Autonomous observation health

The system SHALL expose independent states for missing, incomplete, stale and complete observations and alert on absent telemetry, exporter errors/backlog and failed collection. A live endpoint or empty metric set MUST NOT establish complete observation. Status SHALL be derived from bounded backend queries with a declared freshness window; probe failure SHALL NOT block the application or merge gate.

#### Scenario: Missing and stale observations

- **WHEN** no observation has ever been found, some required signals are absent, or any required observation exceeds the freshness window
- **THEN** the reported state is respectively missing, incomplete or stale with the affected signals named, and a complete state is not emitted

#### Scenario: Observer stops

- **WHEN** the probe stops publishing or the collector/backend path fails
- **THEN** Prometheus rules detect absence or staleness, Alertmanager records firing state, and recovery records resolved state without sending unapproved external notifications

### Requirement: Bounded recovery and preserved services

Collection SHALL use finite request deadlines, bounded queues/retries and explicit loss/backlog signals. Rollout and rollback MUST preserve existing Victoria history, Grafana dashboards/datasources, MLflow and dev application availability. Fault drills SHALL affect only the newly deployed dev path. Rollback SHALL stop only the new services and restore named integration changes while retaining volumes.

#### Scenario: Backend outage and recovery

- **WHEN** a dev backend is unavailable for a bounded drill and then restored
- **THEN** the probe exits or retries within its deadline, health reports the gap, queue limits hold, queryable evidence resumes, and any lost records remain explicitly accounted for

#### Scenario: Rollback

- **WHEN** the reviewed rollback is invoked
- **THEN** existing services and stored history remain available, no storage is deleted, and failure to restore an integration produces an explicit error

### Requirement: Operator evidence and reviewable delivery

The implementation SHALL include OpenSpec verification evidence, reproducible deployment/rollback commands, backend queries, Grafana metric panels, a Kibana trace workflow, limitations and targeted tests. Each new safety guard MUST have a production-path negative proved by breaking its dependency or removing the guard. The implementation SHALL be delivered as reviewable commits and a PR without an unauthorized final merge or production change.

#### Scenario: Completion audit

- **WHEN** the change is presented as complete
- **THEN** live dev evidence proves all three signals, freshness/failure/recovery and operator views, affected checks pass, and the report distinguishes unverified capabilities from proven behavior
