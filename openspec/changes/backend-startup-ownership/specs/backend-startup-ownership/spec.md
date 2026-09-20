## ADDED Requirements

### Requirement: Boot resolves only when its configured startup actions have finished

`bootBe01` SHALL resolve only after every startup action its configuration asks for has finished: the listener is accepting, the configured schema step has run, the fixed local identity exists where one was requested, and the optimizer is started when configured. An unhealthy schema SHALL remain a served health state and not a startup failure; a failed required startup write SHALL reject boot.

#### Scenario: Configured startup actions finish before resolution

- **WHEN** `bootBe01` resolves
- **THEN** the process is listening on its port, the configured schema step has run, the fixed local identity exists where one was requested, and the optimizer is started when configured

#### Scenario: An unhealthy schema remains a served health state

- **WHEN** the schema is unhealthy but every other configured startup action succeeds
- **THEN** boot resolves and `/health` answers 503 with the schema's own status word exactly as it does today

#### Scenario: A required startup write fails

- **WHEN** a migration or fixed-identity write fails
- **THEN** boot rejects instead of reporting a completed start

### Requirement: A failure during startup releases what startup acquired

When any startup action fails, `bootBe01` SHALL reject with the original failure reachable through the cause chain and SHALL release every resource it had acquired by then, each exactly once, and nothing it did not acquire.

#### Scenario: The source cannot be opened

- **WHEN** opening the source fails
- **THEN** boot rejects and leaves no listener of its own

#### Scenario: Startup fails after opening the source

- **WHEN** service composition fails, an exclusive listener already holds the configured port, or a step after the listener fails
- **THEN** boot rejects with the original failure reachable through the cause chain and closes the source exactly once

#### Scenario: Startup fails after acquiring the listener

- **WHEN** boot acquired a listener before a later startup action fails
- **THEN** that listener stops accepting while any listener boot never owned remains active

### Requirement: Shutdown releases in the reverse of the start order

`stop()` SHALL release resources in the declared shutdown order: listener, optimizer, retention timer, source. Repeated calls SHALL replay the first close's outcome without invoking any disposer again.

#### Scenario: The process stops normally

- **WHEN** `stop()` is called
- **THEN** the listener stops accepting before the source closes, and both the optimizer and retention timer are stopped by the time the source closes

#### Scenario: The process is stopped twice

- **WHEN** `stop()` is called after a previous call has settled
- **THEN** the second call replays the previous success or cleanup failure without releasing any resource twice

### Requirement: A refused release is reported and the rest is still released

When a resource's disposer rejects during `stop()`, `stop()` SHALL still attempt every other release and SHALL then reject with a cleanup failure naming the resource and carrying its error.

#### Scenario: One disposer rejects

- **WHEN** a resource disposer rejects during `stop()`
- **THEN** `stop()` rejects with a cleanup failure that names the resource and carries its error after every other release has been attempted

### Requirement: The retention timer belongs to the process lifecycle

The retention timer SHALL be started by boot and stopped by `stop()`, like every other resource boot owns.

#### Scenario: The process starts and stops the timer

- **WHEN** boot resolves
- **THEN** the retention timer is running
- **WHEN** `stop()` resolves
- **THEN** the retention timer is no longer running
