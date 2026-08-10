## ADDED Requirements

### Requirement: The Gantt panel's top edge can be dragged to another height

The Gantt panel SHALL carry a drag handle on its top edge, and dragging that
handle up and down SHALL move the boundary between the plan and the chart: up
gives the chart more of the screen, down gives it back to the plan. The height
the drag settles at is a **panel height override**.

A drag SHALL clamp the height to a floor of **84px** — the axis row and two
chart rows, below which the panel shows nothing worth keeping open — and to a
named ceiling declared beside the floor and read by **both** the drag clamp
and the stored-height check, so no drag can produce a height a reload would
reject. The override SHALL additionally be applied under a live cap of 80% of
the viewport's height, so a height dragged on a tall monitor opens sane on a
laptop, and the plan above always keeps a strip of the screen.

While no override is in force the panel SHALL keep today's behavior exactly:
it takes what it needs up to a 40vh cap. The default MUST NOT be written
anywhere — a panel that has never been dragged has nothing stored about it.

The handle SHALL NOT die with a chart that cannot be drawn: the chart's fault
boundary replaces the chart, and the boundary of what it replaces MUST leave
the drag standing — a reader who shrank the chart to almost nothing must be
able to drag it back open.

The drag is a pointer gesture and jsdom performs no default action for
pointer events, so the gesture SHALL be proved in Chromium
(`e2e/gantt.spec.ts`), the shape of the fourteenth and fifteenth failures.

#### Scenario: dragging the boundary up makes the chart taller

- **GIVEN** an open Gantt panel at its default share
- **WHEN** the handle is dragged 100px up
- **THEN** the panel is 100px taller than it was and the plan above has given
  up the same 100px

#### Scenario: the floor stops a drag that got away

- **WHEN** the handle is dragged far below the panel's bottom
- **THEN** the panel stops at 84px and is still there to be dragged back

#### Scenario: no drag yet means today's panel

- **GIVEN** a project whose panel has never been dragged
- **WHEN** the chart is opened
- **THEN** the panel takes what it needs up to the 40vh cap, and nothing about
  its height is stored

#### Scenario: a chart that cannot be drawn leaves the drag standing

- **GIVEN** a panel height override near the floor, and a chart read the fault
  boundary replaces
- **WHEN** the fault is on screen
- **THEN** the handle is still there and dragging it still moves the boundary

### Requirement: The remembered height is a claim, not a fact

The panel height override SHALL be remembered per project and per browser,
under `wbs.ganttHeight.<projectId>`, as the widths beside it are. Nothing
SHALL be sent to be-01: the height is one reader's, never the project's.

What is read back SHALL be validated at that boundary. Storage that does not
parse to a number inside the same range the drag clamps to — the 84px floor up
to the same named ceiling — SHALL have the key dropped and the panel SHALL
open at its default share. The range SHALL be read from the same constants the
drag reads, so the two cannot drift apart.

Validation MUST NOT be inferred from reading the code. Each refusal SHALL
have a negative test watched failing with that refusal's line removed.

#### Scenario: the height survives a reload

- **GIVEN** the panel dragged to 500px
- **WHEN** the browser is reloaded onto the same project and the chart is
  opened
- **THEN** the panel is 500px

#### Scenario: unparseable storage

- **GIVEN** `wbs.ganttHeight.<projectId>` holding text that is not a number
- **WHEN** the chart is opened
- **THEN** the panel is at its default share and the key is gone

#### Scenario: a height outside the drag's range

- **GIVEN** a stored height below the floor, and on another run one above the
  ceiling
- **WHEN** the chart is opened
- **THEN** the panel is at its default share and the key is gone

## MODIFIED Requirements

### Requirement: Resetting forgets the layout rather than freezing it

The table SHALL offer one reset, labeled as a **layout reset**, that removes
the stored width key **and** the stored height key for the project and drops
every override in force — column widths and the panel height together. Each
SHALL then return to what is resolved for it **now**: the columns to the
widths the frame layout resolves, the panel to its default share. The reset
MUST NOT write a snapshot of any width or height, including the defaults as
they stood when it was pressed.

The reset SHALL be offered only while at least one override — a width or the
height — is in force: a control that provably does nothing reads as a broken
one.

#### Scenario: reset returns a column to today's default, not yesterday's

- **GIVEN** not-before overridden while no row in the project sets a date, and
  a row has since been given one — so its resolved default has changed
- **WHEN** the layout is reset
- **THEN** not-before is laid out at the default that holds now, and the
  stored key is gone

#### Scenario: reset returns the panel to its default share

- **GIVEN** the panel dragged taller and the chart open
- **WHEN** the layout is reset
- **THEN** the panel is back at its default share and the stored height key is
  gone

#### Scenario: a height override alone is enough to offer the reset

- **GIVEN** a project no column has been dragged in, whose panel has been
  dragged
- **WHEN** the table is rendered
- **THEN** the layout reset is offered, and pressing it forgets the height

#### Scenario: reset is absent with nothing to reset

- **GIVEN** a project no column and no panel edge has been dragged in
- **WHEN** the table is rendered
- **THEN** no reset control is offered

### Requirement: Layout controls belong to the table renderer and to nothing else

The column resize handles and the layout reset SHALL be rendered by the table
renderer alone. The reset SHALL sit **in the toolbar row, as that row's own
child** — not on a line of its own above the table, and MUST NOT enter the
shared toolbar controls array: that one array is rendered both in the desktop
toolbar row and in the Plan actions sheet, so a control put there reaches the
phone by construction, and a card has no columns to widen.

The panel's own edge handle is the one exception, and it is the panel's, not
the table's: the chart mounts under either renderer, and its edge SHALL be
draggable wherever the chart is open — a phone reader gets the same boundary.

#### Scenario: the reset sits in the toolbar row

- **GIVEN** an override in force
- **WHEN** the table is rendered on a desktop viewport
- **THEN** the layout reset is a child of the toolbar row, and no control
  stands on a line of its own between the toolbar and the table

#### Scenario: the Plan actions sheet offers no layout control

- **GIVEN** a viewport narrow enough that the outline cards are the plan
  renderer
- **WHEN** the Plan actions sheet is opened
- **THEN** it offers no layout reset and no resize control

#### Scenario: the cards keep the panel's edge

- **GIVEN** the outline cards as the plan renderer and the chart open
- **WHEN** the page is read
- **THEN** no column resize handle exists anywhere, and the panel's edge
  handle does

## RENAMED Requirements

- FROM: `### Requirement: Resetting forgets the widths rather than freezing them`
- TO: `### Requirement: Resetting forgets the layout rather than freezing it`

- FROM: `### Requirement: Width controls belong to the table and to nothing else`
- TO: `### Requirement: Layout controls belong to the table renderer and to nothing else`
