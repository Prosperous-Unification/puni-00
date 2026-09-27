## ADDED Requirements

### Requirement: Consistent PUNI presentation

The website continuation app SHALL use PUNI's dark spectral and neutral white palette, warm gold controls, Inter Tight headings, Geist body text and clean PUNI wordmark across manual brief, studio and operator routes. It SHALL use redistributable self-hosted fonts with their license texts and SHALL not include licensed Novaform theme files or demo media.

#### Scenario: Visitor continues a request

- **WHEN** a visitor arrives at `/manual` from the PUNI site at desktop or mobile width
- **THEN** the brand, headings, buttons, form and status states use the PUNI presentation while preserving their labels and actions

#### Scenario: Other app routes

- **WHEN** a visitor opens `/studio` or an operator opens `/operator`
- **THEN** the same palette, typography and wordmark apply to conversation, concept preview and inbox states without clipped content or horizontal overflow

### Requirement: Visual state clarity

Focus, hover, selected, disabled, loading and error states SHALL remain distinguishable with readable contrast after the visual change.

#### Scenario: Keyboard and error state

- **WHEN** a user tabs through a form or an API request fails
- **THEN** the focused control and error message remain visible and readable
