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

### Requirement: Picker lines end in an ellipsis and never widen a sheet

Every line of a picker's option list SHALL be one line that ends in an ellipsis
where it is cut, and SHALL carry its whole words in its fact card. On a modal
surface the list SHALL be no wider than its box, and moving the active line
SHALL NOT scroll the surface sideways. On the phone's surfaces each line SHALL
be at least 44px tall.

#### Scenario: twenty-five long tags on a phone

- **WHEN** a reader at 390×844 opens a card's Tags sheet with 25 tags whose names are wider than the sheet and walks the list with the arrow keys
- **THEN** the sheet's horizontal scroll stays at 0, the list ends inside the sheet, and every cut line ends in an ellipsis and carries its whole name
- **AND** a mouse resting on a cut line opens its fact card drawn above the sheet
