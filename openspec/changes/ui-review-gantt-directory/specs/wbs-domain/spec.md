## ADDED Requirements

### Requirement: A lane stack writes one label

Bars of one row that share their band in lanes (a lane stack) SHALL write no on-bar label of their
own. The stack SHALL write one label across the drawn union of its bars and the whole bar band: the
row's number, then `N steps`, then `no estimate` when no bar in it is estimated, or `U no estimate`
otherwise. The number SHALL lead and be whole. Where only the number fits, the label SHALL be the
number; where the number does not fit, nothing SHALL be written. The label SHALL sit on a patch of
the page's ground in the page's ink, and SHALL clear 4.5:1 in light and dark. The exported SVG
SHALL write the same label. This supersedes `gantt-legibility`'s rule that each label in a laned
row takes its lane's height.

#### Scenario: one short estimated step beside an unestimated one

- **GIVEN** a leaf whose first step is unestimated and whose second is estimated at half a day
- **WHEN** the chart draws the two bars in lanes at one instant
- **THEN** the row's number is written once, as `010 · 2 steps · 1 no estimate`
- **AND** no two labels' glyphs touch on the chart

#### Scenario: nobody estimated any step

- **GIVEN** a leaf with two unestimated steps
- **THEN** its one label reads `020 · 2 steps · no estimate`

### Requirement: Directory load lines use the app's link ink

The `booked, overlapping` line under each person in the Directory SHALL be drawn in the app's
foreground ink, the token every other link uses, never the user agent's link colour. It SHALL
clear 4.5:1 on its ground in light and dark.

#### Scenario: a person with no booked work, dark

- **WHEN** the Directory shows `0 d booked, 0 d overlapping` in the dark palette
- **THEN** the line's colour is `--foreground`, not `rgb(158, 158, 255)`

### Requirement: Key chips name columns by their header

A key chip that says where a key works (`Enter in …`) SHALL name the column exactly as the table's
header does.

#### Scenario: saving a priority

- **WHEN** the cheat sheet lists the key that saves a priority and stays on the row
- **THEN** its chip reads `Enter in Priority`

### Requirement: A project's meta leads with its date

A project's meta in the picker and on its hover card SHALL read `(date · owner)`. At 1024px every
option's date SHALL be on screen whole; the owner is what the clip takes.

#### Scenario: two projects of one name at 1024px

- **WHEN** the picker is open at 1024px
- **THEN** every option shows its date, as in `Review fixture (16 Oct · local-d…`
