## ADDED Requirements

### Requirement: SS and FF writes require compatible rollout and rollback

SS/FF writes SHALL remain disabled until every serving reader understands SS/FF. A code rollback to an FS-only binary SHALL be refused while any SS/FF row exists, with a manual completion command or explicit lossless conversion procedure. This code guard SHALL operate through the production swap path independently of migration rollback checks.

#### Scenario: An incompatible rollback is refused

- **GIVEN** a stored FF relationship
- **WHEN** the production swap attempts to return to an FS-only binary
- **THEN** the swap refuses before serving that binary and reports the recovery action

#### Scenario: Compatible rollout enables writes

- **GIVEN** every serving reader accepts SS and FF
- **WHEN** the write gate is enabled
- **THEN** new SS/FF relationships may be stored
