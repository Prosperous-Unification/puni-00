## ADDED Requirements

### Requirement: The Build brief card keeps edits and asks explicitly

The Build `[ YOUR BRIEF ]` card SHALL save a changed, non-blank brief to the draft through
`PATCH /brief` with the draft claim and CSRF when the field loses focus, and SHALL say it is saved
only after the API accepted it; a refused save SHALL say the edit is not saved. The card SHALL
state how the email is used and link the site's privacy page. While a request is in flight the
action SHALL be disabled, and a repeated request SHALL reuse one idempotency key.

#### Scenario: Edited brief survives reload

- **WHEN** a visitor edits the card's brief, leaves the field and reloads Build
- **THEN** the card shows the edited brief

#### Scenario: Refused save

- **WHEN** `PATCH /brief` is refused
- **THEN** the card says `Your edit is not saved yet.` and shows no saved line

#### Scenario: Storage failure on submit

- **WHEN** the store fails while a proposal request is submitted
- **THEN** no submission is stored, the draft stays unconsumed, the visitor sees an error and no
  receipt, and the same key later submits once

#### Scenario: Brief to inbox

- **WHEN** a visitor edits the brief and requests a proposal on the Build card or the manual brief
  at 1440, 768, 390 or 320 px
- **THEN** the operator inbox lists that request exactly once with the edited brief and its line
  breaks
