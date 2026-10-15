## ADDED Requirements

### Requirement: A settings box keeps the focus while its write travels

While a write sent by a Project settings section is in flight, that section's text boxes SHALL
be read-only rather than disabled, the box that sent the write SHALL keep the focus, and the
section's panel SHALL be marked busy. A section SHALL send one write at a time. A control that
was disabled while the write travelled and lost the focus SHALL get it back once the write is over.

#### Scenario: Enter in a band of the ladder

- **WHEN** a reader renames a band and presses Enter while the write is slow
- **THEN** the band keeps the focus and is read-only until the ladder lands, then is editable again

### Requirement: A zone typed while the zone list loads is applied once it lands

The Timezone box SHALL accept typing while the list of zones is read. Leaving the box or Enter
before the list arrives SHALL say that the zone applies once the zones are read, and SHALL apply
it, against the list, once the list lands. A failed list SHALL leave the box and the typed zone
in place beside the failure and its Try again.

#### Scenario: a zone typed before the list arrives

- **WHEN** a reader types `Europe/Kyiv` and presses Enter before the zone list has arrived
- **THEN** the line under the box says it applies once the zones are read, and the zone is saved once they are

### Requirement: The settings modal's revert is not called Undo

The control a Project settings group offers after it lands SHALL be named Put back, SHALL send
the values the landed write replaced, and SHALL say that the toolbar's undo does not reach
project settings. No control in the modal SHALL be named Undo.

#### Scenario: the ladder applied

- **WHEN** a renamed ladder lands
- **THEN** the section offers Put back, and no control in the modal is named Undo

### Requirement: The settings modal's closing lines move nothing above them

The status that a section is saving while the modal waits to close, and the refusal that an
edit holds it open, SHALL be shown at the modal's foot, so neither moves the title or the
section tabs. Below 768px wide the modal SHALL fill the screen.

#### Scenario: closing while the ladder travels

- **WHEN** a reader renames a band, opens Timezone and presses the close control while the ladder travels
- **THEN** the saving status appears and the section tabs stay where they were

### Requirement: Saved plans spell a saved moment once

Saved plans SHALL write a saved plan's moment as day, short month, year and a 24-hour minute
(`14 Oct 2026, 06:41`) in the reader's zone. A plan whose name is the server's default name for
its own moment SHALL show that moment as its name and SHALL NOT repeat it on its meta line; any
other plan SHALL show its name and the moment on its meta line. The save status SHALL name the
saved plan and SHALL NOT repeat the moment.

#### Scenario: an unnamed save beside a named one

- **WHEN** a reader saves once with no name and once named `Before the re-plan`
- **THEN** the first row reads its moment as its name with no second time, the second row reads
  its name over the moment, and the status reads `Saved “Before the re-plan”.`
