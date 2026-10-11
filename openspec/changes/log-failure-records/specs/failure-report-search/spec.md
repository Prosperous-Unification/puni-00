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

### Requirement: An Elasticsearch outage loses no failure line

A failure line written while Elasticsearch is unavailable for 60 seconds SHALL be stored once Elasticsearch returns.

#### Scenario: Elasticsearch stops for 60 seconds

- **GIVEN** a WBS service writing failure lines continuously
- **WHEN** Elasticsearch is unavailable for 60 seconds and then returns
- **THEN** every line written is stored exactly once
