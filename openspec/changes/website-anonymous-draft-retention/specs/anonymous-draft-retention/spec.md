## ADDED Requirements

### Requirement: Eligible anonymous drafts

Cleanup SHALL select only drafts whose expiry is at or before the inspected cutoff, whose consumed time is absent, and which have no association in proposal submissions, software requests, legacy account requests or submission replay. Every other row SHALL remain unchanged.

#### Scenario: Mixed cohort

- **WHEN** cleanup inspects a database containing expired unlinked drafts, unexpired drafts, consumed drafts and each kind of associated draft
- **THEN** only expired unlinked drafts are eligible, including a draft expiring exactly at the cutoff

### Requirement: Read-only inspection

The operator SHALL be able to inspect an existing supported database without creating a database, migrating it, changing request authority or running API startup recovery. The report SHALL contain a cutoff, eligible count and opaque fingerprint bound to the database and eligible cohort. It SHALL omit raw identifiers, descriptions, briefs, claims, contact details and cookies.

#### Scenario: Inspection beside an active conversation

- **WHEN** an operator inspects the database while a chat operation is in flight
- **THEN** its state and reservation remain unchanged and the inspection publishes only the aggregate report

### Requirement: Explicit atomic application

Cleanup SHALL require an explicit apply operation with the inspected cutoff and fingerprint. It SHALL validate the database and recompute eligibility under a write transaction before deleting. A changed cohort, different database, future cutoff, invalid fingerprint, unsupported state or failed delete SHALL leave all rows unchanged and produce a nonzero command exit. Cleanup SHALL delete only the inspected eligible cohort and report the deleted count after commit.

#### Scenario: Unchanged plan

- **WHEN** the operator applies a valid plan to its unchanged supported database
- **THEN** all eligible drafts are removed atomically and protected records remain readable

#### Scenario: Changed association

- **WHEN** a candidate becomes associated with a request between inspection and application
- **THEN** applying the prior plan refuses without deleting any draft

#### Scenario: Failure during deletion

- **WHEN** an injected database fault interrupts deletion
- **THEN** the transaction rolls back and every candidate remains

### Requirement: Trusted database boundary

Inspection and application SHALL reject absent, unreadable, malformed and unsupported databases, including an unexpected or edited applied migration and incompatible schema. They SHALL never initialize or repair the selected file. The public API SHALL gain no network cleanup endpoint.

#### Scenario: Missing database

- **WHEN** inspection or application selects a missing database path
- **THEN** the command fails without creating the database or parent directory

#### Scenario: Unknown schema

- **WHEN** the selected database has an unsupported migration or lacks a required association table
- **THEN** inspection and application fail before any deletion

### Requirement: Verifiable operator command

The API build SHALL include the operator command and required migration inputs. Command input SHALL be validated at its boundary; unknown commands and malformed arguments SHALL fail explicitly. The operating instructions SHALL distinguish active-database cleanup from backup deletion and the outstanding 12-month/client policy. Deployment SHALL keep scheduled/live deletion disabled for this slice.

#### Scenario: Built command

- **WHEN** the built command inspects a disposable supported database
- **THEN** it returns the same aggregate plan contract as the source command without contacting any provider or identity service
