## ADDED Requirements

### Requirement: Durable submission capture

Every committed proposal submission SHALL create exactly one notification obligation in the same SQLite transaction, including inserts by a compatible predecessor API. Failed submissions and idempotent replays SHALL create no additional obligation. Migration SHALL queue existing unerased submissions still in submitted status. Notification state SHALL contain only identifiers, timing and delivery metadata. Erasing contact or brief content SHALL cancel the obligation.

#### Scenario: Crash after proposal commit

- **WHEN** the API exits after committing a proposal before a notification is delivered
- **THEN** a subsequent delivery command finds its obligation in the existing database

#### Scenario: Submission transaction aborts

- **WHEN** a write after the proposal insert aborts its transaction
- **THEN** neither the proposal nor its notification obligation exists

### Requirement: Retriable delivery

A bounded delivery command SHALL lease due obligations atomically, send only the request ID and operator-inbox link to an explicit HTTPS webhook, and persist acceptance only after HTTP success. Network failures, non-success responses and deadlines SHALL preserve obligations with bounded exponential retry delay. Expired leases SHALL recover after a crash; stale workers SHALL NOT acknowledge a newer attempt. Delivery SHALL be at least once.

#### Scenario: Restart after failure

- **WHEN** a webhook fails and the worker exits
- **THEN** a later command retries the same obligation after its retry time and records successful acceptance

#### Scenario: Missing or unsafe configuration

- **WHEN** the database, required HTTPS webhook or canonical production/development app origin is missing or malformed
- **THEN** the command fails before delivery, without creating a database or exposing configuration values

#### Scenario: Erasure before retry

- **WHEN** an undelivered proposal's brief or email is erased
- **THEN** its notification obligation disappears without copying that content elsewhere
