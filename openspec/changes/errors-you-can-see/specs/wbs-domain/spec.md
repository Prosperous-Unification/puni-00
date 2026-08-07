## ADDED Requirements

### Requirement: Failures are reported as toasts that outlive the next action

Every event the table reports SHALL appear as a toast in a stack in the corner
of the screen — a refused request, a refusal it makes on be-01's behalf, a
gesture cancelled underneath the user — and SHALL NOT appear as a line above the
table. A toast of kind `error` SHALL stay until it is dismissed, and SHALL NOT
be removed by any later action succeeding. A toast of kind `info` SHALL remove
itself after about five seconds, and its timer SHALL be cleared when the stack
unmounts. At most five toasts SHALL be shown at once, newest first, with the
remainder counted as `+N more` and held until a visible one is dismissed. A
message identical to one already held SHALL move that one to the top rather than
appear beside it. A gesture that produces several refusals at once SHALL report
them in one toast.

#### Scenario: a refused rename

- **GIVEN** be-01 refuses a rename
- **WHEN** the name cell is left
- **THEN** the reason is shown as a toast, and the only alert on screen is that
  toast

#### Scenario: the next thing that works

- **GIVEN** a refusal is on screen
- **WHEN** a later edit succeeds
- **THEN** the refusal is still on screen

#### Scenario: dismissing a refusal

- **WHEN** a toast's ✕ is pressed
- **THEN** it is gone

#### Scenario: an info message leaves by itself

- **GIVEN** an info toast has been raised
- **WHEN** five seconds pass
- **THEN** it is gone, and an error raised at the same moment is not

#### Scenario: more failures than the stack shows

- **WHEN** seven failures are raised
- **THEN** the five newest are shown, newest first, and `+2 more` says where the
  others are

#### Scenario: one gesture, one toast

- **GIVEN** a typed list of dependency numbers with two be-01 refuses and one
  that names no work item
- **WHEN** the list is sent
- **THEN** one toast carries all three complaints

### Requirement: A tree that may be stale says so, with a way back

When a refetch fails, the table SHALL keep the last tree it read on screen and
SHALL show a persistent banner saying the plan may be out of date, carrying a
control that refetches. The banner SHALL be cleared by any refetch that lands,
whichever path asked for it, and SHALL NOT be cleared by one being asked for. A
refetch failing SHALL NOT raise a toast, and an action failing SHALL NOT raise
the banner; when both happen, both SHALL be shown.

#### Scenario: a peer's change cannot be read

- **GIVEN** a table subscribed to a project
- **WHEN** a change event arrives and the refetch it starts fails
- **THEN** the rows already on screen stay, the banner appears, and no toast is
  raised

#### Scenario: the retry works

- **GIVEN** the banner is up
- **WHEN** the retry is pressed and the refetch lands
- **THEN** the banner is gone and the refetched rows are on screen

#### Scenario: somebody else's edit repairs it

- **GIVEN** the banner is up
- **WHEN** a later change event arrives and its refetch lands
- **THEN** the banner is gone

#### Scenario: refused and stale at once

- **GIVEN** be-01 refuses a dependency and the reread after it also fails
- **WHEN** the request settles
- **THEN** the refusal is a toast and the banner is up
