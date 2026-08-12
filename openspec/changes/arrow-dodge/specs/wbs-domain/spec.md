## ADDED Requirements

### Requirement: A dependency arrow's route clears every bar it does not join

A dependency arrow SHALL be drawn through a route no run of which passes through
the **interior** of any bar the panel draws, the two bars the arrow itself joins
included. The arrow SHALL touch those two only on the edge it leaves and the
edge it arrives at: an edge is not an interior, and a route that counted one as a
collision would leave every arrow nowhere to go.

The route SHALL be decided against the bars the panel is drawing rather than
from the arrow's two ends alone. Only drawn bars are obstacles: since the arrows
are asked for rather than shown by default, a bar nothing paints is not
something to dodge.

Where nothing stands under the column the arrow would turn at, the route SHALL
be the one already drawn — three runs where there is room between the two ends,
and the five-run jog out past the predecessor's edge and back where there is
not. Where something does stand there, the route SHALL turn at the nearest
clear column to that one, so a dodge is the smallest that clears rather than the
first that is found.

Every run SHALL be horizontal or vertical, and the last SHALL be horizontal and
arrive at the successor's start from its left, so the head is never rotated.

The invariant SHALL hold on either axis — the workday one and the calendar one,
whose weekends make every bar the route has to clear wider — and whether the
successor stands below the predecessor or above it.

The one shape the route cannot clear is an arrow whose **start** is already
strictly inside another bar on its own row, which no route can leave without
crossing. The chart does not draw that shape: a row's slices run one after
another in role order, so two bars of one row do not overlap.

#### Scenario: a descent does not run down an unrelated bar

- **GIVEN** `010` of 3 days, `020` of 2 and `030` of 4 both waiting on it, and
  `040` of 2 waiting on both
- **WHEN** the arrows are asked for
- **THEN** no run of the `020 → 040` arrow passes inside `030`'s bar, and no run
  of any of the four arrows passes inside any of the four bars

#### Scenario: the same plan on a calendar

- **GIVEN** that plan on a calendar axis, where the weekend inside `030` makes
  its bar two days wider than the workday axis draws it
- **THEN** the invariant still holds for every arrow

#### Scenario: a clear chart is drawn exactly as it was

- **GIVEN** a predecessor finishing at workday 3 and a successor starting at
  workday 6 on the next row, with nothing between them
- **THEN** the arrow is the three-run elbow turning one approach short of the
  successor's start, unchanged by this requirement

#### Scenario: a dodge is the smallest one available

- **WHEN** the `020 → 040` arrow of the plan above is routed
- **THEN** it crosses just past `030`'s finish rather than anywhere further out

#### Scenario: no column between the two ends is clear

- **GIVEN** a row between the predecessor and the successor whose bar spans the
  whole chart
- **THEN** the route crosses left of that bar, outside the schedule and inside
  the canvas

#### Scenario: the anchor has the next role standing against it

- **GIVEN** a predecessor whose Dev runs 0 → 3 and whose QA runs 3 → 5, and a
  successor waiting on it
- **WHEN** the arrow leaves the anchor's finish at 3, with QA drawn right
  against it
- **THEN** the route leaves on that edge itself rather than stepping into QA

#### Scenario: an arrow climbing the chart

- **GIVEN** a successor drawn on a row above its predecessor
- **THEN** the invariant holds for it as it does for one descending

#### Scenario: the head still points right

- **WHEN** any arrow is routed
- **THEN** its last run is horizontal and ends at the successor's start, arrived
  at from the left
