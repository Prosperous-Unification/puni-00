## ADDED Requirements

### Requirement: An unset start day reads in the app's words

While a project has no start day, the plan toolbar's Starts field SHALL show `No start
date` in placeholder ink over the native date field while the field does not hold the
focus, and SHALL NOT show the platform's own empty-date pattern. A click on the words
SHALL focus the native field, which SHALL accept a typed day.

#### Scenario: the start day is cleared

- **WHEN** a reader clears the start day and leaves the field
- **THEN** the field reads `No start date` and no `mm/dd/yyyy` is visible

### Requirement: Every project settings section applies as its field is left

No section of the Project settings modal SHALL offer its own Save, Cancel or Done. A
field SHALL apply when it loses the focus or on Enter, and Escape in a field SHALL put
that field back. The priority ladder and the PERT weights SHALL each be sent as one
request when the focus leaves the group or Enter is pressed in it, never as the focus
moves between their boxes, and once one lands the section SHALL offer Undo, which sends
the values it replaced. The close control, a click outside and Escape outside a field
SHALL close the modal; while a write is in flight the close SHALL be refused and SHALL
then happen once nothing is held, and a refused write SHALL keep the modal open with its
sentence.

#### Scenario: a capacity typed and the close control pressed

- **WHEN** a reader types a capacity and presses the close control
- **THEN** the capacity is sent, and the modal closes once it lands

#### Scenario: the ladder applied and undone

- **WHEN** a reader renames a band, leaves the ladder, and presses Undo
- **THEN** the renamed ladder is sent once, and Undo sends the ladder it replaced

### Requirement: The Saved plans popover reads like the Views panel

The Saved plans popover SHALL show a name field and the primary Save on one line, the
line `No plans saved yet.` in the Views panel's empty-state ink while nothing is saved,
and one row per saved plan with Compare and a delete that asks for confirmation. Save
with an empty name SHALL leave the name to the server. The popover SHALL share the Views
panel's background, border, radius, padding and shadow.

#### Scenario: a named plan saved and deleted

- **WHEN** a reader types a name, presses Save, then deletes the row and confirms
- **THEN** the row appears under that name and is removed once the delete is confirmed
