## MODIFIED Requirements

### Requirement: A created work item carries the project's middle priority

The system SHALL, on creating a work item, write the project's **rank 2**
priority band's default value as the item's priority. The rank SHALL be what
chooses it; the band's label SHALL NOT. A project holding no ladder of its own
SHALL use the default ladder's rank 2 value.

A create command MAY carry a priority. An explicit value SHALL be written as
given; an explicit null SHALL create the item with no priority; an absent
priority SHALL take the rank 2 default.

The priority SHALL be read from the project's ladder inside the write, and SHALL
NOT be supplied by the client as a default.

#### Scenario: a new work item is ordinary by default

- **GIVEN** a project with the default priority ladder
- **WHEN** a work item is created with no priority named
- **THEN** its priority SHALL be 50
- **AND** it SHALL resolve to the third band of the ladder

#### Scenario: a re-cut ladder moves the default

- **GIVEN** a project whose rank 2 band writes 200
- **WHEN** a work item is created with no priority named
- **THEN** its priority SHALL be 200

#### Scenario: a renamed middle band still supplies the default

- **GIVEN** a project whose rank 2 band is named `Normal`
- **WHEN** a work item is created with no priority named
- **THEN** its priority SHALL be that band's default value

#### Scenario: an explicit null creates an unprioritised item

- **WHEN** a work item is created with its priority explicitly null
- **THEN** it SHALL have no priority
- **AND** every face SHALL draw its priority as nothing

### Requirement: Work items written before this change keep their blank priority

The system SHALL NOT write a priority onto any existing work item. A work item
with no priority SHALL continue to have none and SHALL continue to be drawn with
no priority mark on every face.

#### Scenario: an existing plan is unchanged

- **GIVEN** a plan whose work items have no priority
- **WHEN** it is read after this change
- **THEN** every one of those work items SHALL still have no priority

### Requirement: Priority colour reads as distance from ordinary

The system SHALL colour priority bands by rank on a diverging scale: the middle
rank neutral, the ranks above it warm, the ranks below it cool.

Rank 2 SHALL be the neutral grey that rank 4 carried before this change. Ranks 3
and 4 SHALL be one cool hue at one lightness, distinguished by chroma, with rank
4 the more saturated. Ranks 0 and 1 SHALL be unchanged.

Every rank's colour SHALL remain legible against the page in both the light and
the dark palette, and ranks 3 and 4 SHALL be distinguishable from each other.

#### Scenario: the middle rank is neutral

- **WHEN** a work item at the rank 2 band is drawn
- **THEN** its ink SHALL be the neutral grey rank 4 carried before this change

#### Scenario: the two cool ranks are told apart

- **WHEN** the rank 3 and rank 4 inks are compared
- **THEN** they SHALL share a hue and a lightness
- **AND** their chroma SHALL differ by a measurable margin
- **AND** rank 4 SHALL be the more saturated

#### Scenario: a plan of ordinary work is quiet

- **GIVEN** a plan whose every work item is at the rank 2 band
- **WHEN** the Prio column is drawn
- **THEN** no chip SHALL carry a warm hue
