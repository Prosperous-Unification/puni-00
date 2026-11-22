## ADDED Requirements

### Requirement: Dedicated development measurement identity

The website MUST select `G-1FGH62F56G` for enabled analytics on the two canonical development origins. The production analytics configuration MUST refuse both development stream identities.

#### Scenario: Dev property receives eligible development activity

- **WHEN** analytics is enabled on `dev.puni.dev` or `dev.request.puni.dev` using `G-1FGH62F56G`
- **THEN** the existing consent-aware loader MUST select that measurement identity

#### Scenario: Retired or crossed identities are refused

- **WHEN** an enabled development configuration uses `G-R0JM3R4SSV` or an enabled production configuration uses either development measurement identity
- **THEN** the runtime MUST refuse analytics initialization

### Requirement: Canonical development form destinations

When the dedicated dev stream enables Enhanced measurement, public request and conversation forms MUST expose their canonical API destinations without copying the visitor URL. The analytics loader MUST keep global privacy controls at their existing scope.

#### Scenario: Measured form has a canonical destination

- **WHEN** a visitor interacts with a public form from a page with query or fragment components
- **THEN** the form destination MUST be the fixed API route
- **AND** the existing credentialed JavaScript submission MUST remain functional

#### Scenario: Google stream configuration omits global controls

- **WHEN** the loader initializes or reinitializes the developer stream
- **THEN** global privacy controls MUST remain set and MUST be absent from per-stream event configuration
