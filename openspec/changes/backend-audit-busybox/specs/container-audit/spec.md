## ADDED Requirements

### Requirement: Backend audit shell is explicit and immutable

The backend runtime SHALL ship static BusyBox from a pinned official image digest. Namespace supervisor and scanner SHALL execute via `/bin/busybox sh` with existing receipts and deadline/reaping semantics.

#### Scenario: Debian backend admission

- **WHEN** the initialized Debian backend contains the pinned executable
- **THEN** production namespace admission succeeds with complete cleanup

#### Scenario: Missing executable or restored dash

- **WHEN** the executable is absent or audit invocation uses Debian dash
- **THEN** production admission refuses

#### Scenario: Stalled descendant

- **WHEN** a scanner launches a descendant and stalls
- **THEN** the bounded supervisor ends the audit and its initialized process group is reaped
