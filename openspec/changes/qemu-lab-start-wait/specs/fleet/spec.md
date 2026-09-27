## ADDED Requirements

### Requirement: QEMU lab start waits a bounded time for its owned process

After QEMU's daemonizing start exits zero, the rootless QEMU lab provider SHALL poll for a process that owns the machine's pid file and name until a finite deadline. It SHALL fail when the deadline passes without one, and SHALL fail at once on a malformed or unreadable pid file.

#### Scenario: The daemon writes its pid after the start command returns

- **GIVEN** the start command exits zero before the machine's owned process is visible
- **WHEN** the owned process appears before the deadline
- **THEN** the start succeeds

#### Scenario: No owned process appears

- **GIVEN** the start command exits zero and no pid file appears, or the pid file names a process that is not this machine
- **WHEN** the deadline passes
- **THEN** the start fails naming the machine and the deadline

#### Scenario: The pid file is malformed

- **GIVEN** the start command writes a pid file that is not a process id
- **WHEN** the provider reads it
- **THEN** the start fails at once as a malformed pid file without waiting out the deadline
