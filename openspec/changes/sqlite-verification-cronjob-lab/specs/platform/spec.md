## ADDED Requirements

### Requirement: Disposable rehearsal executes the shipped SQLite verification CronJob

The backup lab SHALL create verification Jobs from the release-rendered `wbs-solver/sqlite-backup-verify` CronJob and SHALL use the production runner, backend image and trusted admission policy.

#### Scenario: Scheduled backup cannot race the known snapshot proof

- **GIVEN** a rendered release overlay for the disposable backup lab
- **WHEN** the lab prepares its initial apply
- **THEN** every CronJob has `spec.suspend: true`, both shipped Job templates are preserved for manual runs, and verification still requires the manually captured object key, digest and complete migration set

#### Scenario: Known migrated backup verifies

- **GIVEN** the lab has backed up a migrated database containing its known project
- **WHEN** it starts a Job from the shipped verification CronJob
- **THEN** the Job succeeds and its report matches the snapshot digest and applied migration names and hashes

#### Scenario: Backup state is absent or corrupt

- **GIVEN** an isolated prefix has no report, damaged snapshot bytes, or a report claiming a different migration set
- **WHEN** a Job from the shipped verification CronJob verifies that prefix
- **THEN** the Job fails and names the corresponding missing report, byte mismatch, or migration mismatch

#### Scenario: Verification image is unapproved

- **GIVEN** a Pod derived from the shipped verification CronJob uses the prior Bun backup image
- **WHEN** the disposable API evaluates the Pod
- **THEN** the trusted workload policy denies its backend image identity

### Requirement: Verification rehearsal retains explicit limits

The lab evidence SHALL distinguish disposable Kubernetes verification from real-host maintenance and cloud storage recovery.

#### Scenario: Disposable verification passes

- **GIVEN** the local verification cases pass
- **WHEN** evidence is recorded
- **THEN** it does not claim real-host maintenance, production rollout, cloud CSI, or complete F10 acceptance
