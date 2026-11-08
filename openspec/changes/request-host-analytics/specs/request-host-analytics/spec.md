## ADDED Requirements

### Requirement: Exact environment-specific analytics hosts

Enabled development analytics SHALL approve exactly dev.puni.dev and dev.request.puni.dev. Enabled production analytics SHALL approve exactly puni.dev and request.puni.dev. Cookie scope SHALL remain puni.dev with separate development and production preferences and measurement identities. Existing consent, query sanitization and route admission SHALL remain unchanged.

#### Scenario: Canonical request hosts initialize analytics

- **WHEN** correctly configured analytics initializes on its environment's site or request host
- **THEN** configuration succeeds and registered request routes produce sanitized page locations

#### Scenario: Legacy and unapproved hosts refuse measurement

- **WHEN** enabled analytics initializes or resolves a page on a legacy app host, crossed-environment host or unknown host
- **THEN** the host guard throws before vendor initialization or measurement

#### Scenario: Shared consent remains isolated by environment

- **WHEN** a visitor accepts on the development site and opens the development request host
- **THEN** the request host reads the same development preference while production remains ungranted
