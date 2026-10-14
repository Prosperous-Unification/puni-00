## ADDED Requirements

### Requirement: Workers telemetry absence

The platform SHALL alert after ten minutes without host memory metrics from its expected workers cluster and observability namespace.

#### Scenario: Foreign telemetry cannot silence absence

- **WHEN** only a different cluster or namespace reports metrics
- **THEN** PuniWorkersTelemetryMissing fires after ten minutes

#### Scenario: Expected telemetry returns

- **WHEN** the expected workers cluster resumes reporting
- **THEN** the alert clears

### Requirement: Daily snapshot freshness

The platform SHALL validate puni-daily SLM last_success every fifteen minutes, rejecting absent, malformed, future or older-than-26-hour timestamps and request failures. It SHALL alert after thirty-five minutes without a successful validation, including a missing validator CronJob, scoped to its platform cluster and observability namespace.

#### Scenario: Stale or unavailable SLM

- **WHEN** last_success is absent, malformed, future, stale or unreachable
- **THEN** the validator fails and cannot advance its successful-check time

#### Scenario: Validation stops

- **WHEN** no successful check occurs for thirty-five minutes or the CronJob disappears
- **THEN** PuniElasticSnapshotStale fires

#### Scenario: Foreign successful check

- **WHEN** another cluster or namespace has a recent successful check
- **THEN** it cannot silence the expected platform alert

#### Scenario: Snapshot deadline boundary

- **WHEN** the last successful validation or a never-successful validator creation reaches age thirty-five minutes
- **THEN** PuniElasticSnapshotStale fires, while remaining quiet at age thirty-four minutes
