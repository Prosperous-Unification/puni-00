## ADDED Requirements

### Requirement: A phone's cards offer the table's own row actions

The mobile card renderer SHALL offer, per card, the same row actions the
desktop table's `ActionsMenu` offers — Duplicate, Unfreeze (frozen rows only)
and Delete — behind the same ⋯ control, in the table's own words and with the
table's own refusal behaviour, rather than a second vocabulary.

#### Scenario: a card offers Duplicate and Delete on a row that is not frozen

- **GIVEN** a work item that is not frozen
- **WHEN** its card's ⋯ menu is opened on a phone
- **THEN** the menu SHALL offer Duplicate and Delete, and no Unfreeze item

#### Scenario: a card offers Unfreeze and refuses Delete on a frozen row

- **GIVEN** a work item that is frozen
- **WHEN** its card's ⋯ menu is opened on a phone
- **THEN** the menu SHALL offer Duplicate, Unfreeze and Delete
- **AND** Delete SHALL be shown refused, carrying the table's own sentence
  (`Frozen — unfreeze this row before deleting it`), and taking it SHALL do
  nothing

#### Scenario: a card offers no per-row Freeze item

- **GIVEN** any work item, frozen or not
- **WHEN** its card's ⋯ menu is opened on a phone
- **THEN** the menu SHALL NOT offer a Freeze item, matching the desktop table,
  where freezing numbering is a plan-level toolbar action and not a per-row one

#### Scenario: at most one card's menu is open at a time

- **GIVEN** two cards on screen
- **WHEN** one card's ⋯ menu is opened and then another card's is
- **THEN** the first card's menu SHALL close

#### Scenario: the ⋯ control is a 44px tap target

- **GIVEN** a card's ⋯ control on a phone
- **WHEN** it is measured
- **THEN** it SHALL be at least 44px on each side
