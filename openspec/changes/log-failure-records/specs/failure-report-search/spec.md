## ADDED Requirements

### Requirement: A failure line is searchable by fingerprint and occurrence

When a WBS service writes a failure line, the stored log document SHALL carry the report's fingerprint, occurrence identifier and report version as keyword attributes beside the service and level, and SHALL keep the whole line as its body.

#### Scenario: A failure line with a fingerprint arrives

- **GIVEN** a WBS service logs a failure whose report carries a fingerprint
- **WHEN** the line reaches Elasticsearch
- **THEN** the document carries `failure.fingerprint`, `failure.occurrence_id` and `failure.v` as keyword attributes
- **AND** its body is the unchanged line

#### Scenario: A plain line arrives

- **GIVEN** a pod writes a line that is not a JSON object
- **WHEN** the line reaches Elasticsearch
- **THEN** the document's body is the line and no failure attribute is set

### Requirement: Lifting never loses or invents a line

A line SHALL ship whether or not its body parses, and a field SHALL be lifted only when its value has the shape the log schema declares; a malformed value SHALL stay in the body and SHALL NOT be replaced by a default. JSON from a workload that is not a WBS service SHALL lift nothing.

#### Scenario: A body that does not parse

- **GIVEN** a pod writes `{` alone
- **WHEN** the line reaches Elasticsearch
- **THEN** the document's body is `{` and no attribute was lifted

#### Scenario: A malformed level

- **GIVEN** a WBS line whose level is not one of the schema's level labels
- **WHEN** the line reaches Elasticsearch
- **THEN** the document has no `level` attribute and its body carries the original level

#### Scenario: A failure without a fingerprint

- **GIVEN** a failure line whose report carries no fingerprint
- **WHEN** failures are grouped by fingerprint
- **THEN** the line forms no group

#### Scenario: Foreign JSON

- **GIVEN** a JSON line whose `service` is not a WBS service
- **WHEN** the line reaches Elasticsearch
- **THEN** no attribute was lifted from it

#### Scenario: An oversize line

- **GIVEN** a failure line larger than the container runtime's 16 KiB line chunk
- **WHEN** the line reaches Elasticsearch
- **THEN** it is one document carrying its fingerprint

### Requirement: Failures are grouped by fingerprint in Kibana

The platform SHALL provide a Kibana dashboard over the last 7 days that shows one row per fingerprint with its occurrence count and its latest occurrence, imported by a Job that fails unless Kibana accepts every object.

#### Scenario: Repeated failures of one kind

- **GIVEN** three failures with one fingerprint and one failure with another
- **WHEN** the dashboard is opened
- **THEN** it shows two rows, and the first fingerprint's row counts 3 and names its latest occurrence

#### Scenario: Kibana refuses the objects

- **GIVEN** an objects file that Kibana rejects, as malformed NDJSON or as an object it cannot import
- **WHEN** the import Job runs
- **THEN** the Job's pod exits non-zero

### Requirement: Loss during an Elasticsearch outage is bounded and counted

While Elasticsearch refuses connections, failure lines SHALL wait in the collector's persistent sending queue and SHALL all be stored once it returns, until that queue's 5000 requests fill. A request whose connection hangs SHALL be abandoned when the exporter's 90 second request timeout or an earlier dial timeout expires; its batch is then dropped without retry, and the dropped records SHALL be counted in `otelcol_exporter_send_failed_log_records`. Every drop SHALL raise the `PuniLogRecordsDropped` alert in Alertmanager, including the first drop after the collector starts, and an outage that drops nothing SHALL NOT raise it. A full queue SHALL stop intake rather than drop, and SHALL raise `PuniLogQueueFull` while it stays full. Making the hanging case lossless is open (task 2.6).

#### Scenario: Elasticsearch refuses connections

- **GIVEN** a service writing failure lines continuously
- **WHEN** Elasticsearch refuses connections and returns before the persistent queue fills
- **THEN** every line written is stored exactly once
- **AND** `PuniLogRecordsDropped` does not fire

#### Scenario: A connection to Elasticsearch hangs

- **GIVEN** an export request whose connection to Elasticsearch hangs
- **WHEN** 90 seconds pass without an answer, or a new connection's dial times out first
- **THEN** that request's batch is dropped and not retried
- **AND** `otelcol_exporter_send_failed_log_records` grows by the batch's record count
- **AND** `PuniLogRecordsDropped` fires for that collector pod and reaches Alertmanager

#### Scenario: The first drop after the collector starts

- **GIVEN** a collector that has dropped nothing since it started, so its drop counters do not exist yet
- **WHEN** a batch is dropped and the counter appears already incremented
- **THEN** `PuniLogRecordsDropped` fires

#### Scenario: The persistent queue is full

- **GIVEN** a collector whose persistent queue is at capacity
- **WHEN** a minute passes without the queue draining
- **THEN** `PuniLogQueueFull` fires
- **AND** the queue does not drop queued records to make room
