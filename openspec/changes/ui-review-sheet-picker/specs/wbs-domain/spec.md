## ADDED Requirements

### Requirement: Toasts are drawn above every modal surface

A toast SHALL be drawn above any open modal surface — dialog, sheet, Project
settings or the keyboard shortcuts sheet — so that the point at a toast's centre
hit-tests to the toast. A card opened from a control on a modal surface (a hint
or a fact) SHALL be drawn above that surface and below the toasts. A toast's dismiss control SHALL
answer a tap while a modal surface is open, and dismissing it SHALL leave that
surface open.

#### Scenario: a refused import from the phone's Plan actions sheet

- **WHEN** a reader at 390×844 chooses a file that is not JSON through Import JSON on the Plan actions sheet
- **THEN** the toast `This file is not JSON.` is drawn above the still-open sheet
- **AND** tapping its dismiss control removes the toast and leaves the sheet open

#### Scenario: a toast over Project settings

- **WHEN** an error toast stands while Project settings is open, alone or over the phone's Plan actions sheet
- **THEN** tapping the toast's dismiss control leaves Project settings (and the sheet under it) open

### Requirement: The project list shows every name whole

Each entry in the header's project list SHALL show the project's whole name,
wrapping onto further lines when it is wider than the list, and SHALL NOT cut
the name at the list's edge. The list SHALL stay inside the window and the page
SHALL NOT scroll sideways. Below 768px the list SHALL be the window's width
less its margins, so a name takes at most two lines there. The closed picker
SHALL carry the whole name in its fact card. The open change
`project-dropdown-details` is amended to the same rule (wrap, never clip).

#### Scenario: two imports of one long plan

- **WHEN** a reader with `Twilight Shipyards roadmap 2026 (imported 15 Oct)` and `Twilight Shipyards roadmap 2026 (imported 15 Oct, 2)` opens the project list at 1440, 1024 or 375px
- **THEN** both names are drawn whole, dates included, on at most two lines, and the list ends inside the window

### Requirement: Picker names stay readable without widening a sheet

A picker on a bottom sheet SHALL show each option's whole name, wrapping it
inside the list without clipping or requiring hover. On a modal surface the
list SHALL be no wider than its box, and moving the active line SHALL NOT
scroll the surface sideways. Compact lists outside bottom sheets MAY truncate
with an ellipsis and carry their whole words in a fact card. On phone surfaces
picker rows SHALL have at least 12px of padding above and below their words and
be at least 44px tall.

#### Scenario: twenty-five long tags on a phone

- **WHEN** a reader at 390×844 taps a card's Tags search with 25 tags whose names exceed the sheet width and walks the list with arrow keys
- **THEN** the sheet's horizontal scroll stays at 0 and the list fits inside it without horizontal panning
- **AND** every long name wraps visibly inside its option with at least 12px padding above and below
- **AND** a mouse resting on the active line opens its fact card drawn above the sheet

#### Scenario: an active priority option at the table edge

- **WHEN** a reader opens a priority picker beside the bottom edge of the scrolling table
- **THEN** native active-option scrolling exposes the option inside the table viewport
