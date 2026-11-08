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

### Requirement: Authorized infrastructure alert recipient survives deployment

Normal dev configuration rendering SHALL preserve the authorized punispace #puni-alerts Slack destination and recovery notifications using only the existing persistent secret-file reference. It MUST refuse local-only fallback, inline webhook values, extra recipients and unapproved route or HTTP-transport overrides. Deployment MUST separately verify that the expected protected secret is readable and valid; configuration-check success alone SHALL NOT establish notification readiness.

#### Scenario: Readiness output excludes verifier return values

- **WHEN** protected-secret readiness is checked for a runtime snapshot
- **THEN** the verifier is invoked before successful output, only the fixed verified marker is serialized regardless of its return value, and a verification exception prevents successful output

#### Scenario: Configuration is regenerated

- **WHEN** the normal dev configuration is rendered for another deployment
- **THEN** it retains slack-puni and #puni-alerts with recovery notifications, reuses the persistent secret reference and emits no webhook value

#### Scenario: Notification material or destination is unverified

- **WHEN** the destination is changed, external transports are added, or the required protected secret is missing, unreadable or malformed
- **THEN** rendering or deployment respectively refuses and cannot report notification readiness

#### Scenario: Actual mounted notification release is unverified

- **WHEN** the inspected Alertmanager config is writable, outside its owned versioned release, or its fixed manifest/config/overlay files are missing, unreadable, linked, malformed, oversized or differ from trusted rendering
- **THEN** runtime preflight refuses even when host-supplied manifest and file hashes agree, while the prior immutable release inventories remain required

#### Scenario: Existing receiver moves to versioned ownership

- **WHEN** the authorized receiver is adopted through a reviewed, gated release and Alertmanager is recreated
- **THEN** its existing persistent volume and protected secret are retained, the actual mounted config and loaded policy verify, original release manifests remain unchanged, the old config is restored only after it is unmounted, and firing/recovery delivery survives a further recreation

### Requirement: Mounted configuration content matches its verified release

Runtime preflight SHALL measure configuration content through the captured running container identity. It MUST refuse absent, failed, malformed, ambiguous or disagreeing fixed-path measurements; trusted host pathname bytes alone SHALL NOT establish mounted content.

#### Scenario: Host config pathname is replaced while a predecessor remains mounted

- **WHEN** the verified host release pathname contains trusted replacement bytes but the configuration measured through the captured container identity differs, or that bounded fixed-path observation is unavailable or invalid
- **THEN** runtime preflight refuses without emitting configuration contents, while all existing host-release file and ownership checks remain required
