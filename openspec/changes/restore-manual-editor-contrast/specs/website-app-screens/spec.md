## ADDED Requirements

### Requirement: Scoped manual editor uses readable light-surface colors

On the light manual form panel, the scoped-v1 request editor SHALL use existing light palette roles for its brief/reference preview, labels, entered field values, help/error text, links, actions and saved-request receipt. Normal text SHALL reach at least4.5:1 against its actual rendered surface; resting field boundaries and focus indicators SHALL reach at least3:1. The reference SHALL remain visible and wrap within the viewport.

#### Scenario: Edit and review a scoped request manually

- **WHEN** a visitor opens a scoped request on /manual, edits brief and references, and reviews it
- **THEN** labels, entered values, preview and contact controls remain readable on the light surface
- **AND** the request's exact text, references, email, save/submission behavior and keyboard operation remain unchanged

#### Scenario: Read confirmation

- **WHEN** a scoped manual request is saved
- **THEN** the receipt reference and confirmation copy are readable without selecting text
- **AND** the page has no horizontal overflow at1440,768,390 and320px

### Requirement: Dark conversation editor remains unchanged

The shared editor in the dark conversation thread SHALL retain its existing night palette, card treatment and readable controls. The repair SHALL be scoped to the manual light panel.

#### Scenario: Review from the dark thread

- **WHEN** the same scoped editor is opened in the conversation thread
- **THEN** its existing night foreground and surface colors remain unchanged
- **AND** its fields, actions and reference continue to work
