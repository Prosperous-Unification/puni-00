## ADDED Requirements

### Requirement: Independent organization runtime authority survives composition

The backend SHALL preserve DNS resolver/scheduling configuration and the parsed
verification-only SMTP mode simultaneously in production and development boot.
Missing SMTP configuration SHALL remain disabled independently of DNS settings.
Invitation and join approval SHALL retain refusing delivery even with SMTP enabled.

#### Scenario: Both authorities are configured

- **WHEN** boot receives explicit authoritative DNS and SMTP configuration
- **THEN** it starts the retained-proof scheduler and binds verification SMTP
- **AND** a controlled failed proof lookup updates the retained claim as specified
- **AND** a verification submission receives final acceptance through the configured relay

### Requirement: Scheduler lifecycle survives SMTP integration

The backend SHALL preserve the shared supervisor, latched background failure,
non-overlapping bounded proof sweeps and abort/join-before-storage-close order.
It SHALL NOT restore an earlier direct process signal handler.

#### Scenario: Composed process stops

- **WHEN** shutdown occurs after configured proof work
- **THEN** proof resources stop through the existing shared lifecycle
- **AND** listener disposal remains idempotent and failures remain observable
