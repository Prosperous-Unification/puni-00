## ADDED Requirements

### Requirement: Dedicated development measurement identity

The website MUST select `G-1FGH62F56G` for enabled analytics on the two canonical development origins. The production analytics configuration MUST refuse both development stream identities.

#### Scenario: Dev property receives eligible development activity

- **WHEN** analytics is enabled on `dev.puni.dev` or `dev.request.puni.dev` using `G-1FGH62F56G`
- **THEN** the existing consent-aware loader MUST select that measurement identity

#### Scenario: Retired or crossed identities are refused

- **WHEN** an enabled development configuration uses `G-R0JM3R4SSV` or an enabled production configuration uses either development measurement identity
- **THEN** the runtime MUST refuse analytics initialization
