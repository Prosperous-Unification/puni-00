## ADDED Requirements

### Requirement: The table says what its keyboard does

The table SHALL offer a cheat sheet listing every key binding it has, grouped
by where the binding applies. The sheet SHALL be opened by `?` pressed while
the keystroke is not going into a text box, and by a toolbar control for
readers who have not been told about `?`. A `?` typed into any input, textarea
or editable element SHALL remain a question mark.

The sheet SHALL be a modal dialog: labelled, marked `aria-modal`, closable by
Escape, by its own close control, and by clicking away from it. Opening it
SHALL move the focus into the dialog; closing it SHALL return the focus to the
element that held it when the sheet opened.

`Alt` SHALL be shown as `⌥` where the browser reports a Mac, as `Alt` where it
reports something else, and as `⌥/Alt` where it reports neither.

#### Scenario: opening the sheet from the table

- **WHEN** `?` is pressed with the keystroke landing outside any text box
- **THEN** a labelled modal dialog listing the key bindings is shown

#### Scenario: a question mark typed into a name

- **GIVEN** the focus is in a work item's Name cell
- **WHEN** `?` is pressed
- **THEN** no dialog opens and the keystroke is left to the browser

#### Scenario: closing it puts the focus back

- **GIVEN** the sheet was opened from the toolbar control
- **WHEN** Escape is pressed
- **THEN** the sheet closes and the focus is back on the control that opened it

#### Scenario: clicking away

- **WHEN** the area outside the dialog is clicked
- **THEN** the sheet closes

### Requirement: The cheat sheet is derived from a binding registry

The bindings SHALL be held as one exported registry of `{keys, does, where}`
entries, rendered by the sheet and re-stated nowhere else. Every registry entry
SHALL name at least one behaviour test that proves it, and a test SHALL read
the behaviour test file and fail when a named test is absent from it, when a
registry entry names no test, or when a named test belongs to no entry.

#### Scenario: a renamed behaviour test

- **GIVEN** a registry entry naming the test that proves its binding
- **WHEN** that test is renamed or deleted
- **THEN** the cross-check fails, naming the entry and the missing test

#### Scenario: a binding added without proof

- **WHEN** an entry is added to the registry and no test is named for it
- **THEN** the cross-check fails
