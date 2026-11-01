## ADDED Requirements

### Requirement: Initial request loading feedback

The app SHALL render a small visible status reading “Opening your request…” before application JavaScript downloads, using the existing night palette and Geist fallback. React mounting SHALL replace this shell. A noscript explanation SHALL state that JavaScript is required and offer contact. The initial spinner SHALL remain still when reduced motion is requested.

#### Scenario: Application JavaScript is held

- **WHEN** the document arrives while application JavaScript is held
- **THEN** the status and spinner are visible without another application request

#### Scenario: Reduced motion

- **WHEN** reduced motion is requested before the document loads
- **THEN** the initial spinner has no animation

#### Scenario: JavaScript unavailable

- **WHEN** JavaScript is disabled
- **THEN** the visitor sees an honest explanation and a contact route instead of indefinite loading feedback

### Requirement: Compact utility footer

The app SHALL show a compact PUNI wordmark with its existing dot, copyright and four useful links grouped under Explore and Get in touch. It SHALL omit the promotional lead, call-to-action button, oversized wordmark and closing slogan.

#### Scenario: Request page footer

- **WHEN** the visitor reaches the footer
- **THEN** Services and Blog appear under Explore, and Start a Request and Privacy appear under Get in touch
