## ADDED Requirements

### Requirement: A pressed toggle is drawn filled and its unpressed state plain

Every chrome button with `aria-pressed="true"` SHALL be drawn with the primary fill, and a toggle
SHALL use a plain (outline or ghost) face when not pressed, so the two states of one toggle, and
the pressed and unpressed buttons of one selector, differ by at least 3:1 in the light and the dark
palette.

#### Scenario: the header's view selector

- **WHEN** a reader is on a project's Plan at 1440 px, in either palette
- **THEN** the Plan button's face stands at least 3:1 off the Board button's, and after Board is chosen the Board button's face stands at least 3:1 off the Plan button's

#### Scenario: the toolbar's Gantt toggle

- **WHEN** a reader opens the Gantt chart from the toolbar
- **THEN** the Gantt button's pressed face stands at least 3:1 off its unpressed face

### Requirement: The project settings controls follow the app's control vocabulary

The Project settings section tabs SHALL draw no border. A step's estimate-unit radios that are
locked by estimates SHALL show the reason as text on the row and as the group's description, and a
disabled checked radio SHALL stand at least 3:1 off a disabled unchecked one. The Optimization
radios SHALL read `Fast`, `Priority-first` and `Finish-first`, on one line at 375 px. No settings
section SHALL carry a heading of its own. The priority ladder SHALL show a header row naming its
columns, aligned with them at 1440 px and 375 px. A section that scrolls SHALL end with bottom
room equal to the surface's top padding.

#### Scenario: a step that holds estimates

- **WHEN** the Steps section shows a step with two estimates
- **THEN** its radios are disabled, `fixed by 2 estimates` is shown under them, and the checked disc's centre stands at least 3:1 off the unchecked disc's

#### Scenario: optimization is off

- **WHEN** the Optimization section is shown at 375 px with optimization off
- **THEN** `Fast`, `Priority-first` and `Finish-first` stand on one line and Fast's disabled disc stands at least 3:1 off the others

#### Scenario: Estimating at 1024×768

- **WHEN** the Estimating section is scrolled to its end at 1024×768
- **THEN** at least the surface's top padding stands between the closing paragraph and the box's bottom
