## MODIFIED Requirements

### Requirement: A project entry's card opens beside the list it is read against

The system SHALL place an entry's hover card outside the horizontal bounds of
the option list, so that every other option stays visible while a card is open.

The card SHALL be placed at the list's right edge, at the vertical position of
the option it describes. Where the viewport has no room for the card's width to
the right of the list, the card SHALL be placed at the list's left edge instead.
Where neither side has room, the card SHALL NOT be shown.

The card SHALL follow the pointer between options vertically and SHALL NOT move
horizontally while the same list is open.

#### Scenario: a card does not cover the options it is being compared against

- **GIVEN** a picker listing three projects, open, with room to its right
- **WHEN** the pointer rests on the second option
- **THEN** the card's left edge SHALL be at or beyond the list's right edge
- **AND** the first and third options SHALL each be fully visible

#### Scenario: a window with no room on the right flips the card to the left

- **GIVEN** an open picker whose list's right edge is within a card's width of
  the viewport's right edge
- **WHEN** the pointer rests on an option
- **THEN** the card's right edge SHALL be at or before the list's left edge

#### Scenario: moving between options moves the card only vertically

- **GIVEN** an open picker with a card showing for the first option
- **WHEN** the pointer moves to the third option
- **THEN** the card's horizontal position SHALL be unchanged
- **AND** the card SHALL describe the third project

### Requirement: Choosing a project leaves the picker at rest, not in a field

The system SHALL, on choosing a project from the picker, close the list, show
the chosen project's name as the picker's label, and leave no text caret in it.

The picker SHALL remain a combobox: focusing it SHALL re-open the list and
SHALL accept typing as a search. A pointer click on the closed picker SHALL NOT
place a caret inside the project's name.

Choosing a project SHALL NOT arm a rename. A rename SHALL be armed only by the
rename control.

#### Scenario: a pick leaves no caret in the name

- **GIVEN** a picker with its list open
- **WHEN** an option is chosen
- **THEN** the list SHALL be closed and the picker SHALL read the chosen name
- **AND** the picker SHALL NOT hold the keyboard focus
- **AND** no rename SHALL be in progress

#### Scenario: the picker still searches after a pick

- **GIVEN** a picker at rest showing a chosen project
- **WHEN** it is focused and text is typed
- **THEN** the list SHALL be open and narrowed by what was typed
- **AND** the typed text SHALL be what the picker shows

### Requirement: A new project opens with its name ready to be typed

The system SHALL, on creating a project, select it, record it as opened, and
arm a rename on it with the caret in the name field and the placeholder name
selected, so that the first keystroke replaces it.

The rename SHALL be armed only after the created project is present in the
list. Abandoning the rename SHALL leave the project created under its
placeholder name; nothing SHALL be rolled back.

A rename armed for a different project before the create SHALL be discarded
rather than carried onto the new one.

#### Scenario: creating a project puts the caret in its name

- **WHEN** a project is created
- **THEN** a rename SHALL be in progress for the created project
- **AND** the name field SHALL hold the keyboard focus
- **AND** its whole value SHALL be selected

#### Scenario: a draft armed for another project does not follow the create

- **GIVEN** a rename armed on an existing project with unsaved typing in it
- **WHEN** a new project is created
- **THEN** the rename in progress SHALL be for the new project
- **AND** the typed draft SHALL NOT appear in it
- **AND** the existing project's name SHALL be unchanged

#### Scenario: abandoning the new project's rename keeps the project

- **GIVEN** a project just created with its rename armed
- **WHEN** the rename is abandoned
- **THEN** the project SHALL still exist and SHALL be the selected one
