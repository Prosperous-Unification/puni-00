## MODIFIED Requirements

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

**The handle SHALL take the press along the whole of its strip.** The panel is
pulled up over those 6px by the handle's own negative margin, so the two boxes
share them and paint order decides the press; the chart SHALL therefore resolve
its own layering **within itself**, and no box inside the chart SHALL outrank
the handle over it. A point of the strip the browser hands to the chart is a
point the reader cannot start a drag from, and there is nothing at that point
for a press on the chart to mean.

The drag is a pointer gesture and jsdom performs no default action for
pointer events, so the gesture SHALL be proved in Chromium
(`e2e/gantt.spec.ts`), the shape of the fourteenth and fifteenth failures. The
strip's ownership SHALL be proved there too, and against the chart's own top
row rather than the panel's width: where the chart draws nothing the strip is
uncontested, and a sweep over empty pixels would pass whatever the layering
says.

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

#### Scenario: the chart's sticky header does not take the strip

- **GIVEN** an open chart whose label column and calendar axis stand under the
  handle's 6px
- **WHEN** the browser is asked what a press lands on, across the width of that
  header and down the strip
- **THEN** every point is the handle's, and a drag started over the label
  column's own corner moves the boundary
